// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import type { ColDef } from "../../interfaces/column";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

// `autoHeight`: rows measured from their cells' content. happy-dom does no layout, so the content
// height is stubbed: a Range over a cell reports 20px per "|"-separated line of its text, and every
// box reads 0 (no row chrome). The layout probe checks the same in a real browser.

const LINE = 20;
const originalRangeRect = Range.prototype.getBoundingClientRect;

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
  Range.prototype.getBoundingClientRect = function (this: Range) {
    const text = this.startContainer.textContent ?? "";
    const lines = text ? text.split("|").length : 0;
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: lines * LINE, width: 0, height: lines * LINE, toJSON() {} } as DOMRect;
  };
});

afterAll(() => {
  Range.prototype.getBoundingClientRect = originalRangeRect;
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};
const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

const ROW_HEIGHT = 40;
/** A wrapping cell's padding (8px top and bottom) and borders (1px each), as happy-dom resolves the
 * stylesheet. A one-line note (20 + 18) fits the 40px row. */
const CHROME = 18;
const px = (n: number) => `${n}px`;
const VIEW_HEIGHT = 400;

/** `lines(n)` is a note that needs n lines. */
const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("|");

function mount(notes: string[], options: Partial<GridOptions> = {}, colDefs?: ColDef[]) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", rowHeight: ROW_HEIGHT, overscanRowCount: 2, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs ?? [
    { colId: "name", key: "name", label: "Name", pinned: "left" },
    { colId: "note", key: "note", label: "Note", wrapText: true, autoHeight: true },
  ]);
  const body = container.querySelector<HTMLElement>(".pte-body")!;
  Object.defineProperty(body, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  api.setRowData(notes.map((note, n) => ({ id: `r${n}`, name: `Row ${n}`, note })));
  return { container, core, api, body };
}

const spacerHeight = (container: HTMLElement) => container.querySelector<HTMLElement>(".pte-spacer")!.style.height;

function rowHeights(container: HTMLElement, section: string) {
  const heights: Record<number, string> = {};
  for (const row of container.querySelectorAll<HTMLElement>(`${section} .pte-row`)) {
    if (row.style.display === "none" || row.dataset.viewIdx == null) continue;
    heights[Number(row.dataset.viewIdx)] = row.style.height;
  }
  return heights;
}

describe("autoHeight rows", () => {
  it("marks wrapText and autoHeight cells", () => {
    const { container } = mount([lines(1)]);
    const row = Array.from(container.querySelectorAll<HTMLElement>(".pte-viewport .pte-row"))
      .find(el => el.dataset.viewIdx === "0")!;
    const cell = row.querySelector<HTMLElement>(".pte-cell-auto-height")!;
    expect(cell.classList.contains("pte-cell-wrap-text")).toBe(true);
    expect(cell.textContent).toBe("line 1");
    expect(container.querySelector(".pte-viewport-left .pte-cell-auto-height")).toBeNull();
  });

  it("grows drawn rows to their content, never below rowHeight, in every section", () => {
    const { container } = mount([lines(1), lines(3), lines(5), lines(2)]);
    const center = rowHeights(container, ".pte-viewport");
    expect(center).toEqual({ 0: "40px", 1: px(60 + CHROME), 2: px(100 + CHROME), 3: px(40 + CHROME) });
    expect(rowHeights(container, ".pte-viewport-left")).toEqual(center);
    expect(spacerHeight(container)).toBe(px(40 + 60 + 100 + 40 + 3 * CHROME));
  });

  it("leaves rows alone without an autoHeight column", () => {
    const { container } = mount([lines(5), lines(5)], {}, [
      { colId: "name", key: "name", label: "Name" },
      { colId: "note", key: "note", label: "Note", wrapText: true },
    ]);
    expect(rowHeights(container, ".pte-viewport")).toEqual({ 0: "40px", 1: "40px" });
    expect(spacerHeight(container)).toBe("80px");
  });

  it("re-measures a row whose value changes, both ways", () => {
    const { container, api } = mount([lines(1), lines(1), lines(1)]);
    api.setCellValue({ rowId: "r1", colId: "note" }, lines(4));
    expect(rowHeights(container, ".pte-viewport")[1]).toBe(px(80 + CHROME));
    expect(spacerHeight(container)).toBe(px(160 + CHROME));
    api.setCellValue({ rowId: "r1", colId: "note" }, lines(1));
    expect(rowHeights(container, ".pte-viewport")[1]).toBe("40px");
    expect(spacerHeight(container)).toBe("120px");
  });

  it("keeps the row at the top of the viewport in place when a row above it grows", async () => {
    const { api, body } = mount(Array.from({ length: 200 }, () => lines(1)));
    body.scrollTop = 50 * ROW_HEIGHT;
    body.dispatchEvent(new Event("scroll"));
    await raf();
    // Row 48 is drawn (overscan) above the viewport: growing it pushes row 50 down by as much.
    api.setCellValue({ rowId: "r48", colId: "note" }, lines(5));
    expect(body.scrollTop).toBe(50 * ROW_HEIGHT + (100 + CHROME - ROW_HEIGHT));
  });

  it("sizes measured rows' sticky mirrors and offsets from the measurement", async () => {
    const { container, core, api, body } = mount(
      Array.from({ length: 20 }, (_, n) => (n < 10 ? lines(2) : lines(1))),
      { groupDisplayType: "groupRows", groupRowsSticky: true } as Partial<GridOptions>,
      [
        { colId: "group", key: "group", label: "Group" },
        { colId: "note", key: "note", label: "Note", wrapText: true, autoHeight: true },
      ],
    );
    api.setRowData(Array.from({ length: 20 }, (_, n) => ({ id: `r${n}`, group: n < 10 ? "A" : "B", note: lines(n < 10 ? 2 : 1) })));
    core.dispatch({ type: "rowGroupSet", colIds: ["group"] } as any);
    await raf();
    api.setAllGroupsExpanded(true);
    await raf();
    // Group row A (40, full-width: not measured) + ten two-line rows: B's header starts after them.
    expect(core.rowHeights.topOf(11)).toBe(40 + 10 * (40 + CHROME));
    body.scrollTop = 100;
    body.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();
    const overlay = container.querySelector<HTMLElement>(".pte-sticky-rows")!;
    expect(overlay.querySelector<HTMLElement>(".pte-sticky-row")!.style.height).toBe("40px");
  });
});
