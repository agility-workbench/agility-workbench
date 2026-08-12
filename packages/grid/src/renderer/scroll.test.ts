// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "./dom";

// C3 scroll half: where api.ensureRowVisible / ensureColumnVisible leave the scrollers. The model
// half (id → view slot, page jumps, ancestor expansion) is covered in api/api.scroll.test.ts.

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

const ROW_HEIGHT = 40;
const VIEW_HEIGHT = 400; // exactly 10 rows

function mountGrid(rowCount: number, options: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", rowHeight: ROW_HEIGHT, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach({ current: container });
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name" },
    { colId: "region", key: "region", label: "Region" },
  ]);
  api.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: `r${i}`,
    name: `Account ${i}`,
    region: i % 2 === 0 ? "AMER" : "EMEA",
  })));

  // happy-dom does no layout, so the viewport height the scroll math reads has to be declared.
  const body = container.querySelector<HTMLElement>(".pte-body")!;
  Object.defineProperty(body, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  const scroller = container.querySelector<HTMLElement>(".pte-scroller")!;
  return { container, core, api, scroller };
}

describe("ensureRowVisible scroll placement", () => {
  it("scrolls down just enough to bring a row below the fold into view", () => {
    const { api, scroller } = mountGrid(100);
    expect(scroller.scrollTop).toBe(0);

    api.ensureRowVisible("r14");
    // Row 14 spans 560-600, so the smallest scroll that shows all of it is 600 - 400.
    expect(scroller.scrollTop).toBe(200);
  });

  it("leaves an already-visible row alone under the default position", () => {
    const { api, scroller } = mountGrid(100);
    scroller.scrollTop = 400;
    api.ensureRowVisible("r12");
    expect(scroller.scrollTop).toBe(400);
  });

  it("scrolls up to a row above the fold", () => {
    const { api, scroller } = mountGrid(100);
    scroller.scrollTop = 2000;
    api.ensureRowVisible("r10");
    expect(scroller.scrollTop).toBe(400);
  });

  it("places the row explicitly when asked, even if it is already on screen", () => {
    const { api, scroller } = mountGrid(100);
    scroller.scrollTop = 400;

    api.ensureRowVisible("r12", { position: "top" });
    expect(scroller.scrollTop).toBe(480);

    api.ensureRowVisible("r12", { position: "bottom" });
    expect(scroller.scrollTop).toBe(480 + ROW_HEIGHT - VIEW_HEIGHT);

    api.ensureRowVisible("r12", { position: "middle" });
    expect(scroller.scrollTop).toBe(480 - (VIEW_HEIGHT - ROW_HEIGHT) / 2);
  });

  it("never scrolls past the top of the dataset", () => {
    const { api, scroller } = mountGrid(100);
    scroller.scrollTop = 800;
    api.ensureRowVisible("r0", { position: "middle" });
    expect(scroller.scrollTop).toBe(0);
  });

  it("reports false for a row that does not exist and leaves the scroller where it was", () => {
    const { api, scroller } = mountGrid(100);
    scroller.scrollTop = 320;
    expect(api.ensureRowVisible("nope")).toBe(false);
    expect(scroller.scrollTop).toBe(320);
  });

  it("measures from the page-local slot under pagination", () => {
    const { api, core, scroller } = mountGrid(100, { pagination: true, pageSize: 25, pageSizes: [25] });

    expect(api.ensureRowVisible("r64", { position: "top" })).toBe(true);
    expect(core.getPaginationInfo().pageIndex).toBe(2);
    // Row 64 is the 15th row of page 3 (index 14) — the page change resets the scroller first, so
    // the offset must be measured within the page, not across the dataset.
    expect(scroller.scrollTop).toBe(14 * ROW_HEIGHT);
  });
});

describe("ensureColumnVisible scroll placement", () => {
  it("does not scroll horizontally for a column that is already fully visible", () => {
    const { api, container } = mountGrid(10);
    const spacer = container.querySelector<HTMLElement>(".pte-spacer")!;
    Object.defineProperty(spacer, "clientWidth", { value: 1000, configurable: true });
    expect(api.ensureColumnVisible("region")).toBe(true);
    expect(spacer.scrollLeft).toBe(0);
  });

  it("scrolls a column that sits past the right edge into view", () => {
    const { api, core, container } = mountGrid(10);
    const spacer = container.querySelector<HTMLElement>(".pte-spacer")!;
    Object.defineProperty(spacer, "clientWidth", { value: 50, configurable: true });

    const region = core.getColumnModel().getByColId("region")!;
    expect(api.ensureColumnVisible("region")).toBe(true);
    // Right edge of the column minus the (tiny) viewport width.
    const centerLeaves = core.getColumnModel().getCenterLeaves();
    const left = centerLeaves
      .slice(0, region.centralPosition!)
      .reduce((sum, col) => sum + col.computedWidth, 0);
    expect(spacer.scrollLeft).toBe(left + region.computedWidth - 50);
  });
});
