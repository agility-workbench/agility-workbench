// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../../createGrid";
import { IGridAPI } from "../../interfaces/iGridAPI";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

const columnDefs = [
  { colId: "a", key: "a", label: "A" },
  { colId: "b", key: "b", label: "B" },
  { colId: "c", key: "c", label: "C" },
  { colId: "d", key: "d", label: "D" },
];

// "signal" appears only in the first row's last cell: the one the widget covers.
const rowData = [
  { id: 1, a: "one", b: "two", c: "three", d: "signal" },
  { id: 2, a: "four", b: "five", c: "six", d: "seven" },
  { id: 3, a: "eight", b: "nine", c: "ten", d: "eleven" },
];

const BODY_TOP = 40;
const VIEW_HEIGHT = 400;
/** The widget's own box: 200px wide, inset 8px from the right edge, in the strip below the header. */
const WIDGET_WIDTH = 200;
const OFFSET_X = 8;
const WIDGET_TOP = 46;
const WIDGET_BOTTOM = 82;

function rect(box: { left: number; top: number; right: number; bottom: number }): DOMRect {
  return {
    ...box,
    width: box.right - box.left,
    height: box.bottom - box.top,
    x: box.left,
    y: box.top,
  } as DOMRect;
}

function define(el: Element, props: Record<string, number>): void {
  for (const [name, value] of Object.entries(props)) {
    Object.defineProperty(el, name, { configurable: true, value });
  }
}

/**
 * happy-dom has no layout, so hand out exactly the boxes the reveal reads: the body and the centre
 * spacer it scrolls, the widget that occludes, and the floating host a dodge measures itself
 * against. Widths come from the column model rather than being asserted, since the columns are
 * auto-sized from their content — the test is about the reveal, not about sizing.
 *
 * `sideways` gives the centre section somewhere to scroll to; without it both scrollers are pinned,
 * which is the state the top-right corner of a grid is really in.
 */
function mount(
  { sideways = false, quickFilter = {} }: { sideways?: boolean; quickFilter?: Record<string, unknown> } = {},
): IGridAPI {
  const api = createGrid(host, {
    rowIdKey: "id",
    columnDefs,
    rowData,
    quickFilter: { mode: "always", debounceMs: 0, behavior: "find", ...quickFilter },
  } as any);

  const centerWidth = api.getCore().getColumnModel().getCenterLeaves()
    .reduce((total, col) => total + col.computedWidth, 0);

  const body = host.querySelector<HTMLElement>(".pte-body")!;
  const center = host.querySelector<HTMLElement>(".pte-spacer")!;
  const floatingHost = host.querySelector<HTMLElement>(".pte-quick-filter-floating-host")!;

  const sectionBox = { left: 0, top: BODY_TOP, right: centerWidth, bottom: BODY_TOP + VIEW_HEIGHT };
  body.getBoundingClientRect = () => rect(sectionBox);
  center.getBoundingClientRect = () => rect(sectionBox);
  widgetEl().getBoundingClientRect = () => rect({
    left: centerWidth - OFFSET_X - WIDGET_WIDTH,
    top: WIDGET_TOP,
    right: centerWidth - OFFSET_X,
    bottom: WIDGET_BOTTOM,
  });

  define(body, { clientHeight: VIEW_HEIGHT, clientWidth: centerWidth, scrollHeight: VIEW_HEIGHT });
  define(center, {
    clientWidth: centerWidth,
    clientHeight: VIEW_HEIGHT,
    scrollWidth: sideways ? centerWidth * 2 : centerWidth,
  });
  define(widgetEl(), { offsetWidth: WIDGET_WIDTH });
  define(floatingHost, { clientWidth: centerWidth });
  return api;
}

function widgetEl(): HTMLElement {
  return host.querySelector<HTMLElement>(".pte-quick-filter")!;
}

function centerEl(): HTMLElement {
  return host.querySelector<HTMLElement>(".pte-spacer")!;
}

function input(): HTMLInputElement {
  return host.querySelector<HTMLInputElement>(".pte-quick-filter-input")!;
}

/** Search for the covered cell and step onto it, which is what triggers a reveal. */
function findSignal(): void {
  input().value = "signal";
  input().dispatchEvent(new Event("input", { bubbles: true }));
  input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function pointer(type: "pointerenter" | "pointerleave"): void {
  widgetEl().dispatchEvent(new Event(type));
}

describe("revealing a find match from under the quick-filter widget", () => {
  it("flips to the far edge for the first row's last cell, which no scroll can clear", () => {
    const api = mount();
    expect(widgetEl().style.left).toBe("auto");

    findSignal();

    expect(widgetEl().style.left).toBe(`${OFFSET_X}px`);
    expect(widgetEl().style.right).toBe("auto");
    api.destroy();
  });

  it("scrolls the match clear instead, when the centre section has room", () => {
    const api = mount({ sideways: true });

    findSignal();

    // Parking the cell's trailing edge against the widget's leading edge is exactly the width the
    // widget occupies, inset included.
    expect(centerEl().scrollLeft).toBe(WIDGET_WIDTH + OFFSET_X);
    // And the widget stayed where the config put it.
    expect(widgetEl().style.left).toBe("auto");
    api.destroy();
  });

  it("leaves the configured anchor alone — the dodge is not a preference change", () => {
    const api = mount({ quickFilter: { showLayoutOptions: true } });

    findSignal();

    expect(widgetEl().style.left).toBe(`${OFFSET_X}px`);
    expect(host.querySelector<HTMLSelectElement>(".pte-quick-filter-anchor-select")!.value).toBe("right");
    api.destroy();
  });

  it("holds the flip while the pointer is on the widget, then takes it on the way out", () => {
    const api = mount();

    pointer("pointerenter");
    findSignal();
    // Clicking next/previous repeatedly must not move the button out from under the cursor.
    expect(widgetEl().style.left).toBe("auto");

    pointer("pointerleave");
    expect(widgetEl().style.left).toBe(`${OFFSET_X}px`);
    api.destroy();
  });

  it("does not move a widget hosted in the toolbar, which occludes nothing", () => {
    const api = mount({ quickFilter: { showLayoutOptions: true } });
    api.updateGridOptions({ toolbar: { quickFilter: true } } as any);
    // The rebuilt widget lives in the toolbar now; re-stub the geometry onto it.
    define(widgetEl(), { offsetWidth: WIDGET_WIDTH });

    findSignal();

    expect(widgetEl().style.left).toBe("");
    expect(widgetEl().classList.contains("pte-quick-filter-toolbar")).toBe(true);
    api.destroy();
  });

  it("comes home when the search is dismissed", () => {
    const api = mount({ quickFilter: { mode: "onDemand" } });
    host.querySelector<HTMLElement>(".pte-root")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
    );
    findSignal();
    expect(widgetEl().style.left).toBe(`${OFFSET_X}px`);

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    // Left released, so it is anchored right again. (The right inset itself is a calc() with a
    // custom property, which this environment's CSS parser drops.)
    expect(widgetEl().style.left).toBe("auto");
    api.destroy();
  });
});
