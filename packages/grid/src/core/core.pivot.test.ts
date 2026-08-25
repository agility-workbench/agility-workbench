import { describe, expect, it, beforeEach, vi } from "vitest";
import { GridCore } from "./core";
import { GridAPI } from "../api/api";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { AggregateType } from "../interfaces/aggregate";
import { IRowNode } from "../interfaces/iRowNode";
import { PIVOT_TOTAL_GROUP_ID } from "../csrm/pivot";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// Region → Quarter × Revenue, with predictable sums:
//   EMEA: Q1 = 20, Q2 = 10        APAC: Q1 = 5, Q2 = 40
const ROWS = [
  { id: "1", region: "EMEA", quarter: "Q2", revenue: 10 },
  { id: "2", region: "EMEA", quarter: "Q1", revenue: 20 },
  { id: "3", region: "APAC", quarter: "Q1", revenue: 5 },
  { id: "4", region: "APAC", quarter: "Q2", revenue: 40 },
];

const COLUMN_DEFS = [
  { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
  { colId: "quarter", key: "quarter", label: "Quarter", type: ColumnType.STRING },
  { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
];

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps(COLUMN_DEFS.map(d => ({ ...d })));
  return core;
}

function viewNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) out.push(rm.getRowNodeAtViewIndex(i)!);
  return out;
}

function enterPivot(core: GridCore) {
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
  core.dispatch({
    type: "aggregateModelSet",
    aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
  });
  core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
  core.dispatch({ type: "pivotModeSet", on: true });
}

const leafColIds = (core: GridCore) =>
  core.getColumnModel().getLeaves().map(c => c.colId);

describe("GridCore pivot mode", () => {
  let core: GridCore;
  beforeEach(() => { core = makeGrid(); });

  it("swaps the layout to auto-group + generated columns and shows only group rows", () => {
    enterPivot(core);
    expect(core.getPivotMode()).toBe(true);
    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);

    const nodes = viewNodes(core);
    expect(nodes.map(n => n.groupKey)).toEqual(["APAC", "EMEA"]);
    expect(nodes.every(n => n.isGroup && n.expandable === false)).toBe(true);

    // Values stamped by the generated columns' instanceIDs — what the cell renderer reads.
    const q1 = core.getColumnModel().getLeaves()[1];
    const emea = nodes.find(n => n.groupKey === "EMEA")!;
    expect(emea.aggregateValues![q1.instanceID]).toBe(20);
  });

  it("hides non-participating source columns and restores them exactly on exit", () => {
    const beforeIds = core.getColumnModel().getLeaves().map(c => c.instanceID);
    enterPivot(core);
    expect(leafColIds(core)).not.toContain("region");
    core.dispatch({ type: "pivotModeSet", on: false });
    expect(core.getPivotMode()).toBe(false);
    // Grouping is still on, so the auto-group column leads the restored source columns.
    const after = core.getColumnModel().getLeaves();
    expect(after[0].isAutoGroupColumn()).toBe(true);
    expect(after.slice(1).map(c => c.instanceID)).toEqual(beforeIds);
    const nodes = viewNodes(core);
    expect(nodes.map(n => n.groupKey)).toEqual(["APAC", "EMEA"]);
    expect(nodes.every(n => n.expandable !== false)).toBe(true);
  });

  it("shows the Total root when pivoted without row groups", () => {
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
    core.dispatch({ type: "pivotModeSet", on: true });
    const nodes = viewNodes(core);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe(PIVOT_TOTAL_GROUP_ID);
    const q2 = core.getColumnModel().getLeaves().find(c => c.colId === "pv:Q2|revenue|sum")!;
    expect(nodes[0].aggregateValues![q2.instanceID]).toBe(50);
  });

  it("shows the degenerate grouped-aggregate view with no pivot columns", () => {
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:|revenue|sum"]);
    const rootLeaf = core.getColumnModel().getLeaves()[1];
    const emea = viewNodes(core).find(n => n.groupKey === "EMEA")!;
    expect(emea.aggregateValues![rootLeaf.instanceID]).toBe(30);
  });

  it("re-derives generated columns when edits create a new pivot value, keeping instances", () => {
    enterPivot(core);
    const q1Before = core.getColumnModel().getLeaves()[1];
    core.applyTransaction({ add: [{ id: "9", region: "EMEA", quarter: "Q3", revenue: 7 }] });
    expect(leafColIds(core)).toEqual([
      "__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum", "pv:Q3|revenue|sum",
    ]);
    // Q1's instance survived the re-discovery (registry reuse).
    expect(core.getColumnModel().getLeaves()[1]).toBe(q1Before);
    const emea = viewNodes(core).find(n => n.groupKey === "EMEA")!;
    const q3 = core.getColumnModel().getLeaves()[3];
    expect(emea.aggregateValues![q3.instanceID]).toBe(7);
  });

  it("updates pivot values live when a cell edit changes the data", () => {
    const api = new GridAPI(core);
    enterPivot(core);
    api.setCellValue({ rowId: "2", colId: "revenue" }, 100); // EMEA Q1: 20 → 100
    const q1 = core.getColumnModel().getLeaves()[1];
    const emea = viewNodes(core).find(n => n.groupKey === "EMEA")!;
    expect(emea.aggregateValues![q1.instanceID]).toBe(100);
  });

  it("sorts group rows by a generated column", () => {
    enterPivot(core);
    const q1 = core.getColumnModel().getLeaves()[1];
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: q1.instanceID, dir: "desc" }] });
    // Q1 sums: EMEA = 20, APAC = 5 → desc puts EMEA first.
    expect(viewNodes(core).map(n => n.groupKey)).toEqual(["EMEA", "APAC"]);
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: q1.instanceID, dir: "asc" }] });
    expect(viewNodes(core).map(n => n.groupKey)).toEqual(["APAC", "EMEA"]);
  });

  it("emits pivotColumnLimitReached and truncates deterministically past maxPivotColumns", () => {
    core = makeGrid({ maxPivotColumns: 1 });
    const limitEvents: any[] = [];
    core.on("pivotColumnLimitReached", e => limitEvents.push(e));
    enterPivot(core);
    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:Q1|revenue|sum"]);
    expect(limitEvents.length).toBeGreaterThan(0);
    expect(limitEvents[0]).toMatchObject({ truncatedColumnCount: 1, maxPivotColumns: 1 });
  });

  it("keeps quick filter searching source columns while pivoted", () => {
    enterPivot(core);
    core.setQuickFilter("APAC");
    const nodes = viewNodes(core);
    expect(nodes.map(n => n.groupKey)).toEqual(["APAC"]);
  });

  it("seeds pivot from initial grid options once columns exist", () => {
    const seeded = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "clientSide",
      pivotMode: true,
      pivotColumns: ["quarter"],
    });
    seeded.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    seeded.setRowData(ROWS.map(r => ({ ...r })));
    seeded.setColumnDefsFromProps(COLUMN_DEFS.map(d => ({ ...d })));
    seeded.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });
    expect(seeded.getPivotMode()).toBe(true);
    expect(seeded.getPivotColumns().map(c => c.colId)).toEqual(["quarter"]);
    expect(seeded.getColumnModel().getLeaves().map(c => c.colId))
      .toEqual(["__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);
  });

  it("refuses pivot mode with tree data", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const treeCore = new GridCore(measurer, {
        rowIdKey: "id",
        rowModelType: "clientSide",
        treeData: { mode: "parent", getParentId: () => undefined },
      });
      treeCore.dispatch({ type: "pivotModeSet", on: true });
      expect(treeCore.getPivotMode()).toBe(false);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("describes the generated columns through getPivotResultColumns", () => {
    enterPivot(core);
    const descriptors = core.getPivotResultColumns();
    expect(descriptors).toEqual([
      { colId: "pv:Q1|revenue|sum", label: "Revenue", groupPath: ["Q1"], valueColId: "revenue", aggregateType: "sum" },
      { colId: "pv:Q2|revenue|sum", label: "Revenue", groupPath: ["Q2"], valueColId: "revenue", aggregateType: "sum" },
    ]);
  });

  it("suffixes labels when a source column carries multiple aggregates", () => {
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [
        { key: "revenue", type: AggregateType.SUM },
        { key: "revenue", type: AggregateType.AVG },
      ],
    });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(leafColIds(core)).toEqual([
      "__pte_group__",
      "pv:Q1|revenue|sum", "pv:Q1|revenue|avg",
      "pv:Q2|revenue|sum", "pv:Q2|revenue|avg",
    ]);
    const leaves = core.getColumnModel().getLeaves();
    expect(leaves[1].label).toBe("Revenue (sum)");
    expect(leaves[2].label).toBe("Revenue (avg)");
    const emea = viewNodes(core).find(n => n.groupKey === "EMEA")!;
    expect(emea.aggregateValues![leaves[2].instanceID]).toBe(20); // avg of the single EMEA Q1 row
  });
});

describe("GridAPI pivot view state", () => {
  it("round-trips pivot mode, pivot columns, and the aggregate model", () => {
    const core = makeGrid();
    const api = new GridAPI(core);
    enterPivot(core);
    const state = api.captureViewState();
    expect(state.pivotMode).toBe(true);
    expect(state.pivotColumns).toEqual(["quarter"]);
    expect(state.aggregateModel).toEqual([{ colId: "revenue", type: "sum" }]);
    // Column state describes the stashed SOURCE columns, never the generated layout.
    expect(state.columns.map(c => c.colId)).toEqual(["region", "quarter", "revenue"]);

    // Apply onto a fresh grid: same generated layout, same values.
    const other = makeGrid();
    const otherApi = new GridAPI(other);
    otherApi.applyViewState(state);
    expect(other.getPivotMode()).toBe(true);
    expect(other.getColumnModel().getLeaves().map(c => c.colId))
      .toEqual(["__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);

    // A non-pivot state drops the other grid back out of pivot.
    const flat = makeGrid();
    const flatState = new GridAPI(flat).captureViewState();
    otherApi.applyViewState(flatState);
    expect(other.getPivotMode()).toBe(false);
    expect(other.getColumnModel().getLeaves().map(c => c.colId))
      .toEqual(["region", "quarter", "revenue"]);
  });
});
