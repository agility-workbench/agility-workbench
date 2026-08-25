import { describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { computePivotArrangeOrder } from "./columnInteraction";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

// Pivoted on quarter (Q1, Q2), two measures → center anchors:
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
  return { core, anchors };
}

const id = (path: string, colId: string) => `pv:${path}|${colId}|sum`;

describe("computePivotArrangeOrder (free-mode header drag)", () => {
  it("moves a value leaf into another group's span", () => {
    const { core, anchors } = makePivoted();
    // Drag Q1·revenue (anchor 1) to between Q2·revenue and Q2·units (targetIndex 4).
    const order = computePivotArrangeOrder(core, anchors[1], 4, anchors);
    expect(order).toEqual([id("Q1", "units"), id("Q2", "revenue"), id("Q1", "revenue"), id("Q2", "units")]);
  });

  it("moves a whole generated group as a contiguous block", () => {
    const { core, anchors } = makePivoted();
    // The displayed Q2 group root.
    const q2 = core.getColumnModel().getCenterColumns()
      .find(col => col.isPivotResultColumn() && col.label === "Q2")!;
    // Drop before the pivot area's first leaf (targetIndex 1).
    const order = computePivotArrangeOrder(core, q2, 1, anchors);
    expect(order).toEqual([id("Q2", "revenue"), id("Q2", "units"), id("Q1", "revenue"), id("Q1", "units")]);
  });

  it("clamps a drop before the auto-group column to the front of the pivot area", () => {
    const { core, anchors } = makePivoted();
    const order = computePivotArrangeOrder(core, anchors[4], 0, anchors);
    expect(order).toEqual([id("Q2", "units"), id("Q1", "revenue"), id("Q1", "units"), id("Q2", "revenue")]);
  });

  it("appends at the far end", () => {
    const { core, anchors } = makePivoted();
    const order = computePivotArrangeOrder(core, anchors[1], anchors.length, anchors);
    expect(order).toEqual([id("Q1", "units"), id("Q2", "revenue"), id("Q2", "units"), id("Q1", "revenue")]);
  });

  it("returns null for no-op drops and non-pivot columns", () => {
    const { core, anchors } = makePivoted();
    expect(computePivotArrangeOrder(core, anchors[1], 1, anchors)).toBeNull();
    expect(computePivotArrangeOrder(core, anchors[1], 2, anchors)).toBeNull();
    expect(computePivotArrangeOrder(core, anchors[1], -1, anchors)).toBeNull();
    expect(computePivotArrangeOrder(core, anchors[0], 3, anchors)).toBeNull(); // auto-group column
  });
});
