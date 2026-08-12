/**
 * ARIA helpers for the owns-ordered grid topology.
 *
 * A logical row renders as up to four sibling section fragments (leading / pinned-left / center /
 * pinned-right). Only the CENTER fragment is the ARIA row; the others are presentational and their
 * cells are stitched into it via `aria-owns`, listing every cell — the center row's own children
 * included — in visual order, which is the order Chrome reads.
 *
 * Stitching is creation-time only: pool slots and band rows pair the same physical elements across
 * sections for their whole lifetime, so ids and `aria-owns` are never touched in the scroll hot path.
 * Cells hidden by colSpan shadowing or full-width layout are `display:none` and leave the tree.
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
 * Mirror selection onto a cell or row, writing only on a transition. `aria-selected` is present-and-true
 * when selected and *absent* otherwise rather than an explicit "false": the grid recycles ~600 cells per
 * scroll frame, an unconditional write per cell is measurable, and an absent attribute already means
 * "not selected" to AT. `wasSelected` is the caller's cheap record of the previous state (the paint
 * class it is about to toggle, or the attribute itself for rows), which keeps the steady state at zero
 * DOM writes without reading the attribute back per cell.
 */
export function setAriaSelected(el: HTMLElement, selected: boolean, wasSelected: boolean): void {
  if (selected === wasSelected) return;
  if (selected) el.setAttribute("aria-selected", "true");
  else el.removeAttribute("aria-selected");
}

/**
 * Put expand/collapse state on the ARIA row itself, where the grid pattern expects it. The chevron span
 * keeps its own `aria-expanded` — duplicated, not moved, because `[aria-expanded]` on the toggle is
 * selected by tests and client CSS. `aria-level` is 1-based and written only when the row genuinely has
 * a depth: a leaf row under a CSRM group reports `level: 0` like a top-level row, and announcing every
 * data row as "level 1" is worse than announcing no level at all.
 */
export function stampRowHierarchyAria(
  rowEl: HTMLElement,
  row: { isGroup?: boolean; isExpanded?: boolean; level?: number; children?: unknown[] },
): void {
  const expandable = !!row.isGroup || (row.children?.length ?? 0) > 0;
  if (expandable) rowEl.setAttribute("aria-expanded", String(!!row.isExpanded));
  else rowEl.removeAttribute("aria-expanded");
  const level = row.level ?? 0;
  if (expandable || level > 0) rowEl.setAttribute("aria-level", String(level + 1));
  else rowEl.removeAttribute("aria-level");
}

/**
 * Owns `aria-activedescendant` on the grid root.
 *
 * Keyboard navigation never moves DOM focus off the root — it paints a class on the active cell — so the
 * root is the only element AT reads focus from, and the active cell must be named there by id. That
 * element is not stable (pool slots recycle, bands are rebuilt wholesale), so the pointer is re-derived
 * by whichever renderer paints the active cell rather than held across a render.
 *
 * Two renderers paint it (body pool, pinned bands), in an order that depends on which one focus left.
 * Each claims for itself and releases only what it still owns, so the new owner's claim survives the old
 * owner's release whichever runs second.
 *
 * NOT gated on `highlightActiveCell`: that option draws a visual outline and defaults to false, while AT
 * focus tracking has to work in every configuration.
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
