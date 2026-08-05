// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import type { ICellRenderer, CellRendererParams } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one so the real renderer can mount.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: string; region: string; sales: number };

const ROWS: Row[] = [
  { id: "1", region: "EMEA", sales: 10 },
  { id: "2", region: "EMEA", sales: 20 },
  { id: "3", region: "APAC", sales: 30 },
];

// A minimal class renderer that records every refresh() reason it receives. This stands in for the
// SparklineRenderer: the point of the fix is that the grid tells renderers *why* refresh fired so a
// pixel-drawing renderer can remeasure on resize.
const refreshReasons: (string | undefined)[] = [];
class RecordingRenderer implements ICellRenderer {
  private el!: HTMLElement;
  init(_p: CellRendererParams): void {
    this.el = document.createElement("span");
    this.el.textContent = "cell";
  }
  getGui(): HTMLElement {
    return this.el;
  }
  refresh(p: CellRendererParams): boolean {
    refreshReasons.push(p.refreshReason);
    return true;
  }
  destroy(): void {}
}

async function mountGrid() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={ROWS}
        columnDefs={[
          { colId: "region", key: "region", label: "Region" },
          { colId: "sales", key: "sales", label: "Sales", cellRenderer: RecordingRenderer, resizable: true },
        ]}
        rowIdKey="id"
      />,
    );
  });
  return { container, apiRef, root };
}

describe("column resize refreshes cell renderers with reason 'resize'", () => {
  it("invokes a custom renderer's refresh() with refreshReason='resize' when its column is resized", async () => {
    const { apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    const core = api.getCore();

    const salesCol = core.getColumnModel().getByColId("sales")!;
    expect(salesCol).toBeTruthy();

    refreshReasons.length = 0;

    // Simulate the drag-resize dispatch (columnInteraction dispatches this per mousemove).
    await act(async () => {
      core.dispatch({ type: "columnResize", colId: salesCol.instanceID, widthPx: salesCol.computedWidth + 60 });
    });

    // The renderer must have been told about the resize.
    expect(refreshReasons.length).toBeGreaterThan(0);
    expect(refreshReasons.every(r => r === "resize")).toBe(true);

    await act(async () => root.unmount());
  });
});
