/**
 * ARIA helpers for the owns-ordered grid topology (accessibility plan 2.1).
 *
 * A logical row is rendered as up to four sibling section fragments (leading / pinned-left /
 * center / pinned-right). Only the CENTER fragment is exposed as the ARIA row; the other
 * fragments are presentational and their cells are stitched into the center row via
 * `aria-owns`, listing every cell — the center row's own DOM children included — in visual
 * order (Chrome honors the listed order, which fixes reading order).
 *
 * The stitching is creation-time only: pool slots and band rows pair the same physical
 * elements across sections for their whole lifetime, so ids and `aria-owns` never need
 * touching in the scroll hot path. Cells hidden by colSpan shadowing or full-width layout
 * are `display:none` and drop out of the accessibility tree automatically.
 */

/**
 * Expose `centerRowEl` as the ARIA row owning `orderedCells` (visual order). Cells without
 * an id get one derived from `idPrefix` — prefix ids with the grid instance id (`core.id`)
 * so multiple grids on one page never collide.
 */
export function stitchAriaRow(centerRowEl: HTMLElement, orderedCells: HTMLElement[], idPrefix: string): void {
  centerRowEl.setAttribute("role", "row");
  const ids: string[] = [];
  for (let i = 0; i < orderedCells.length; i++) {
    const cell = orderedCells[i];
    if (!cell.id) cell.id = `${idPrefix}-c${i}`;
    ids.push(cell.id);
  }
  if (ids.length) centerRowEl.setAttribute("aria-owns", ids.join(" "));
  else centerRowEl.removeAttribute("aria-owns");
}

/** Stamp a body/band/aggregate cell. `globalIndex` is the leafColumnLookup global index. */
export function stampGridCellAria(cell: HTMLElement, globalIndex?: number): void {
  cell.setAttribute("role", "gridcell");
  if (globalIndex !== undefined) cell.setAttribute("aria-colindex", String(globalIndex + 1));
}

/** Remove an element (wrapper machinery, non-center row fragment) from the ARIA tree. */
export function markPresentational(...elements: Array<HTMLElement | null | undefined>): void {
  for (const el of elements) el?.setAttribute("role", "presentation");
}

/**
 * Owns `aria-activedescendant` on the grid root (accessibility plan 6 PR 2).
 *
 * Keyboard navigation never moves DOM focus off the root — it paints a class on the active
 * cell — so the root is the only element AT reads focus from, and the active cell has to be
 * named there by id. The cell's element is not stable: pool slots recycle under scroll and
 * bands are rebuilt wholesale, so the pointer is re-derived by whichever renderer paints the
 * active cell rather than held across a render.
 *
 * Two renderers paint it (the body pool and the pinned bands) and they run in an order that
 * depends on which one the focus moved away from. Each claims for itself and releases only
 * what it still owns, so a claim by the new owner is never undone by the old owner's release,
 * whichever runs second.
 *
 * Deliberately NOT gated on `highlightActiveCell`: that option draws a visual outline and
 * defaults to false, while AT focus tracking has to work in every configuration.
 */
export class ActiveDescendantTracker {
  private cell: HTMLElement | null = null;
  private owner: object | null = null;

  constructor(private root: HTMLElement) {}

  /** `owner` (a pool slot / band) painted `cell` as the active cell. */
  claim(cell: HTMLElement, owner: object): void {
    // Every pooled and band cell is given an id by stitchAriaRow; a cell without one cannot be
    // referenced, and pointing at a stale id would be worse than pointing at nothing.
    if (!cell.id) {
      this.clear();
      return;
    }
    if (this.cell === cell && this.owner === owner) return;
    this.cell = cell;
    this.owner = owner;
    this.root.setAttribute("aria-activedescendant", cell.id);
  }

  /**
   * `owner` painted no active cell. Drops the pointer only when it is still `owner`'s, or when
   * the element it names has been detached — a pool rebuild or band re-render leaves no owner
   * behind to release it, and the id would otherwise resolve to a recycled element.
   */
  release(owner: object): void {
    if (!this.cell) return;
    if (this.owner !== owner && this.cell.isConnected) return;
    this.clear();
  }

  clear(): void {
    this.cell = null;
    this.owner = null;
    this.root.removeAttribute("aria-activedescendant");
  }
}
