export interface BodyWrapperElements {
  body: HTMLDivElement;
  leadingScroller: HTMLDivElement;
  leftScroller: HTMLDivElement;
  centerScroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
  vScrollParent: HTMLDivElement;
  vScroll: HTMLDivElement;
  vScroller: HTMLDivElement;
  leadingSpacer: HTMLDivElement;
  leftSpacer: HTMLDivElement;
  centerSpacer: HTMLDivElement;
  rightSpacer: HTMLDivElement;
  leadingViewport: HTMLDivElement;
  leftViewport: HTMLDivElement;
  centerViewport: HTMLDivElement;
  rightViewport: HTMLDivElement;
}

import { markPresentational } from "../aria";

export function createBodyWrapper(): BodyWrapperElements {
  const body = document.createElement("div");
  body.className = "pte-body";

  const leadingScroller = document.createElement("div");
  leadingScroller.className = "pte-scroller-leading";
  body.appendChild(leadingScroller);

  const leftScroller = document.createElement("div");
  leftScroller.className = "pte-scroller-left";
  body.appendChild(leftScroller);

  const centerScroller = document.createElement("div");
  centerScroller.className = "pte-scroller";
  body.appendChild(centerScroller);

  const rightScroller = document.createElement("div");
  rightScroller.className = "pte-scroller-right";
  body.appendChild(rightScroller);

  const vScrollParent = document.createElement("div");
  vScrollParent.className = "pte-scroller-vertical-container";
  body.appendChild(vScrollParent);

  const vScroll = document.createElement("div");
  vScroll.className = "pte-scroller-vertical-spacer";
  vScrollParent.appendChild(vScroll);

  const vScroller = document.createElement("div");
  vScroller.className = "pte-scroller-vertical";
  vScroll.appendChild(vScroller);

  const leadingSpacer = document.createElement("div");
  leadingSpacer.className = "pte-spacer-leading";
  leadingScroller.appendChild(leadingSpacer);

  const leftSpacer = document.createElement("div");
  leftSpacer.className = "pte-spacer-left";
  leftScroller.appendChild(leftSpacer);

  const centerSpacer = document.createElement("div");
  centerSpacer.className = "pte-spacer";
  centerScroller.appendChild(centerSpacer);

  const rightSpacer = document.createElement("div");
  rightSpacer.className = "pte-spacer-right";
  rightScroller.appendChild(rightSpacer);

  const leadingViewport = document.createElement("div");
  leadingViewport.className = "pte-viewport-leading";
  leadingSpacer.appendChild(leadingViewport);

  const leftViewport = document.createElement("div");
  leftViewport.className = "pte-viewport-left";
  leftSpacer.appendChild(leftViewport);

  const centerViewport = document.createElement("div");
  centerViewport.className = "pte-viewport";
  centerSpacer.appendChild(centerViewport);

  const rightViewport = document.createElement("div");
  rightViewport.className = "pte-viewport-right";
  rightSpacer.appendChild(rightViewport);

  // ARIA (plan 2.1, owns-ordered topology): the center viewport is the grid's only rowgroup —
  // pinned/leading fragments are presentational and their cells are aria-owns-stitched into the
  // center rows. Scroll machinery carries no semantics.
  centerViewport.setAttribute("role", "rowgroup");
  markPresentational(
    body,
    leadingScroller, leftScroller, centerScroller, rightScroller,
    leadingSpacer, leftSpacer, centerSpacer, rightSpacer,
    leadingViewport, leftViewport, rightViewport,
  );
  vScrollParent.setAttribute("aria-hidden", "true");

  return {
    body,
    leadingScroller,
    leftScroller,
    centerScroller,
    rightScroller,
    vScrollParent,
    vScroll,
    vScroller,
    leadingSpacer,
    leftSpacer,
    centerSpacer,
    rightSpacer,
    leadingViewport,
    leftViewport,
    centerViewport,
    rightViewport,
  };
}
