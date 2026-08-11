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
