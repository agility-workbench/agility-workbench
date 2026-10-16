import {
  autoHeaderLevelHeights,
  HeaderContentRequirement,
  HeaderGeometry,
} from "../../core/headerGeometry";

/**
 * `ColDef.autoHeaderHeight`: measuring header content and turning it into level heights.
 *
 * The header renderer registers every cell it builds (so a height change can be re-applied without
 * rebuilding the DOM) and asks for one measurement pass per render, after the cells exist and carry
 * their widths. The pass only reads — every auto cell's content height and its container's padding —
 * and the renderer then writes the resulting geometry in one go, so a render costs one forced
 * layout however many auto columns there are. The heights go back through `headerGeometry` as
 * per-level minimums: nothing here writes a height.
 *
 * Re-measurement triggers that do not rebuild the header (a final column resize, autosize, fit, a
 * theme swap) call {@link HeaderAutoHeight.measure} through the renderer; two browser signals cover
 * what the grid cannot see coming — a ResizeObserver on the measured content (a label re-wrapping
 * for any reason: font metrics, zoom, a width the grid did not write) and the document's font
 * loading (a web font arriving after the first render changes every wrapped line).
 */

/** One header cell as built: what a geometry change has to rewrite, and whether it is measured. */
export interface HeaderCellLayout {
  /** The `.pte-hcell`: its height is every level from its own down to the leaf level. */
  header: HTMLElement;
  /** Its `.pte-hcell-container`: the cell's own label/menu row. */
  container: HTMLElement;
  /** Tree depth (1 for a leaf), as `HeaderGeometry.cellHeights` takes it. */
  depth: number;
  /** How many levels the cell spans, as `HeaderGeometry.cellHeights` takes it. */
  levelsBelow: number;
  /** `autoHeaderHeight`: the cell's content is measured and its level grows to fit. */
  auto: boolean;
}

function px(value: string | null | undefined): number {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/** An element's natural height: its scroll height, or its box when that reads larger (fractions). */
function naturalHeight(el: HTMLElement): number {
  return Math.max(el.scrollHeight || 0, el.getBoundingClientRect().height || 0);
}

/**
 * The height a header container needs for its content: the tallest piece of content plus the
 * container's vertical padding and borders.
 *
 * The pieces are measured, not the container or `.pte-hcell-content`: both are stretched to the
 * cell's current height (the content row is `height: 100%`, the menu is a stretched flex item), so
 * their own heights could only ever grow. Their children — the label, the sort icon, the expander,
 * the menu buttons, a custom component's elements — are centred, not stretched, and report what
 * they need.
 */
export function measureHeaderContentHeight(container: HTMLElement): number {
  let content = 0;
  for (const child of Array.from(container.children) as HTMLElement[]) {
    const pieces = Array.from(child.children) as HTMLElement[];
    if (pieces.length === 0) {
      content = Math.max(content, naturalHeight(child));
      continue;
    }
    for (const piece of pieces) content = Math.max(content, naturalHeight(piece));
  }
  const style = getComputedStyle(container);
  const chrome = px(style.paddingTop) + px(style.paddingBottom)
    + px(style.borderTopWidth) + px(style.borderBottomWidth);
  return content + chrome;
}

/** The elements whose size changes mean the measured heights may be stale. */
function observedPieces(container: HTMLElement): HTMLElement[] {
  const pieces: HTMLElement[] = [];
  for (const child of Array.from(container.children) as HTMLElement[]) {
    const inner = Array.from(child.children) as HTMLElement[];
    if (inner.length === 0) pieces.push(child);
    else pieces.push(...inner);
  }
  return pieces;
}

function sameLevels(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export class HeaderAutoHeight {
  private cells: HeaderCellLayout[] = [];
  /** The measured level heights (top first), or null for "the configured heights". */
  private levels: number[] | null = null;
  private observer: ResizeObserver | null = null;
  private readonly fonts: { addEventListener?: Document["addEventListener"]; removeEventListener?: Document["removeEventListener"] } | null;
  private readonly onFontsLoaded = () => this.onStale();

  /** `onStale`: the measured content may have changed size; the owner re-measures. */
  constructor(private readonly onStale: () => void) {
    const fonts = typeof document !== "undefined"
      ? (document as Document & { fonts?: FontFaceSet }).fonts ?? null
      : null;
    this.fonts = fonts as typeof this.fonts;
    this.fonts?.addEventListener?.("loadingdone", this.onFontsLoaded);
  }

  /** Forget the cells of the previous render (the header DOM is about to be replaced). */
  reset(): void {
    this.cells = [];
    this.observer?.disconnect();
  }

  track(cell: HeaderCellLayout): void {
    this.cells.push(cell);
  }

  /** Every cell of the current render, auto or not (a geometry change rewrites all of them). */
  getCells(): readonly HeaderCellLayout[] {
    return this.cells;
  }

  hasAutoCells(): boolean {
    return this.cells.some(cell => cell.auto);
  }

  /** The measured heights for a header `levelCount` deep; null when there are none (or stale). */
  getLevels(levelCount: number): number[] | null {
    return this.levels && this.levels.length === levelCount ? this.levels : null;
  }

  /**
   * Measure every auto cell against `base` (the configured geometry) and keep the result. Reads
   * only. Returns whether the measured heights changed, i.e. whether the owner must re-apply the
   * geometry.
   */
  measure(base: HeaderGeometry): boolean {
    const requirements: HeaderContentRequirement[] = [];
    for (const cell of this.cells) {
      if (!cell.auto || !cell.container.isConnected) continue;
      const { top, bottom } = base.containerLevels(cell.depth, cell.levelsBelow);
      // The header wrapper's 1px bottom border is drawn over the leaf level's last pixel row (the
      // declared header height includes it), so content reaching the leaf level needs one more.
      const border = bottom === base.levelCount - 1 ? 1 : 0;
      requirements.push({ top, bottom, height: measureHeaderContentHeight(cell.container) + border });
    }
    const next = autoHeaderLevelHeights(base, requirements);
    const changed = !sameLevels(next, this.levels);
    this.levels = next;
    return changed;
  }

  /** Watch the auto cells' content for size changes the grid did not cause. */
  observe(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.observer?.disconnect();
    const auto = this.cells.filter(cell => cell.auto);
    if (auto.length === 0) return;
    this.observer ??= new ResizeObserver(() => this.onStale());
    for (const cell of auto) {
      for (const piece of observedPieces(cell.container)) this.observer.observe(piece);
    }
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.fonts?.removeEventListener?.("loadingdone", this.onFontsLoaded);
    this.cells = [];
  }
}
