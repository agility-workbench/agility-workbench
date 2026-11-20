import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import { AggregateType } from "@agility-workbench/grid";
import type {
  IGridAPI,
  IServerSideDataSource,
  IServerSideGetRowsParams,
  IServerSidePivotField,
  IServerSideRequest,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

// Pre-aggregated, as a server would answer: EMEA Q1 = 20, Q2 = 10; APAC Q1 = 5, Q2 = 40.
const fields: IServerSidePivotField[] = [
  { field: "q2_sum", pivotKeys: ["Q2"], valueKey: "revenue", aggregate: "sum" },
  { field: "q1_sum", pivotKeys: ["Q1"], valueKey: "revenue", aggregate: "sum" },
];
const groupRows = [
  { region: "EMEA", q1_sum: 20, q2_sum: 10 },
  { region: "APAC", q1_sum: 5, q2_sum: 40 },
];
const leaves = [
  { id: 1, region: "EMEA", quarter: "Q1", revenue: 20 },
  { id: 2, region: "APAC", quarter: "Q2", revenue: 40 },
];

const requests: IServerSideRequest[] = [];
const source: IServerSideDataSource = {
  getRows: ({ request, success }: IServerSideGetRowsParams) => {
    requests.push(request);
    if (request.pivot && request.groupBy.length > 0) {
      success({ rows: groupRows.map((row) => ({ ...row })), totalRows: groupRows.length, pivotFields: fields });
    } else {
      success({ rows: leaves.map((row) => ({ ...row })), totalRows: leaves.length });
    }
  },
};

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [columnDefs]="cols"
      rowIdKey="id"
      rowModelType="serverSide"
      [serverSideDataSource]="source"
      [pivotMode]="pivotMode"
      [pivotColumns]="pivotColumns"
      (gridReady)="api = $event"
    />
  `,
})
class ServerSidePivotHost {
  readonly source = source;
  api: IGridAPI | null = null;
  pivotMode = true;
  pivotColumns = ["quarter"];
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region" },
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "revenue", key: "revenue", label: "Revenue" },
  ];
}

async function settleLoads(): Promise<void> {
  for (let index = 0; index < 6; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const headerLabels = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(".pte-hcell-label"), (element) => element.textContent ?? "");

describe("AwbGrid server-side pivot", () => {
  it("pivots from the pivotMode / pivotColumns inputs, and the input turns it off again", async () => {
    const { fixture, gridEl, host } = await mountGridHost(ServerSidePivotHost);
    await syncGridInputs(fixture);
    await settleLoads();

    host.api!.setRowGroupColumns(["region"]);
    host.api!.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
    await settleLoads();

    expect(requests[requests.length - 1].pivot).toEqual({
      pivotBy: ["quarter"],
      values: [{ key: "revenue", type: "sum" }],
      maxPivotColumns: expect.any(Number),
    });
    const labels = headerLabels(gridEl);
    expect(labels.indexOf("Q1")).toBeGreaterThan(-1);
    expect(labels.indexOf("Q1")).toBeLessThan(labels.indexOf("Q2"));
    expect(gridEl.textContent).toContain("EMEA");
    expect(gridEl.textContent).toContain("40");

    host.pivotMode = false;
    await syncGridInputs(fixture);
    await settleLoads();
    expect(host.api!.getPivotMode()).toBe(false);
    expect(requests[requests.length - 1].pivot).toBeUndefined();
    expect(headerLabels(gridEl)).not.toContain("Q1");
  });
});
