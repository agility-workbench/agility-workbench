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
}

export class PinnedSectionLayoutRenderer {
  private resizeObserver: ResizeObserver | null = null;

  constructor(private params: PinnedSectionLayoutRendererParams) { }

  bind() {
    this.applyMaxWidths();
    this.resizeObserver = new ResizeObserver(() => {
      this.applyMaxWidths();
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
