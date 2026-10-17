// @vitest-environment happy-dom
/**
 * Right-to-left layout (`enableRtl`, finding #126). happy-dom has no layout engine, so these tests
 * pin the parts that are decisions rather than geometry: how the direction is resolved and written
 * on the root, that every key binding along the inline axis is mirrored (body, header, menus, the
 * set-filter tree, the sheet tabs), the resize drag's sign, the start-relative scroll offsets the
 * public surface reports and accepts, which side menus and submenus open on, and that layers
 * portaled out of the root carry the grid's direction. The layout itself is covered by the
 * real-browser layout probe (`npm run probe:layout -- --only=^rtl-`).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { FilterPanelSpec, FilterRuntimeState } from "../filter/types";
import { buildSetOptions } from "../filter/setFilterCore";
import { buildSetFilterTree, defaultSegmentFormatter } from "../filter/setFilterTree";
import { GridAPI } from "../api/api";
import { createGrid } from "../createGrid";
import { initDomRenderer } from "./dom";
import { MenuRenderer } from "./menuRenderer";
import { FloatingAnchor } from "./floating/floatingAnchor";
import { portalOutOfRoot } from "./floating/portal";
import { ColumnInteractionRenderer } from "./header/columnInteraction";
import { SetFilterRenderer } from "./filter/setFilterRenderer";
import { SheetsRenderer } from "./sheets/sheetsRenderer";
import { resolveGroupDropIndex, showGroupDropPosition } from "./toolbar/groupDropPosition";
import {
  inlineDelta,
  inlineEnd,
  inlineOffset,
  inlineStart,
  isRtl,
  logicalArrowKey,
  mirrorHorizontal,
  resolveRtl,
  scrollStart,
  scrollStartBy,
  setScrollStart,
} from "./layout/direction";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("dir");
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

const rect = (left: number, top: number, right: number, bottom: number) =>
  ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top }) as DOMRect;

/** An element whose scrollLeft behaves like a browser's RTL scroller: 0 at the start, negative after. */
function rtlScroller() {
  const el = document.createElement("div");
  let value = 0;
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    get: () => value,
    set: (next: number) => { value = Math.min(0, next); },
  });
  return el;
}

function mountGrid(options: Record<string, unknown> = {}, ancestorDir?: string) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  if (ancestorDir) {
    const page = document.createElement("section");
    page.setAttribute("dir", ancestorDir);
    page.appendChild(container);
    document.body.appendChild(page);
  } else {
    document.body.appendChild(container);
  }
  const core = new GridCore(measurer, { rowIdKey: "id", rowNumbers: true, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "المنطقة" },
    { colId: "name", key: "name", label: "שם" },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
  ]);
  api.setRowData(Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, region: i % 2 ? "EMEA" : "AMER", name: `n${i}`, total: i })));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { core, api, renderer, root };
}

const press = (target: EventTarget, key: string, mods: Partial<KeyboardEventInit> = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }));

describe("direction helpers", () => {
  it("measure scroll offsets from the inline-start edge, never negative", () => {
    const ltr = document.createElement("div");
    expect(scrollStart(ltr, false)).toBe(0);

    const rtl = rtlScroller();
    setScrollStart(rtl, true, 120);
    expect(rtl.scrollLeft).toBe(-120);
    expect(scrollStart(rtl, true)).toBe(120);
    scrollStartBy(rtl, true, 30);
    expect(rtl.scrollLeft).toBe(-150);
    setScrollStart(rtl, true, -40); // clamped at the start edge
    expect(rtl.scrollLeft).toBe(-0);
    expect(scrollStart(rtl, true)).toBe(0);
  });

  it("read a box's inline edges and offsets in either direction", () => {
    const r = rect(100, 0, 300, 20);
    expect([inlineStart(r, false), inlineEnd(r, false)]).toEqual([100, 300]);
    expect([inlineStart(r, true), inlineEnd(r, true)]).toEqual([300, 100]);
    expect(inlineOffset(150, r, false)).toBe(50);
    expect(inlineOffset(150, r, true)).toBe(150);
    expect(inlineDelta(-12, true)).toBe(12);
    expect(inlineDelta(-12, false)).toBe(-12);
  });

  it("mirror the horizontal arrows and directions only in RTL", () => {
    expect(logicalArrowKey("ArrowLeft", true)).toBe("ArrowRight");
    expect(logicalArrowKey("ArrowRight", true)).toBe("ArrowLeft");
    expect(logicalArrowKey("ArrowLeft", false)).toBe("ArrowLeft");
    expect(logicalArrowKey("ArrowUp", true)).toBe("ArrowUp");
    expect(mirrorHorizontal("left", true)).toBe("right");
    expect(mirrorHorizontal("right", true)).toBe("left");
    expect(mirrorHorizontal("down", true)).toBe("down");
    expect(mirrorHorizontal("left", false)).toBe("left");
  });

  it("resolve the direction: the option wins, else the inherited one (closest [dir] in a DOM shim)", () => {
    const page = document.createElement("div");
    page.setAttribute("dir", "rtl");
    const el = document.createElement("div");
    page.appendChild(el);
    document.body.appendChild(page);
    expect(resolveRtl(el, undefined)).toBe(true);
    expect(resolveRtl(el, false)).toBe(false);
    page.setAttribute("dir", "ltr");
    expect(resolveRtl(el, undefined)).toBe(false);
    expect(resolveRtl(el, true)).toBe(true);
  });

  it("isRtl reads the owning root's resolved dir attribute", () => {
    const root = document.createElement("div");
    root.className = "pte-root";
    const child = document.createElement("span");
    root.appendChild(child);
    expect(isRtl(child)).toBe(false);
    root.dir = "rtl";
    expect(isRtl(child)).toBe(true);
    expect(isRtl(root)).toBe(true);
    expect(isRtl(null)).toBe(false);
  });
});

describe("enableRtl resolution on the root", () => {
  it("true writes dir=rtl, false writes dir=ltr even under an RTL page", () => {
    expect(mountGrid({ enableRtl: true }).root.dir).toBe("rtl");
    expect(mountGrid({ enableRtl: false }, "rtl").root.dir).toBe("ltr");
  });

  it("unset follows the direction the root inherits at attach", () => {
    expect(mountGrid({}, "rtl").root.dir).toBe("rtl");
    expect(mountGrid({}).root.dir).toBe("ltr");
  });

  it("an RTL <html> is inherited through createGrid, and the grid stays RTL afterwards", () => {
    document.documentElement.setAttribute("dir", "rtl");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const api = createGrid(host, {
      rowIdKey: "id",
      columnDefs: [{ colId: "a", key: "a", label: "A" }],
      rowData: [{ id: "1", a: 1 }],
    });
    const root = host.querySelector<HTMLElement>(".pte-root")!;
    expect(root.dir).toBe("rtl");
    // Creation-only: the page flipping later does not flip a live grid.
    document.documentElement.setAttribute("dir", "ltr");
    expect(root.dir).toBe("rtl");
    api.destroy();
  });
});

describe("body keyboard in RTL", () => {
  it("ArrowLeft moves to the NEXT column and ArrowRight to the previous one", () => {
    const { core, api, root } = mountGrid({ enableRtl: true });
    api.setFocusedCell(0, 1);
    press(root, "ArrowLeft");
    expect(core.getActiveCell()?.colIdx).toBe(2);
    press(root, "ArrowLeft");
    expect(core.getActiveCell()?.colIdx).toBe(3);
    press(root, "ArrowRight");
    expect(core.getActiveCell()?.colIdx).toBe(2);
  });

  it("Home/End stay logical (first/last column), and LTR is unchanged", () => {
    const rtl = mountGrid({ enableRtl: true });
    rtl.api.setFocusedCell(0, 2);
    press(rtl.root, "End");
    expect(rtl.core.getActiveCell()?.colIdx).toBe(3);

    const ltr = mountGrid({ enableRtl: false });
    ltr.api.setFocusedCell(0, 2);
    press(ltr.root, "ArrowLeft");
    expect(ltr.core.getActiveCell()?.colIdx).toBe(1);
  });

  it("Shift+ArrowLeft extends the range towards the next column", () => {
    const { core, api, root } = mountGrid({ enableRtl: true, rangeSelection: true });
    api.setFocusedCell(0, 1);
    press(root, "ArrowLeft", { shiftKey: true });
    const range = core.getSelectionRange();
    expect(range).not.toBeNull();
    expect([range!.colStart, range!.colEnd].sort()).toEqual([1, 2]);
  });
});

describe("header keyboard in RTL", () => {
  it("ArrowLeft moves the header cursor to the next column, Ctrl+ArrowLeft to the last", () => {
    const { core, root } = mountGrid({ enableRtl: true });
    root.focus();
    const start = core.getHeaderFocusColIdx()!;
    press(root, "ArrowLeft");
    expect(core.getHeaderFocusColIdx()).toBe(start + 1);
    press(root, "ArrowRight");
    expect(core.getHeaderFocusColIdx()).toBe(start);
    press(root, "ArrowLeft", { ctrlKey: true });
    expect(core.getHeaderFocusColIdx()).toBe(3);
  });

  it("the shortcut table names what the arrows do in this direction", () => {
    const { api } = mountGrid({ enableRtl: true });
    const moveLeft = api.getKeyboardShortcuts().find(s => s.id === "moveLeft" && s.scope === "headerCursor");
    expect(moveLeft?.label).toMatch(/next/i);
  });
});

describe("menus in RTL", () => {
  function rtlMenuRoot() {
    const root = document.createElement("div");
    root.className = "pte-root";
    root.dir = "rtl";
    document.body.appendChild(root);
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value(this: HTMLElement) {
        if (this === root) return rect(0, 0, 800, 600);
        if (this.classList.contains("pte-menu")) return rect(0, 0, 220, 100);
        const r = this.dataset.rect;
        if (r) { const [l, t, rr, b] = r.split(",").map(Number); return rect(l, t, rr, b); }
        return rect(0, 0, 0, 0);
      },
    });
    return root;
  }
  const items = () => [
    { id: "pin", label: "Pin", subMenu: [{ id: "pinLeft", label: "Left" }, { id: "pinRight", label: "Right" }] },
    { id: "hide", label: "Hide" },
  ];

  afterEach(() => {
    delete (HTMLElement.prototype as any).getBoundingClientRect;
  });

  it("a start-aligned menu hangs from the anchor's right edge", () => {
    const root = rtlMenuRoot();
    const anchorEl = document.createElement("button");
    anchorEl.dataset.rect = "500,40,540,70";
    root.appendChild(anchorEl);
    const menu = new MenuRenderer(root);
    menu.open({ anchorEl, clientX: 500, clientY: 70, items: items(), position: "bottom-left" });
    const overlay = root.querySelector<HTMLElement>(".pte-menu")!;
    expect(overlay.style.left).toBe(`${540 - 220}px`);
    menu.close(0);
  });

  it("ArrowLeft opens a submenu towards the left, ArrowRight closes it", () => {
    const root = rtlMenuRoot();
    const menu = new MenuRenderer(root);
    menu.open({ clientX: 600, clientY: 100, items: items() });
    // The parent item is the first one, focused on open; give it a rect to open from.
    const parent = root.querySelector<HTMLElement>(".pte-menu-item.has-submenu")!;
    parent.dataset.rect = "380,100,600,134";

    press(document, "ArrowRight"); // closes nothing at level 0, opens nothing either
    expect(root.querySelector(".pte-submenu")).toBeNull();

    press(document, "ArrowLeft");
    const submenu = root.querySelector<HTMLElement>(".pte-submenu")!;
    expect(submenu).not.toBeNull();
    expect(submenu.style.left).toBe(`${380 - 220}px`); // its right edge on the parent's left edge
    expect(submenu.contains(document.activeElement)).toBe(true);

    press(document, "ArrowRight");
    expect(root.querySelector(".pte-submenu")).toBeNull();
    expect(document.activeElement).toBe(parent);
    menu.close(0);
  });

  it("a submenu that would overflow on the left opens to the right instead", () => {
    const root = rtlMenuRoot();
    const menu = new MenuRenderer(root);
    menu.open({ clientX: 230, clientY: 100, items: items() });
    const parent = root.querySelector<HTMLElement>(".pte-menu-item.has-submenu")!;
    parent.dataset.rect = "10,100,230,134";
    press(document, "ArrowLeft");
    expect(root.querySelector<HTMLElement>(".pte-submenu")!.style.left).toBe("230px");
    menu.close(0);
  });
});

describe("set-filter tree in RTL", () => {
  it("ArrowLeft opens a closed group (towards the inline end) and ArrowRight closes it", () => {
    const setSetGroupExpanded = vi.fn();
    let lastOptions: any[] = [];
    const controller = {
      filterOptions: vi.fn(),
      applyMiniFilter: vi.fn(),
      getSetOptionStates: vi.fn(() => lastOptions.map(o =>
        o.type === "group" ? { selected: false, indeterminate: true } : { selected: true, indeterminate: false })),
      toggleSetValue: vi.fn(),
      setSetGroupExpanded,
    } as any;
    const tree = {
      pathOf: (v: any) => (typeof v === "string" ? v.split("/") : null),
      formatSegment: defaultSegmentFormatter,
      defaultExpanded: 0,
    };
    const spec = { column: { colId: "item", label: "Item" }, params: {}, tree } as unknown as FilterPanelSpec;
    const renderer = new SetFilterRenderer(controller, spec, {} as IGridAPI);
    const root = document.createElement("div");
    root.className = "pte-root";
    root.dir = "rtl";
    root.appendChild(renderer.getUi());
    document.body.appendChild(root);
    const options = buildSetFilterTree(buildSetOptions(["Fruit/Orange", "Veg/Carrot"]), tree);
    lastOptions = options;
    renderer.renderState({
      join: "and",
      conditionOrder: ["c1"],
      draft: { c1: { type: "notIn" as any, values: [] } },
      ui: { c1: { loading: false, options } },
    } as FilterRuntimeState);
    const rows = Array.from(renderer.getUi().querySelectorAll<HTMLLabelElement>("label.pte-set-filter-option"));
    const fruitIdx = options.findIndex(o => o.label === "Fruit");
    rows.find(r => r.textContent?.includes("Fruit"))!.focus();

    press(renderer.getUi(), "ArrowLeft");
    expect(setSetGroupExpanded).toHaveBeenLastCalledWith(0, fruitIdx, true);
    setSetGroupExpanded.mockClear();
    press(renderer.getUi(), "ArrowRight"); // closed and a top-level row: steps to the parent
    expect(setSetGroupExpanded).not.toHaveBeenCalledWith(0, fruitIdx, true);
    renderer.destroy();
  });
});

describe("sheet tabs in RTL", () => {
  it("ArrowLeft focuses the NEXT tab", () => {
    const core = new GridCore(measurer, { rowIdKey: "id" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    core.setColumnDefsFromProps([{ colId: "a", key: "a", label: "A" }]);
    core.setRowData([{ id: "1", a: 1 }]);
    const root = document.createElement("div");
    root.className = "pte-root";
    root.dir = "rtl";
    const host = document.createElement("div");
    root.appendChild(host);
    document.body.appendChild(root);
    new SheetsRenderer({
      core,
      api: new GridAPI(core),
      host,
      menuRenderer: new MenuRenderer(root),
      options: { sheets: [{ id: "a", name: "ألف" }, { id: "b", name: "ב" }, { id: "c", name: "C" }] },
      onEnabledChange: () => undefined,
      onActiveTabChange: () => undefined,
      openColumnPanel: () => undefined,
    } as any);
    const tabs = [...host.querySelectorAll<HTMLButtonElement>(".pte-sheet-tab")];
    tabs[0].focus();
    press(tabs[0], "ArrowLeft");
    expect(document.activeElement).toBe(tabs[1]);
    press(tabs[1], "ArrowRight");
    expect(document.activeElement).toBe(tabs[0]);
  });
});

describe("pointer geometry in RTL", () => {
  it("a resize drag towards the left widens the column (the handle is on the inline-end edge)", () => {
    const core = new GridCore(measurer, { rowIdKey: "id" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    core.setRowData([{ id: "1", name: "x" }]);
    core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name" }]);
    const col = core.getColumnModel().getByColId("name")!;
    const root = document.createElement("div");
    root.className = "pte-root";
    root.dir = "rtl";
    const header = document.createElement("div");
    header.className = "pte-hcell";
    header.id = col.instanceID;
    header.getBoundingClientRect = () => ({ width: 100 } as DOMRect);
    const handle = document.createElement("div");
    handle.className = "pte-hcell-resize-handle";
    header.appendChild(handle);
    root.appendChild(header);
    document.body.appendChild(root);
    const div = () => document.createElement("div");
    const renderer = new ColumnInteractionRenderer({
      core, root, headerHeight: () => 30, headerWrapper: div(),
      leftHeader: div(), centerHeader: div(), rightHeader: div(), body: div(),
      leftSpacer: div(), centerSpacer: div(), rightSpacer: div(), leafColumnLookup: () => new Map(),
    });
    const mouse = (type: string, clientX: number, target?: EventTarget) => {
      const ev = new MouseEvent(type, { clientX, button: 0, bubbles: true });
      if (target) Object.defineProperty(ev, "target", { value: target });
      return ev;
    };
    renderer.onHeaderMouseDown(mouse("mousedown", 200, handle));
    renderer.onColumnResizeMouseMove(mouse("mousemove", 160));
    renderer.onColumnResizeMouseUp();
    expect(col.computedWidth).toBe(140);
  });

  it("toolbar chips: the drop index and marker follow the inline axis", () => {
    const root = document.createElement("div");
    root.className = "pte-root";
    root.dir = "rtl";
    const zone = document.createElement("div");
    zone.getBoundingClientRect = () => rect(0, 0, 400, 30);
    // DOM order = logical order; in RTL the first chip is the rightmost.
    const chips = [rect(300, 0, 380, 30), rect(200, 0, 280, 30)].map(r => {
      const chip = document.createElement("span");
      chip.className = "pte-grid-toolbar-group-chip";
      chip.getBoundingClientRect = () => r;
      zone.appendChild(chip);
      return chip;
    });
    root.appendChild(zone);
    document.body.appendChild(root);
    expect(resolveGroupDropIndex(zone, 390)).toBe(0); // right of the first chip's middle
    expect(resolveGroupDropIndex(zone, 320)).toBe(1);
    expect(resolveGroupDropIndex(zone, 100)).toBe(2);
    showGroupDropPosition(zone, 0);
    expect(zone.querySelector<HTMLElement>(".pte-grid-toolbar-group-drop-indicator")!.style.left).toBe("380px");
    showGroupDropPosition(zone, 2);
    expect(zone.querySelector<HTMLElement>(".pte-grid-toolbar-group-drop-indicator")!.style.left).toBe("200px");
    expect(chips[1].classList.contains("drop-after")).toBe(true);
  });
});

describe("scroll offsets in RTL", () => {
  it("bodyScroll reports scrollLeftPx from the start edge (≥ 0) and scrollTo writes a negative scrollLeft", async () => {
    const { core, api, renderer } = mountGrid({ enableRtl: true });
    const spacer = renderer._bodyViewportRenderer.getRefs().centerSpacer;
    let value = 0;
    Object.defineProperty(spacer, "scrollLeft", {
      configurable: true,
      get: () => value,
      set: (next: number) => { value = Math.min(0, next); },
    });
    const events: number[] = [];
    core.on("bodyScroll", e => events.push(e.scrollLeftPx));

    api.scrollTo({ leftPx: 75 });
    expect(spacer.scrollLeft).toBe(-75);
    spacer.dispatchEvent(new Event("scroll"));
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]).toBe(75);
  });
});

describe("portaled layers carry the grid's direction", () => {
  it("portalOutOfRoot copies the root's dir onto the layer", () => {
    const root = document.createElement("div");
    root.className = "pte-root";
    root.dir = "rtl";
    document.body.appendChild(root);
    const layer = document.createElement("div");
    const unlink = portalOutOfRoot(root, layer);
    expect(layer.parentElement).toBe(document.body);
    expect(layer.getAttribute("dir")).toBe("rtl");
    unlink();
  });

  it("an escapeRootClip floater is mounted outside the root with dir=rtl", () => {
    const root = document.createElement("div");
    root.className = "pte-root";
    root.dir = "rtl";
    document.body.appendChild(root);
    const floating = new FloatingAnchor(root);
    const content = document.createElement("div");
    floating.show(content, { mode: { kind: "follow", x: 10, y: 10 }, escapeRootClip: true });
    const overlay = document.body.querySelector<HTMLElement>(":scope > .pte-floating");
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute("dir")).toBe("rtl");
    floating.destroy();
  });
});
