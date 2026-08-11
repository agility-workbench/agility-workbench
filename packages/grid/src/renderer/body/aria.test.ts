// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

// ARIA topology cover (accessibility plan 2.1, owns-ordered): the center fragment of every
// logical row is THE aria row, owning all four sections' cells in visual order; only the
// center row carries aria-rowindex, written in the patchRows recycle loop and cleared with
// slot identity. This suite exercises the recycle path directly — the framework smoke suites
// cover the full-grid shape.

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

function buildRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    name: `Account ${i}`,
    category: i % 2 === 0 ? "Services" : "Hardware",
    rep: `Rep ${i}`,
    total: i,
  }));
}

function mountGrid(rowCount: number) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", rowNumbers: true });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach({ current: container });
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", pinned: "left" },
    // colSpan: Services rows span category across rep.
    { colId: "category", key: "category", label: "Category", colSpan: (p: any) => (p.value === "Services" ? 2 : 1) },
    { colId: "rep", key: "rep", label: "Rep" },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER, pinned: "right" },
  ]);
  api.setRowData(buildRows(rowCount));
  return { container, core, api };
}

function centerRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row")];
}

describe("body ARIA topology (owns-ordered)", () => {
  it("exposes the root as the grid with dataset-scoped counts", () => {
    const { container } = mountGrid(100);
    const root = container.querySelector<HTMLElement>(".pte-root")!;
    expect(root.getAttribute("role")).toBe("grid");
    // 4 user columns + row-number column
    expect(root.getAttribute("aria-colcount")).toBe("5");
    // 100 view rows + header row
    expect(root.getAttribute("aria-rowcount")).toBe("101");
  });

  it("exposes the center header section as the single header row owning every leaf columnheader", () => {
    const { container } = mountGrid(10);
    const centerHeader = container.querySelector<HTMLElement>(".pte-header")!;
    expect(centerHeader.getAttribute("role")).toBe("row");
    expect(centerHeader.getAttribute("aria-rowindex")).toBe("1");
    const headerCells = [...container.querySelectorAll<HTMLElement>(".pte-hcell-leaf")];
    expect(headerCells).toHaveLength(5);
    const ownedIds = centerHeader.getAttribute("aria-owns")!.split(" ");
    expect(ownedIds).toEqual(headerCells.map(cell => cell.id));
    // colindex is gap-free across sections in visual order (row-number leading col is 1).
    expect(headerCells.map(cell => cell.getAttribute("aria-colindex"))).toEqual(["1", "2", "3", "4", "5"]);
    expect(headerCells.every(cell => cell.getAttribute("role") === "columnheader")).toBe(true);
  });

  it("stitches each center row over all four sections' cells in visual order", () => {
    const { container } = mountGrid(10);
    const row = centerRows(container)[0];
    expect(row.getAttribute("role")).toBe("row");
    const ownedIds = row.getAttribute("aria-owns")!.split(" ");
    // 1 row-number + 1 left-pinned + 2 center + 1 right-pinned + full-width host
    expect(ownedIds).toHaveLength(6);
    const owned = ownedIds.map(id => document.getElementById(id)!);
    expect(owned.every(cell => cell.getAttribute("role") === "gridcell")).toBe(true);
    // Visual order: row number (1), pinned-left name (2), center (3, 4), pinned-right (5), host.
    expect(owned.slice(0, 5).map(cell => cell.getAttribute("aria-colindex"))).toEqual(["1", "2", "3", "4", "5"]);
    // Section fragments other than center are presentational.
    expect(container.querySelector(".pte-viewport-leading > .pte-row")!.getAttribute("role")).toBe("presentation");
    expect(container.querySelector(".pte-viewport-left > .pte-row")!.getAttribute("role")).toBe("presentation");
    expect(container.querySelector(".pte-viewport-right > .pte-row")!.getAttribute("role")).toBe("presentation");
  });

  it("stamps aria-colspan alongside dataset.colSpan for spanning cells", () => {
    const { container } = mountGrid(10);
    const row = centerRows(container)[0]; // r0 is a Services row -> category spans rep
    const spanning = row.querySelector<HTMLElement>("[data-col-span]")!;
    expect(spanning.getAttribute("aria-colspan")).toBe("2");
    const rowOdd = centerRows(container)[1]; // Hardware row -> no span
    expect(rowOdd.querySelector("[aria-colspan]")).toBeNull();
  });

  it("writes aria-rowindex in the recycle loop and keeps it consistent after scrolling", async () => {
    const { container, core } = mountGrid(500);
    for (const row of centerRows(container)) {
      if (row.style.display === "none") continue;
      const viewIdx = Number(row.getAttribute("data-view-idx"));
      // Header is aria row 1; body rows follow their absolute display number (viewIdx + 1).
      expect(row.getAttribute("aria-rowindex")).toBe(String(viewIdx + 2));
    }

    // Scroll far enough that every pool slot recycles.
    const scroller = container.querySelector<HTMLElement>(".pte-scroller")!;
    scroller.scrollTop = 200 * core.options.rowHeight;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();

    const recycled = centerRows(container).filter(row => row.style.display !== "none");
    expect(recycled.length).toBeGreaterThan(0);
    for (const row of recycled) {
      const viewIdx = Number(row.getAttribute("data-view-idx"));
      expect(viewIdx).toBeGreaterThanOrEqual(200 - core.options.overscanRowCount);
      expect(row.getAttribute("aria-rowindex")).toBe(String(viewIdx + 2));
    }
  });

  it("clears aria-rowindex with slot identity when a slot empties", async () => {
    const { container, api } = mountGrid(100);
    api.setRowData(buildRows(2));
    await raf();
    await raf();
    const rows = centerRows(container);
    const empty = rows.filter(row => row.style.display === "none");
    expect(empty.length).toBeGreaterThan(0);
    for (const row of empty) {
      expect(row.hasAttribute("aria-rowindex")).toBe(false);
      expect(row.hasAttribute("data-view-idx")).toBe(false);
    }
    // The two live rows are still indexed.
    const live = rows.filter(row => row.style.display !== "none");
    expect(live.map(row => row.getAttribute("aria-rowindex"))).toEqual(["2", "3"]);
  });
});
