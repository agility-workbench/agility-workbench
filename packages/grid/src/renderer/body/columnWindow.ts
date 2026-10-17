/**
 * Column (horizontal) virtualization of the centre body section: which centre columns a pooled row
 * renders, as a pure function of the column widths and the centre section's scroll box.
 *
 * Indexes are positions in the centre section's non-hidden leaves (`ColumnModel.getCenterLeaves()`,
 * which never holds a hidden leaf — the same index as `leafColumnLookup`'s centre `localIndex` and
 * `Column.centralPosition`). Pixel offsets are measured from the section's inline-start edge, so the
 * result is direction-agnostic: the caller reads `scrollStart` through `layout/direction.ts`.
 *
 * Pinned and leading sections are never virtualized (they are clamped to a fraction of the grid and
 * stay fully rendered), and neither are the header, the aggregate row, the pinned-row bands or the
 * sticky group overlay.
 */

export interface ColumnWindowInput {
  /** `computedWidth` of every non-hidden centre leaf, in order. */
  widths: readonly number[];
  /** Pixels the centre section is scrolled from its inline-start edge (≥ 0). */
  scrollStart: number;
  /** The centre section's client width. 0 means "not laid out": every column is rendered. */
  clientWidth: number;
  /** Extra columns rendered on each side of the visible ones. */
  overscan: number;
  /** `GridOptions.columnVirtualization`. False renders every column. */
  enabled: boolean;
  /** Some centre leaf defines `colSpan`: spans are resolved across the whole section, so render all. */
  hasColSpan: boolean;
  /** Columns that must stay rendered wherever the viewport is (an open editor's column). */
  keep?: Iterable<number>;
}

export interface ColumnWindow {
  /** First rendered column of the contiguous visible range. */
  start: number;
  /** One past the last rendered column of the range. */
  end: number;
  /** Width of the columns before `start`. */
  offsetPx: number;
  /** Every rendered column, ascending: the range plus any kept column outside it. */
  cols: number[];
}

/** One contiguous run of rendered columns, preceded by `gapPx` of unrendered columns. */
export interface ColumnRun {
  gapPx: number;
  /** Positions into the rendered `cols` list (not column indexes): `[from, to)`. */
  from: number;
  to: number;
}

function range(start: number, end: number): number[] {
  const out = new Array<number>(Math.max(0, end - start));
  for (let i = start; i < end; i++) out[i - start] = i;
  return out;
}

/** Every column rendered: the non-virtualized shape. */
export function fullColumnWindow(count: number): ColumnWindow {
  return { start: 0, end: count, offsetPx: 0, cols: range(0, count) };
}

export function computeColumnWindow(input: ColumnWindowInput): ColumnWindow {
  const { widths } = input;
  const n = widths.length;
  if (n === 0 || !input.enabled || input.hasColSpan || !(input.clientWidth > 0)) {
    return fullColumnWindow(n);
  }

  const viewStart = Math.max(0, input.scrollStart);
  const viewEnd = viewStart + input.clientWidth;
  // First column whose inline-end edge is past the viewport start, and one past the last column
  // whose inline-start edge is before the viewport end.
  let x = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    const w = Math.max(0, widths[i] || 0);
    const right = x + w;
    if (first < 0 && right > viewStart) first = i;
    if (x < viewEnd) last = i;
    else break;
    x = right;
  }
  // Scrolled past the content (a stale offset before the browser clamps it): show the tail.
  if (first < 0) first = n - 1;
  if (last < first) last = first;

  const overscan = Math.max(0, Math.floor(input.overscan || 0));
  const start = Math.max(0, first - overscan);
  const end = Math.min(n, last + 1 + overscan);
  let offsetPx = 0;
  for (let i = 0; i < start; i++) offsetPx += Math.max(0, widths[i] || 0);

  const cols = range(start, end);
  if (input.keep) {
    const extra = new Set<number>();
    for (const k of input.keep) {
      if (Number.isInteger(k) && k >= 0 && k < n && (k < start || k >= end)) extra.add(k);
    }
    if (extra.size > 0) {
      cols.push(...extra);
      cols.sort((a, b) => a - b);
    }
  }
  return { start, end, offsetPx, cols };
}

/**
 * Split ascending rendered columns into contiguous runs, each with the width of the unrendered
 * columns before it. The first run's gap is the offset of the first rendered column.
 */
export function columnRuns(widths: readonly number[], cols: readonly number[]): ColumnRun[] {
  const runs: ColumnRun[] = [];
  let next = 0;
  let i = 0;
  while (i < cols.length) {
    let gap = 0;
    for (; next < cols[i]; next++) gap += Math.max(0, widths[next] || 0);
    const from = i;
    while (i < cols.length && (i === from || cols[i] === cols[i - 1] + 1)) {
      next = cols[i] + 1;
      i++;
    }
    runs.push({ gapPx: gap, from, to: i });
  }
  return runs;
}

/** Position of column `index` in the ascending rendered `cols`, or -1 when it is not rendered. */
export function renderedPosition(cols: readonly number[], index: number): number {
  // The common shape is one contiguous run: answer that without a search.
  const n = cols.length;
  if (n === 0) return -1;
  const guess = index - cols[0];
  if (guess >= 0 && guess < n && cols[guess] === index) return guess;
  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = cols[mid];
    if (v === index) return mid;
    if (v < index) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export function sameColumns(a: readonly number[], b: readonly number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
