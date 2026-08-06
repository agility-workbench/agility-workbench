interface PinnedSectionLayoutRendererParams {
  root: HTMLDivElement;
  leftHeader: HTMLDivElement;
  rightHeader: HTMLDivElement;
  hScrollLeftParent: HTMLDivElement;
  hScrollRightParent: HTMLDivElement;
  leftScroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
  aggregateLeft: HTMLDivElement;
  aggregateRight: HTMLDivElement;
  /** The pinned-row bands and sticky overlay clamp their sections themselves (their widths depend
   * on band content, not just the root), so a root resize hands off to them after the body clamp. */
  onResize?: () => void;
}

export class PinnedSectionLayoutRenderer {
  private resizeObserver: ResizeObserver | null = null;

  constructor(private params: PinnedSectionLayoutRendererParams) { }

  bind() {
    this.applyMaxWidths();
    this.params.onResize?.();
    this.resizeObserver = new ResizeObserver(() => {
      this.applyMaxWidths();
      this.params.onResize?.();
    });
    this.resizeObserver.observe(this.params.root);
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private applyMaxWidths() {
    const maxWidth = `${this.params.root.clientWidth * 0.35}px`;
    this.params.leftHeader.style.maxWidth = maxWidth;
    this.params.hScrollLeftParent.style.maxWidth = maxWidth;
    this.params.leftScroller.style.maxWidth = maxWidth;
    this.params.aggregateLeft.style.maxWidth = maxWidth;
    this.params.rightHeader.style.maxWidth = maxWidth;
    this.params.hScrollRightParent.style.maxWidth = maxWidth;
    this.params.rightScroller.style.maxWidth = maxWidth;
    this.params.aggregateRight.style.maxWidth = maxWidth;
  }
}
