// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import type { ReactColDef } from "./cellRenderer";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; a: string; b: string; c: string };

async function mount(columnDefs: ReactColDef[], data: Row[]) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid apiRef={apiRef} data={data} columnDefs={columnDefs} rowIdKey="id" />);
  });
  return { container, apiRef, root };
}

const DATA: Row[] = [
  { id: 1, a: "span", b: "b1", c: "c1" },
  { id: 2, a: "normal", b: "b2", c: "c2" },
];

function rowEl(container: HTMLElement, viewIdx: number): HTMLElement {
  return container.querySelector<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}']`)!;
}
function dataCells(rowEl: HTMLElement): HTMLElement[] {
  return Array.from(rowEl.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-row-number-cell):not(.pte-full-width-cell)"));
}

describe("colSpan", () => {
  it("widens the spanning cell and hides the covered cells, only on matching rows", async () => {
    const COLS: ReactColDef[] = [
      { colId: "a", key: "a", label: "A", width: 100, colSpan: (p: any) => (p.value === "span" ? 2 : 1) },
      { colId: "b", key: "b", label: "B", width: 100 },
      { colId: "c", key: "c", label: "C", width: 100 },
    ];
    const { container, root } = await mount(COLS, DATA);

    // Row 1 first (non-spanning) establishes the per-column baseline widths.
    const cells1 = dataCells(rowEl(container, 1));
    expect(cells1[0].dataset.colSpan).toBeUndefined();
    expect(cells1[1].style.display).not.toBe("none");
    expect(cells1[2].style.display).not.toBe("none");
    const wA = parseFloat(cells1[0].style.width);
    const wB = parseFloat(cells1[1].style.width);

    // Row 0: "a" spans 2 → its cell width = A+B, B cell hidden, C visible.
    const cells0 = dataCells(rowEl(container, 0));
    expect(cells0[0].dataset.colSpan).toBe("2");
    expect(parseFloat(cells0[0].style.width)).toBeCloseTo(wA + wB, 1);
    expect(cells0[1].style.display).toBe("none");
    expect(cells0[2].style.display).not.toBe("none");
    await unmountTestRoot(root);
  });

  it("clamps a span to the section end (never over-spans)", async () => {
    const COLS: ReactColDef[] = [
      { colId: "a", key: "a", label: "A", width: 100 },
      { colId: "b", key: "b", label: "B", width: 100 },
      { colId: "c", key: "c", label: "C", width: 100, colSpan: () => 5 },
    ];
    const { container, root } = await mount(COLS, DATA);
    const row0 = dataCells(rowEl(container, 0));
    const row1 = dataCells(rowEl(container, 1));
    // "c" is the last center leaf: a span of 5 clamps to 1 (no covered columns, own width) — and all
    // three cells stay visible (nothing covered).
    expect(row0[2].dataset.colSpan).toBeUndefined();
    expect(parseFloat(row0[2].style.width)).toBeCloseTo(parseFloat(row1[2].style.width), 1);
    expect(row0[0].style.display).not.toBe("none");
    expect(row0[1].style.display).not.toBe("none");
    expect(row0[2].style.display).not.toBe("none");
    await unmountTestRoot(root);
  });
});
