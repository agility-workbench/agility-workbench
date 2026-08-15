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
    this.params.root.appendChild(this.elements.bodyFrame);
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
    // The body owns the scrollbar now, so its presence follows directly from whether the sections
    // outgrow it. The gutter it consumes is measured rather than assumed — see columnLayout.
    const hasVerticalScrollbar = verticalSize > this.elements.body.clientHeight;
    this.params.onVerticalScrollbarVisibilityChanged?.(hasVerticalScrollbar);
  }

  resetScrollPosition() {
    this.elements.body.scrollTop = 0;
  }
}
