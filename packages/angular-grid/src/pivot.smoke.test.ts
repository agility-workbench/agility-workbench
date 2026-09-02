import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { GridOptions, IGridAPI } from "@agility-workbench/grid";
import { AggregateType } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [pivotMode]="pivotMode"
      [pivotColumns]="pivotColumns"
      [pivotResultColumnDef]="pivotResultColumnDef"
      [maxPivotColumns]="maxPivotColumns"
      (gridReady)="onReady($event)"
    />
  `,
})
class PivotHost {
  api: IGridAPI | null = null;
  rows: Record<string, unknown>[] = [
    { id: "1", region: "EMEA", quarter: "Q1", revenue: 20 },
    { id: "2", region: "EMEA", quarter: "Q2", revenue: 10 },
    { id: "3", region: "APAC", quarter: "Q1", revenue: 5 },
    { id: "4", region: "APAC", quarter: "Q2", revenue: 40 },
  ];
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region" },
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "revenue", key: "revenue", label: "Revenue" },
  ];
  pivotMode: GridOptions["pivotMode"] = true;
  pivotColumns: GridOptions["pivotColumns"] = ["quarter"];
  pivotResultColumnDef: GridOptions["pivotResultColumnDef"] = undefined;
  maxPivotColumns: GridOptions["maxPivotColumns"] = undefined;

  onReady(api: IGridAPI): void {
    this.api = api;
    api.setRowGroupColumns(["region"]);
    api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
  }
}

const leafColIds = (api: IGridAPI) =>
  api.getCore().getColumnModel().getLeaves().map((column) => column.colId);

describe("AwbGrid pivot inputs", () => {
  it("applies pivotMode and pivotColumns from inputs at mount", async () => {
    const { host } = await mountGridHost(PivotHost);
    const api = host.api!;

    expect(api.getPivotMode()).toBe(true);
    expect(api.getPivotColumns()).toEqual(["quarter"]);
    expect(leafColIds(api)).toEqual([
      "__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum",
    ]);
  });

  it("reconciles pivotMode and pivotColumns live, without recreating the API", async () => {
    const { fixture, host } = await mountGridHost(PivotHost);
    const api = host.api!;

    host.pivotColumns = ["region"];
    await syncGridInputs(fixture);
    expect(host.api).toBe(api);
    expect(api.getPivotColumns()).toEqual(["region"]);
    expect(leafColIds(api)).toEqual([
      "__pte_group__", "pv:APAC|revenue|sum", "pv:EMEA|revenue|sum",
    ]);

    // Leaving pivot mode restores the source columns; the row grouping was assigned in gridReady
    // while the mode was already on, so it belongs to the pivot layer and leaves with it.
    host.pivotMode = false;
    await syncGridInputs(fixture);
    expect(api.getPivotMode()).toBe(false);
    expect(api.getRowGroupColumns()).toEqual([]);
    expect(leafColIds(api)).toEqual(["region", "quarter", "revenue"]);

    // …and turning it back on reinstates the pivot configuration.
    host.pivotMode = true;
    await syncGridInputs(fixture);
    expect(api.getRowGroupColumns()).toEqual(["region"]);
    expect(leafColIds(api)).toEqual([
      "__pte_group__", "pv:APAC|revenue|sum", "pv:EMEA|revenue|sum",
    ]);
  });

  it("forwards pivotResultColumnDef and maxPivotColumns to the generated columns", async () => {
    const { host } = await mountGridHost(PivotHost, 600, (instance) => {
      instance.pivotResultColumnDef = { width: 111 };
      instance.maxPivotColumns = 1;
    });
    const api = host.api!;

    expect(leafColIds(api)).toEqual(["__pte_group__", "pv:Q1|revenue|sum"]);
    expect(api.getCore().getColumnModel().getLeaves()[1].width).toBe(111);
  });
});
