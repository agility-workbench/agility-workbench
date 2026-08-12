/**
 * The declarative on* GridOptions callbacks bridge to the underlying core events:
 *  - onCellClicked / onRowClicked  → cellClicked / rowClicked
 *  - onSelectionChanged            → selectionChanged
 *  - onCellValueChanged            → cellValueChanged (every write path; colId = public colId)
 *  - onSortChanged                 → columnsChanged (reason "sort")
 *  - onFilterChanged               → filterChanged (canonical: column filters + quick filter)
 * Consumers can use either the option callback or api.on(...) interchangeably.
 */
import { describe, it, expect, vi } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3 },
    { id: "2", name: "bob", qty: 7 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING, editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  ]);
  return core;
}

function colId(core: GridCore, key: string): string {
  return core.getColumnModel().getByColId(key)!.instanceID;
}

describe("declarative on* callbacks", () => {
  it("onSelectionChanged fires with the snapshot when the selection changes", () => {
    const onSelectionChanged = vi.fn();
    const core = makeGrid({ onSelectionChanged });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    expect(onSelectionChanged).toHaveBeenCalled();
    expect(onSelectionChanged.mock.calls[0][0].snapshot.kind).toBeDefined();
  });

  it("onCellValueChanged fires only on a committed edit, with the new and old values", () => {
    const onCellValueChanged = vi.fn();
    const core = makeGrid({ onCellValueChanged });
    const name = colId(core, "name");
    core.dispatch({ type: "editStart", cell: { rowId: "1", colId: name }, source: "api" });
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: name }, value: "ALICE" });
    expect(onCellValueChanged).toHaveBeenCalledTimes(1);
    expect(onCellValueChanged.mock.calls[0][0]).toEqual({
      rowId: "1",
      colId: "name",
      colInstanceId: name,
      value: "ALICE",
      oldValue: "alice",
      source: "edit",
    });
  });

  it("onCellValueChanged fires per cell for batch commits and undo/redo, with source", () => {
    const onCellValueChanged = vi.fn();
    const core = makeGrid({ onCellValueChanged });
    const name = colId(core, "name");
    const qty = colId(core, "qty");
    core.dispatch({
      type: "cellsCommit",
      edits: [
        { cell: { rowId: "1", colId: name }, value: "x" },
        { cell: { rowId: "2", colId: qty }, value: "9" },
      ],
      reason: "paste",
    });
    expect(onCellValueChanged).toHaveBeenCalledTimes(2);
    expect(onCellValueChanged.mock.calls[0][0]).toEqual({
      rowId: "1", colId: "name", colInstanceId: name, value: "x", oldValue: "alice", source: "paste",
    });
    expect(onCellValueChanged.mock.calls[1][0]).toEqual({
      rowId: "2", colId: "qty", colInstanceId: qty, value: "9", oldValue: 7, source: "paste",
    });

    // Undo reports the write back to the old value; redo the write forward again.
    core.dispatch({ type: "undo" });
    const undoCalls = onCellValueChanged.mock.calls.slice(2, 4).map(call => call[0]);
    expect(undoCalls).toEqual(expect.arrayContaining([
      { rowId: "1", colId: "name", colInstanceId: name, value: "alice", oldValue: "x", source: "undo" },
      { rowId: "2", colId: "qty", colInstanceId: qty, value: 7, oldValue: "9", source: "undo" },
    ]));
    core.dispatch({ type: "redo" });
    const redoCalls = onCellValueChanged.mock.calls.slice(4, 6).map(call => call[0]);
    expect(redoCalls).toEqual(expect.arrayContaining([
      { rowId: "1", colId: "name", colInstanceId: name, value: "x", oldValue: "alice", source: "redo" },
      { rowId: "2", colId: "qty", colInstanceId: qty, value: "9", oldValue: 7, source: "redo" },
    ]));
  });

  it("onSortChanged fires when a column sort toggles", () => {
    const onSortChanged = vi.fn();
    const core = makeGrid({ onSortChanged });
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: colId(core, "qty") });
    expect(onSortChanged).toHaveBeenCalled();
  });

  it("onFilterChanged fires for column-filter changes with public colIds, and legacy events still fire", () => {
    const onFilterChanged = vi.fn();
    const core = makeGrid({ onFilterChanged });
    const legacy: string[] = [];
    core.on("columnsChanged", ev => { if (ev.reason === "filter") legacy.push("columnsChanged"); });
    const nameCol = core.getColumnModel().getByColId("name")!;
    core.setFilterModel([{ col: nameCol, key: "name", filters: [{ type: "contains" as any, values: ["ali"] }] }]);
    expect(onFilterChanged).toHaveBeenCalledTimes(1);
    expect(onFilterChanged.mock.calls[0][0]).toEqual({
      source: "filter",
      changedColIds: ["name"],
      changedColInstanceIds: [nameCol.instanceID],
    });
    expect(legacy).toEqual(["columnsChanged"]);
  });

  it("onFilterChanged fires for quick-filter changes with empty colIds, alongside modelUpdated", () => {
    const onFilterChanged = vi.fn();
    const core = makeGrid({ onFilterChanged });
    const legacy: string[] = [];
    core.on("modelUpdated", ev => { if (ev.reason === "filter") legacy.push("modelUpdated"); });
    core.dispatch({ type: "quickFilterSet", text: "alice" });
    expect(onFilterChanged).toHaveBeenCalledTimes(1);
    expect(onFilterChanged.mock.calls[0][0]).toEqual({
      source: "quickFilter",
      changedColIds: [],
      changedColInstanceIds: [],
    });
    expect(legacy).toEqual(["modelUpdated"]);
  });

  it("onFilterChanged does not fire for sort changes", () => {
    const onFilterChanged = vi.fn();
    const core = makeGrid({ onFilterChanged });
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: colId(core, "qty") });
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "name", dir: "desc" }] });
    expect(onFilterChanged).not.toHaveBeenCalled();
  });

  it("a filterChanged handler observes post-filter state (client-side apply is synchronous)", () => {
    const seen: number[] = [];
    const core = makeGrid({
      onFilterChanged: () => seen.push(core.getRowModel().getViewCount()),
    });
    core.dispatch({ type: "quickFilterSet", text: "alice" });
    expect(seen).toEqual([1]);
  });

  it("onCellClicked / onRowClicked forward the corresponding events", () => {
    const onCellClicked = vi.fn();
    const onRowClicked = vi.fn();
    const core = makeGrid({ onCellClicked, onRowClicked });
    const fakeEvent = {} as MouseEvent;
    core.emit("rowClicked", { rowId: "1", viewIdx: 0, data: { id: "1" }, isGroup: false, event: fakeEvent });
    core.emit("cellClicked", { rowId: "1", colId: colId(core, "name"), viewIdx: 0, colIdx: 0, data: { id: "1" }, value: "alice", event: fakeEvent });
    expect(onRowClicked).toHaveBeenCalledTimes(1);
    expect(onCellClicked).toHaveBeenCalledTimes(1);
    expect(onCellClicked.mock.calls[0][0]).toMatchObject({ rowId: "1", value: "alice" });
  });

  it("does not wire callbacks that were not provided (no throw, no calls)", () => {
    const core = makeGrid();
    // Just exercising the same paths without callbacks should be a no-op.
    expect(() => {
      core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
      core.dispatch({ type: "headerAction", action: "toggleSort", colId: colId(core, "qty") });
    }).not.toThrow();
  });
});
