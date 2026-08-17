// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { BodyViewportRenderer } from "../body/viewport";
import { ColumnLayoutRenderer } from "./columnLayout";

const element = () => document.createElement("div");

function createColumnLayout(rightWidth = 0) {
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

  return { renderer, centerHeader, rightHeader, hScrollContainer };
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
