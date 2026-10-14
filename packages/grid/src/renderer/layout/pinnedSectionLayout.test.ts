// @vitest-environment happy-dom
/**
 * Pinned sections clamp to 35% of the grid through ONE mechanism: the `max-width` that
 * PinnedSectionLayoutRenderer reapplies on every root resize. For the header, aggregate row and
 * horizontal-scrollbar lane to clamp with the body, none of them may carry an inline `min-width`
 * (which outranks `max-width`), and all of them must receive the same cap. The regression this
 * pins: the headers kept `min-width` = full content width, so narrowing the grid clamped the body
 * but not the header, and the centre header drifted right of the centre body. Actual layout cannot
 * be measured under happy-dom; the browser probe covers that.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../../createGrid";
import { ColumnType } from "../../interfaces/column";
import { AggregateType } from "../../interfaces/aggregate";
import { PinnedSectionLayoutRenderer } from "./pinnedSectionLayout";

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
  host.style.height = "400px";
  host.style.width = "600px";
  document.body.appendChild(host);
});

const columnDefs = [
  { colId: "l", key: "l", label: "L", type: ColumnType.NUMBER, pinned: "left" as const, width: 200 },
  { colId: "c", key: "c", label: "C", type: ColumnType.NUMBER, width: 300 },
  { colId: "r", key: "r", label: "R", type: ColumnType.NUMBER, pinned: "right" as const, width: 150 },
];

const PINNED_BOXES = [
  ".pte-header-left",
  ".pte-header-right",
  ".pte-aggregate-left",
  ".pte-aggregate-right",
  ".pte-scroller-horizontal-left-container",
  ".pte-scroller-horizontal-right-container",
];

function box(selector: string): HTMLElement {
  const el = host.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function expectWidthOnly() {
  for (const selector of PINNED_BOXES) {
    expect(box(selector).style.width, selector).not.toBe("");
    expect(box(selector).style.minWidth, selector).toBe("");
  }
  // The centre lane is a flex lane now, not a `calc(100% - <widths at layout time>)`.
  expect(box(".pte-scroller-horizontal-container").style.width).toBe("");
}

describe("pinned section clamp", () => {
  it("sizes the pinned header, aggregate and lane boxes with width only, never min-width", () => {
    const api = createGrid(host, {
      rowIdKey: "id",
      columnDefs,
      rowData: [{ id: 1, l: 1, c: 2, r: 3 }],
      rowNumbers: true,
    });
    api.setAggregates([{ colId: "l", type: AggregateType.SUM }, { colId: "r", type: AggregateType.SUM }]);

    expectWidthOnly();
    // Content width plus the section's 1px border, matching the body spacer.
    expect(box(".pte-header-left").style.width).toBe("201px");
    expect(box(".pte-aggregate-left").style.width).toBe("201px");
    expect(box(".pte-scroller-horizontal-left-container").style.width).toBe("201px");
    expect(box(".pte-aggregate-right").style.width).toBe("151px");
    expect(box(".pte-scroller-horizontal-right-container").style.width).toBe("151px");

    // A column resize reruns the width pass; it must not bring min-width back.
    api.applyColumnState([{ colId: "l", widthPx: 260 }, { colId: "r", widthPx: 90 }]);
    expectWidthOnly();
    expect(box(".pte-header-left").style.width).toBe("261px");
    expect(box(".pte-scroller-horizontal-right-container").style.width).toBe("91px");

    // The leading section is never clamped and keeps its floor.
    expect(box(".pte-header-leading").style.minWidth).toBe(box(".pte-header-leading").style.width);
    api.destroy();
  });

  it("applies one cap to header, body, aggregate and lane; the right header adds the scrollbar lane", () => {
    const div = () => document.createElement("div");
    const root = div();
    let width = 1000;
    Object.defineProperty(root, "clientWidth", { configurable: true, get: () => width });
    let observerCallback: (() => void) | undefined;
    const OriginalObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) { observerCallback = cb; }
      observe() {}
      disconnect() {}
    } as any;
    try {
      const p = {
        root,
        leftHeader: div(), rightHeader: div(),
        hScrollLeftParent: div(), hScrollRightParent: div(),
        leftSpacer: div(), rightSpacer: div(),
        aggregateLeft: div(), aggregateRight: div(),
      };
      let resized = 0;
      const layout = new PinnedSectionLayoutRenderer({ ...p, onResize: () => resized++ });
      layout.bind();

      const check = (cap: string) => {
        for (const el of [p.leftHeader, p.leftSpacer, p.aggregateLeft, p.hScrollLeftParent,
          p.rightSpacer, p.aggregateRight, p.hScrollRightParent]) {
          expect(el.style.maxWidth).toBe(cap);
        }
        // The right header also holds the vertical-scrollbar lane as padding, so its cap is the
        // section cap plus that lane — the live value ColumnLayoutRenderer publishes to CSS.
        expect(p.rightHeader.style.maxWidth).toBe(`calc(${cap} + var(--pte-scrollbar-gutter-active, 0px))`);
      };
      check("350px");
      expect(resized).toBe(1);

      width = 600;
      observerCallback?.();
      check("210px");
      expect(resized).toBe(2);
      layout.destroy();
    } finally {
      globalThis.ResizeObserver = OriginalObserver;
    }
  });
});
