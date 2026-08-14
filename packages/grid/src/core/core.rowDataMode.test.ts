/**
 * B6 `rowDataMode`. A replacement `rowData` array (which is what both wrappers hand the core when
 * the prop's reference changes) is diffed against the current rows by id and applied as a
 * transaction, instead of re-ingesting the whole data set. That keeps node identity, edit history
 * and the page. Diffing is automatic where it is possible — client-side model, a stable row id, no
 * tree data — and `rowDataMode: "reset"` forces the wholesale replacement back.
 *
 * A row counts as changed only when its object REFERENCE differs, so these tests are careful about
 * which row objects they reuse: handing back the same object means "unchanged", by design.
 *
 * Every test builds its own rows. Committed edits write into the caller's row objects (the
 * documented in-place contract), so a shared fixture would leak edited values across tests.
 */
import { describe, expect, it, vi } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { GridOptions } from "../interfaces/gridOptions";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

type Row = { id: string; name: string; qty: number };

const makeRows = (): Row[] => [
  { id: "1", name: "alice", qty: 3 },
  { id: "2", name: "bob", qty: 7 },
  { id: "3", name: "carol", qty: 5 },
];

/** Grid over its own copy of the rows; the caller gets the exact array the grid holds. */
function makeGrid(options: Partial<GridOptions> = {}): { core: GridCore; rows: Row[] } {
  const rows = makeRows();
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(rows);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true, type: ColumnType.STRING },
    { colId: "qty", key: "qty", label: "Qty", editable: true, type: ColumnType.NUMBER },
  ]);
  return { core, rows };
}

const colId = (core: GridCore, key: string) => core.getColumnModel().getByColId(key)!.instanceID;

function viewIds(core: GridCore): string[] {
  const out: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) out.push(core.getRowIdAtViewIndex(i)!);
  return out;
}

/** A fresh array of fresh row objects — the immutable-update pattern diff mode exists for. */
const cloneAll = (rows: Row[]): Row[] => rows.map(r => ({ ...r }));

describe("rowDataMode — diffing a replacement rowData array", () => {
  it("keeps edit history across a new array reference", () => {
    const { core, rows } = makeGrid();
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(core, "qty") }, value: 50, parsed: true });
    expect(core.canUndo()).toBe(true);

    core.setRowData(cloneAll(rows));

    expect(core.canUndo()).toBe(true);
    core.dispatch({ type: "undo" });
    expect(core.getCellValue("1", "qty")).toBe(3);
  });

  it("keeps the current page across a new array reference", () => {
    const { core, rows } = makeGrid({ pagination: true, pageSize: 2, pageSizes: [2] });
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    expect(core.getPaginationInfo().pageIndex).toBe(1);

    core.setRowData(cloneAll(rows));

    expect(core.getPaginationInfo().pageIndex).toBe(1);
    expect(viewIds(core)).toEqual(["3"]);
  });

  it("keeps node identity for rows the new array did not change", () => {
    const { core, rows } = makeGrid();
    const before = core.getRowModel().getRowNode("2");
    // Row 1 replaced with a new object; rows 2 and 3 are handed back by reference.
    core.setRowData([{ ...rows[0], qty: 99 }, rows[1], rows[2]]);
    expect(core.getRowModel().getRowNode("2")).toBe(before);
    expect(core.getCellValue("1", "qty")).toBe(99);
  });

  it("keeps node identity even for rows it updates, so renderers can diff", () => {
    const { core, rows } = makeGrid();
    const before = core.getRowModel().getRowNode("1");
    core.setRowData([{ ...rows[0], qty: 99 }, rows[1], rows[2]]);
    expect(core.getRowModel().getRowNode("1")).toBe(before);
  });

  it("treats a reference-identical array member as unchanged", () => {
    const { core, rows } = makeGrid({ reevaluateOnEdit: false });
    const cellsReasons: string[] = [];
    core.on("cellsChanged", (e) => cellsReasons.push(e.reason));
    // Same objects in a new array: nothing to add, update or remove, and the order is unchanged.
    core.setRowData([...rows]);
    expect(cellsReasons).toEqual([]);
  });

  it("adds, updates and removes in one replacement", () => {
    const { core, rows } = makeGrid();
    core.setRowData([
      rows[0],
      { ...rows[2], qty: 55 },
      { id: "4", name: "dave", qty: 9 },
    ]);
    expect(viewIds(core)).toEqual(["1", "3", "4"]);
    expect(core.getCellValue("3", "qty")).toBe(55);
    expect(core.getRowModel().getRowNode("2")).toBeUndefined();
  });

  it("follows the order of the incoming array when unsorted", () => {
    const { core, rows } = makeGrid();
    core.setRowData([rows[2], rows[0], rows[1]]);
    expect(viewIds(core)).toEqual(["3", "1", "2"]);
  });

  it("puts a new row where the incoming array puts it, not at the end", () => {
    const { core, rows } = makeGrid();
    core.setRowData([{ id: "0", name: "aaron", qty: 1 }, ...rows]);
    expect(viewIds(core)).toEqual(["0", "1", "2", "3"]);
  });

  it("lets an active sort win over the incoming array order", () => {
    const { core, rows } = makeGrid();
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: colId(core, "qty"), dir: "asc" }] });
    expect(viewIds(core)).toEqual(["1", "3", "2"]); // 3, 5, 7
    core.setRowData([rows[1], rows[2], rows[0]]);
    expect(viewIds(core)).toEqual(["1", "3", "2"]);
  });

  it("clamps to the last page when the replacement drops rows out from under it", () => {
    const { core, rows } = makeGrid({ pagination: true, pageSize: 2, pageSizes: [2] });
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    expect(core.getPaginationInfo().pageIndex).toBe(1);

    core.setRowData([rows[0]]);

    expect(core.getPaginationInfo().pageIndex).toBe(0);
    expect(viewIds(core)).toEqual(["1"]);
  });

  it("resolves comparators on the first data load so a seeded initial sort applies", () => {
    // No rows at construction: comparators are derived from sample values, so they cannot resolve
    // until data arrives — and the first load now goes through the diff path (all adds).
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([
      { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
      { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, sort: "asc" },
    ]);
    core.setRowData(makeRows());
    expect(viewIds(core)).toEqual(["1", "3", "2"]); // 3, 5, 7
  });
});

describe("rowDataMode — when the grid falls back to a full reset", () => {
  it('rowDataMode: "reset" discards history and returns to page 1', () => {
    const { core, rows } = makeGrid({ rowDataMode: "reset", pagination: true, pageSize: 2, pageSizes: [2] });
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(core, "qty") }, value: 50, parsed: true });
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });

    core.setRowData(cloneAll(rows));

    expect(core.canUndo()).toBe(false);
    expect(core.getPaginationInfo().pageIndex).toBe(0);
  });

  it('rowDataMode: "reset" prunes selected ids absent from the replacement', () => {
    const { core, rows } = makeGrid({ rowDataMode: "reset" });
    core.selectRowsById(["1", "2"]);
    const events: Array<{ reason?: string; added: string[]; removed: string[] }> = [];
    core.on("selectionChanged", event => events.push({ reason: event.reason, ...event.delta }));

    core.setRowData([rows[0], rows[2]]);

    expect([...core.getSelectedRowIds()]).toEqual(["1"]);
    expect(events).toEqual([{ reason: "model", added: [], removed: ["2"] }]);
  });

  it("falls back silently when no stable row id is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // No rowIdKey/getRowId: ids come from the per-object fallback, so every cloned row would look
    // like a different row and a diff would degrade to "remove all, add all".
    const rows = makeRows();
    const core = new GridCore(measurer, { rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(rows);
    core.setColumnDefsFromProps([{ colId: "qty", key: "qty", label: "Qty", editable: true, type: ColumnType.NUMBER }]);
    const firstRowId = core.getRowIdAtViewIndex(0)!;
    core.dispatch({ type: "editCommit", cell: { rowId: firstRowId, colId: colId(core, "qty") }, value: 50, parsed: true });

    core.setRowData(cloneAll(rows));

    expect(core.canUndo()).toBe(false); // reset path
    expect(core.getRowModel().getRowCount()).toBe(3);
    expect(warn).not.toHaveBeenCalled(); // "auto" never asked for diffing, so there is nothing to warn about
    warn.mockRestore();
  });

  it('warns when rowDataMode: "diff" is asked for without a stable row id', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    new GridCore(measurer, { rowModelType: "clientSide", rowDataMode: "diff" });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stable row id"));
    warn.mockRestore();
  });

  it("falls back for tree data, whose hierarchy a row-level diff does not model", () => {
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "clientSide",
      treeData: { mode: "path", getPath: (r: any) => r.path },
    });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    const tree = [
      { id: "1", path: ["a"], qty: 1 },
      { id: "2", path: ["a", "b"], qty: 2 },
    ];
    core.setRowData(tree);
    core.setColumnDefsFromProps([{ colId: "qty", key: "qty", label: "Qty", editable: true, type: ColumnType.NUMBER }]);
    core.dispatch({ type: "editCommit", cell: { rowId: "1", colId: colId(core, "qty") }, value: 50, parsed: true });

    core.setRowData(tree.map(r => ({ ...r })));

    expect(core.canUndo()).toBe(false); // reset path
  });
});

describe("rowDataMode — state that survives either way", () => {
  it("keeps group expansion across a diffed replacement", () => {
    const { core, rows } = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["name"] });
    const group = core.getRowModel().getGroupNodes()[0];
    expect(group).toBeDefined();
    core.dispatch({ type: "groupToggleExpand", groupId: group.id, expanded: true });

    core.setRowData(cloneAll(rows));

    expect(core.getRowModel().getRowNode(group.id)?.isExpanded).toBe(true);
  });

  it("keeps selection across a diffed replacement", () => {
    const { core, rows } = makeGrid();
    core.selectRowsById(["2"], "set");
    core.setRowData(cloneAll(rows));
    expect([...core.getSelectedRowIds()]).toEqual(["2"]);
  });
});
