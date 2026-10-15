// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import type { ColDef } from "../../interfaces/column";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

/**
 * An application-pinned band is capped at 30% of the grid's height. The cap depends on the root's
 * height, which changes without the band's content changing, so the layout pass (what the root
 * resize path calls) must re-lay it — including for a grid created hidden, whose first render had
 * no height to cap against (gap finding A3.6).
 */

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
const colDefs: ColDef[] = [{ colId: "name", key: "name", label: "Name" }];

async function mount(rootHeight: number) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowHeight: 40,
    pinnedTopRowData: [{ id: "p0", name: "Top 0" }, { id: "p1", name: "Top 1" }],
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  const root: HTMLElement = (renderer as any).root;
  let height = rootHeight;
  Object.defineProperty(root, "clientHeight", { configurable: true, get: () => height });
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs);
  api.setRowData(Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` })));
  await raf();
  const pinned = (renderer as any)._pinnedRowsRenderer;
  const band = container.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
  const lane = band.querySelector<HTMLElement>(".pte-pinned-rows-vertical")!;
  const scroller = band.querySelector<HTMLElement>(".pte-pinned-rows-vertical-scroller")!;
  return {
    pinned, band, lane, scroller,
    setHeight: (next: number) => { height = next; },
  };
}

describe("pinned band height follows the root height", () => {
  it("re-caps the band on updateLayout after the root's height changes, and uncaps it again", async () => {
    const { pinned, band, lane, scroller, setHeight } = await mount(600);
    // 2 rows x 40 = 80px, under the 30% cap of 180px.
    expect(band.style.height).toBe("80px");
    expect(lane.classList.contains("scrollable")).toBe(false);

    setHeight(180); // cap: max(40, floor(54)) = 54px
    pinned.updateLayout();
    expect(band.style.height).toBe("54px");
    for (const section of band.querySelectorAll<HTMLElement>(
      ".pte-pinned-rows-left, .pte-pinned-rows-center, .pte-pinned-rows-right, .pte-pinned-rows-vertical",
    )) {
      expect(section.style.height).toBe("54px");
    }
    expect(scroller.style.height).toBe("80px");
    expect(lane.classList.contains("scrollable")).toBe(true);
    expect(lane.style.pointerEvents).toBe("auto");

    setHeight(600);
    pinned.updateLayout();
    expect(band.style.height).toBe("80px");
    expect(lane.classList.contains("scrollable")).toBe(false);
  });

  it("caps a band rendered while the root had no height on the next updateLayout", async () => {
    const { pinned, band, setHeight } = await mount(0);
    expect(band.style.height).toBe("80px"); // uncapped: nothing to cap against yet
    setHeight(100); // cap: max(40, 30) = 40px
    pinned.updateLayout();
    expect(band.style.height).toBe("40px");
  });

  it("hands a changed band height to the body, and only a changed one", async () => {
    const { pinned, setHeight } = await mount(600);
    let calls = 0;
    pinned.params.onHeightChanged = () => { calls++; };
    pinned.updateLayout();
    expect(calls).toBe(0);
    setHeight(180);
    pinned.updateLayout();
    expect(calls).toBe(1);
    pinned.updateLayout();
    expect(calls).toBe(1);
  });
});
