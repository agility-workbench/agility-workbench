// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string };

interface Opts {
  rowHover?: boolean;
  columnHover?: boolean;
  zebraRows?: boolean;
  highlightActiveCell?: boolean;
}

async function mountGrid(opts: Opts = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const data: Row[] = [
    { id: 1, name: "AAA" },
    { id: 2, name: "BBB" },
    { id: 3, name: "CCC" },
    { id: 4, name: "DDD" },
  ];

  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={data}
        columnDefs={[
          { colId: "id", key: "id", label: "ID" },
          { colId: "name", key: "name", label: "Name" },
        ]}
        rowIdKey="id"
        rowHover={opts.rowHover}
        columnHover={opts.columnHover}
        zebraRows={opts.zebraRows}
        highlightActiveCell={opts.highlightActiveCell}
      />,
    );
  });

  return { container, apiRef, root };
}

function firstDataCell(container: HTMLElement): HTMLElement {
  // First non-row-number data cell in the first row.
  return container.querySelector<HTMLElement>(".pte-row .pte-cell:not(.pte-row-number-cell)")!;
}

describe("zebraRows", () => {
  it("stripes odd view-index rows only when enabled", async () => {
    const { container, root } = await mountGrid({ zebraRows: true });
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".pte-row[data-view-idx]"));
    const byIdx = new Map(rows.map((r) => [Number(r.getAttribute("data-view-idx")), r]));
    expect(byIdx.get(0)!.classList.contains("pte-row-alt")).toBe(false);
    expect(byIdx.get(1)!.classList.contains("pte-row-alt")).toBe(true);
    expect(byIdx.get(2)!.classList.contains("pte-row-alt")).toBe(false);
    root.unmount();
  });

  it("adds no stripe class when disabled (default)", async () => {
    const { container, root } = await mountGrid();
    expect(container.querySelector(".pte-row-alt")).toBeNull();
    root.unmount();
  });
});

describe("highlightActiveCell", () => {
  it("marks only the active cell within a range when enabled", async () => {
    const { container, apiRef, root } = await mountGrid({ highlightActiveCell: true });
    const api = apiRef.current!;
    // Select a 2x1 range (anchor at 0,0, active corner extended to 1,0).
    await act(async () => {
      api.selectRange(0, 0);
      api.extendRangeTo(1, 0);
    });
    const active = container.querySelectorAll(".pte-active-cell");
    expect(active.length).toBe(1);
    root.unmount();
  });

  it("adds no active-cell class when disabled (default)", async () => {
    const { container, apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    await act(async () => {
      api.selectRange(0, 0);
      api.extendRangeTo(1, 0);
    });
    expect(container.querySelector(".pte-active-cell")).toBeNull();
    root.unmount();
  });
});

describe("columnHover", () => {
  it("highlights every cell in the hovered column when enabled", async () => {
    const { container, root } = await mountGrid({ columnHover: true });
    const cell = firstDataCell(container);
    const colIdx = cell.dataset.colIdx!;
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    const highlighted = container.querySelectorAll(`.pte-cell.pte-col-hover[data-col-idx="${colIdx}"]`);
    expect(highlighted.length).toBeGreaterThan(1);
    // No other column should be highlighted.
    const stray = Array.from(container.querySelectorAll<HTMLElement>(".pte-col-hover"))
      .filter((c) => c.dataset.colIdx !== colIdx);
    expect(stray).toHaveLength(0);
    root.unmount();
  });

  it("does not highlight columns when disabled (default)", async () => {
    const { container, root } = await mountGrid();
    const cell = firstDataCell(container);
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(container.querySelector(".pte-col-hover")).toBeNull();
    root.unmount();
  });
});

describe("rowHover toggle", () => {
  it("highlights the hovered row by default", async () => {
    const { container, root } = await mountGrid();
    const cell = firstDataCell(container);
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(container.querySelector(".pte-row-hover")).not.toBeNull();
    root.unmount();
  });

  it("does not highlight the hovered row when rowHover is false", async () => {
    const { container, root } = await mountGrid({ rowHover: false });
    const cell = firstDataCell(container);
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(container.querySelector(".pte-row-hover")).toBeNull();
    root.unmount();
  });
});
