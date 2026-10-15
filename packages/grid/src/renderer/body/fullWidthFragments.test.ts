// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import type { ColDef } from "../../interfaces/column";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

/**
 * A full-width row (isFullWidthRow, or a groupRows heading) must keep its pinned/leading fragments
 * in the flow: the pinned sections lay their rows out one after another, so a fragment set to
 * `display: none` lifted every pinned row below it by one row (gap finding A3.13). happy-dom has no
 * layout, so these pin the style contract: displayed, row height, cells hidden, rows in order.
 * Also covers refreshFullWidthWidths (A3.7): widths re-read without re-rendering.
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};
const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

const colDefs: ColDef[] = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "pin", key: "name", label: "Pinned", pinned: "left", width: 120 },
  { colId: "name", key: "name", label: "Name", width: 150 },
  { colId: "right", key: "name", label: "Right", pinned: "right", width: 90 },
];

async function mount(options: Partial<GridOptions>, grouped: boolean) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", groupDefaultExpanded: -1, ...options } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs);
  api.setRowData(Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`, region: i < 3 ? "AMER" : "EMEA", name: `Account ${i}`,
  })));
  if (grouped) core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
  await raf();
  const windowRenderer = (renderer as any)._bodyWindowRenderer;
  return { container, core, api, renderer, windowRenderer };
}

function fragment(container: HTMLElement, section: "left" | "right", viewIdx: number): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `.pte-viewport-${section} > .pte-row[data-view-idx="${viewIdx}"]`,
  );
  if (!found) throw new Error(`no ${section} fragment at ${viewIdx}`);
  return found;
}

function centerRow(container: HTMLElement, viewIdx: number): HTMLElement {
  const row = container.querySelector<HTMLElement>(
    `.pte-row[aria-rowindex][data-view-idx="${viewIdx}"]:not(.pte-sticky-row):not(.pte-pinned-row)`,
  );
  if (!row) throw new Error(`no centre row at ${viewIdx}`);
  return row;
}

describe("full-width rows keep their pinned fragments in the flow", () => {
  it("a user full-width row's left and right fragments stay displayed, blank and row-high", async () => {
    const { container, core } = await mount({ isFullWidthRow: (n) => n.id === "r1" }, false);
    const rowHeight = `${core.options.rowHeight}px`;
    expect(centerRow(container, 1).classList.contains("pte-full-width-row")).toBe(true);

    for (const section of ["left", "right"] as const) {
      const blank = fragment(container, section, 1);
      expect(blank.style.display).not.toBe("none");
      expect(blank.style.height).toBe(rowHeight);
      expect(blank.classList.contains("pte-full-width-fragment")).toBe(true);
      expect(blank.getAttribute("aria-hidden")).toBe("true");
      // Nothing bleeds through: every pinned cell of the blank fragment is hidden.
      const cells = Array.from(blank.querySelectorAll<HTMLElement>(".pte-cell"));
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every(cell => cell.style.display === "none")).toBe(true);

      // The next row's fragment follows it in the same section, in order, with its cells shown.
      const next = fragment(container, section, 2);
      expect(blank.nextElementSibling).toBe(next);
      expect(next.style.display).not.toBe("none");
      expect(next.classList.contains("pte-full-width-fragment")).toBe(false);
      expect(next.querySelector<HTMLElement>(".pte-cell")!.textContent).toBe("Account 2");
    }
  });

  it("a groupRows heading's pinned fragments stay in the flow and recover on recycle", async () => {
    const { container, core } = await mount({ groupDisplayType: "groupRows" }, true);
    // View 0 is the AMER heading, view 1 its first leaf.
    expect(core.getRowModel().getRowNodeAtViewIndex(0)!.isGroup).toBe(true);
    const heading = fragment(container, "left", 0);
    expect(heading.style.display).not.toBe("none");
    expect(heading.style.height).toBe(`${core.options.rowHeight}px`);
    expect(heading.classList.contains("pte-full-width-fragment")).toBe(true);
    expect(heading.nextElementSibling).toBe(fragment(container, "left", 1));

    // Ungrouping recycles the slot into a leaf: its fragment loses the blank state, cells return.
    core.dispatch({ type: "rowGroupSet", colIds: [] } as any);
    await raf();
    const leaf = fragment(container, "left", 0);
    expect(leaf.classList.contains("pte-full-width-fragment")).toBe(false);
    expect(leaf.hasAttribute("aria-hidden")).toBe(false);
    const cells = Array.from(leaf.querySelectorAll<HTMLElement>(".pte-cell"));
    expect(cells.every(cell => cell.style.display !== "none")).toBe(true);
    expect(cells[0].textContent).toBe("Account 0");
  });
});

describe("refreshFullWidthWidths", () => {
  it("re-applies the centre spacer's current client width to user full-width slots", async () => {
    const { container, windowRenderer } = await mount({ isFullWidthRow: (n) => n.id === "r1" }, false);
    const spacer: HTMLElement = windowRenderer.params.centerSpacer;
    let width = 640;
    Object.defineProperty(spacer, "clientWidth", { configurable: true, get: () => width });
    windowRenderer.refreshFullWidthWidths();
    const row = centerRow(container, 1);
    const host = row.querySelector<HTMLElement>(".pte-full-width-cell")!;
    expect(row.style.width).toBe("640px");
    expect(host.style.width).toBe("640px");

    width = 410;
    windowRenderer.refreshFullWidthWidths();
    expect(row.style.width).toBe("410px");
    expect(host.style.width).toBe("410px");
    // A normal row is left alone: it keeps the centre columns' width.
    expect(centerRow(container, 2).style.width).not.toBe("410px");
  });

  it("re-applies the centre columns' total width to groupRows headings, not the viewport width", async () => {
    const { container, core, windowRenderer } = await mount({ groupDisplayType: "groupRows" }, true);
    const spacer: HTMLElement = windowRenderer.params.centerSpacer;
    Object.defineProperty(spacer, "clientWidth", { configurable: true, get: () => 2000 });
    const centerTotal = core.getColumnModel().getCenterLeaves()
      .filter(c => !c.hidden).reduce((sum, c) => sum + c.computedWidth, 0);
    const row = centerRow(container, 0);
    row.style.width = "1px"; // stale
    windowRenderer.refreshFullWidthWidths();
    expect(row.style.width).toBe(`${centerTotal}px`);
    expect(row.querySelector<HTMLElement>(".pte-full-width-cell")!.style.width).toBe(`${centerTotal}px`);
  });
});
