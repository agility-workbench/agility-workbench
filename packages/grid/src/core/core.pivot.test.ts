import { describe, expect, it, beforeEach, vi } from "vitest";
import { GridCore } from "./core";
import { GridAPI } from "../api/api";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { AggregateType } from "../interfaces/aggregate";
import { IRowNode } from "../interfaces/iRowNode";
import { PIVOT_TOTAL_GROUP_ID } from "../csrm/pivot";
import { ColumnMenuService } from "../menu/columnMenuService";
import { MenuItem } from "../interfaces/menuItem";
import { GridViewState } from "../interfaces/gridView";

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

// Menu items nest into submenus; commands are addressed by name wherever they sit.
function findMenuItem(items: MenuItem[], command: string): MenuItem | undefined {
  for (const item of items) {
    if (item.command === command) return item;
    const found = item.subMenu && findMenuItem(item.subMenu, command);
    if (found) return found;
  }
  return undefined;
}

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

describe("GridCore pivot state layers", () => {
  let core: GridCore;
  beforeEach(() => { core = makeGrid(); });

  // The whole point of the layers: roles assigned while pivoted describe the pivot view only.
  const configureInsidePivot = () => {
    core.dispatch({ type: "pivotModeSet", on: true });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });
  };

  it("discards roles assigned while pivoted, and reinstates them on re-entry", () => {
    configureInsidePivot();
    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);

    core.dispatch({ type: "pivotModeSet", on: false });
    // Back to the plain grid: no auto-group column, no grouping, no measures, leaf rows again.
    expect(leafColIds(core)).toEqual(["region", "quarter", "revenue"]);
    expect(core.getRowGroupColumns()).toEqual([]);
    expect(core.getAggregateModel()).toEqual([]);
    expect(core.getPivotColumns()).toEqual([]);
    expect(viewNodes(core).map(n => n.id)).toEqual(["1", "2", "3", "4"]);

    // Turning it back on reinstates the configuration the user left, not a blank pivot.
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);
    expect(core.getRowGroupColumns().map(c => c.colId)).toEqual(["region"]);
    expect(core.getPivotColumns().map(c => c.colId)).toEqual(["quarter"]);
    expect(viewNodes(core).map(n => n.groupKey)).toEqual(["APAC", "EMEA"]);
  });

  it("restores the state the flat grid had, not the state the pivot view ended with", () => {
    // Grouped by region and pivoted from there; the pivot view then regroups by quarter.
    enterPivot(core);
    core.dispatch({ type: "rowGroupSet", colIds: ["quarter"] });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["region"] });

    core.dispatch({ type: "pivotModeSet", on: false });
    expect(core.getRowGroupColumns().map(c => c.colId)).toEqual(["region"]);
    expect(core.getAggregateModel()).toHaveLength(1);
    expect(core.getPivotColumns().map(c => c.colId)).toEqual(["quarter"]);

    core.dispatch({ type: "pivotModeSet", on: true });
    expect(core.getRowGroupColumns().map(c => c.colId)).toEqual(["quarter"]);
    expect(core.getPivotColumns().map(c => c.colId)).toEqual(["region"]);
  });

  it("restores the aggregate scope of the flat grid", () => {
    expect(core.getAggregateScope()).toBe("none");
    configureInsidePivot();
    expect(core.getAggregateScope()).toBe("page"); // measures forced a scope
    core.dispatch({ type: "pivotModeSet", on: false });
    expect(core.getAggregateScope()).toBe("none");
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(core.getAggregateScope()).toBe("page");
  });

  it("takes sorts on generated columns out with the layout that owned them", () => {
    configureInsidePivot();
    const q2 = core.getColumnModel().getLeaves()[2];
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: q2.instanceID, dir: "desc" }] });
    expect(core.getSortModel().items).toHaveLength(1);

    core.dispatch({ type: "pivotModeSet", on: false });
    // A leftover pv: item cannot be seen or cleared from the flat grid, and silently stops group
    // buckets from sorting — so it leaves with the generated columns.
    expect(core.getSortModel().items).toEqual([]);
  });

  it("re-resolves a reinstated layer against replaced column defs", () => {
    configureInsidePivot();
    core.dispatch({ type: "pivotModeSet", on: false });
    // "quarter" is gone: its pivot role drops, the rest of the layer survives.
    core.setColumnDefsFromProps(COLUMN_DEFS.filter(d => d.colId !== "quarter").map(d => ({ ...d })));
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(core.getPivotColumns()).toEqual([]);
    expect(core.getRowGroupColumns().map(c => c.colId)).toEqual(["region"]);
    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:|revenue|sum"]);
  });

  it("exits to no roles at all when pivot mode came from the grid options", () => {
    const seeded = makeGrid({ pivotMode: true, pivotColumns: ["quarter"] });
    seeded.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    seeded.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });
    expect(seeded.getPivotMode()).toBe(true);

    seeded.dispatch({ type: "pivotModeSet", on: false });
    // Nothing was ever configured outside pivot mode, so there is no earlier state to claim it.
    expect(seeded.getRowGroupColumns()).toEqual([]);
    expect(seeded.getAggregateModel()).toEqual([]);
    expect(seeded.getColumnModel().getLeaves().map(c => c.colId))
      .toEqual(["region", "quarter", "revenue"]);
  });

  it("exits pivot the same way from the column menu as from the API", () => {
    configureInsidePivot();
    const menu = new ColumnMenuService(core);
    const autoGroup = core.getColumnModel().getLeaves()[0];
    const ctx = {
      targetColId: autoGroup.instanceID,
      colIds: [autoGroup.instanceID],
      trigger: "columnMenuButton" as const,
    };
    const exitItem = findMenuItem(menu.buildDefaultColumnMenu(ctx), "pivot.exit");
    expect(exitItem).toBeDefined();
    menu.execute(exitItem!, ctx);

    expect(core.getPivotMode()).toBe(false);
    expect(core.getRowGroupColumns()).toEqual([]);
    // The pivot configuration is stashed, not cleared: re-entering brings it back.
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);
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

  it("carries the state pivot mode exits to, so a restored view toggles off cleanly", () => {
    const core = makeGrid();
    const api = new GridAPI(core);
    // Everything configured INSIDE pivot mode: the flat grid it exits to is empty.
    core.dispatch({ type: "pivotModeSet", on: true });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
    });

    const state = api.captureViewState();
    expect(state.prePivotState).toEqual({
      rowGroupColumns: [],
      aggregateModel: [],
      pivotColumns: [],
      aggregateScope: "none",
    });
    // While pivoted, the pivot layer IS the live state — nothing stale is reported alongside it.
    expect(state.pivotState).toBeUndefined();

    const other = makeGrid();
    const otherApi = new GridAPI(other);
    otherApi.applyViewState(state);
    otherApi.setPivotMode(false);
    expect(other.getRowGroupColumns()).toEqual([]);
    expect(other.getAggregateModel()).toEqual([]);
    expect(other.getColumnModel().getLeaves().map(c => c.colId))
      .toEqual(["region", "quarter", "revenue"]);
  });

  it("carries the stashed pivot configuration of a view captured outside pivot mode", () => {
    const core = makeGrid();
    const api = new GridAPI(core);
    enterPivot(core);
    api.setPivotMode(false);

    const state = api.captureViewState();
    expect(state.pivotMode).toBe(false);
    expect(state.pivotState).toMatchObject({
      rowGroupColumns: ["region"],
      pivotColumns: ["quarter"],
      aggregateModel: [{ colId: "revenue", type: "sum" }],
    });
    expect(state.prePivotState).toBeUndefined();

    const other = makeGrid();
    const otherApi = new GridAPI(other);
    otherApi.applyViewState(state);
    otherApi.setPivotMode(true);
    expect(other.getColumnModel().getLeaves().map(c => c.colId))
      .toEqual(["__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);
  });

  it("applies column state to the stashed sources while pivoted, leaving the pivot header intact", () => {
    const core = makeGrid();
    const api = new GridAPI(core);
    // A layout worth restoring: revenue first, quarter hidden and narrower.
    const state = api.getColumnState().map(s => ({ ...s }));
    const at = (colId: string) => state.find(s => s.colId === colId)!;
    at("revenue").order = 0;
    at("region").order = 1;
    at("quarter").order = 2;
    at("quarter").hidden = true;
    at("quarter").widthPx = 77;

    enterPivot(core);
    // Column state addresses the SOURCE columns (that is what getColumnState captures while
    // pivoted), so restoring must not walk the generated tree — it used to throw and wipe the
    // header, leaving a layout the signature cache would never rebuild.
    expect(() => api.applyColumnState(state)).not.toThrow();
    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);

    // The restore landed on the stash: getColumnState reads it back, and exiting pivot displays it.
    expect(api.getColumnState().map(s => s.colId)).toEqual(["revenue", "region", "quarter"]);
    api.setPivotMode(false);
    expect(core.getColumnModel().getColumns().map(c => c.colId))
      .toEqual(["__pte_group__", "revenue", "region", "quarter"]);
    const quarter = core.getColumnModel().getByColId("quarter")!;
    expect(quarter.hidden).toBe(true);
    expect(quarter.computedWidth).toBe(77);
  });

  it("survives a pre-pivot view state (no pivotMode field) applied while pivoted", () => {
    const core = makeGrid();
    const api = new GridAPI(core);
    enterPivot(core);
    // A capture from before pivot existed: same shape, no pivotMode field.
    const { pivotMode: _pivotMode, ...legacy } = api.captureViewState();
    // Without a pivotMode field applyViewState leaves the mode alone (every other field is
    // restored as usual), so the column state lands while the generated layout is displayed.
    expect(() => api.applyViewState(legacy as GridViewState)).not.toThrow();
    expect(core.getPivotMode()).toBe(true);
    expect(leafColIds(core)).toEqual(["__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);
  });

  it("never inherits another view's stashed pivot configuration", () => {
    const core = makeGrid();
    const api = new GridAPI(core);
    enterPivot(core);
    api.setPivotMode(false); // this grid now holds a stash

    // A state that addresses pivot mode but carries no layers describes a view with no pivot
    // history — entering pivot on it must start blank, not resurrect this grid's stash.
    api.applyViewState({ ...new GridAPI(makeGrid()).captureViewState(), pivotMode: false });
    api.setPivotMode(true);
    expect(core.getRowGroupColumns()).toEqual([]);
    expect(core.getPivotColumns()).toEqual([]);
    expect(core.getAggregateModel()).toEqual([]);
  });
});
