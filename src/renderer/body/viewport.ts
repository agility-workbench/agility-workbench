import { GridCore } from "../../core/core";
import { BodyWrapperElements, createBodyWrapper } from "./wrapper";

interface BodyViewportRendererParams {
  core: GridCore;
  root: HTMLElement;
  rowHeight: () => number;
}

export class BodyViewportRenderer {
  private elements: BodyWrapperElements;

  constructor(private params: BodyViewportRendererParams) {
    this.elements = createBodyWrapper();
    this.params.root.appendChild(this.elements.body);
  }

  getRefs() {
    return this.elements;
  }

  recomputeView() {
    const verticalSize = this.params.core.getRowModel().getViewCount() * this.params.rowHeight();
    this.elements.leftSpacer.style.height = `${verticalSize}px`;
    this.elements.centerSpacer.style.height = `${verticalSize}px`;
    this.elements.rightSpacer.style.height = `${verticalSize}px`;
    this.elements.vScroller.style.height = `${verticalSize}px`;
    this.elements.vScrollParent.style.display = verticalSize > this.elements.body.clientHeight ? "block" : "none";
  }
}
