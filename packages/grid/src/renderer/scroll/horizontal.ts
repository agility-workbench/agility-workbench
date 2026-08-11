export interface HorizontalScrollElements {
  container: HTMLDivElement;
  leadingParent: HTMLDivElement;
  leftParent: HTMLDivElement;
  centerParent: HTMLDivElement;
  rightParent: HTMLDivElement;
  leftSpacer: HTMLDivElement;
  centerSpacer: HTMLDivElement;
  rightSpacer: HTMLDivElement;
  leftScroller: HTMLDivElement;
  centerScroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
}

export class HorizontalScrollRenderer {
  private elements: HorizontalScrollElements;

  constructor(root: HTMLElement) {
    this.elements = createHorizontalScroll();
    root.appendChild(this.elements.container);
  }

  getRefs() {
    return this.elements;
  }
}

export function createHorizontalScroll(): HorizontalScrollElements {
  const container = document.createElement("div");
  container.className = "pte-scroller-horizontal-container-wrapper";
  // Scrollbar machinery carries no semantics for AT.
  container.setAttribute("aria-hidden", "true");

  const leadingParent = document.createElement("div");
  leadingParent.className = "pte-scroller-horizontal-leading-container";
  container.appendChild(leadingParent);

  const leftParent = document.createElement("div");
  leftParent.className = "pte-scroller-horizontal-left-container";
  container.appendChild(leftParent);

  const centerParent = document.createElement("div");
  centerParent.className = "pte-scroller-horizontal-container";
  container.appendChild(centerParent);

  const rightParent = document.createElement("div");
  rightParent.className = "pte-scroller-horizontal-right-container";
  container.appendChild(rightParent);

  const leftSpacer = createHorizontalSpacer();
  leftParent.appendChild(leftSpacer);

  const centerSpacer = createHorizontalSpacer();
  centerParent.appendChild(centerSpacer);

  const rightSpacer = createHorizontalSpacer();
  rightParent.appendChild(rightSpacer);

  const leftScroller = createHorizontalScroller();
  leftSpacer.appendChild(leftScroller);

  const centerScroller = createHorizontalScroller();
  centerSpacer.appendChild(centerScroller);

  const rightScroller = createHorizontalScroller();
  rightSpacer.appendChild(rightScroller);

  return {
    container,
    leadingParent,
    leftParent,
    centerParent,
    rightParent,
    leftSpacer,
    centerSpacer,
    rightSpacer,
    leftScroller,
    centerScroller,
    rightScroller,
  };
}

function createHorizontalSpacer() {
  const spacer = document.createElement("div");
  spacer.style.height = "15px";
  spacer.className = "pte-scroller-horizontal-spacer";
  return spacer;
}

function createHorizontalScroller() {
  const scroller = document.createElement("div");
  scroller.className = "pte-scroller-horizontal";
  return scroller;
}
