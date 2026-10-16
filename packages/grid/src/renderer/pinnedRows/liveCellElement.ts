import type { GridCore } from "../../core/core";

/**
 * The sticky group-row overlay of the grid whose body scroller is `body`. The overlay is a sibling
 * of the body inside the body frame, not a descendant of it; the lookup is scoped to the frame's
 * direct children so a grid nested in a cell renderer cannot answer for its host.
 */
export function stickyOverlayOf(body: HTMLElement): HTMLElement | null {
  return body.parentElement?.querySelector<HTMLElement>(":scope > .pte-sticky-rows") ?? null;
}

/**
 * The element the user sees for a body cell: a docked group row's sticky mirror when there is one
 * (it covers its pooled body row, so a border, popover or tooltip anchored underneath would be
 * hidden), else the pooled body cell. Null when the row is scrolled out of the pool.
 *
 * A full-width row's pooled per-column cells stay in the DOM, hidden, with their own colIdx stamps
 * (the nominal column's among them); its visible cell is the `.pte-full-width-cell` host, so only
 * that matches for such a row.
 *
 * Mirrors are matched by row id rather than by view index: the overlay is a handful of rows, so a
 * scan beats escaping an arbitrary id into a selector, and the id is the one coordinate every row
 * model agrees on.
 */
export function findLiveCellElement(
  core: GridCore,
  body: HTMLElement,
  rowId: string,
  colIdx: number,
): HTMLElement | null {
  if (colIdx < 0) return null;
  const fullWidth = core.isFullWidthNode(core.getRowModel().getRowNode(rowId));
  const cellSelector = `${fullWidth ? ".pte-full-width-cell" : ".pte-cell"}[data-col-idx="${colIdx}"]`;
  const sticky = stickyOverlayOf(body);
  if (sticky && sticky.style.display !== "none") {
    for (const rowEl of sticky.querySelectorAll<HTMLElement>(".pte-row.pte-sticky-row")) {
      if (rowEl.dataset.rowId !== rowId) continue;
      const cellEl = rowEl.querySelector<HTMLElement>(cellSelector);
      if (cellEl) return cellEl;
    }
  }
  const viewIdx = core.getViewIndexForRowId(rowId);
  if (viewIdx == null || viewIdx < 0) return null;
  // A row slot renders up to four section rows (leading/left/center/right) sharing one view-idx;
  // the cell lives in exactly one of them.
  const rowEls = body.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`);
  for (let i = 0; i < rowEls.length; i++) {
    const cellEl = rowEls[i].querySelector<HTMLElement>(cellSelector);
    if (cellEl) return cellEl;
  }
  return null;
}
