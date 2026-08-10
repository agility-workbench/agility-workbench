import { GridCore } from "../../core/core";
import { BodyWrapperElements, createBodyWrapper } from "./wrapper";

interface BodyViewportRendererParams {
  core: GridCore;
  root: HTMLElement;
  rowHeight: () => number;
  onVerticalScrollbarVisibilityChanged?: (visible: boolean) => void;
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
    this.elements.leadingSpacer.style.height = `${verticalSize}px`;
    this.elements.leftSpacer.style.height = `${verticalSize}px`;
    this.elements.centerSpacer.style.height = `${verticalSize}px`;
    this.elements.rightSpacer.style.height = `${verticalSize}px`;
    this.elements.vScroller.style.height = `${verticalSize}px`;
    const hasVerticalScrollbar = verticalSize > this.elements.body.clientHeight;
    this.elements.vScrollParent.style.display = hasVerticalScrollbar ? "block" : "none";
    this.params.onVerticalScrollbarVisibilityChanged?.(hasVerticalScrollbar);
  }

  resetScrollPosition() {
    this.elements.leadingScroller.scrollTop = 0;
    this.elements.leftScroller.scrollTop = 0;
    this.elements.centerScroller.scrollTop = 0;
    this.elements.rightScroller.scrollTop = 0;
    this.elements.vScroll.scrollTop = 0;
  }
}
