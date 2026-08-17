import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridOptions, REJECT } from "../interfaces/gridOptions";
import {
  GridEventCellValueChangedParams,
  GridEventCellsChangedParams,
  GridEventEditingChangedParams,
} from "../events/events";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: Partial<GridOptions> = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    readOnlyEdit: true,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3 },
    { id: "2", name: "bob", qty: 7 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true },
    {
      colId: "qty",
      key: "qty",
      label: "Qty",
      type: ColumnType.NUMBER,
      editable: true,
      valueParser: ({ value, oldValue }) => {
        const n = Number(value);
        return Number.isNaN(n) ? oldValue : n;
      },
    },
  ]);
  return core;
}

function instanceId(core: GridCore, key: string): string {
  return core.getColumnModel().getByColId(key)!.instanceID;
}

describe("readOnlyEdit (B7)", () => {
  it("editor commit reports the parsed value but leaves the row object untouched", () => {
    const core = makeGrid();
    const data = core.getRowModel().getRowNode("2")!.data;
    const editingEvents: GridEventEditingChangedParams[] = [];
    const valueEvents: GridEventCellValueChangedParams[] = [];
    const cellsEvents: GridEventCellsChangedParams[] = [];
    core.on("editingChanged", (e) => editingEvents.push(e));
    core.on("cellValueChanged", (e) => valueEvents.push(e));
    core.on("cellsChanged", (e) => cellsEvents.push(e));

    core.dispatch({ type: "editCommit", cell: { rowId: "2", colId: instanceId(core, "qty") }, value: "99" });

    expect(data.qty).toBe(7);
    expect(core.getRowModel().getRowNode("2")!.data).toBe(data); // same object, unmutated
    const cell = { rowId: "2", colId: "qty", colInstanceId: instanceId(core, "qty") };
    expect(editingEvents).toEqual([{ state: "committed", cell, value: 99, oldValue: 7 }]);
    expect(valueEvents).toEqual([{ cell, oldValue: 7, value: 99, source: "edit" }]);
    expect(cellsEvents).toEqual([]); // nothing was written, so no repaint signal
    expect(core.canUndo()).toBe(false); // the grid has nothing of its own to undo
  });

  it("clipboard batch reports every accepted cell and writes none", () => {
    const core = makeGrid();
    const valueEvents: GridEventCellValueChangedParams[] = [];
    core.on("cellValueChanged", (e) => valueEvents.push(e));
    const qty = instanceId(core, "qty");

    core.dispatch({
      type: "cellsCommit",
      reason: "paste",
      edits: [
        { cell: { rowId: "1", colId: qty }, value: "11" },
        { cell: { rowId: "2", colId: qty }, value: "22" },
      ],
    });

    expect(core.getRowModel().getRowNode("1")!.data.qty).toBe(3);
    expect(core.getRowModel().getRowNode("2")!.data.qty).toBe(7);
    expect(valueEvents.map((e) => ({ rowId: e.cell.rowId, value: e.value, source: e.source }))).toEqual([
      { rowId: "1", value: 11, source: "paste" },
      { rowId: "2", value: 22, source: "paste" },
    ]);
    expect(core.canUndo()).toBe(false);
  });

  it("composes with onBeforeCellCommit: transforms surface in the event, REJECT silences it", () => {
    const valueEvents: GridEventCellValueChangedParams[] = [];
    const core = makeGrid({
      onBeforeCellCommit: (p) => (p.rowId === "1" ? REJECT : Math.min(p.value as number, 10)),
    });
    core.on("cellValueChanged", (e) => valueEvents.push(e));
    const qty = instanceId(core, "qty");

    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: qty }, value: "50" });
    core.dispatch({ type: "editCommit", cell: { rowId: "2", colId: qty }, value: "50" });

    expect(valueEvents).toHaveLength(1);
    expect(valueEvents[0]).toMatchObject({ cell: { rowId: "2" }, value: 10, source: "edit" });
    expect(core.getRowModel().getRowNode("2")!.data.qty).toBe(7); // still not written
  });

  it("still reports a commit of the unchanged value (no slot to compare — always report)", () => {
    const core = makeGrid();
    const valueEvents: GridEventCellValueChangedParams[] = [];
    core.on("cellValueChanged", (e) => valueEvents.push(e));

    // The grid writes nothing under readOnlyEdit, so it cannot know whether the application's
    // store already holds this value; no-op suppression must not apply.
    core.dispatch({ type: "editCommit", cell: { rowId: "2", colId: instanceId(core, "qty") }, value: "7" });

    expect(valueEvents).toEqual([{
      cell: { rowId: "2", colId: "qty", colInstanceId: instanceId(core, "qty") },
      oldValue: 7, value: 7, source: "edit",
    }]);
    expect(core.canUndo()).toBe(false);
  });

  it("stays off by default: a normal grid writes through", () => {
    const core = makeGrid({ readOnlyEdit: undefined });
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: instanceId(core, "name") }, value: "ALICE" });
    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("ALICE");
  });
});
