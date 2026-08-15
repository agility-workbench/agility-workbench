export interface BodyWrapperElements {
  /** Non-scrolling positioning context for the body. The sticky group-row overlay hangs off this so
   * it stays put while the body scrolls underneath it. */
  bodyFrame: HTMLDivElement;
  /** The grid's only vertical scroll container. Every section rides inside it, so the four sections
   * scroll together on the compositor with no JavaScript in the loop. */
  body: HTMLDivElement;
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
  const bodyFrame = document.createElement("div");
  bodyFrame.className = "pte-body-frame";

  const body = document.createElement("div");
  body.className = "pte-body";
  bodyFrame.appendChild(body);

  // Each spacer is one horizontal section: it stands at the full row-content height (so all four
  // rise and fall together inside the one vertical scroller) and owns its own horizontal scroll.
  const leadingSpacer = document.createElement("div");
  leadingSpacer.className = "pte-spacer-leading";
  body.appendChild(leadingSpacer);

  const leftSpacer = document.createElement("div");
  leftSpacer.className = "pte-spacer-left";
  body.appendChild(leftSpacer);

  const centerSpacer = document.createElement("div");
  centerSpacer.className = "pte-spacer";
  body.appendChild(centerSpacer);

  const rightSpacer = document.createElement("div");
  rightSpacer.className = "pte-spacer-right";
  body.appendChild(rightSpacer);

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

  // ARIA (owns-ordered topology): the center viewport is the grid's only rowgroup —
  // pinned/leading fragments are presentational and their cells are aria-owns-stitched into the
  // center rows. Scroll machinery carries no semantics.
  centerViewport.setAttribute("role", "rowgroup");
  markPresentational(
    bodyFrame, body,
    leadingSpacer, leftSpacer, centerSpacer, rightSpacer,
    leadingViewport, leftViewport, rightViewport,
  );

  return {
    bodyFrame,
    body,
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
