import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridEventEditingChangedParams, GridEventCellsChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  // Column autosizing measures text with the theme fonts, which are otherwise only set by the
  // renderer; provide them so setColumnDefs can compute widths.
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
    { colId: "locked", key: "locked", label: "Locked" }, // not editable
  ]);
  return core;
}

function colId(core: GridCore, key: string): string {
  return core.getColumnModel().getByColId(key)!.instanceID;
}

// Emitted CellRefs are normalized: public colId + the internal instance id.
function emittedCell(core: GridCore, rowId: string, key: string) {
  return { rowId, colId: key, colInstanceId: colId(core, key) };
}

describe("GridCore editing", () => {
  let core: GridCore;
  let editingEvents: GridEventEditingChangedParams[];
  let cellsEvents: GridEventCellsChangedParams[];

  beforeEach(() => {
    core = makeGrid();
    editingEvents = [];
    cellsEvents = [];
    core.on("editingChanged", (e) => editingEvents.push(e));
    core.on("cellsChanged", (e) => cellsEvents.push(e));
  });

  it("starts editing an editable cell and tracks the editing cell", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "editStart", cell });
    expect(core.getEditingCell()).toEqual(emittedCell(core, "1", "name"));
    expect(editingEvents).toEqual([{ state: "started", cell: emittedCell(core, "1", "name") }]);
  });

  it("forwards charPress on the started event (edit-on-typing)", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "editStart", cell, source: "keyboard", charPress: "q" });
    expect(editingEvents.at(-1)).toMatchObject({ state: "started", cell: emittedCell(core, "1", "name"), charPress: "q" });
  });

  it("refuses to start editing a non-editable column", () => {
    const cell = { rowId: "1", colId: colId(core, "locked") };
    core.dispatch({ type: "editStart", cell });
    expect(core.getEditingCell()).toBeNull();
    expect(editingEvents).toEqual([]);
  });

  it("commits a value, writing it to the row and emitting cellsChanged", () => {
    const cId = colId(core, "name");
    const cell = { rowId: "1", colId: cId };
    core.dispatch({ type: "editStart", cell });
    core.dispatch({ type: "editCommit", cell, value: "ALICE" });

    expect(core.getEditingCell()).toBeNull();
    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("ALICE");
    expect(cellsEvents).toEqual([
      { reason: "editCommit", rowIds: ["1"], colIds: ["name"], colInstanceIds: [cId] },
    ]);
    expect(editingEvents.at(-1)).toEqual({
      state: "committed", cell: emittedCell(core, "1", "name"), value: "ALICE", oldValue: "alice",
    });
  });

  it("runs the column valueParser on commit", () => {
    const cId = colId(core, "qty");
    const cell = { rowId: "2", colId: cId };
    core.dispatch({ type: "editCommit", cell, value: "99" });
    expect(core.getRowModel().getRowNode("2")!.data.qty).toBe(99);
    expect(editingEvents.at(-1)).toEqual({
      state: "committed", cell: emittedCell(core, "2", "qty"), value: 99, oldValue: 7,
    });
  });

  it("stores the value directly and skips valueParser when parsed=true", () => {
    const cId = colId(core, "qty");
    const cell = { rowId: "2", colId: cId };
    // A typed editor commits a real number with parsed:true — valueParser must not run.
    core.dispatch({ type: "editCommit", cell, value: 123, parsed: true });
    expect(core.getRowModel().getRowNode("2")!.data.qty).toBe(123);
    expect(editingEvents.at(-1)).toEqual({
      state: "committed", cell: emittedCell(core, "2", "qty"), value: 123, oldValue: 7,
    });
  });

  it("cancels an edit without changing the value", () => {
    const cId = colId(core, "name");
    const cell = { rowId: "1", colId: cId };
    core.dispatch({ type: "editStart", cell });
    core.dispatch({ type: "editCancel", cell });

    expect(core.getEditingCell()).toBeNull();
    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("alice");
    expect(cellsEvents).toEqual([]);
    expect(editingEvents.at(-1)).toEqual({ state: "cancelled", cell: emittedCell(core, "1", "name") });
  });
});
