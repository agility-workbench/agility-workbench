interface PinnedSectionLayoutRendererParams {
  root: HTMLDivElement;
  leftHeader: HTMLDivElement;
  rightHeader: HTMLDivElement;
  hScrollLeftParent: HTMLDivElement;
  hScrollRightParent: HTMLDivElement;
  leftSpacer: HTMLDivElement;
  rightSpacer: HTMLDivElement;
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

  /**
   * The ONE place the 35% clamp on pinned sections lives, rerun on every root resize. Every box of a
   * pinned side — header, body spacer, aggregate section, horizontal-scrollbar lane — gets the same
   * `max-width` over its own inline `width` and carries no `min-width` (which would outrank it), so
   * they clamp together and the centre regions, all `flex: 1 1 auto; min-width: 0`, start at the same
   * x. The right header is the one box wider than its section: it also holds the vertical-scrollbar
   * lane as `padding-right`, so its cap carries that same lane on top, read from the custom property
   * ColumnLayoutRenderer publishes rather than measured again here.
   */
  private applyMaxWidths() {
    const cap = this.params.root.clientWidth * 0.35;
    const maxWidth = `${cap}px`;
    this.params.leftHeader.style.maxWidth = maxWidth;
    this.params.hScrollLeftParent.style.maxWidth = maxWidth;
    this.params.leftSpacer.style.maxWidth = maxWidth;
    this.params.aggregateLeft.style.maxWidth = maxWidth;
    this.params.rightHeader.style.maxWidth = `calc(${maxWidth} + var(--pte-scrollbar-gutter-active, 0px))`;
    this.params.hScrollRightParent.style.maxWidth = maxWidth;
    this.params.rightSpacer.style.maxWidth = maxWidth;
    this.params.aggregateRight.style.maxWidth = maxWidth;
  }
}
