interface PinnedSectionLayoutRendererParams {
  root: HTMLDivElement;
  /** The body scroller (or its frame). Observed next to the root, because chrome inside a fixed
   * root — toolbar, sheet tabs, pagination, the scrollbar strip itself — resizes the body without
   * resizing the root, and the body's height drives the row pool and the vertical scrollbar. */
  body?: HTMLElement;
  leftHeader: HTMLDivElement;
  rightHeader: HTMLDivElement;
  hScrollLeftParent: HTMLDivElement;
  hScrollRightParent: HTMLDivElement;
  leftSpacer: HTMLDivElement;
  rightSpacer: HTMLDivElement;
  aggregateLeft: HTMLDivElement;
  aggregateRight: HTMLDivElement;
  /** The rest of the grid's resize path, run after the clamp: the scrollbar strip and body-frame
   * budget, the vertical extent, the row pool, full-width rows, the pinned-row bands (which clamp
   * their sections themselves — their widths depend on band content, not just the root) and
   * anything floating over a cell. Must be idempotent: it runs from a ResizeObserver, and a pass
   * that changes the body's size (the strip toggling) is observed again. */
  onResize?: () => void;
}

/** Share of the root's content width a pinned side may take before it scrolls on its own. */
export const PINNED_SECTION_CAP_RATIO = 0.35;

/**
 * The root's content-box width: `clientWidth` minus its horizontal padding. `.pte-root` carries
 * `padding-right` for the column panel's rail (36px) or the open panel (304px), and that space is
 * not the grid's — the clamp and the scrollbar strip are both decided against what is left.
 */
export function rootContentWidth(root: HTMLElement): number {
  const width = root.clientWidth;
  if (width <= 0) return 0;
  let padding = 0;
  if (typeof getComputedStyle === "function") {
    const style = getComputedStyle(root);
    padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  }
  return Math.max(0, width - padding);
}

export class PinnedSectionLayoutRenderer {
  private resizeObserver: ResizeObserver | null = null;
  private appliedCap: string | null = null;

  constructor(private params: PinnedSectionLayoutRendererParams) { }

  bind() {
    this.applyMaxWidths();
    this.params.onResize?.();
    // ONE observer for both boxes: when a root resize also resizes the body, both entries arrive in
    // the same delivery and the resize path runs once, not twice.
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.params.root);
    if (this.params.body) this.resizeObserver.observe(this.params.body);
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private onResize() {
    this.applyMaxWidths();
    this.params.onResize?.();
  }

  /**
   * The ONE place the 35% clamp on pinned sections lives, rerun on every root or body resize. Every
   * box of a pinned side — header, body spacer, aggregate section, horizontal-scrollbar lane — gets
   * the same `max-width` over its own inline `width` and carries no `min-width` (which would
   * outrank it), so they clamp together and the centre regions, all `flex: 1 1 auto; min-width: 0`,
   * start at the same x. The right header is the one box wider than its section: it also holds the
   * vertical-scrollbar lane as `padding-right`, so its cap carries that same lane on top, read from
   * the custom property ColumnLayoutRenderer publishes rather than measured again here.
   *
   * The cap is a share of the root's CONTENT width (see rootContentWidth): with the column panel
   * open, the root's padding is the panel's, not the grid's. Writes only when the cap changed.
   */
  private applyMaxWidths() {
    const cap = rootContentWidth(this.params.root) * PINNED_SECTION_CAP_RATIO;
    const maxWidth = `${cap}px`;
    // Compared against what was last written, not the serialized inline value: a browser rounds
    // a fractional length when it serializes it, so that comparison would never match.
    if (maxWidth === this.appliedCap) return;
    this.appliedCap = maxWidth;
    const p = this.params;
    for (const el of [p.leftHeader, p.hScrollLeftParent, p.leftSpacer, p.aggregateLeft,
      p.hScrollRightParent, p.rightSpacer, p.aggregateRight]) {
      el.style.maxWidth = maxWidth;
    }
    p.rightHeader.style.maxWidth = `calc(${maxWidth} + var(--pte-scrollbar-gutter-active, 0px))`;
  }
}
