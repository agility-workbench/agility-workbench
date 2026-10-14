// @vitest-environment happy-dom
/**
 * The header is sized from the header-height options alone — never the body row height — and the
 * wrapper, its sections, the body frame and every header cell agree on it.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../../createGrid";
import type { IGridAPI } from "../../interfaces/iGridAPI";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;
let api: IGridAPI | null = null;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "800px";
  document.body.appendChild(host);
});

afterEach(() => {
  api?.destroy();
  api = null;
  vi.restoreAllMocks();
});

const leaf = (id: string) => ({ colId: id, key: id, label: id });

/** One level: three plain leaves. */
const flatDefs = [leaf("a"), leaf("b"), leaf("c")];

/** Two levels: a group of two leaves beside a standalone leaf. */
const twoLevelDefs = [
  { colId: "G", label: "G", children: [leaf("g1"), leaf("g2")] },
  leaf("s"),
];

/**
 * Three levels: a three-level group (a two-level group plus a direct leaf), a two-level group that
 * is shallower than the header, and a standalone leaf.
 */
const threeLevelDefs = [
  {
    colId: "A", label: "A", children: [
      { colId: "A1", label: "A1", children: [leaf("a1"), leaf("a2")] },
      leaf("a3"),
    ],
  },
  { colId: "B", label: "B", children: [leaf("b1"), leaf("b2")] },
  leaf("c"),
];

function mount(columnDefs: unknown[], extra: Record<string, unknown> = {}) {
  api = createGrid(host, { rowIdKey: "id", columnDefs, rowData: [{ id: 1 }], ...extra } as any);
  return api;
}

const wrapper = () => host.querySelector<HTMLElement>(".pte-header-wrapper")!;
const px = (value: string) => Number.parseFloat(value);
const SECTIONS = [".pte-header-leading", ".pte-header-left", ".pte-header", ".pte-header-right"];

/** The header cell whose own label (not a descendant's) reads `label`. */
function cell(label: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>(".pte-hcell")].find(h =>
    h.querySelector(":scope > .pte-hcell-wrapper .pte-hcell-label")?.textContent === label);
  if (!found) throw new Error(`no header cell labelled ${label}`);
  return found;
}

/** [cell height, content (container) height] for the labelled header cell. */
function heights(label: string): [number, number] {
  const h = cell(label);
  const container = h.querySelector<HTMLElement>(":scope > .pte-hcell-wrapper > .pte-hcell-container")!;
  return [px(h.style.height), px(container.style.height)];
}

/** Every top-level header cell is exactly as tall as the wrapper: no gap, no clip. */
function expectCellsFillWrapper() {
  const total = px(wrapper().style.height);
  const topCells = SECTIONS.flatMap(section =>
    [...host.querySelectorAll<HTMLElement>(`.pte-header-wrapper > ${section} > .pte-hcell`)]);
  expect(topCells.length).toBeGreaterThan(0);
  for (const h of topCells) expect(px(h.style.height)).toBe(total);
}

describe("header geometry", () => {
  it("defaults to 43px per level", () => {
    mount(twoLevelDefs);
    expect(wrapper().style.height).toBe("86px");
    expect(heights("G")).toEqual([86, 43]);
    expect(heights("g1")).toEqual([43, 43]);
    expect(heights("s")).toEqual([86, 86]);
  });

  it("sizes the wrapper, sections, CSS variable and body frame from one total", () => {
    // happy-dom has no layout; let the header wrapper measure as its inline height, which is what
    // the column layout reads back when it re-fits the body frame.
    const rect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains("pte-header-wrapper")) return rect.call(this);
      return { height: px(this.style.height) || 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect;
    });
    mount(twoLevelDefs, { leafHeaderHeight: 60, parentHeaderHeight: 30 });
    const w = wrapper();
    expect(w.style.height).toBe("90px");
    expect(w.style.minHeight).toBe("90px");
    for (const section of SECTIONS) {
      const el = w.querySelector<HTMLElement>(`:scope > ${section}`)!;
      expect(el.style.height).toBe("90px");
      expect(el.style.minHeight).toBe("90px");
    }
    expect(host.querySelector<HTMLElement>(".pte-root")!.style
      .getPropertyValue("--pte-rendered-header-height")).toBe("90px");
    const frame = host.querySelector<HTMLElement>(".pte-body-frame")!;
    expect(frame.style.height).toBe("calc(100% - 90px)");
    expect(frame.style.maxHeight).toBe("calc(100% - 90px)");
  });

  it("matches every level of a three-level tree", () => {
    mount(threeLevelDefs);
    expect(wrapper().style.height).toBe("129px");
    expect(heights("A")).toEqual([129, 43]);
    expect(heights("A1")).toEqual([86, 43]);
    expect(heights("a1")).toEqual([43, 43]);
    expect(heights("a3")).toEqual([86, 86]);
    // A two-level group in a three-level header: its leaves stay on the leaf level and its own
    // label takes the extra level, so its children are not pushed past the bottom of the header.
    expect(heights("B")).toEqual([129, 86]);
    expect(heights("b1")).toEqual([43, 43]);
    expect(heights("c")).toEqual([129, 129]);
    expectCellsFillWrapper();
  });

  it("uses the leaf and parent heights per level in a three-level tree", () => {
    mount(threeLevelDefs, { leafHeaderHeight: 60, parentHeaderHeight: 30 });
    expect(wrapper().style.height).toBe("120px");
    expect(heights("A")).toEqual([120, 30]);
    expect(heights("A1")).toEqual([90, 30]);
    expect(heights("a1")).toEqual([60, 60]);
    expect(heights("a3")).toEqual([90, 90]);
    expect(heights("B")).toEqual([120, 60]);
    expect(heights("b1")).toEqual([60, 60]);
    expect(heights("c")).toEqual([120, 120]);
  });

  it("headerHeight: 60 leaves no gap under the cells", () => {
    mount(twoLevelDefs, { headerHeight: 60 });
    expect(wrapper().style.height).toBe("120px");
    expect(heights("G")).toEqual([120, 60]);
    expect(heights("g1")).toEqual([60, 60]);
    expect(heights("s")).toEqual([120, 120]);
    expectCellsFillWrapper();
  });

  it("headerHeight: 30 does not clip the cells", () => {
    mount(twoLevelDefs, { headerHeight: 30 });
    expect(wrapper().style.height).toBe("60px");
    expect(heights("G")).toEqual([60, 30]);
    expect(heights("g1")).toEqual([30, 30]);
    expectCellsFillWrapper();
  });

  it("rowHeight alone leaves the header at its default", () => {
    mount(twoLevelDefs, { rowHeight: 60 });
    expect(wrapper().style.height).toBe("86px");
    expect(heights("G")).toEqual([86, 43]);
    expect(heights("g1")).toEqual([43, 43]);
    expect(heights("s")).toEqual([86, 86]);
  });

  it("leafHeaderHeight and parentHeaderHeight win over headerHeight", () => {
    mount(twoLevelDefs, { headerHeight: 50, leafHeaderHeight: 60, parentHeaderHeight: 30 });
    expect(wrapper().style.height).toBe("90px");
    expect(heights("G")).toEqual([90, 30]);
    expect(heights("g1")).toEqual([60, 60]);
    expect(heights("s")).toEqual([90, 90]);
  });

  it("a one-level header is the leaf height", () => {
    mount(flatDefs, { headerHeight: 50, leafHeaderHeight: 36 });
    expect(wrapper().style.height).toBe("36px");
    expect(heights("a")).toEqual([36, 36]);
  });
});

describe("header heights at runtime", () => {
  it("updateGridOptions re-lays the header out", () => {
    const grid = mount(twoLevelDefs);
    grid.updateGridOptions({ headerHeight: 60 });
    expect(wrapper().style.height).toBe("120px");
    expect(heights("G")).toEqual([120, 60]);
    expect(heights("g1")).toEqual([60, 60]);
    expect(host.querySelector<HTMLElement>(".pte-body-frame")!.style.maxHeight).toBe("calc(100% - 120px)");
    expect(grid.getCore().getOptions()).toMatchObject({
      headerHeight: 60, leafHeaderHeight: 60, parentHeaderHeight: 60,
    });
  });

  it("an unset level height keeps following headerHeight; undefined falls back", () => {
    const grid = mount(twoLevelDefs, { leafHeaderHeight: 50 });
    grid.updateGridOptions({ headerHeight: 30 });
    expect(heights("G")).toEqual([80, 30]);
    expect(heights("g1")).toEqual([50, 50]);

    grid.updateGridOptions({ leafHeaderHeight: undefined });
    expect(wrapper().style.height).toBe("60px");
    expect(heights("g1")).toEqual([30, 30]);

    grid.updateGridOptions({ headerHeight: undefined });
    expect(wrapper().style.height).toBe("86px");
  });

  it("does not warn and does not rebuild the header when nothing changed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const grid = mount(twoLevelDefs, { headerHeight: 43 });
    const before = cell("G");
    grid.updateGridOptions({ headerHeight: 43, leafHeaderHeight: undefined });
    expect(cell("G")).toBe(before);
    expect(warn).not.toHaveBeenCalled();
  });
});
