import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { AggregateType } from "../interfaces/aggregate";
import { groupNodeId } from "../csrm/rowGroup";
import { IRowNode } from "../interfaces/iRowNode";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// Region → Country → some numeric metric, chosen so grouping produces predictable buckets.
const ROWS = [
  { id: "1", region: "EMEA", country: "UK", sales: 10 },
  { id: "2", region: "EMEA", country: "UK", sales: 20 },
  { id: "3", region: "EMEA", country: "France", sales: 5 },
  { id: "4", region: "APAC", country: "Japan", sales: 30 },
  { id: "5", region: "APAC", country: "Japan", sales: 40 },
  { id: "6", region: "APAC", country: "India", sales: 15 },
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

// Flat list of display nodes in view order.
function viewNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) out.push(rm.getRowNodeAtViewIndex(i)!);
  return out;
}

const colInstance = (core: GridCore, key: string) => core.getColumnModel().getByColId(key)!.instanceID;

describe("GridCore row grouping", () => {
  let core: GridCore;
  beforeEach(() => { core = makeGrid(); });

  it("does nothing observable until a grouping is applied (regression: empty group model)", () => {
    expect(core.getRowModel().getViewCount()).toBe(6);
    expect(viewNodes(core).every(n => !n.isGroup)).toBe(true);
  });

  it("single-level grouping shows only top-level group headers when collapsed by default", () => {
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const nodes = viewNodes(core);
    // groupDefaultExpanded defaults to 0 → all collapsed → only the two region headers show.
    expect(nodes.length).toBe(2);
    expect(nodes.every(n => n.isGroup && n.level === 0)).toBe(true);
    expect(nodes.map(n => n.groupKey).sort()).toEqual(["APAC", "EMEA"]);
    // childCount counts leaf descendants.
    const byKey = new Map(nodes.map(n => [n.groupKey, n]));
    expect(byKey.get("APAC")!.childCount).toBe(3);
    expect(byKey.get("EMEA")!.childCount).toBe(3);
  });

  it("expanding a group reveals its children; collapsing hides them again", () => {
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const apac = viewNodes(core).find(n => n.groupKey === "APAC")!;
    core.dispatch({ type: "groupToggleExpand", groupId: apac.id });

    let nodes = viewNodes(core);
    // 2 group headers + 3 APAC leaves.
    expect(nodes.length).toBe(5);
    const apacIdx = nodes.findIndex(n => n.groupKey === "APAC");
    expect(nodes.slice(apacIdx + 1, apacIdx + 4).every(n => !n.isGroup)).toBe(true);

    // Toggle again → collapsed.
    core.dispatch({ type: "groupToggleExpand", groupId: apac.id });
    nodes = viewNodes(core);
    expect(nodes.length).toBe(2);
  });

  it("multi-level grouping nests groups with increasing level", () => {
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    const emea = viewNodes(core).find(n => n.groupKey === "EMEA")!;
    core.dispatch({ type: "groupToggleExpand", groupId: emea.id, expanded: true });
    const nodes = viewNodes(core);
    const emeaIdx = nodes.findIndex(n => n.groupKey === "EMEA");
    // EMEA's children are country groups at level 1 (still collapsed → no leaves yet).
    const children = nodes.slice(emeaIdx + 1).filter(n => n.level === 1);
    expect(children.length).toBeGreaterThanOrEqual(2);
    expect(children.map(n => n.groupKey).sort()).toEqual(["France", "UK"]);
    expect(children.every(n => n.isGroup && n.level === 1)).toBe(true);
  });

  it("computes per-group aggregates over the group's leaf set", () => {
    core.setAggregateModel([{ key: colInstance(core, "sales"), type: AggregateType.SUM }]);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const nodes = viewNodes(core);
    const salesId = colInstance(core, "sales");
    const emea = nodes.find(n => n.groupKey === "EMEA")!;
    const apac = nodes.find(n => n.groupKey === "APAC")!;
    expect(emea.aggregateValues?.[salesId]).toBe(35); // 10 + 20 + 5
    expect(apac.aggregateValues?.[salesId]).toBe(85); // 30 + 40 + 15
  });

  it("widens a column so its per-group aggregate value fits", () => {
    // The per-group SUM has one more digit than any raw cell, so its formatted text is wider and the
    // column must grow beyond what the raw data alone would size it to. (Empty label keeps the
    // header-content floor low so the data width is what drives the result.)
    const c = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    c.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    c.setRowData([
      { id: "1", region: "EMEA", sales: 50000000000000 },
      { id: "2", region: "EMEA", sales: 50000000000000 },
    ]);
    c.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
      { colId: "sales", key: "sales", label: "", type: ColumnType.NUMBER },
    ]);
    const salesCol = () => c.getColumnModel().getByColId("sales")!;
    const widthBefore = salesCol().computedWidth;

    c.setAggregateModel([{ key: colInstance(c, "sales"), type: AggregateType.SUM }]);
    c.dispatch({ type: "rowGroupSet", colIds: ["region"] });

    // Raw cells are 14-digit; the group total (1e14) is 15-digit, so the column grows to fit it.
    expect(salesCol().computedWidth).toBeGreaterThan(widthBefore);
  });

  it("only computes group aggregates for columns with an aggregate configured", () => {
    // sales is aggregated; region/country are not. Group rows should carry a value for sales only,
    // not a default-op total for every column (which would clutter the grid).
    core.setAggregateModel([{ key: colInstance(core, "sales"), type: AggregateType.SUM }]);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const emea = viewNodes(core).find(n => n.groupKey === "EMEA")!;
    expect(Object.keys(emea.aggregateValues ?? {})).toEqual([colInstance(core, "sales")]);
    expect(emea.aggregateValues?.[colInstance(core, "country")]).toBeUndefined();
  });

  it("synthesizes one auto-group column in singleColumn mode and removes it when grouping clears", () => {
    expect(core.getColumnModel().getAutoGroupColumns().length).toBe(0);
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    expect(core.getColumnModel().getAutoGroupColumns().length).toBe(1);
    core.dispatch({ type: "rowGroupSet", colIds: [] });
    expect(core.getColumnModel().getAutoGroupColumns().length).toBe(0);
    expect(core.getRowModel().getViewCount()).toBe(6);
  });

  it("creates no auto-group column in multipleColumns mode and tags real grouped columns by level", () => {
    const c = makeGrid({ groupDisplayType: "multipleColumns" });
    c.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    // No synthesized columns — the real grouped columns carry the group value in place.
    expect(c.getColumnModel().getAutoGroupColumns().length).toBe(0);
    expect(c.getColumnModel().getByColId("region")!.groupLevel).toBe(0);
    expect(c.getColumnModel().getByColId("country")!.groupLevel).toBe(1);
    // A non-grouped column stays untagged.
    expect(c.getColumnModel().getByColId("sales")!.groupLevel).toBeUndefined();
  });

  it("clears per-column group-level tags when grouping is removed", () => {
    const c = makeGrid({ groupDisplayType: "multipleColumns" });
    c.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(c.getColumnModel().getByColId("region")!.groupLevel).toBe(0);
    c.dispatch({ type: "rowGroupSet", colIds: [] });
    expect(c.getColumnModel().getByColId("region")!.groupLevel).toBeUndefined();
  });

  it("creates no auto-group column in groupRows mode", () => {
    const c = makeGrid({ groupDisplayType: "groupRows" });
    c.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(c.getColumnModel().getAutoGroupColumns().length).toBe(0);
  });

  it("switches group display type in place while preserving the grouped tree", () => {
    const c = makeGrid({ groupDisplayType: "singleColumn" });
    c.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    const apac = viewNodes(c).find(n => n.groupKey === "APAC")!;
    c.dispatch({ type: "groupToggleExpand", groupId: apac.id, expanded: true });

    c.setGroupDisplayType("multipleColumns");
    expect(c.getOptions().groupDisplayType).toBe("multipleColumns");
    expect(c.getColumnModel().getAutoGroupColumns()).toHaveLength(0);
    expect(c.getColumnModel().getByColId("region")!.groupLevel).toBe(0);
    expect(c.getColumnModel().getByColId("country")!.groupLevel).toBe(1);
    expect(c.getRowModel().getRowNode(apac.id)?.isExpanded).toBe(true);

    c.setGroupDisplayType("groupRows");
    expect(c.getColumnModel().getByColId("region")!.groupLevel).toBeUndefined();
    expect(c.getColumnModel().getByColId("country")!.groupLevel).toBeUndefined();
    expect(c.getRowModel().getRowNode(apac.id)?.isExpanded).toBe(true);

    c.setGroupDisplayType("singleColumn");
    expect(c.getColumnModel().getAutoGroupColumns()).toHaveLength(1);
    expect(c.getRowModel().getRowNode(apac.id)?.isExpanded).toBe(true);
  });

  it("ignores non-groupable columns", () => {
    const c = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    c.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    c.setRowData(ROWS.map(r => ({ ...r })));
    c.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region", type: ColumnType.STRING, groupable: false },
      { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
    ]);
    c.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(c.getRowGroupColumns().length).toBe(0);
    expect(c.getRowModel().getViewCount()).toBe(6);
  });

  it("resolves the group.setMany menu command to grouping (previously unhandled)", () => {
    // Simulate what ColumnMenuService.execute does for the "Group by" item.
    core.dispatch({ type: "rowGroupSet", colIds: [colInstance(core, "region")] });
    expect(core.getRowGroupColumns().length).toBe(1);
    expect(viewNodes(core).every(n => n.isGroup)).toBe(true);
  });

  it("preserves expansion state across setRowData via stable group ids", () => {
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const apac = viewNodes(core).find(n => n.groupKey === "APAC")!;
    expect(apac.id).toBe(groupNodeId(["APAC"]));
    core.dispatch({ type: "groupToggleExpand", groupId: apac.id, expanded: true });
    expect(viewNodes(core).length).toBe(5);

    // Replace the data with the same regions; the APAC group should stay expanded.
    core.setRowData(ROWS.map(r => ({ ...r })));
    const nodesAfter = viewNodes(core);
    const apacAfter = nodesAfter.find(n => n.groupKey === "APAC")!;
    expect(apacAfter.isExpanded).toBe(true);
    // Still expanded → APAC leaves visible.
    expect(nodesAfter.length).toBe(5);
  });

  it("paginates over the flat display list (group headers + visible leaves)", () => {
    const c = makeGrid({ pagination: true, pageSize: 2, groupDefaultExpanded: -1 });
    c.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    // Flat list fully expanded = 2 headers + 6 leaves = 8 rows → 4 pages of 2.
    expect(c.getRowModel().getRowCount()).toBe(8);
    const info = c.getPaginationInfo();
    expect(info.totalRowCount).toBe(8);
    expect(info.totalPageCount).toBe(4);
    // First page shows the first two flat rows.
    expect(c.getRowModel().getViewCount()).toBe(2);
  });

  it("keeps leaves in active sort order within each group", () => {
    core.setSortModel([{ key: colInstance(core, "sales"), dir: "desc" }]);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const apac = viewNodes(core).find(n => n.groupKey === "APAC")!;
    core.dispatch({ type: "groupToggleExpand", groupId: apac.id, expanded: true });
    const nodes = viewNodes(core);
    const apacIdx = nodes.findIndex(n => n.groupKey === "APAC");
    const leaves = nodes.slice(apacIdx + 1, apacIdx + 4).filter(n => !n.isGroup);
    // APAC sales desc: 40, 30, 15.
    expect(leaves.map(n => (n.data as any).sales)).toEqual([40, 30, 15]);
  });

  it("group rows are not editable", () => {
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
    core.dispatch({ type: "editStart", cell: { rowId: group.id, colId: colInstance(core, "region") }, source: "api" });
    expect(core.getEditingCell()).toBeNull();
  });
});

describe("GridCore group row selectability (groupRowsSelectable)", () => {
  // Fully-expanded single-level grouping so group headers are interleaved with leaf rows.
  const grouped = (opts: object = {}) => {
    const c = makeGrid({ groupDefaultExpanded: -1, ...opts });
    c.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    return c;
  };

  it("arrow navigation skips over group rows by default", () => {
    const c = grouped();
    // Find a leaf row immediately followed by a group header, so a down-step must skip the header.
    const nodes = viewNodes(c);
    const leafBeforeGroupIdx = nodes.findIndex((n, i) => !n.isGroup && nodes[i + 1]?.isGroup && nodes[i + 2]);
    expect(leafBeforeGroupIdx).toBeGreaterThanOrEqual(0);

    c.dispatch({ type: "focusSet", viewIdx: leafBeforeGroupIdx, colIdx: 0, reason: "api" });
    c.dispatch({ type: "navigate", dir: "down" });
    const active = c.getActiveCell()!;
    // Landed past the group header, on the next leaf — never on the group row.
    expect(c.getRowModel().getRowNodeAtViewIndex(active.row)!.isGroup).toBe(false);
    expect(active.row).toBeGreaterThan(leafBeforeGroupIdx + 1);
  });

  it("navigation lands on group rows when groupRowsSelectable is enabled", () => {
    const c = grouped({ groupRowsSelectable: true });
    const nodes = viewNodes(c);
    const leafBeforeGroupIdx = nodes.findIndex((n, i) => !n.isGroup && nodes[i + 1]?.isGroup);
    c.dispatch({ type: "focusSet", viewIdx: leafBeforeGroupIdx, colIdx: 0, reason: "api" });
    c.dispatch({ type: "navigate", dir: "down" });
    const active = c.getActiveCell()!;
    expect(active.row).toBe(leafBeforeGroupIdx + 1);
    expect(c.getRowModel().getRowNodeAtViewIndex(active.row)!.isGroup).toBe(true);
  });

  it("updates groupRowsSelectable in place", () => {
    const c = grouped();
    const nodes = viewNodes(c);
    const leafBeforeGroupIdx = nodes.findIndex((n, i) => !n.isGroup && nodes[i + 1]?.isGroup);

    c.setGroupRowsSelectable(true);
    c.dispatch({ type: "focusSet", viewIdx: leafBeforeGroupIdx, colIdx: 0, reason: "api" });
    c.dispatch({ type: "navigate", dir: "down" });
    expect(c.getRowModel().getRowNodeAtViewIndex(c.getActiveCell()!.row)!.isGroup).toBe(true);

    c.setGroupRowsSelectable(false);
    expect(c.getOptions().groupRowsSelectable).toBe(false);
    expect(c.getSelectionRange()).toBeNull();
    expect(c.getActiveCell()).toBeNull();
  });
});
