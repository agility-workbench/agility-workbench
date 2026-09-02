import { describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { computePivotMeasureReorder } from "./columnInteraction";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

// Pivoted on quarter (Q1, Q2) with two measures → center leaves:
// [auto-group, Q1·revenue, Q1·units, Q2·revenue, Q2·units].
function makePivoted() {
  const core = new GridCore(measurer, { rowIdKey: "id" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "units", key: "units", label: "Units", type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  core.setRowData([
    { id: "1", region: "West", quarter: "Q1", units: 2, revenue: 10 },
    { id: "2", region: "West", quarter: "Q2", units: 3, revenue: 20 },
  ]);
  const byColId = (colId: string) => core.getColumnModel().getByColId(colId)!;
  core.dispatch({
    type: "aggregateModelSet",
    aggregateModels: [
      { key: byColId("revenue").instanceID, type: AggregateType.SUM },
      { key: byColId("units").instanceID, type: AggregateType.SUM },
    ],
  });
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
  core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
  core.dispatch({ type: "pivotModeSet", on: true });
  const anchors = core.getColumnModel().getLeavesBySection("center");
  return { core, anchors, byColId };
}

const types = (core: GridCore) =>
  core.getAggregateModel().map(entry => `${core.getColumnModel().getById(entry.key)!.colId}:${entry.type}`);

describe("computePivotMeasureReorder (header drag of generated value leaves)", () => {
  it("moving a leaf after its group sibling reorders the measures", () => {
    const { core, anchors } = makePivoted();
    expect(anchors.map(c => c.colId.split("|")[0].startsWith("pv:"))).toEqual([false, true, true, true, true]);
    // Drag Q1·revenue (anchor 1) to between Q1·units and Q2·revenue (targetIndex 3).
    const next = computePivotMeasureReorder(core, anchors[1], 3, anchors)!;
    expect(next).not.toBeNull();
    core.dispatch({ type: "aggregateModelSet", aggregateModels: next });
    expect(types(core)).toEqual(["units:sum", "revenue:sum"]);
    // The generated leaves in every group follow.
    const q1 = core.getPivotResultColumns().filter(d => d.groupPath[0] === "Q1").map(d => d.valueColId);
    expect(q1).toEqual(["units", "revenue"]);
  });

  it("moving a leaf to the front of the pivot area works from any group", () => {
    const { core, anchors } = makePivoted();
    // Drag Q2·units (anchor 4) to before Q1·revenue (targetIndex 1; left neighbor is the
    // auto-group column, so the right neighbor names insert-before).
    const next = computePivotMeasureReorder(core, anchors[4], 1, anchors)!;
    core.dispatch({ type: "aggregateModelSet", aggregateModels: next });
    expect(types(core)).toEqual(["units:sum", "revenue:sum"]);
  });

  it("returns null for no-op drops (onto itself or its own right edge)", () => {
    const { core, anchors } = makePivoted();
    expect(computePivotMeasureReorder(core, anchors[1], 1, anchors)).toBeNull();
    expect(computePivotMeasureReorder(core, anchors[1], 2, anchors)).toBeNull();
    expect(computePivotMeasureReorder(core, anchors[1], -1, anchors)).toBeNull();
  });

  it("returns null when dropped outside the pivot area or for non-measure columns", () => {
    const { core, anchors } = makePivoted();
    // A fake anchor list without measures (e.g. a pinned utility section).
    const rowNumberOnly = anchors.slice(0, 1);
    expect(computePivotMeasureReorder(core, anchors[1], 0, rowNumberOnly)).toBeNull();
    // The auto-group column is not a measure leaf.
    expect(computePivotMeasureReorder(core, anchors[0], 2, anchors)).toBeNull();
  });

  it("appending at the far end moves the measure last", () => {
    const { core, anchors } = makePivoted();
    // Drag Q1·revenue past everything (targetIndex = anchors.length).
    const next = computePivotMeasureReorder(core, anchors[1], anchors.length, anchors)!;
    core.dispatch({ type: "aggregateModelSet", aggregateModels: next });
    expect(types(core)).toEqual(["units:sum", "revenue:sum"]);
  });
});
