export interface BodyWrapperElements {
  body: HTMLDivElement;
  leftScroller: HTMLDivElement;
  centerScroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
  vScrollParent: HTMLDivElement;
  vScroll: HTMLDivElement;
  vScroller: HTMLDivElement;
  leftSpacer: HTMLDivElement;
  centerSpacer: HTMLDivElement;
  rightSpacer: HTMLDivElement;
  leftViewport: HTMLDivElement;
  centerViewport: HTMLDivElement;
  rightViewport: HTMLDivElement;
}

export function createBodyWrapper(): BodyWrapperElements {
  const body = document.createElement("div");
  body.className = "pte-body";

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

  const leftSpacer = document.createElement("div");
  leftSpacer.className = "pte-spacer-left";
  leftScroller.appendChild(leftSpacer);

  const centerSpacer = document.createElement("div");
  centerSpacer.className = "pte-spacer";
  centerScroller.appendChild(centerSpacer);

  const rightSpacer = document.createElement("div");
  rightSpacer.className = "pte-spacer-right";
  rightScroller.appendChild(rightSpacer);

  const leftViewport = document.createElement("div");
  leftViewport.className = "pte-viewport-left";
  leftSpacer.appendChild(leftViewport);

  const centerViewport = document.createElement("div");
  centerViewport.className = "pte-viewport";
  centerSpacer.appendChild(centerViewport);

  const rightViewport = document.createElement("div");
  rightViewport.className = "pte-viewport-right";
  rightSpacer.appendChild(rightViewport);

  return {
    body,
    leftScroller,
    centerScroller,
    rightScroller,
    vScrollParent,
    vScroll,
    vScroller,
    leftSpacer,
    centerSpacer,
    rightSpacer,
    leftViewport,
    centerViewport,
    rightViewport,
  };
}
