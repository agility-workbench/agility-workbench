/**
 * gridOptions.groupColumnDef — the auto-generated group column ("singleColumn" display mode) is an
 * ordinary column, not a special-cased one:
 *  - defaults: unpinned, movable, resizable, sortable;
 *  - groupColumnDef layers client overrides (label, width, pinned, flags) over those defaults;
 *  - identity / grouping-machinery fields (colId, key, groupable, aggregatable, filter) stay
 *    grid-owned;
 *  - pin / move / resize dispatches act on it like any other column;
 *  - sorting it orders the group buckets at every grouping level.
 */
import { describe, it, expect } from "vitest";
import { GridCore } from "./core";
import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IRowNode } from "../interfaces/iRowNode";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", region: "EMEA", country: "UK", sales: 10 },
  { id: "2", region: "EMEA", country: "France", sales: 5 },
  { id: "3", region: "APAC", country: "Japan", sales: 30 },
  { id: "4", region: "APAC", country: "India", sales: 15 },
];

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
  ]);
  return core;
}

const groupCol = (core: GridCore): Column => core.getColumnModel().getAutoGroupColumns()[0];

function viewNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) out.push(rm.getRowNodeAtViewIndex(i)!);
  return out;
}

const groupKeysAtLevel = (core: GridCore, level: number) =>
  viewNodes(core).filter(n => n.isGroup && n.level === level).map(n => n.groupKey);

describe("auto-group column defaults (no special treatment)", () => {
  it("is unpinned, movable, resizable, and sortable by default", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const col = groupCol(core);
    expect(col.pinned).toBeNull();
    expect(col.movable).toBe(true);
    expect(col.resizable).toBe(true);
    expect(col.sortable).toBe(true);
    // Unpinned → it lives in the center section, ahead of the user columns.
    expect(core.getColumnModel().getCenterColumns()[0]).toBe(col);
    expect(core.getColumnModel().getLeftColumns()).toHaveLength(0);
  });
});

describe("gridOptions.groupColumnDef", () => {
  it("layers client overrides over the defaults", () => {
    const core = makeGrid({
      groupColumnDef: { label: "Category", width: 333, pinned: "right", movable: false, resizable: false, sortable: false },
    });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const col = groupCol(core);
    expect(col.label).toBe("Category");
    expect(col.computedWidth).toBe(333);
    expect(col.pinned).toBe("right");
    expect(col.movable).toBe(false);
    expect(col.resizable).toBe(false);
    expect(col.sortable).toBe(false);
    expect(core.getColumnModel().getRightColumns()[0]).toBe(col);
  });

  it("keeps identity and grouping-machinery fields grid-owned", () => {
    const core = makeGrid({
      groupColumnDef: { colId: "mine", key: "mine", groupable: true, aggregatable: true, filter: true },
    });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const col = groupCol(core);
    expect(col.colId).toBe("__pte_group__");
    expect(col.key).toBe("__pte_group__");
    expect(col.isAutoGroupColumn()).toBe(true);
    expect(col.groupable).toBe(false);
    expect(col.aggregatable).toBe(false);
    expect(col.filter).toBe(false);
  });

  it("a sortable: false override blocks header sorting", () => {
    const core = makeGrid({ groupColumnDef: { sortable: false } });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: groupCol(core).instanceID });
    expect(core.getSortModel().items).toHaveLength(0);
  });
});

describe("pin / move / resize the auto-group column", () => {
  it("pins left, right, and unpins via the regular columnPin dispatch", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const id = groupCol(core).instanceID;

    core.dispatch({ type: "columnPin", colIds: [id], pinned: "left" });
    expect(groupCol(core).pinned).toBe("left");
    expect(core.getColumnModel().getLeftColumns().some(c => c.isAutoGroupColumn())).toBe(true);

    core.dispatch({ type: "columnPin", colIds: [groupCol(core).instanceID], pinned: "right" });
    expect(groupCol(core).pinned).toBe("right");
    expect(core.getColumnModel().getRightColumns().some(c => c.isAutoGroupColumn())).toBe(true);

    core.dispatch({ type: "columnPin", colIds: [groupCol(core).instanceID], pinned: null });
    expect(groupCol(core).pinned).toBeNull();
    expect(core.getColumnModel().getCenterColumns().some(c => c.isAutoGroupColumn())).toBe(true);
  });

  it("moves within the center section and keeps its position across later layout rebuilds", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const id = groupCol(core).instanceID;

    core.dispatch({ type: "columnMove", colId: id, toIndex: 2, toSection: "center" });
    const orderAfterMove = core.getColumnModel().getCenterColumns().map(c => c.colId);
    expect(orderAfterMove.indexOf("__pte_group__")).toBeGreaterThan(0);
    // The canonical auto-group list tracks the moved (rebuilt) instance.
    expect(core.getColumnModel().getCenterColumns()).toContain(groupCol(core));

    // A later visibility toggle rebuilds the layout; the moved position must not snap back.
    core.dispatch({ type: "columnVisibility", colIds: [core.getColumnModel().getByColId("sales")!.instanceID], hidden: true });
    expect(core.getColumnModel().getCenterColumns().map(c => c.colId)).toEqual(orderAfterMove);
  });

  it("resizes via the regular columnResize dispatch", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const col = groupCol(core);
    core.dispatch({ type: "columnResize", colId: col.instanceID, widthPx: 321 });
    expect(col.computedWidth).toBe(321);
    expect(col.resizedWidth).toBe(321);
  });

  it("still refuses to pin, move, or resize the row-number column", () => {
    const core = makeGrid({ rowNumbers: true });
    const rowNumberCol = () => core.getColumnModel().getLeaves().find(c => c.isRowNumberColumn())!;
    core.dispatch({ type: "columnPin", colIds: [rowNumberCol().instanceID], pinned: "right" });
    expect(rowNumberCol().pinned).toBe("left");
    core.dispatch({ type: "columnMove", colId: rowNumberCol().instanceID, toIndex: 2, toSection: "center" });
    expect(core.getColumnModel().getLeaves()[0].isRowNumberColumn()).toBe(true);
    core.dispatch({ type: "columnResize", colId: rowNumberCol().instanceID, widthPx: 300 });
    expect(rowNumberCol().computedWidth).toBe(52);
  });
});

describe("sorting the auto-group column", () => {
  it("orders group buckets at every level, cycling asc → desc", () => {
    const core = makeGrid({ groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    const id = groupCol(core).instanceID;

    core.dispatch({ type: "headerAction", action: "toggleSort", colId: id });
    expect(core.getSortModel().items.map(i => [i.key, i.dir])).toEqual([["__pte_group__", "asc"]]);
    expect(groupKeysAtLevel(core, 0)).toEqual(["APAC", "EMEA"]);
    expect(groupKeysAtLevel(core, 1)).toEqual(["India", "Japan", "France", "UK"]);

    core.dispatch({ type: "headerAction", action: "toggleSort", colId: id });
    expect(core.getSortModel().items.map(i => [i.key, i.dir])).toEqual([["__pte_group__", "desc"]]);
    expect(groupKeysAtLevel(core, 0)).toEqual(["EMEA", "APAC"]);
    expect(groupKeysAtLevel(core, 1)).toEqual(["UK", "France", "Japan", "India"]);
  });

  it("keeps an active group-column sort across regrouping (instance reuse)", () => {
    const core = makeGrid({ groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const before = groupCol(core);
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: before.instanceID });
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: before.instanceID }); // desc

    core.dispatch({ type: "rowGroupSet", colIds: ["country"] });
    expect(groupCol(core)).toBe(before);
    expect(core.getSortModel().items.map(i => [i.key, i.dir])).toEqual([["__pte_group__", "desc"]]);
    expect(groupKeysAtLevel(core, 0)).toEqual(["UK", "Japan", "India", "France"]);
  });
});
