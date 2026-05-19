import { GridCore } from "../../core/core";

interface BodyViewportRendererParams {
  core: GridCore;
  rowHeight: () => number;
  body: HTMLDivElement;
  leftSpacer: HTMLDivElement;
  centerSpacer: HTMLDivElement;
  rightSpacer: HTMLDivElement;
  vScrollParent: HTMLDivElement;
  vScroller: HTMLDivElement;
}

export class BodyViewportRenderer {
  constructor(private params: BodyViewportRendererParams) {}

  recomputeView() {
    const verticalSize = this.params.core.getRowModel().getViewCount() * this.params.rowHeight();
    this.params.leftSpacer.style.height = `${verticalSize}px`;
    this.params.centerSpacer.style.height = `${verticalSize}px`;
    this.params.rightSpacer.style.height = `${verticalSize}px`;
    this.params.vScroller.style.height = `${verticalSize}px`;
    this.params.vScrollParent.style.display = verticalSize > this.params.body.clientHeight ? "block" : "none";
  }
}
