// @vitest-environment happy-dom
/**
 * The grid's resize path (A3 in docs/feature-gap-findings.md). happy-dom has no layout engine, so
 * every box the path reads is stubbed: `clientWidth`/`clientHeight` come from a per-class table, and
 * ResizeObserver is a fake whose callback the test fires by hand. What is pinned here:
 *
 * - the horizontal scrollbar strip is decided from boxes that do not depend on its own display
 *   (it used to read its own lanes, which measure 0 while it is hidden, so it flipped every call);
 * - the root/body observer re-decides the strip, re-sizes the row pool and the body-frame budget
 *   without any column change, and a second pass with unchanged inputs writes nothing;
 * - header cell widths are found inside the grid, so a shadow-root mount keeps them in step.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../../createGrid";
import { ColumnType } from "../../interfaces/column";
import { GridCore } from "../../core/core";
import { ColumnLayoutRenderer } from "./columnLayout";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

/** clientWidth / clientHeight by class name; anything not listed measures 0, as in happy-dom. */
let widths: Record<string, number>;
let heights: Record<string, number>;
let observers: Array<{ fire: () => void; targets: Element[] }>;
let observed: Element[];
const OriginalObserver = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");

function measure(el: HTMLElement, table: Record<string, number>): number {
  for (const cls of Object.keys(table)) if (el.classList.contains(cls)) return table[cls];
  return 0;
}

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  widths = {};
  heights = {};
  observers = [];
  observed = [];
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) { return measure(this, widths); },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) { return measure(this, heights); },
  });
  globalThis.ResizeObserver = class {
    private entry: { fire: () => void; targets: Element[] };
    constructor(cb: () => void) {
      this.entry = { fire: () => cb(), targets: [] };
      observers.push(this.entry);
    }
    observe(el: Element) { observed.push(el); this.entry.targets.push(el); }
    unobserve() {}
    disconnect() {}
  } as any;
});

afterEach(() => {
  globalThis.ResizeObserver = OriginalObserver;
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
});

/** Fire the grid's resize path: the observer on the root (and body). Other observers (responsive
 * toolbar/footer bars, sheet tabs) watch their own boxes and are not part of it. */
function fireResize() {
  for (const o of observers) {
    if (o.targets.some(t => (t as HTMLElement).classList?.contains("pte-root"))) o.fire();
  }
}

const columnDefs = [
  { colId: "a", key: "a", label: "A", type: ColumnType.NUMBER, width: 200 },
  { colId: "b", key: "b", label: "B", type: ColumnType.NUMBER, width: 200 },
];
const rowData = Array.from({ length: 500 }, (_, i) => ({ id: i, a: i, b: i * 2 }));

function q<T extends HTMLElement = HTMLElement>(selector: string, scope: ParentNode = host): T {
  const el = scope.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

const strip = (scope: ParentNode = host) => q(".pte-scroller-horizontal-container-wrapper", scope);

describe("horizontal scrollbar strip", () => {
  it("shows iff a section's content is wider than its body section, whatever the strip showed before", () => {
    widths = { "pte-root": 1000, "pte-spacer": 600 };
    const api = createGrid(host, { rowIdKey: "id", columnDefs, rowData });
    // 400px of centre columns in a 600px centre section: no strip, on every call — it used to
    // come back on every other call because a hidden strip's lanes measure 0.
    expect(strip().style.display).toBe("none");
    api.applyColumnState([{ colId: "a", widthPx: 210 }]);
    expect(strip().style.display).toBe("none");
    api.applyColumnState([{ colId: "a", widthPx: 220 }]);
    expect(strip().style.display).toBe("none");

    // 640px of centre columns in the same section: the strip, on every call.
    api.applyColumnState([{ colId: "a", widthPx: 440 }]);
    expect(strip().style.display).toBe("flex");
    api.applyColumnState([{ colId: "b", widthPx: 201 }]);
    expect(strip().style.display).toBe("flex");
    api.destroy();
  });

  it("is re-decided by the resize path without any column change", () => {
    widths = { "pte-root": 1000, "pte-spacer": 600 };
    const api = createGrid(host, { rowIdKey: "id", columnDefs, rowData });
    expect(strip().style.display).toBe("none");

    // The root narrows: the centre section is now narrower than its 400px of columns.
    widths = { "pte-root": 350, "pte-spacer": 300 };
    fireResize();
    expect(strip().style.display).toBe("flex");
    fireResize();
    expect(strip().style.display).toBe("flex");

    // And grows back: the empty strip goes.
    widths = { "pte-root": 1000, "pte-spacer": 600 };
    fireResize();
    expect(strip().style.display).toBe("none");
    api.destroy();
  });

  it("measures the root's content box, not its padding box", () => {
    // The body section fits, but the total does not fit what the column-panel padding leaves.
    widths = { "pte-root": 450, "pte-spacer": 450 };
    const api = createGrid(host, { rowIdKey: "id", columnDefs, rowData });
    expect(strip().style.display).toBe("none");
    q(".pte-root").style.paddingRight = "100px";
    fireResize();
    expect(strip().style.display).toBe("flex");
    api.destroy();
  });

  it("observes the body as well as the root, and a second pass with unchanged inputs writes nothing", () => {
    widths = { "pte-root": 1000, "pte-spacer": 300, "pte-body": 985 };
    heights = { "pte-body": 300 };
    // A live 15px body scrollbar, so the gutter is read off the body rather than probed (the probe
    // appends an element, which is not a write of the resize path's own).
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get(this: HTMLElement) { return this.classList.contains("pte-body") ? 1000 : 0; },
    });
    const api = createGrid(host, { rowIdKey: "id", columnDefs, rowData });
    expect(observed).toContain(q(".pte-root"));
    expect(observed).toContain(q(".pte-body"));
    fireResize();

    const writes: string[] = [];
    const observer = new MutationObserver(records => {
      for (const r of records) writes.push(`${(r.target as HTMLElement).className}: ${r.attributeName}`);
    });
    observer.observe(q(".pte-root"), { attributes: true, subtree: true, childList: true });
    fireResize();
    return Promise.resolve().then(() => {
      observer.disconnect();
      // The pinned-row bands re-apply their own (unchanged) section widths on every pass; they are
      // the PinnedRowsRenderer's to settle and do not change any box's size.
      expect(writes.filter(w => !w.startsWith("pte-pinned-rows"))).toEqual([]);
      api.destroy();
    });
  });
});

describe("row pool on resize", () => {
  it("is re-evaluated from the resize callback when the body grows", () => {
    widths = { "pte-root": 1000, "pte-spacer": 600 };
    heights = { "pte-body": 200 };
    const api = createGrid(host, { rowIdKey: "id", columnDefs, rowData, rowHeight: 20, overscanRowCount: 0 });
    const rows = () => host.querySelectorAll(".pte-viewport > .pte-row").length;
    const before = rows();
    expect(before).toBe(10);

    // The body grows (root resize, or chrome removed inside a fixed root): the pool follows.
    heights = { "pte-body": 600 };
    fireResize();
    expect(rows()).toBe(30);
    api.destroy();
  });
});

describe("header widths in a shadow root", () => {
  it("updates header cell widths when the grid is mounted inside a shadow root", () => {
    const shadowHost = document.createElement("div");
    document.body.appendChild(shadowHost);
    const shadow = shadowHost.attachShadow({ mode: "open" });
    const el = () => document.createElement("div");
    const headerWrapper = el();
    const hcell = el();
    hcell.className = "pte-hcell";
    hcell.id = "col-instance-1";
    hcell.style.width = "100px";
    headerWrapper.appendChild(hcell);
    shadow.appendChild(headerWrapper);
    // Unreachable through the document, which is what the lookup used to rely on.
    expect(document.getElementById("col-instance-1")).toBeNull();

    const column = { instanceID: "col-instance-1", computedWidth: 200, isVisible: () => true };
    const core = {
      getColumnModel: () => ({
        getLeadingLeaves: () => [],
        getLeftLeaves: () => [],
        getCenterLeaves: () => [],
        getRightLeaves: () => [],
        walkColumns: (cb: (c: typeof column) => void) => cb(column),
      }),
    } as unknown as GridCore;
    const params: Record<string, unknown> = {
      core,
      headerWrapper,
      rowPool: () => [],
      verticalScrollbarGutter: () => 15,
      aggregateLeadingCells: () => [],
      aggregateLeftCells: () => [],
      aggregateCenterCells: () => [],
      aggregateRightCells: () => [],
    };
    for (const key of ["root", "bodyFrame", "leadingViewport", "leftViewport", "centerViewport",
      "rightViewport", "leadingSpacer", "leftSpacer", "centerSpacer", "rightSpacer", "leadingHeader",
      "leftHeader", "centerHeader", "rightHeader", "hScrollContainer", "hScrollLeadingParent",
      "hScrollLeftParent", "hScrollParent", "hScrollRightParent", "hScrollerLeft", "hScroller",
      "hScrollerRight", "aggregateLeading", "aggregateLeft", "aggregateRight"]) {
      params[key] = el();
    }
    new ColumnLayoutRenderer(params as any).updateColumnWidths();
    expect(hcell.style.width).toBe("200px");
  });
});
