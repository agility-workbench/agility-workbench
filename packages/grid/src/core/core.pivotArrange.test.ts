import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { GridAPI } from "../api/api";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

const ROWS = [
  { id: "1", region: "West", quarter: "Q1", units: 2, revenue: 10 },
  { id: "2", region: "West", quarter: "Q2", units: 3, revenue: 20 },
];

// Pivoted on quarter with two measures. Canonical leaf order:
// [Q1·revenue, Q1·units, Q2·revenue, Q2·units].
function makePivoted() {
  const core = new GridCore(measurer, { rowIdKey: "id" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "units", key: "units", label: "Units", type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  core.setRowData(ROWS.map(row => ({ ...row })));
  const api = new GridAPI(core);
  api.setAggregates([
    { colId: "revenue", type: AggregateType.SUM },
    { colId: "units", type: AggregateType.SUM },
  ]);
  api.setRowGroupColumns(["region"]);
  api.setPivotColumns(["quarter"]);
  api.setPivotMode(true);
  return { core, api };
}

const leafId = (path: string, colId: string) => `pv:${path}|${colId}|sum`;
const Q1R = leafId("Q1", "revenue");
const Q1U = leafId("Q1", "units");
const Q2R = leafId("Q2", "revenue");
const Q2U = leafId("Q2", "units");

const displayedLeaves = (core: GridCore) => core.getColumnModel().getDisplayedPivotLeafOrder();
// Displayed generated tree shape: one "Label[child,child]" per root fragment.
const displayedShape = (core: GridCore) =>
  core.getColumnModel().getCenterColumns()
    .filter(col => col.isPivotResultColumn())
    .map(col => `${col.label}[${col.children.map(c => c.label).join(",")}]`);

describe("manual pivot column arrangement (pivotColumnOrderSet)", () => {
  it("rearranges the displayed layout into split fragments; canonical roots stay pristine", () => {
    const { core } = makePivoted();
    expect(displayedLeaves(core)).toEqual([Q1R, Q1U, Q2R, Q2U]);

    core.dispatch({ type: "pivotColumnOrderSet", order: [Q1U, Q2R, Q1R, Q2U] });
    expect(displayedLeaves(core)).toEqual([Q1U, Q2R, Q1R, Q2U]);
    expect(displayedShape(core)).toEqual(["Q1[Units]", "Q2[Revenue]", "Q1[Revenue]", "Q2[Units]"]);
    // Canonical roots untouched — nothing was surgically removed from them.
    const canonicalLeaves = core.getColumnModel().getPivotResultRoots()
      .flatMap(root => root.getLeaves().map(leaf => leaf.colId));
    expect(canonicalLeaves).toEqual([Q1R, Q1U, Q2R, Q2U]);

    // The moved leaf is the same instance: its stamped aggregate still resolves.
    const displayed = core.getColumnModel().getLeavesBySection("center");
    const movedQ1R = displayed.find(col => col.colId === Q1R)!;
    const west = core.getRowModel().getGroupNodes().find(node => node.groupKey === "West")!;
    expect(west.aggregateValues?.[movedQ1R.instanceID]).toBe(10);
  });

  it("clearing the order restores the canonical layout", () => {
    const { core } = makePivoted();
    core.dispatch({ type: "pivotColumnOrderSet", order: [Q2R, Q2U, Q1R, Q1U] });
    core.dispatch({ type: "pivotColumnOrderSet", order: null });
    expect(displayedLeaves(core)).toEqual([Q1R, Q1U, Q2R, Q2U]);
    expect(displayedShape(core)).toEqual(["Q1[Revenue,Units]", "Q2[Revenue,Units]"]);
  });

  it("survives a data-driven re-discovery; new leaves land at their canonical position", () => {
    const { core } = makePivoted();
    core.dispatch({ type: "pivotColumnOrderSet", order: [Q2R, Q2U, Q1R, Q1U] });
    // New quarter appears from data — new discovery signature, layout rebuilt.
    core.setRowData([...ROWS.map(row => ({ ...row })), { id: "3", region: "East", quarter: "Q3", units: 5, revenue: 30 }]);
    const q3r = leafId("Q3", "revenue");
    const q3u = leafId("Q3", "units");
    // Known leaves keep the arrangement; Q3 (canonically after Q2) slots in after the Q2 block.
    expect(displayedLeaves(core)).toEqual([Q2R, Q2U, q3r, q3u, Q1R, Q1U]);
    expect(core.getPivotColumnOrder()).toEqual([Q2R, Q2U, Q1R, Q1U]);
  });

  it("resets on explicit role edits (aggregates and pivot columns)", () => {
    const { core, api } = makePivoted();
    core.dispatch({ type: "pivotColumnOrderSet", order: [Q2R, Q2U, Q1R, Q1U] });
    api.setAggregates([
      { colId: "revenue", type: AggregateType.SUM },
      { colId: "units", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.AVG },
    ]);
    expect(core.getPivotColumnOrder()).toBeNull();
    expect(displayedShape(core)).toEqual([
      "Q1[Revenue (sum),Units,Revenue (avg)]",
      "Q2[Revenue (sum),Units,Revenue (avg)]",
    ]);

    core.dispatch({ type: "pivotColumnOrderSet", order: displayedLeaves(core).reverse() });
    expect(core.getPivotColumnOrder()).not.toBeNull();
    api.setPivotColumns(["quarter"]);
    expect(core.getPivotColumnOrder()).toBeNull();
  });

  it("survives pivot off/on and applies when set before the mode turns on", () => {
    const { core, api } = makePivoted();
    core.dispatch({ type: "pivotColumnOrderSet", order: [Q2R, Q2U, Q1R, Q1U] });
    api.setPivotMode(false);
    api.setPivotMode(true);
    expect(displayedLeaves(core)).toEqual([Q2R, Q2U, Q1R, Q1U]);
  });

  it("round-trips through view state, and a state without an arrangement applies canonically", () => {
    const { core, api } = makePivoted();
    const canonicalState = api.captureViewState();
    expect(canonicalState.pivotColumnOrder).toBeUndefined();

    api.setPivotColumnOrder([Q2R, Q2U, Q1R, Q1U]);
    const arrangedState = api.captureViewState();
    expect(arrangedState.pivotColumnOrder).toEqual([Q2R, Q2U, Q1R, Q1U]);

    // Sheet-switch shape: applying the canonical state clears the arrangement…
    api.applyViewState(canonicalState);
    expect(api.getPivotColumnOrder()).toBeNull();
    expect(displayedLeaves(core)).toEqual([Q1R, Q1U, Q2R, Q2U]);

    // …and applying the arranged state restores it.
    api.applyViewState(arrangedState);
    expect(api.getPivotColumnOrder()).toEqual([Q2R, Q2U, Q1R, Q1U]);
    expect(displayedLeaves(core)).toEqual([Q2R, Q2U, Q1R, Q1U]);
  });
});
