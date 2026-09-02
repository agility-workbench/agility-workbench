import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { GridOptions } from "../interfaces/gridOptions";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

// A pivoted grid WITHOUT groupRowsSelectable: every body row is a group row, and selection /
// navigation must work on them regardless (the pivot rows ARE the data).
function makePivoted(options: GridOptions = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  core.setRowData([
    { id: "1", region: "West", quarter: "Q1", revenue: 10 },
    { id: "2", region: "West", quarter: "Q2", revenue: 20 },
    { id: "3", region: "East", quarter: "Q1", revenue: 30 },
  ]);
  const revenue = core.getColumnModel().getByColId("revenue")!;
  core.dispatch({
    type: "aggregateModelSet",
    aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }],
  });
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
  core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
  core.dispatch({ type: "pivotModeSet", on: true });
  return core;
}

describe("cell selection and navigation on pivot rows", () => {
  it("focus and arrow navigation land on pivot group rows without groupRowsSelectable", () => {
    const core = makePivoted();
    expect(core.getOptions().groupRowsSelectable).toBe(false);
    expect(core.getRowModel().getRowNodeAtViewIndex(0)!.isGroup).toBe(true);

    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0, reason: "api" });
    expect(core.getActiveCell()?.row).toBe(0);
    core.dispatch({ type: "navigate", dir: "down" });
    expect(core.getActiveCell()?.row).toBe(1);
    expect(core.getRowModel().getRowNodeAtViewIndex(1)!.isGroup).toBe(true);
  });

  it("range selection spans pivot rows", () => {
    const core = makePivoted();
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 1, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 2, mode: "extend" });
    const range = core.getSelectionRange()!;
    expect(range.rowStart).toBe(0);
    expect(range.rowEnd).toBe(1);
  });

  it("keeps pivot rows out of ROW selection (checkability still follows groupRowsSelectable)", () => {
    const core = makePivoted({ rowSelection: true });
    core.dispatch({ type: "rowSelectSet", viewIdx: 0, mode: "toggle" });
    expect(core.getSelectedRowIds().size).toBe(0);
  });

  it("leaves non-pivot grouped views gated exactly as before", () => {
    const core = makePivoted();
    core.dispatch({ type: "pivotModeSet", on: false });
    // Fully expand so group headers interleave with leaves; the cursor must skip group rows again.
    core.dispatch({ type: "groupSetExpanded", expanded: true });
    const nodes = Array.from(
      { length: core.getRowModel().getViewCount() },
      (_, i) => core.getRowModel().getRowNodeAtViewIndex(i)!,
    );
    const leafBeforeGroupIdx = nodes.findIndex((n, i) => !n.isGroup && nodes[i + 1]?.isGroup && nodes[i + 2]);
    expect(leafBeforeGroupIdx).toBeGreaterThanOrEqual(0);
    core.dispatch({ type: "focusSet", viewIdx: leafBeforeGroupIdx, colIdx: 0, reason: "api" });
    core.dispatch({ type: "navigate", dir: "down" });
    const active = core.getActiveCell()!;
    expect(active.row).toBeGreaterThan(leafBeforeGroupIdx + 1);
    expect(core.getRowModel().getRowNodeAtViewIndex(active.row)!.isGroup).toBe(false);
  });
});
