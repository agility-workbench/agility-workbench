// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

// Per-row heights (`getRowHeight`): every place that placed a body row at `index × rowHeight` now
// reads the core's row-height index. happy-dom does no layout, so these check the geometry the grid
// writes (spacer heights, row heights, the window's translate, scroll offsets) rather than boxes.

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

const ROW_HEIGHT = 40;
const VIEW_HEIGHT = 400;
/** Every third row is tall. */
const heightOf = (i: number) => (i % 3 === 0 ? 100 : 20);
const tallEveryThird: GridOptions["getRowHeight"] = ({ data }) => heightOf(data.n);

function mount(rowCount: number, options: Partial<GridOptions> = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", rowHeight: ROW_HEIGHT, overscanRowCount: 2, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", pinned: "left" },
    { colId: "group", key: "group", label: "Group" },
  ]);
  api.setRowData(Array.from({ length: rowCount }, (_, n) => ({
    id: `r${n}`,
    n,
    name: `Row ${n}`,
    group: n < rowCount / 2 ? "A" : "B",
  })));
  const body = container.querySelector<HTMLElement>(".pte-body")!;
  Object.defineProperty(body, "clientHeight", { value: VIEW_HEIGHT, configurable: true });
  return { container, core, api, body, renderer };
}

function scrollBody(body: HTMLElement, scrollTop: number) {
  body.scrollTop = scrollTop;
  body.dispatchEvent(new Event("scroll"));
}

const prefix = (count: number) => Array.from({ length: count }, (_, i) => heightOf(i)).reduce((a, b) => a + b, 0);

/** Rendered centre rows with their view index and height. */
function centerRows(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(".pte-viewport .pte-row"))
    .filter(row => row.style.display !== "none" && row.dataset.viewIdx != null)
    .map(row => ({ viewIdx: Number(row.dataset.viewIdx), height: row.style.height }));
}

describe("getRowHeight in the body", () => {
  it("stands the sections at the sum of the row heights", () => {
    const { container } = mount(30, { getRowHeight: tallEveryThird });
    const spacer = container.querySelector<HTMLElement>(".pte-spacer")!;
    expect(spacer.style.height).toBe(`${prefix(30)}px`);
    expect(container.querySelector<HTMLElement>(".pte-spacer-left")!.style.height).toBe(`${prefix(30)}px`);
  });

  it("sizes every fragment of a row to that row's height", () => {
    const { container } = mount(30, { getRowHeight: tallEveryThird });
    const rows = centerRows(container);
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) expect(row.height).toBe(`${heightOf(row.viewIdx)}px`);
    const left = Array.from(container.querySelectorAll<HTMLElement>(".pte-viewport-left .pte-row"))
      .filter(row => row.style.display !== "none" && row.dataset.viewIdx != null);
    for (const row of left) expect(row.style.height).toBe(`${heightOf(Number(row.dataset.viewIdx))}px`);
  });

  it("starts the window at the row under the scroll offset and translates it to that row's top", async () => {
    const { container, body } = mount(300, { getRowHeight: tallEveryThird });
    // Rows 0..29 are 10 × (100 + 20 + 20) = 1400px; row 30 starts there and is 100px tall.
    scrollBody(body, 1450);
    await raf();
    const first = centerRows(container)[0];
    expect(first.viewIdx).toBe(28); // row 30 minus overscan 2
    const viewport = container.querySelector<HTMLElement>(".pte-viewport")!;
    expect(viewport.style.transform).toBe(`translateY(${prefix(28)}px)`);
  });

  it("sizes the pool for the shortest row so a viewport of short rows is covered", () => {
    const short = mount(300, { getRowHeight: () => 10 });
    const tall = mount(300);
    const count = (c: HTMLElement) => c.querySelectorAll(".pte-viewport .pte-row").length;
    // ceil(body / 10) + 2 × overscan against ceil(body / 40) + 2 × overscan, for the same body.
    const shortRows = count(short.container) - 4;
    const tallRows = count(tall.container) - 4;
    expect(shortRows).toBeGreaterThanOrEqual(VIEW_HEIGHT / 10);
    expect(shortRows).toBeGreaterThanOrEqual((tallRows - 1) * 4);
  });

  it("scrolls a row into view by its own top and height", () => {
    const { api, body } = mount(300, { getRowHeight: tallEveryThird });
    api.ensureRowVisible("r60", { position: "top" });
    expect(body.scrollTop).toBe(prefix(60));
    api.ensureRowVisible("r90", { position: "bottom" });
    expect(body.scrollTop).toBe(prefix(90) + 100 - VIEW_HEIGHT);
  });

  it("re-lays the body out when getRowHeight is swapped or reset", () => {
    let height = 30;
    const getRowHeight = vi.fn(() => height);
    const { container, api } = mount(20, { getRowHeight });
    const spacer = container.querySelector<HTMLElement>(".pte-spacer")!;
    expect(spacer.style.height).toBe("600px");

    // Cached: a height that changes behind the grid's back is not seen...
    height = 50;
    api.refreshCells();
    expect(spacer.style.height).toBe("600px");
    // ...until the app says so.
    api.resetRowHeights();
    expect(spacer.style.height).toBe("1000px");
    expect(centerRows(container)[0].height).toBe("50px");

    api.updateGridOptions({ getRowHeight: () => 25 });
    expect(spacer.style.height).toBe("500px");
    api.updateGridOptions({ getRowHeight: undefined });
    expect(spacer.style.height).toBe(`${20 * ROW_HEIGHT}px`);
    expect(centerRows(container)[0].height).toBe(`${ROW_HEIGHT}px`);
  });

  it("asks again for a row whose data object is replaced", () => {
    const getRowHeight = vi.fn(({ data }) => (data.tall ? 90 : 30));
    const { container, api } = mount(4, { getRowHeight, rowIdKey: "id" });
    const spacer = container.querySelector<HTMLElement>(".pte-spacer")!;
    expect(spacer.style.height).toBe("120px");
    api.applyTransaction({ update: [{ rowId: "r1", row: { id: "r1", n: 1, name: "Row 1", group: "A", tall: true } }] });
    expect(spacer.style.height).toBe("180px");
    expect(centerRows(container).find(row => row.viewIdx === 1)?.height).toBe("90px");
  });

  it("keeps rowHeight for every row when getRowHeight answers nothing", () => {
    const { container } = mount(10, { getRowHeight: () => undefined });
    expect(container.querySelector<HTMLElement>(".pte-spacer")!.style.height).toBe(`${10 * ROW_HEIGHT}px`);
  });
});

describe("getRowHeight outside the body", () => {
  it("sizes pinned band rows and the band from their own heights", () => {
    const { container } = mount(10, {
      getRowHeight: ({ node }) => (node.rowPinned ? 60 : undefined),
      pinnedTopRowData: [{ id: "p0", name: "Top 0" }, { id: "p1", name: "Top 1" }],
    });
    const band = container.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    const rows = Array.from(band.querySelectorAll<HTMLElement>(".pte-pinned-rows-center .pte-pinned-row"));
    expect(rows.map(row => row.style.height)).toEqual(["60px", "60px"]);
    expect(band.style.height).toBe("120px");
  });

  it("docks sticky group headers at their own heights", async () => {
    const { container, core, api, body } = mount(20, {
      groupDisplayType: "groupRows",
      groupRowsSticky: true,
      getRowHeight: ({ node }) => (node.isGroup ? 70 : 30),
    } as Partial<GridOptions>);
    core.dispatch({ type: "rowGroupSet", colIds: ["group"] } as any);
    await raf();
    api.setAllGroupsExpanded(true);
    await raf();
    // A(70) + 10 × 30 = 370: B's header starts there. Scroll into A's block.
    expect(core.rowHeights.topOf(11)).toBe(370);
    scrollBody(body, 100);
    await raf();
    await raf();
    const overlay = container.querySelector<HTMLElement>(".pte-sticky-rows")!;
    const mirror = overlay.querySelector<HTMLElement>(".pte-sticky-row")!;
    expect(mirror.style.height).toBe("70px");
    expect(overlay.style.height).toBe("70px");

    // 20px before B's header reaches the top, A is pushed up by the 50px it overlaps B.
    scrollBody(body, 370 - 20);
    await raf();
    await raf();
    expect(mirror.style.transform).toBe("translateY(-50px)");
  });
});
