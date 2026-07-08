// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { GridReact } from "./grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text. Provide a
// minimal stub so the real renderer (which the wrapper instantiates) can mount.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

// Drives the real GridReact (React wrapper → renderer → core) and asserts that applyTransaction
// mutates the rendered DOM without a full data-prop reload — the same path the demo's TradingGrid uses.

type Row = { symbol: string; ltp: number };

function textForSymbol(host: HTMLElement, symbol: string): string[] {
  // Cells render their text into the DOM; collect all cell text so we can assert value presence.
  return Array.from(host.querySelectorAll<HTMLElement>(".pte-cell, [class*='cell']"))
    .map((el) => el.textContent ?? "")
    .filter(Boolean);
}

async function mountGrid() {
  const container = document.createElement("div");
  // Give the virtualized body a real height so rows render.
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const initial: Row[] = [
    { symbol: "AAA", ltp: 100 },
    { symbol: "BBB", ltp: 200 },
  ];

  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GridReact
        apiRef={apiRef}
        data={initial}
        columnDefs={[
          { colId: "symbol", key: "symbol", label: "Symbol" },
          { colId: "ltp", key: "ltp", label: "LTP" },
        ]}
        rowIdKey="symbol"
      />,
    );
  });

  return { container, apiRef, root };
}

describe("applyTransaction end-to-end via GridReact", () => {
  it("updates a cell in place, adds a row, and removes a row", async () => {
    const { container, apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    expect(api).toBeTruthy();
    const core = api.getCore();

    // Baseline: both rows present.
    expect(core.getCellValue("AAA", "ltp")).toBe(100);
    expect(core.getCellValue("BBB", "ltp")).toBe(200);

    // UPDATE — value changes without replacing the dataset.
    await act(async () => {
      api.applyTransaction({ update: [{ rowId: "AAA", row: { symbol: "AAA", ltp: 137 } }] });
    });
    expect(core.getCellValue("AAA", "ltp")).toBe(137);

    // ADD — a brand-new row streams in.
    await act(async () => {
      api.applyTransaction({ add: [{ symbol: "CCC", ltp: 300 }] });
    });
    expect(core.getCellValue("CCC", "ltp")).toBe(300);
    expect(core.getViewIndexForRowId("CCC")).not.toBeNull();

    // REMOVE — a row drops out.
    await act(async () => {
      api.applyTransaction({ remove: ["BBB"] });
    });
    expect(core.getCellValue("BBB", "ltp")).toBeNull();
    expect(core.getViewIndexForRowId("BBB")).toBeNull();

    // Rendered DOM reflects the surviving values.
    const cells = textForSymbol(container, "AAA");
    expect(cells.join(" ")).toContain("137");

    await act(async () => root.unmount());
    container.remove();
  });
});
