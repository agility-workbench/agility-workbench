import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

function makeGrid() {
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
    { id: "3", region: "East", quarter: "Q1", units: 4, revenue: 30 },
  ]);
  return { core, api: new GridAPI(core) };
}

describe("role APIs (colId-addressed grouping and aggregates)", () => {
  it("setRowGroupColumns replaces the grouping in level order and getRowGroupColumns reads it back", () => {
    const { core, api } = makeGrid();
    api.setRowGroupColumns(["quarter", "region"]);
    expect(api.getRowGroupColumns()).toEqual(["quarter", "region"]);
    expect(core.getRowGroupColumns().map(col => col.colId)).toEqual(["quarter", "region"]);

    api.setRowGroupColumns(["region"]);
    expect(api.getRowGroupColumns()).toEqual(["region"]);

    api.setRowGroupColumns([]);
    expect(api.getRowGroupColumns()).toEqual([]);
    expect(core.getRowGroupColumns()).toHaveLength(0);
  });

  it("setRowGroupColumns skips unknown colIds", () => {
    const { api } = makeGrid();
    api.setRowGroupColumns(["nope", "region"]);
    expect(api.getRowGroupColumns()).toEqual(["region"]);
  });

  it("setAggregates assigns by colId, keeps entry order, and getAggregates reads colIds back", () => {
    const { core, api } = makeGrid();
    api.setAggregates([
      { colId: "revenue", type: AggregateType.SUM },
      { colId: "units", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.AVG },
    ]);
    expect(api.getAggregates()).toEqual([
      { colId: "revenue", type: AggregateType.SUM },
      { colId: "units", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.AVG },
    ]);
    // Internally keyed by instanceID.
    const revenue = core.getColumnModel().getByColId("revenue")!;
    expect(core.getAggregateModel()[0]).toEqual({ key: revenue.instanceID, type: AggregateType.SUM });

    api.setAggregates([]);
    expect(api.getAggregates()).toEqual([]);
  });

  it("setAggregates skips unknown colIds and collapses exact duplicates", () => {
    const { api } = makeGrid();
    api.setAggregates([
      { colId: "ghost", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.SUM },
    ]);
    expect(api.getAggregates()).toEqual([{ colId: "revenue", type: AggregateType.SUM }]);
  });

  it("aggregate entry order sets the generated pivot column order", () => {
    const { api } = makeGrid();
    api.setRowGroupColumns(["region"]);
    api.setAggregates([
      { colId: "revenue", type: AggregateType.SUM },
      { colId: "units", type: AggregateType.SUM },
    ]);
    api.setPivotColumns(["quarter"]);
    api.setPivotMode(true);
    const before = api.getPivotResultColumns()
      .filter(desc => desc.groupPath[0] === "Q1")
      .map(desc => desc.valueColId);
    expect(before).toEqual(["revenue", "units"]);

    api.setAggregates([
      { colId: "units", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.SUM },
    ]);
    const after = api.getPivotResultColumns()
      .filter(desc => desc.groupPath[0] === "Q1")
      .map(desc => desc.valueColId);
    expect(after).toEqual(["units", "revenue"]);
  });

  it("round-trips through the sheet/view-state seam (roles are per-sheet state)", () => {
    const { api } = makeGrid();
    api.setRowGroupColumns(["region"]);
    api.setAggregates([{ colId: "revenue", type: AggregateType.AVG }]);
    const state = api.captureViewState();
    api.setRowGroupColumns([]);
    api.setAggregates([]);
    api.applyViewState(state);
    expect(api.getRowGroupColumns()).toEqual(["region"]);
    expect(api.getAggregates()).toEqual([{ colId: "revenue", type: AggregateType.AVG }]);
  });
});
