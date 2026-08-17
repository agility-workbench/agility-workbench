// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { BodyViewportRenderer } from "../body/viewport";
import { ColumnLayoutRenderer } from "./columnLayout";

const element = () => document.createElement("div");

/** A stand-in body scroller whose scrollbar takes `gutter` px, the way a real one would. */
function scroller(gutter: number) {
  const el = element();
  Object.defineProperty(el, "offsetWidth", { configurable: true, value: 500 });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: 500 - gutter });
  return el;
}

function createColumnLayout(rightWidth = 0, bodyScroller?: HTMLElement) {
  const root = element();
  Object.defineProperty(root, "clientWidth", { configurable: true, value: 1000 });

  const rightHeader = element();
  const centerHeader = element();
  const hScrollContainer = element();
  const rightCell = element();
  const rightRow = element();
  const rightLeaves = rightWidth > 0
    ? [{ hidden: false, computedWidth: rightWidth }]
    : [];
  const core = {
    getColumnModel: () => ({ getRightLeaves: () => rightLeaves }),
  } as unknown as GridCore;

  const renderer = new ColumnLayoutRenderer({
    core,
    root,
    bodyFrame: element(),
    bodyScroller: bodyScroller ? () => bodyScroller : undefined,
    verticalScrollbarGutter: () => 15,
    rowPool: () => [{ rightCellEls: rightWidth > 0 ? [rightCell] : [], rightRowEl: rightRow } as any],
    leadingViewport: element(),
    leftViewport: element(),
    centerViewport: element(),
    rightViewport: element(),
    leadingSpacer: element(),
    leftSpacer: element(),
    rightSpacer: element(),
    leadingHeader: element(),
    leftHeader: element(),
    centerHeader,
    rightHeader,
    headerWrapper: element(),
    hScrollContainer,
    hScrollLeadingParent: element(),
    hScrollLeftParent: element(),
    hScrollParent: element(),
    hScrollRightParent: element(),
    hScrollerLeft: element(),
    hScroller: element(),
    hScrollerRight: element(),
    aggregateLeading: element(),
    aggregateLeadingCells: () => [],
    aggregateLeft: element(),
    aggregateLeftCells: () => [],
    aggregateCenterCells: () => [],
    aggregateRight: element(),
    aggregateRightCells: () => [],
  });
  renderer.applyRightColumnWidths();

  return { renderer, root, centerHeader, rightHeader, hScrollContainer };
}

describe("vertical scrollbar compensation", () => {
  it("moves the live gutter between the center and right-pinned headers", () => {
    const centerOnly = createColumnLayout();
    centerOnly.renderer.setVerticalScrollbarVisible(true);
    expect(centerOnly.centerHeader.style.paddingRight).toBe("15px");
    expect(centerOnly.rightHeader.style.paddingRight).toBe("0px");
    expect(centerOnly.hScrollContainer.style.paddingRight).toBe("15px");

    centerOnly.renderer.setVerticalScrollbarVisible(false);
    expect(centerOnly.centerHeader.style.paddingRight).toBe("0px");
    expect(centerOnly.hScrollContainer.style.paddingRight).toBe("0px");

    const withRightPinned = createColumnLayout(120);
    withRightPinned.renderer.setVerticalScrollbarVisible(true);
    expect(withRightPinned.centerHeader.style.paddingRight).toBe("0px");
    expect(withRightPinned.rightHeader.style.paddingRight).toBe("15px");
    expect(withRightPinned.rightHeader.style.width).toBe("136px");

    withRightPinned.renderer.setVerticalScrollbarVisible(false);
    expect(withRightPinned.rightHeader.style.paddingRight).toBe("0px");
    expect(withRightPinned.rightHeader.style.width).toBe("121px");
  });

  // The regression this pins: the compensation used to come from a probe element appended to
  // document.body, i.e. from a scrollbar that was not the grid's. That is fine until something
  // styles the two differently — a host stylesheet's `*::-webkit-scrollbar { width: 4px }` governs
  // the page, while the grid's armored `scrollbar-color` makes Chromium ignore it inside the grid.
  // The probe then reported 4px against a real 15px scrollbar and every right edge fell 11px short.
  // Reading the live scroller makes the two the same number by construction.
  it("takes the gutter from the live body scroller, not the fallback probe", () => {
    // Fallback says 15; the body's actual scrollbar is 11. The body must win.
    const withRightPinned = createColumnLayout(120, scroller(11));
    withRightPinned.renderer.setVerticalScrollbarVisible(true);

    expect(withRightPinned.rightHeader.style.paddingRight).toBe("11px");
    expect(withRightPinned.rightHeader.style.width).toBe("132px");
    expect(withRightPinned.hScrollContainer.style.paddingRight).toBe("11px");
  });

  it("publishes the same number to CSS that it applies as padding", () => {
    // The lanes sized in the stylesheet and the paddings sized in JS read one value, so they cannot
    // land on different pixels the way a CSS constant and a JS measurement did.
    const grid = createColumnLayout(120, scroller(11));
    grid.renderer.setVerticalScrollbarVisible(true);

    expect(grid.root.style.getPropertyValue("--pte-scrollbar-gutter")).toBe("11px");
    expect(grid.root.style.getPropertyValue("--pte-scrollbar-gutter-active")).toBe("11px");
    expect(grid.rightHeader.style.paddingRight).toBe("11px");

    // With no scrollbar the compensation goes to zero, but the raw gutter stays — the pinned-row
    // lane still needs a width to reserve when a band scrolls on its own.
    grid.renderer.setVerticalScrollbarVisible(false);
    expect(grid.root.style.getPropertyValue("--pte-scrollbar-gutter")).toBe("11px");
    expect(grid.root.style.getPropertyValue("--pte-scrollbar-gutter-active")).toBe("0px");
  });

  it("falls back to the probe while the body has no scrollbar to read", () => {
    // Bootstrap: a body reporting a 0 gutter tells us nothing about the platform, so the probe
    // (pinned to 15 here) is what the lane has to go on.
    const grid = createColumnLayout(120, scroller(0));
    grid.renderer.setVerticalScrollbarVisible(true);

    expect(grid.rightHeader.style.paddingRight).toBe("15px");
  });

  it("recomputes visibility when the rendered row content changes", () => {
    let rowCount = 2;
    const visibility: boolean[] = [];
    const root = element();
    const core = {
      getRowModel: () => ({ getViewCount: () => rowCount }),
    } as unknown as GridCore;
    const viewport = new BodyViewportRenderer({
      core,
      root,
      rowHeight: () => 40,
      onVerticalScrollbarVisibilityChanged: visible => visibility.push(visible),
    });
    Object.defineProperty(viewport.getRefs().body, "clientHeight", {
      configurable: true,
      value: 100,
    });

    viewport.recomputeView();
    rowCount = 3;
    viewport.recomputeView();

    expect(visibility).toEqual([false, true]);
  });
});
