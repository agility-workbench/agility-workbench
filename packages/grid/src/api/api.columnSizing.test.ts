/**
 * api.autoSizeColumns / autoSizeAllColumns / setColumnWidth(s): the typed doors for the
 * `columnAutosize` / `columnResize` actions, batched into one `columnWidthsChanged`.
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { GridEventColumnWidthsChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(): { core: GridCore; api: IGridAPI } {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    rowNumbers: true,
    minResizeWidth: 40,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "notes", key: "notes", label: "Notes", type: ColumnType.STRING, width: 300 },
    { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER, minWidth: 60, maxWidth: 200 },
  ]);
  core.setRowData([
    { id: "1", name: "a fairly long name", notes: "x", n: 1 },
    { id: "2", name: "b", notes: "y", n: 2 },
  ]);
  return { core, api: new GridAPI(core) };
}

const width = (api: IGridAPI, colId: string) => api.getColumnModel().getByColId(colId)!.computedWidth;

function record(api: IGridAPI): GridEventColumnWidthsChangedParams[] {
  const events: GridEventColumnWidthsChangedParams[] = [];
  api.on("columnWidthsChanged", e => events.push(e));
  return events;
}

describe("api.setColumnWidth / setColumnWidths", () => {
  it("sets a width, clamped to the column's bounds, with one final event", () => {
    const { api } = makeGrid();
    const events = record(api);
    api.setColumnWidth("name", 222);
    expect(width(api, "name")).toBe(222);
    expect(events).toEqual([expect.objectContaining({ changedColIds: ["name"], final: true, source: "api" })]);

    api.setColumnWidth("n", 999);
    expect(width(api, "n")).toBe(200);
    api.setColumnWidth("n", 1);
    expect(width(api, "n")).toBe(60);
  });

  it("batches several widths into one event naming only the columns that changed", () => {
    const { api } = makeGrid();
    api.setColumnWidth("notes", 300);
    const events = record(api);
    api.setColumnWidths([
      { colId: "name", widthPx: 150 },
      { colId: "notes", widthPx: 300 },
      { colId: "nope", widthPx: 100 },
      { colId: "n", widthPx: Number.NaN },
    ]);
    expect(width(api, "name")).toBe(150);
    expect(events).toHaveLength(1);
    expect(events[0].changedColIds).toEqual(["name"]);
  });

  it("emits nothing when no width changed", () => {
    const { api } = makeGrid();
    api.setColumnWidth("name", 150);
    const events = record(api);
    api.setColumnWidth("name", 150);
    api.setColumnWidths([]);
    expect(events).toEqual([]);
  });

  it("a set width survives a later data-driven autosize", () => {
    const { core, api } = makeGrid();
    api.setColumnWidth("name", 333);
    core.autosizeColumns();
    expect(width(api, "name")).toBe(333);
  });
});

describe("api.autoSizeColumns / autoSizeAllColumns", () => {
  it("fits named columns to content, dropping a user width, in one event", () => {
    const { api } = makeGrid();
    const fitted = width(api, "name");
    api.setColumnWidths([{ colId: "name", widthPx: 400 }, { colId: "notes", widthPx: 400 }]);
    const events = record(api);
    api.autoSizeColumns(["name", "notes", "nope"]);
    expect(width(api, "name")).toBe(fitted);
    expect(width(api, "notes")).toBeLessThan(400);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ final: true, source: "api" });
    expect([...events[0].changedColIds].sort()).toEqual(["name", "notes"]);
  });

  it("emits nothing for unknown columns only", () => {
    const { api } = makeGrid();
    const events = record(api);
    api.autoSizeColumns(["nope"]);
    api.autoSizeColumns([]);
    expect(events).toEqual([]);
  });

  it("autoSizeAllColumns sizes every visible data column but not the row-number column", () => {
    const { api } = makeGrid();
    const rowNumber = api.getColumnModel().getLeaves().find(col => col.isRowNumberColumn())!;
    const rowNumberWidth = rowNumber.computedWidth;
    api.setColumnWidths([{ colId: "name", widthPx: 400 }, { colId: "notes", widthPx: 400 }]);
    const events = record(api);
    api.autoSizeAllColumns();
    expect(width(api, "name")).toBeLessThan(400);
    expect(width(api, "notes")).toBeLessThan(400);
    expect(rowNumber.computedWidth).toBe(rowNumberWidth);
    expect(events).toHaveLength(1);
    expect(events[0].changedColInstanceIds).not.toContain(rowNumber.instanceID);
  });
});
