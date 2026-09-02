// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import { AggregateType } from "@agility-workbench/grid";
import type { GridSheet, GridViewState, IGridAPI } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one so the real renderer can mount.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: string; region: string; status: string; revenue: number };

const ROWS: Row[] = [
  { id: "1", region: "EMEA", status: "On track", revenue: 20 },
  { id: "2", region: "APAC", status: "At risk", revenue: 10 },
  { id: "3", region: "EMEA", status: "At risk", revenue: 7 },
];

const COLUMN_DEFS = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "status", key: "status", label: "Status" },
  { colId: "revenue", key: "revenue", label: "Revenue" },
];

function createContainer() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  return container;
}

const tabs = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>(".pte-sheet-tabs [role='tab']"));

/**
 * The documented sheets pattern (mirrored by the docs-site live demo): the list and the active tab
 * are application state reaching the grid as a `sheets` prop, and a sheet seeded at mount goes
 * through that state — NOT through `api.updateGridOptions({ sheets })` inside `onGridReady`, which
 * the wrapper's option-sync effects overwrite with the (undefined) prop moments later.
 */
function SheetsHarness({ apiRef }: { apiRef: React.RefObject<IGridAPI | null> }) {
  const [sheets, setSheets] = React.useState<GridSheet[]>([{ id: "data", name: "Data" }]);
  const [activeSheetId, setActiveSheetId] = React.useState<string | null>("data");
  return (
    <Grid
      apiRef={apiRef}
      data={ROWS}
      columnDefs={COLUMN_DEFS}
      rowIdKey="id"
      toolbar={{ pivot: true }}
      sheets={{
        sheets,
        activeSheetId,
        onChange: (next) => setSheets(next),
        onActiveSheetChange: (id) => setActiveSheetId(id),
      }}
      onGridReady={(api) => {
        setSheets((current) => {
          if (current.some((sheet) => sheet.id === "by-status")) return current;
          const dataState = api.captureViewState();
          const state: GridViewState = {
            ...dataState,
            pivotMode: true,
            pivotColumns: ["status"],
            rowGroupColumns: ["region"],
            aggregateModel: [{ colId: "revenue", type: AggregateType.SUM }],
            groupExpansion: [],
            prePivotState: {
              rowGroupColumns: dataState.rowGroupColumns,
              aggregateModel: dataState.aggregateModel ?? [],
              pivotColumns: dataState.pivotColumns ?? [],
            },
          };
          return [...current, { id: "by-status", name: "By Status", state }];
        });
      }}
    />
  );
}

describe("sheets through the React wrapper", () => {
  it("mounts a sheet seeded from onGridReady via state, and switches into it", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();

    await act(async () => {
      root.render(<SheetsHarness apiRef={apiRef} />);
    });

    // The seeded sheet survives the wrapper's mount-time option sync.
    expect(tabs(container).map((tab) => tab.textContent)).toEqual(["Data", "By Status"]);
    const api = apiRef.current!;
    expect(api.getPivotMode()).toBe(false);

    await act(async () => {
      tabs(container)[1].click();
    });
    expect(api.getPivotMode()).toBe(true);
    expect(api.getPivotColumns()).toEqual(["status"]);
    expect(api.getCore().getColumnModel().getLeaves().map((col) => col.colId)).toEqual([
      "__pte_group__", "pv:At%20risk|revenue|sum", "pv:On%20track|revenue|sum",
    ]);
    // The onChange round-trip re-supplies the list; the strip and the highlight stay put.
    expect(tabs(container).map((tab) => tab.textContent)).toEqual(["Data", "By Status"]);
    expect(tabs(container)[1].getAttribute("aria-selected")).toBe("true");

    // prePivotState: leaving the pivot sheet returns to the flat Data view.
    await act(async () => {
      tabs(container)[0].click();
    });
    expect(api.getPivotMode()).toBe(false);
    expect(tabs(container)[0].getAttribute("aria-selected")).toBe("true");

    await unmountTestRoot(root);
    container.remove();
  });

  it("keeps a sheet added with + once the app persists it through onChange", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();

    await act(async () => {
      root.render(<SheetsHarness apiRef={apiRef} />);
    });
    await act(async () => {
      container.querySelector<HTMLElement>("button.pte-sheet-add")!.click();
    });

    expect(tabs(container).map((tab) => tab.textContent)).toEqual(["Data", "By Status", "Pivot 1"]);
    expect(tabs(container)[2].getAttribute("aria-selected")).toBe("true");

    await unmountTestRoot(root);
    container.remove();
  });
});
