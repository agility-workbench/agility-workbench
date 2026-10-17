// @vitest-environment happy-dom
/**
 * ColDef.wrapHeaderText + autoHeaderHeight: the header measures wrapped labels once per render and
 * grows the level that holds them, through the one header geometry — wrapper, sections, cells, body
 * frame and `--pte-rendered-header-height` move together.
 *
 * happy-dom has no layout, so a label's height is modelled: `LINE` px per line, lines =
 * ceil(text width / room), text width = 7px per character, room = the cell's inline width - 40px.
 * Header containers report 4px top/bottom padding and a 1px top border (chrome = 9px); a cell whose
 * content reaches the leaf level needs one more pixel for the wrapper's bottom border.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../../createGrid";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import { createTheme } from "../../theme/theme";
import { HeaderAutoHeight } from "./headerAutoHeight";
import { HeaderRenderer } from "./renderer";

let LINE = 16;
const CHROME = 9;

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

function cellWidth(hcell: HTMLElement): number {
  const own = parseFloat(hcell.style.width);
  if (hcell.classList.contains("pte-hcell-leaf")) return own || 0;
  // A group's inline width is written by the width pass after the build; in a browser it is the
  // sum of its children's boxes, which is what this models.
  return [...hcell.querySelectorAll<HTMLElement>(".pte-hcell-leaf")]
    .reduce((sum, leaf) => sum + (parseFloat(leaf.style.width) || 0), 0);
}

let host: HTMLElement;
let api: IGridAPI | null = null;

beforeEach(() => {
  LINE = 16;
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "800px";
  document.body.appendChild(host);
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList.contains("pte-hcell-label")) return 0;
      const hcell = this.closest<HTMLElement>(".pte-hcell")!;
      const wraps = this.closest(".pte-hcell-wrap-text") != null;
      const text = (this.textContent ?? "").length * 7;
      const room = Math.max(1, cellWidth(hcell) - 40);
      return (wraps ? Math.max(1, Math.ceil(text / room)) : 1) * LINE;
    },
  });
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation(((el: Element) => {
    if (!el.classList?.contains("pte-hcell-container")) return real(el);
    return { paddingTop: "4px", paddingBottom: "4px", borderTopWidth: "1px", borderBottomWidth: "0px" };
  }) as typeof window.getComputedStyle);
});

afterEach(() => {
  api?.destroy();
  api = null;
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as any).scrollHeight;
});

const LONG = "A very long header label that wraps"; // 35 chars = 245px of text
const leaf = (id: string, extra: Record<string, unknown> = {}) => ({ colId: id, key: id, label: id, width: 100, ...extra });
const auto = { wrapHeaderText: true, autoHeaderHeight: true };

function mount(columnDefs: unknown[], extra: Record<string, unknown> = {}) {
  api = createGrid(host, { rowIdKey: "id", columnDefs, rowData: [{ id: 1 }], ...extra } as any);
  return api;
}

const px = (value: string) => Number.parseFloat(value);
const wrapper = () => host.querySelector<HTMLElement>(".pte-header-wrapper")!;
const SECTIONS = [".pte-header-leading", ".pte-header-left", ".pte-header", ".pte-header-right"];

function cell(label: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>(".pte-hcell")].find(h =>
    h.querySelector(":scope > .pte-hcell-wrapper .pte-hcell-label")?.textContent === label);
  if (!found) throw new Error(`no header cell labelled ${label}`);
  return found;
}

function heights(label: string): [number, number] {
  const h = cell(label);
  const container = h.querySelector<HTMLElement>(":scope > .pte-hcell-wrapper > .pte-hcell-container")!;
  return [px(h.style.height), px(container.style.height)];
}

/** Wrapper, every section, every top-level cell, the CSS variable and the body frame agree. */
function expectHeader(total: number) {
  const w = wrapper();
  expect(px(w.style.height)).toBe(total);
  expect(px(w.style.minHeight)).toBe(total);
  for (const section of SECTIONS) {
    const el = w.querySelector<HTMLElement>(`:scope > ${section}`)!;
    expect(px(el.style.height)).toBe(total);
    for (const top of el.querySelectorAll<HTMLElement>(":scope > .pte-hcell")) {
      expect(px(top.style.height)).toBe(total);
    }
  }
  expect(host.querySelector<HTMLElement>(".pte-root")!.style
    .getPropertyValue("--pte-rendered-header-height")).toBe(`${total}px`);
  expect(host.querySelector<HTMLElement>(".pte-body-frame")!.style.maxHeight).toBe(`calc(100% - ${total}px)`);
}

/** Leaf content of `lines` lines on the leaf level. */
const leafNeeds = (lines: number) => lines * LINE + CHROME + 1;

describe("wrapHeaderText", () => {
  it("marks the container so the label wraps, without changing the configured height", () => {
    mount([leaf("a", { label: LONG, wrapHeaderText: true }), leaf("b")]);
    expect(cell(LONG).querySelector(".pte-hcell-container")!.classList.contains("pte-hcell-wrap-text")).toBe(true);
    expect(cell("b").querySelector(".pte-hcell-container")!.classList.contains("pte-hcell-wrap-text")).toBe(false);
    expectHeader(43);
  });

  it("is inherited from defaultColDef", () => {
    mount([leaf("a", { label: LONG })], { defaultColDef: auto });
    expectHeader(leafNeeds(5));
  });
});

describe("autoHeaderHeight", () => {
  it("grows a one-level header to the tallest wrapped label", () => {
    // 245px of text in 60px of room = 5 lines; 140px of room = 2 lines.
    mount([leaf("a", { label: LONG, ...auto }), leaf("b", { label: LONG, ...auto, width: 180 }), leaf("c")]);
    expectHeader(leafNeeds(5));
    expect(heights(LONG)).toEqual([leafNeeds(5), leafNeeds(5)]);
    expect(heights("c")).toEqual([leafNeeds(5), leafNeeds(5)]);
  });

  it("never shrinks a level below its configured height", () => {
    mount([leaf("a", { label: "Short", ...auto })], { headerHeight: 50 });
    expectHeader(50);
  });

  it("grows the leaf level and the group level independently, pinned sections together", () => {
    mount([
      leaf("left", { pinned: "left", label: LONG, ...auto }),
      {
        colId: "G", label: "Group label that is long enough to wrap in two leaves", ...auto,
        // maxWidth: the autosizer would otherwise widen the leaves to fit the group label on one line.
        children: [leaf("g1", { maxWidth: 100 }), leaf("g2", { maxWidth: 100 })],
      },
      leaf("right", { pinned: "right" }),
    ], { leafHeaderHeight: 43, parentHeaderHeight: 30 });
    // Group: 54 chars = 378px in 160px of room = 3 lines; content on the parent level only.
    const parent = 3 * LINE + CHROME;
    // `left` spans both levels: it needs leafNeeds(5) in all, of which the parent level gives `parent`.
    const leafLevel = Math.max(43, leafNeeds(5) - parent);
    expectHeader(parent + leafLevel);
    expect(heights("Group label that is long enough to wrap in two leaves")).toEqual([parent + leafLevel, parent]);
    expect(heights("g1")).toEqual([leafLevel, leafLevel]);
    expect(heights(LONG)).toEqual([parent + leafLevel, parent + leafLevel]);
  });

  it("measures in one batch per header render, after every cell is built", () => {
    // Per build: how many measuring passes ran, and how many cells existed when the first did.
    const builds: { passes: number; cellsAtFirstPass: number }[] = [];
    let current: { passes: number; cellsAtFirstPass: number } | null = null;
    const measure = HeaderAutoHeight.prototype.measure;
    vi.spyOn(HeaderAutoHeight.prototype, "measure").mockImplementation(function (this: HeaderAutoHeight, base) {
      if (current && current.passes++ === 0) current.cellsAtFirstPass = host.querySelectorAll(".pte-hcell").length;
      return measure.call(this, base);
    });
    const build = HeaderRenderer.prototype.buildDOM;
    vi.spyOn(HeaderRenderer.prototype, "buildDOM").mockImplementation(function (this: HeaderRenderer, reason) {
      current = { passes: 0, cellsAtFirstPass: 0 };
      builds.push(current);
      try { build.call(this, reason); } finally { current = null; }
    });
    const grid = mount([leaf("a", { label: LONG, ...auto }), leaf("b")]);
    grid.setColumnDefs([leaf("a", { label: LONG, ...auto }), leaf("b"), leaf("c")]);
    expect(builds.length).toBeGreaterThan(1);
    // One pass over the finished cells; a build's font probe (themeFontSet) can re-size the columns,
    // and that settled width change is a re-measure trigger of its own — never more than that.
    for (const b of builds) expect([1, 2]).toContain(b.passes);
    expect(builds[0].cellsAtFirstPass).toBe(2);
    expect(builds[builds.length - 1].cellsAtFirstPass).toBe(3);
  });

  it("re-measures when a column's width settles", () => {
    const grid = mount([leaf("a", { label: LONG, ...auto }), leaf("b")]);
    expectHeader(leafNeeds(5));
    grid.setColumnWidth("a", 300); // 260px of room: 1 line
    expectHeader(43);
    grid.setColumnWidth("a", 120); // 80px: 4 lines
    expectHeader(leafNeeds(4));
  });

  it("re-measures on hide / show and on a label change", () => {
    const grid = mount([leaf("a", { label: LONG, ...auto }), leaf("b")]);
    grid.setColumnsVisible(["a"], false);
    expectHeader(43);
    grid.setColumnsVisible(["a"], true);
    expectHeader(leafNeeds(5));
    grid.setColumnDefs([leaf("a", { label: "Tiny", ...auto }), leaf("b")]);
    expectHeader(43);
  });

  it("follows a header-height change: the configured height wins when it is taller", () => {
    const grid = mount([leaf("a", { label: LONG, ...auto })]);
    grid.updateGridOptions({ headerHeight: 150 });
    expectHeader(150);
    grid.updateGridOptions({ headerHeight: 30 });
    expectHeader(leafNeeds(5));
  });

  it("re-measures on a theme swap", () => {
    const grid = mount([leaf("a", { label: LONG, ...auto })]);
    LINE = 20;
    grid.updateGridOptions({ theme: createTheme() });
    expectHeader(leafNeeds(5));
    expect(leafNeeds(5)).toBe(5 * 20 + CHROME + 1);
  });

  it("re-measures when a web font finishes loading", () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    try {
      mount([leaf("a", { label: LONG, ...auto })]);
      expectHeader(leafNeeds(5));
      LINE = 18;
      fonts.dispatchEvent(new Event("loadingdone"));
      expectHeader(5 * 18 + CHROME + 1);
    } finally {
      delete (document as any).fonts;
    }
  });

  it("leaves a header without auto columns exactly as configured", () => {
    const measure = vi.spyOn(HeaderAutoHeight.prototype, "measure");
    mount([leaf("a", { label: LONG }), leaf("b")], { leafHeaderHeight: 40 });
    expectHeader(40);
    expect(measure.mock.results.every(r => r.value === false)).toBe(true);
  });
});
