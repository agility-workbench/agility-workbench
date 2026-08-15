// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

// Vertical scroll sync between the pinned/leading/center sections. Each section is its own scroll
// box, so only the one under the pointer moves natively and the rest are moved from the scroll
// listener. These cover the two halves of that: the sections realign, and scrolling inside a single
// row does not repaint the pool.

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
    leading: container.querySelector<HTMLElement>(".pte-scroller-leading")!,
    left: container.querySelector<HTMLElement>(".pte-scroller-left")!,
    center: container.querySelector<HTMLElement>(".pte-scroller")!,
    right: container.querySelector<HTMLElement>(".pte-scroller-right")!,
    vScroll: container.querySelector<HTMLElement>(".pte-scroller-vertical-spacer")!,
  };
  return { container, core, api, sections };
}

/** Move one section the way a native/compositor scroll would, and let the grid observe it. */
function scrollSection(section: HTMLElement, scrollTop: number) {
  section.scrollTop = scrollTop;
  section.dispatchEvent(new Event("scroll"));
}

describe("vertical section sync", () => {
  it("aligns every other section in the same turn as the scroll event, without waiting for a frame", () => {
    const { sections } = mountGrid(200);

    scrollSection(sections.center, 600);

    // No await: the realignment must not be deferred to the rAF that patches rows.
    expect(sections.left.scrollTop).toBe(600);
    expect(sections.leading.scrollTop).toBe(600);
    expect(sections.right.scrollTop).toBe(600);
    expect(sections.vScroll.scrollTop).toBe(600);
  });

  it("syncs the same way when a pinned section leads", () => {
    const { sections } = mountGrid(200);

    scrollSection(sections.left, 600);

    expect(sections.center.scrollTop).toBe(600);
    expect(sections.leading.scrollTop).toBe(600);
    expect(sections.vScroll.scrollTop).toBe(600);
  });

  it("ignores a follower's echo rather than dragging the leading section back to it", () => {
    const { sections } = mountGrid(200);

    scrollSection(sections.center, 1000);
    expect(sections.left.scrollTop).toBe(1000);

    // The user keeps scrolling the center natively while the write we just made to the left section
    // is still working its way out as a scroll event. Replaying that stale event must not undo it.
    sections.center.scrollTop = 1040;
    sections.left.dispatchEvent(new Event("scroll"));

    expect(sections.center.scrollTop).toBe(1040);
  });
});

describe("row patching during scroll", () => {
  it("does not repaint cells while the scroll stays inside one row", async () => {
    const { sections } = mountGrid(200);

    // Land somewhere the start index is off the clamp: floor(1000/40) - 10 = 15.
    scrollSection(sections.center, 1000);
    await raf();
    refreshCount = 0;

    // floor(1030/40) - 10 is still 15, so the pool already holds exactly the right nodes.
    scrollSection(sections.center, 1030);
    await raf();
    expect(refreshCount).toBe(0);

    // Sections still track each other even though nothing was repainted.
    expect(sections.left.scrollTop).toBe(1030);
  });

  it("repaints as soon as the window advances by a whole row", async () => {
    const { sections } = mountGrid(200);

    scrollSection(sections.center, 1000);
    await raf();
    refreshCount = 0;

    // floor(1240/40) - 10 = 21 — six rows on from 15, so the pool has to be re-patched.
    scrollSection(sections.center, 1240);
    await raf();
    expect(refreshCount).toBeGreaterThan(0);
  });

  it("still repaints when the row data changes without the scroll position moving", async () => {
    const { api, sections } = mountGrid(200);

    scrollSection(sections.center, 1000);
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
