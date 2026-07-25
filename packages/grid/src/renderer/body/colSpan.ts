// Pure (DOM-free) helper for resolving a cell's horizontal colSpan. Kept separate from the window
// renderer so it can be unit-tested without a DOM. Given a raw span value (whatever the column's
// colSpan callback returned) and the number of non-hidden leaves remaining in the SAME section
// (including this cell), return how many columns the cell actually spans: at least 1, at most the
// remaining count — a span never crosses a section (pinned) boundary.

/**
 * Normalize a raw colSpan result to an integer >= 1: non-finite / non-integer / <= 1 all collapse to
 * 1 (no span). Fractional values are floored so `2.9` means "span 2".
 */
export function normalizeSpan(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 1;
  const n = Math.floor(raw);
  return n < 1 ? 1 : n;
}

/**
 * Resolve the effective span for a cell.
 * @param raw            the value the column's colSpan callback returned (or undefined for no callback)
 * @param remainingInSection number of non-hidden leaves in this cell's section from this cell onward
 *                       (so 1 = this is the last leaf in the section). Always >= 1 for a real cell.
 * @returns the clamped span in `[1, remainingInSection]`.
 */
export function resolveColSpan(raw: number | null | undefined, remainingInSection: number): number {
  const span = normalizeSpan(raw);
  const max = Math.max(1, remainingInSection);
  return Math.min(span, max);
}
