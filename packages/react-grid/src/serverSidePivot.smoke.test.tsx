// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import { AggregateType } from "@agility-workbench/grid";
import type { IGridAPI, IServerSideDataSource, IServerSidePivotField, IServerSideRequest } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

// Pre-aggregated, as a server would answer: EMEA Q1 = 20, Q2 = 10; APAC Q1 = 5, Q2 = 40.
const FIELDS: IServerSidePivotField[] = [
  { field: "q2_sum", pivotKeys: ["Q2"], valueKey: "revenue", aggregate: "sum" },
  { field: "q1_sum", pivotKeys: ["Q1"], valueKey: "revenue", aggregate: "sum" },
];
const GROUP_ROWS = [
  { region: "EMEA", q1_sum: 20, q2_sum: 10 },
  { region: "APAC", q1_sum: 5, q2_sum: 40 },
];
const LEAVES = [
  { id: 1, region: "EMEA", quarter: "Q1", revenue: 20 },
  { id: 2, region: "APAC", quarter: "Q2", revenue: 40 },
];

const requests: IServerSideRequest[] = [];
const dataSource: IServerSideDataSource = {
  getRows: ({ request, success }) => {
    requests.push(request);
    if (request.pivot && request.groupBy.length > 0) {
      success({ rows: GROUP_ROWS.map(r => ({ ...r })), totalRows: GROUP_ROWS.length, pivotFields: FIELDS });
    } else {
      success({ rows: LEAVES.map(r => ({ ...r })), totalRows: LEAVES.length });
    }
  },
};

const COLUMNS = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "quarter", key: "quarter", label: "Quarter" },
  { colId: "revenue", key: "revenue", label: "Revenue" },
];

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

const headerLabels = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>(".pte-hcell-label")].map(el => el.textContent ?? "");

describe("server-side pivot through the React Grid", () => {
  it("pivots from the pivotMode / pivotColumns props, and the props turn it off again", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    Object.defineProperty(container, "clientWidth", { value: 900, configurable: true });
    document.body.appendChild(container);
    const apiRef = React.createRef<IGridAPI | null>();
    const root = createRoot(container);
    const render = (pivotMode: boolean) => root.render(
      <Grid
        apiRef={apiRef}
        columnDefs={COLUMNS}
        rowIdKey="id"
        rowModelType="serverSide"
        serverSideDataSource={dataSource}
        pivotMode={pivotMode}
        pivotColumns={["quarter"]}
        style={{ width: "100%", height: "100%" }}
      />,
    );

    await act(async () => { render(true); });
    await act(async () => {
      apiRef.current!.setRowGroupColumns(["region"]);
      apiRef.current!.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
      await settle();
    });

    const request = requests[requests.length - 1];
    expect(request.pivot).toEqual({
      pivotBy: ["quarter"],
      values: [{ key: "revenue", type: "sum" }],
      maxPivotColumns: expect.any(Number),
    });
    const labels = headerLabels(container);
    expect(labels.indexOf("Q1")).toBeGreaterThan(-1);
    expect(labels.indexOf("Q1")).toBeLessThan(labels.indexOf("Q2"));
    expect(container.textContent).toContain("EMEA");
    expect(container.textContent).toContain("40");

    await act(async () => {
      render(false);
      await settle();
    });
    expect(apiRef.current!.getPivotMode()).toBe(false);
    expect(requests[requests.length - 1].pivot).toBeUndefined();
    expect(headerLabels(container)).not.toContain("Q1");

    await unmountTestRoot(root);
    container.remove();
  });
});
