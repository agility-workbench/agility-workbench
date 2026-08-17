import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridEventEditingChangedParams, GridEventCellsChangedParams, GridEventCellValueChangedParams } from "../events/events";
import type { GridOptions } from "../interfaces/gridOptions";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: GridOptions = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    ...options,
  });
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

  it("refuses to start editing an editable column in a row vetoed by row presentation", () => {
    core = makeGrid({
      getRowPresentation: ({ rowId }) => ({ editable: rowId !== "1" }),
    });
    const name = colId(core, "name");

    core.dispatch({ type: "editStart", cell: { rowId: "1", colId: name } });
    expect(core.getEditingCell()).toBeNull();

    core.dispatch({ type: "editStart", cell: { rowId: "2", colId: name } });
    expect(core.getEditingCell()).toEqual(emittedCell(core, "2", "name"));
  });

  it("allows a column that explicitly opts out of the row editability gate", () => {
    core = makeGrid({ getRowPresentation: () => ({ editable: false }) });
    core.setColumnDefsFromProps([{
      colId: "name",
      key: "name",
      label: "Name",
      editable: true,
      inheritRowPresentation: { editable: false },
    }]);
    const name = colId(core, "name");

    core.dispatch({ type: "editStart", cell: { rowId: "1", colId: name } });
    expect(core.getEditingCell()).toEqual(emittedCell(core, "1", "name"));
  });

  it("cancels an active editor if its row becomes non-editable before commit", () => {
    let locked = false;
    core = makeGrid({ getRowPresentation: () => ({ editable: !locked }) });
    const name = colId(core, "name");
    const cell = { rowId: "1", colId: name };
    const events: GridEventEditingChangedParams[] = [];
    core.on("editingChanged", event => events.push(event));

    core.dispatch({ type: "editStart", cell });
    locked = true;
    core.dispatch({ type: "editCommit", cell, value: "ALICE" });

    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("alice");
    expect(events.at(-1)).toEqual({ state: "cancelled", cell: emittedCell(core, "1", "name") });
  });

  it("continues to allow programmatic writes into a row that is not user-editable", () => {
    core = makeGrid({ getRowPresentation: () => ({ editable: false }) });
    const name = colId(core, "name");

    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: name }, value: "API" });

    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("API");
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

// Writes that don't change the stored value commit the editor but are not value changes: no
// cellValueChanged, no undo step. editingChanged and cellsChanged stay unconditional — the first
// drives editor teardown/focus return, the second restores static cell content after the editor
// detaches. See docs/cell-value-change-detection.md.
describe("GridCore no-op write suppression", () => {
  let core: GridCore;
  let editingEvents: GridEventEditingChangedParams[];
  let cellsEvents: GridEventCellsChangedParams[];
  let valueEvents: GridEventCellValueChangedParams[];

  beforeEach(() => {
    core = makeGrid();
    editingEvents = [];
    cellsEvents = [];
    valueEvents = [];
    core.on("editingChanged", (e) => editingEvents.push(e));
    core.on("cellsChanged", (e) => cellsEvents.push(e));
    core.on("cellValueChanged", (e) => valueEvents.push(e));
  });

  it("commits the editor but emits no cellValueChanged and records no undo step", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "editStart", cell });
    core.dispatch({ type: "editCommit", cell, value: "alice" }); // value already present

    expect(editingEvents.at(-1)).toMatchObject({ state: "committed", value: "alice" });
    expect(cellsEvents.length).toBe(1); // repaint still happens (restores static cell content)
    expect(valueEvents).toEqual([]);
    expect(core.getHistoryState().undoDepth).toBe(0);
  });

  it("treats NaN → NaN as unchanged (SameValueZero, not ===)", () => {
    const cell = { rowId: "2", colId: colId(core, "qty") };
    core.dispatch({ type: "editCommit", cell, value: NaN, parsed: true }); // 7 → NaN: a change
    expect(valueEvents.length).toBe(1);
    expect(core.getHistoryState().undoDepth).toBe(1);

    core.dispatch({ type: "editCommit", cell, value: NaN, parsed: true }); // NaN → NaN: no-op
    expect(valueEvents.length).toBe(1);
    expect(core.getHistoryState().undoDepth).toBe(1);
  });

  it("treats two Dates for the same instant as unchanged", () => {
    const cell = { rowId: "1", colId: colId(core, "name") };
    core.dispatch({ type: "editCommit", cell, value: new Date(86400000), parsed: true });
    expect(valueEvents.length).toBe(1);

    // A fresh instance for the same instant is never reference-equal — must still be a no-op.
    core.dispatch({ type: "editCommit", cell, value: new Date(86400000), parsed: true });
    expect(valueEvents.length).toBe(1);
    expect(core.getHistoryState().undoDepth).toBe(1);
  });

  it("judges a valueGetter column on its stored field, not the getter output", () => {
    core.setColumnDefsFromProps([{
      colId: "shout",
      key: "name",
      label: "Shout",
      editable: true,
      valueGetter: (row: any) => row.data.name + "!",
    }]);
    const cell = { rowId: "1", colId: colId(core, "shout") };

    // Getter space says "alice!" → "alice" is a change; storage space says the slot already
    // holds "alice". Storage space wins: the write would not mutate the data.
    core.dispatch({ type: "editCommit", cell, value: "alice", parsed: true });
    expect(valueEvents).toEqual([]);
    expect(core.getHistoryState().undoDepth).toBe(0);
  });

  it("drops unchanged cells from a batch: events, undo entry, and repaint scope", () => {
    const name = colId(core, "name");
    core.dispatch({
      type: "cellsCommit",
      reason: "paste",
      edits: [
        { cell: { rowId: "1", colId: name }, value: "CHANGED" },
        { cell: { rowId: "2", colId: name }, value: "bob" }, // identical to stored
      ],
    });

    expect(valueEvents.length).toBe(1);
    expect(valueEvents[0]).toMatchObject({ cell: emittedCell(core, "1", "name"), value: "CHANGED" });
    expect(cellsEvents.length).toBe(1);
    expect(cellsEvents[0].rowIds).toEqual(["1"]); // row 2 not repainted
    expect(core.getHistoryState().undoDepth).toBe(1);

    // The undo entry holds only the changed cell.
    core.dispatch({ type: "undo" });
    expect(core.getRowModel().getRowNode("1")!.data.name).toBe("alice");
    expect(core.getRowModel().getRowNode("2")!.data.name).toBe("bob");
  });

  it("an all-unchanged batch emits nothing and records nothing", () => {
    const name = colId(core, "name");
    core.dispatch({
      type: "cellsCommit",
      reason: "paste",
      edits: [
        { cell: { rowId: "1", colId: name }, value: "alice" },
        { cell: { rowId: "2", colId: name }, value: "bob" },
      ],
    });

    expect(valueEvents).toEqual([]);
    expect(cellsEvents).toEqual([]);
    expect(core.getHistoryState().undoDepth).toBe(0);
  });
});
