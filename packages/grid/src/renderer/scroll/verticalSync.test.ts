// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

// Vertical scrolling is owned by a single container. The sections ride inside it as flex columns, so
// they move together without any scrollTop fan-out — which is what removes the frame where pinned
// columns trailed the center. These cover the structural invariant and the patch gating that keeps
// the main thread cheap enough for the virtual window to keep up.

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

const raf = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

/** Counts refresh() calls so a test can tell a repaint from a pure scroll. */
let refreshCount = 0;
class CountingRenderer {
  private el = document.createElement("span");
  init(params: any) {
    this.el.textContent = String(params.displayValue);
  }
  getGui() {
    return this.el;
  }
  refresh(params: any) {
    refreshCount++;
    this.el.textContent = String(params.displayValue);
    return true;
  }
}

function mountGrid(rowCount: number) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", rowHeight: ROW_HEIGHT });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", pinned: "left" },
    { colId: "region", key: "region", label: "Region", cellRenderer: CountingRenderer as any },
  ]);
  api.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: `r${i}`,
    name: `Account ${i}`,
    region: i % 2 === 0 ? "AMER" : "EMEA",
  })));

  // happy-dom does no layout, so the viewport height the scroll math reads has to be declared.
  const body = container.querySelector<HTMLElement>(".pte-body")!;
  Object.defineProperty(body, "clientHeight", { value: VIEW_HEIGHT, configurable: true });

  const sections = {
    leading: container.querySelector<HTMLElement>(".pte-spacer-leading")!,
    left: container.querySelector<HTMLElement>(".pte-spacer-left")!,
    center: container.querySelector<HTMLElement>(".pte-spacer")!,
    right: container.querySelector<HTMLElement>(".pte-spacer-right")!,
  };
  return { container, core, api, body, sections };
}

/** Move the body the way a native/compositor scroll would, and let the grid observe it. */
function scrollBody(body: HTMLElement, scrollTop: number) {
  body.scrollTop = scrollTop;
  body.dispatchEvent(new Event("scroll"));
}

describe("vertical scroll ownership", () => {
  it("gives the grid exactly one vertical scroll container", () => {
    const { container } = mountGrid(200);

    // If any section could scroll vertically on its own, the browser would move it independently and
    // the sections would drift apart again under load. Only .pte-body may.
    expect(container.querySelectorAll(".pte-scroller").length).toBe(0);
    expect(container.querySelectorAll(".pte-scroller-left").length).toBe(0);
    expect(container.querySelectorAll(".pte-scroller-right").length).toBe(0);
    expect(container.querySelectorAll(".pte-scroller-vertical-spacer").length).toBe(0);
    expect(container.querySelectorAll(".pte-body").length).toBe(1);
  });

  it("keeps every section inside that container", () => {
    const { body, sections } = mountGrid(200);

    // Being descendants is what makes them move together: one composited scroll, no JS.
    expect(body.contains(sections.leading)).toBe(true);
    expect(body.contains(sections.left)).toBe(true);
    expect(body.contains(sections.center)).toBe(true);
    expect(body.contains(sections.right)).toBe(true);
  });

  it("stands every section at the full content height so they scroll as one", () => {
    const { sections } = mountGrid(200);

    const expected = `${200 * ROW_HEIGHT}px`;
    expect(sections.leading.style.height).toBe(expected);
    expect(sections.left.style.height).toBe(expected);
    expect(sections.center.style.height).toBe(expected);
    expect(sections.right.style.height).toBe(expected);
  });

  it("leaves the sticky group overlay outside the scroller so it does not scroll away", () => {
    const { container, body } = mountGrid(200);

    const overlay = container.querySelector<HTMLElement>(".pte-sticky-rows")!;
    expect(overlay).not.toBeNull();
    expect(body.contains(overlay)).toBe(false);
  });
});

describe("row patching during scroll", () => {
  it("does not repaint cells while the scroll stays inside one row", async () => {
    const { body, sections } = mountGrid(200);

    // Land somewhere the start index is off the clamp: floor(1000/40) - 10 = 15.
    scrollBody(body, 1000);
    await raf();
    refreshCount = 0;

    // floor(1030/40) - 10 is still 15, so the pool already holds exactly the right nodes.
    scrollBody(body, 1030);
    await raf();
    expect(refreshCount).toBe(0);

    // The sections moved anyway — they are inside the scroller, not synced to it.
    expect(sections.left.style.height).toBe(`${200 * ROW_HEIGHT}px`);
  });

  it("repaints as soon as the window advances by a whole row", async () => {
    const { body } = mountGrid(200);

    scrollBody(body, 1000);
    await raf();
    refreshCount = 0;

    // floor(1240/40) - 10 = 21 — six rows on from 15, so the pool has to be re-patched.
    scrollBody(body, 1240);
    await raf();
    expect(refreshCount).toBeGreaterThan(0);
  });

  it("still repaints when the row data changes without the scroll position moving", async () => {
    const { api, body } = mountGrid(200);

    scrollBody(body, 1000);
    await raf();
    refreshCount = 0;

    api.setRowData(Array.from({ length: 200 }, (_, i) => ({
      id: `r${i}`,
      name: `Renamed ${i}`,
      region: i % 2 === 0 ? "APAC" : "EMEA",
    })));
    expect(refreshCount).toBeGreaterThan(0);
  });
});
