/**
 * `ColDef.autoHeight`: measuring a rendered row's content height.
 *
 * A row is measured across all its section fragments (leading, left, centre, right), so its pinned
 * parts and its centre part grow together. Only `.pte-cell-auto-height` cells are read. Each cell's
 * content is measured with a Range over its children rather than from the cell box: the cell is a
 * flex item stretched to the row, so its own height could only ever grow, while the content's line
 * boxes report what the text needs at the cell's current width. Callers measure every row first and
 * write afterwards, so a pass costs one forced layout.
 */

export const AUTO_HEIGHT_CELL_CLASS = "pte-cell-auto-height";
export const WRAP_TEXT_CELL_CLASS = "pte-cell-wrap-text";

function px(value: string | null | undefined): number {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/** Height the content of one cell needs, inside its padding and borders. */
function contentHeight(cell: HTMLElement): number {
  if (!cell.firstChild) return 0;
  const range = document.createRange();
  range.selectNodeContents(cell);
  const height = range.getBoundingClientRect().height || 0;
  range.detach?.();
  return height;
}

/**
 * The row height the `autoHeight` cells of a row's fragments need, or null when the row has none to
 * measure (no auto cell displayed, or the editor is open in one: an editor is sized by the row, not
 * the other way round). The result includes the row's own chrome (borders) as the fragment shows it.
 */
export function measureAutoHeightRow(fragments: Array<HTMLElement | undefined | null>): number | null {
  let required: number | null = null;
  for (const fragment of fragments) {
    if (!fragment || fragment.style.display === "none") continue;
    const cells = fragment.querySelectorAll<HTMLElement>(`.${AUTO_HEIGHT_CELL_CLASS}`);
    if (cells.length === 0) continue;
    const rowHeight = fragment.getBoundingClientRect().height;
    for (const cell of cells) {
      if (cell.style.display === "none") continue;
      if (cell.classList.contains("pte-cell-editing")) return null;
      const style = getComputedStyle(cell);
      const box = cell.getBoundingClientRect().height;
      const chrome = px(style.paddingTop) + px(style.paddingBottom)
        + px(style.borderTopWidth) + px(style.borderBottomWidth);
      // What the row adds around the cell (its own borders), plus the cell's chrome and content.
      const needed = Math.ceil((rowHeight - box) + chrome + contentHeight(cell));
      required = required == null ? needed : Math.max(required, needed);
    }
  }
  return required;
}
