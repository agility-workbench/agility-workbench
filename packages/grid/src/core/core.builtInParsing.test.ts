import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridOptions, REJECT } from "../interfaces/gridOptions";
import { GridEventCellValueChangedParams, GridEventEditingChangedParams } from "../events/events";
import { GridAPI } from "../api/api";

/**
 * Columns without a `valueParser` parse text by type (`column/parsers.ts`): every write path that
 * carries text — an editor commit, a paste/fill/clear batch, a string to `setCellValue` — stores a
 * typed value or refuses the text. A refusal is a per-cell veto: no write, no history, no event.
 */

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: Partial<GridOptions> = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3, when: new Date(2026, 0, 1), flag: true, iso: "2026-01-01", strict: 5 },
    { id: "2", name: "bob", qty: 7, when: new Date(2026, 0, 2), flag: false, iso: "2026-01-02", strict: 6 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
    { colId: "when", key: "when", label: "When", type: ColumnType.DATE, editable: true },
    { colId: "flag", key: "flag", label: "Flag", type: ColumnType.BOOLEAN, editable: true },
    { colId: "iso", key: "iso", label: "ISO", type: ColumnType.DATE, editable: true },
    // A custom parser that refuses odd numbers with REJECT.
    {
      colId: "strict", key: "strict", label: "Strict", type: ColumnType.NUMBER, editable: true,
      valueParser: ({ value }) => {
        const n = Number(value);
        return Number.isInteger(n) && n % 2 === 0 ? n : REJECT;
      },
    },
  ]);
  const api = new GridAPI(core);
  const cell = (rowId: string, key: string) => ({ rowId, colId: core.getColumnModel().getByColId(key)!.instanceID });
  const data = (rowId: string) => core.getRowModel().getRowNode(rowId)!.data as Record<string, unknown>;
  const changes: GridEventCellValueChangedParams[] = [];
  const editing: GridEventEditingChangedParams[] = [];
  core.on("cellValueChanged", ev => changes.push(ev));
  core.on("editingChanged", ev => editing.push(ev));
  return { core, api, cell, data, changes, editing };
}

describe("editor commits of raw text", () => {
  it("stores numeric text as a number and refuses text that is not one", () => {
    const { core, api, cell, data, changes, editing } = makeGrid();
    core.dispatch({ type: "editCommit", cell: cell("1", "qty"), value: "42" });
    expect(data("1").qty).toBe(42);
    expect(changes.map(c => c.value)).toEqual([42]);

    core.dispatch({ type: "editCommit", cell: cell("1", "qty"), value: "forty" });
    expect(data("1").qty).toBe(42);
    expect(editing.at(-1)).toMatchObject({ state: "rejected", value: "forty", oldValue: 42 });
    expect(changes).toHaveLength(1);
    expect(api.getHistoryState().undoDepth).toBe(1);
  });

  it("parses dates in the cell's stored shape and booleans from their spellings", () => {
    const { core, cell, data } = makeGrid();
    core.dispatch({ type: "editCommit", cell: cell("1", "when"), value: "2026-03-04" });
    expect(data("1").when).toEqual(new Date(2026, 2, 4));
    core.dispatch({ type: "editCommit", cell: cell("1", "iso"), value: "2026-03-04" });
    expect(data("1").iso).toBe("2026-03-04");
    core.dispatch({ type: "editCommit", cell: cell("1", "flag"), value: "no" });
    expect(data("1").flag).toBe(false);
    core.dispatch({ type: "editCommit", cell: cell("1", "when"), value: "tomorrow" });
    expect(data("1").when).toEqual(new Date(2026, 2, 4));
  });

  it("a custom valueParser may return REJECT too", () => {
    const { core, cell, data, editing } = makeGrid();
    core.dispatch({ type: "editCommit", cell: cell("1", "strict"), value: "8" });
    expect(data("1").strict).toBe(8);
    core.dispatch({ type: "editCommit", cell: cell("1", "strict"), value: "9" });
    expect(data("1").strict).toBe(8);
    expect(editing.at(-1)).toMatchObject({ state: "rejected", value: "9" });
  });

  it("values the editor already parsed bypass the built-in parser", () => {
    const { core, cell, data } = makeGrid();
    core.dispatch({ type: "editCommit", cell: cell("1", "qty"), value: "kept as given", parsed: true });
    expect(data("1").qty).toBe("kept as given");
  });
});

describe("batch commits", () => {
  it("drops refused cells from the batch and keeps the rest, as one undo step", () => {
    const { core, api, cell, data, changes } = makeGrid();
    core.dispatch({
      type: "cellsCommit",
      reason: "paste",
      edits: [
        { cell: cell("1", "name"), value: "carol" },
        { cell: cell("1", "qty"), value: "many" },
        { cell: cell("2", "qty"), value: "70" },
        { cell: cell("2", "strict"), value: "7" },
        { cell: cell("2", "flag"), value: "TRUE" },
      ],
    });
    expect(data("1")).toMatchObject({ name: "carol", qty: 3 });
    expect(data("2")).toMatchObject({ qty: 70, strict: 6, flag: true });
    expect(changes.map(c => c.value)).toEqual(["carol", 70, true]);
    expect(api.getHistoryState().undoDepth).toBe(1);
    api.undo();
    expect(data("1").name).toBe("alice");
    expect(data("2")).toMatchObject({ qty: 7, flag: false });
  });

  it("clearing typed cells stores null, not an empty string", () => {
    const { core, cell, data } = makeGrid();
    core.dispatch({
      type: "cellsCommit",
      reason: "clear",
      edits: ["name", "qty", "when", "flag", "iso"].map(key => ({ cell: cell("1", key), value: "" })),
    });
    expect(data("1")).toMatchObject({ name: "", qty: null, when: null, flag: null, iso: null });
  });

  it("a batch whose every cell is refused records and reports nothing", () => {
    const { core, api, cell, data, changes } = makeGrid();
    core.dispatch({
      type: "cellsCommit",
      reason: "fill",
      edits: [{ cell: cell("1", "qty"), value: "a" }, { cell: cell("2", "qty"), value: "b" }],
    });
    expect(data("1").qty).toBe(3);
    expect(changes).toHaveLength(0);
    expect(api.getHistoryState().undoDepth).toBe(0);
  });
});

describe("the API's string rule", () => {
  it("a string goes through the built-in parser; anything else is stored as given", () => {
    const { api, cell, data } = makeGrid();
    api.setCellValue(cell("1", "qty"), "42");
    expect(data("1").qty).toBe(42);
    api.setCellValue(cell("1", "qty"), "abc");
    expect(data("1").qty).toBe(42);
    api.setCellValue(cell("1", "qty"), 99);
    expect(data("1").qty).toBe(99);
    api.setCellValue(cell("2", "when"), "2026-12-25");
    expect(data("2").when).toEqual(new Date(2026, 11, 25));
  });
});
