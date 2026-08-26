// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import { AggregateType } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one so the real renderer can mount.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: string; region: string; quarter: string; revenue: number };

const ROWS: Row[] = [
  { id: "1", region: "EMEA", quarter: "Q1", revenue: 20 },
  { id: "2", region: "EMEA", quarter: "Q2", revenue: 10 },
  { id: "3", region: "APAC", quarter: "Q1", revenue: 5 },
  { id: "4", region: "APAC", quarter: "Q2", revenue: 40 },
];

const COLUMN_DEFS = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "quarter", key: "quarter", label: "Quarter" },
  { colId: "revenue", key: "revenue", label: "Revenue" },
];

function createContainer() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  return container;
}

const leafColIds = (api: IGridAPI) =>
  api.getCore().getColumnModel().getLeaves().map((col) => col.colId);

describe("pivot props end-to-end via Grid", () => {
  it("applies pivotMode and pivotColumns from props at mount", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();

    await act(async () => {
      root.render(
        <Grid
          apiRef={apiRef}
          data={ROWS}
          columnDefs={COLUMN_DEFS}
          rowIdKey="id"
          pivotMode
          pivotColumns={["quarter"]}
          onGridReady={(api) => {
            api.setRowGroupColumns(["region"]);
            api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
          }}
        />,
      );
    });

    const api = apiRef.current!;
    expect(api.getPivotMode()).toBe(true);
    expect(api.getPivotColumns()).toEqual(["quarter"]);
    expect(leafColIds(api)).toEqual([
      "__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum",
    ]);

    await unmountTestRoot(root);
    container.remove();
  });

  it("reconciles pivotMode and pivotColumns when the props change", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();

    const render = (pivotMode: boolean, pivotColumns: string[]) =>
      act(async () => {
        root.render(
          <Grid
            apiRef={apiRef}
            data={ROWS}
            columnDefs={COLUMN_DEFS}
            rowIdKey="id"
            pivotMode={pivotMode}
            pivotColumns={pivotColumns}
            onGridReady={(api) => {
              api.setRowGroupColumns(["region"]);
              api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
            }}
          />,
        );
      });

    await render(false, ["quarter"]);
    expect(apiRef.current!.getPivotMode()).toBe(false);

    await render(true, ["quarter"]);
    expect(apiRef.current!.getPivotMode()).toBe(true);
    expect(leafColIds(apiRef.current!)).toEqual([
      "__pte_group__", "pv:Q1|revenue|sum", "pv:Q2|revenue|sum",
    ]);

    // A new pivot column list re-derives the generated header.
    await render(true, ["region"]);
    expect(apiRef.current!.getPivotColumns()).toEqual(["region"]);
    expect(leafColIds(apiRef.current!)).toEqual([
      "__pte_group__", "pv:APAC|revenue|sum", "pv:EMEA|revenue|sum",
    ]);

    // Leaving pivot mode restores the source columns — plus the auto-group column, because the
    // row grouping was assigned while the mode was OFF (the first render above), so it belongs to
    // the state pivot mode exits to.
    await render(false, ["region"]);
    expect(apiRef.current!.getPivotMode()).toBe(false);
    expect(apiRef.current!.getRowGroupColumns()).toEqual(["region"]);
    expect(leafColIds(apiRef.current!)).toEqual([
      "__pte_group__", "region", "quarter", "revenue",
    ]);

    await unmountTestRoot(root);
    container.remove();
  });

  it("forwards pivotResultColumnDef and maxPivotColumns to the generated columns", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();

    await act(async () => {
      root.render(
        <Grid
          apiRef={apiRef}
          data={ROWS}
          columnDefs={COLUMN_DEFS}
          rowIdKey="id"
          pivotMode
          pivotColumns={["quarter"]}
          pivotResultColumnDef={{ width: 111 }}
          maxPivotColumns={1}
          onGridReady={(api) => {
            api.setRowGroupColumns(["region"]);
            api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
          }}
        />,
      );
    });

    const api = apiRef.current!;
    // maxPivotColumns capped the discovery at one generated leaf...
    expect(leafColIds(api)).toEqual(["__pte_group__", "pv:Q1|revenue|sum"]);
    // ...and the overlay reached it.
    const generated = api.getCore().getColumnModel().getLeaves()[1];
    expect(generated.width).toBe(111);

    await unmountTestRoot(root);
    container.remove();
  });
});
