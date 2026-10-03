import type { FillHandleDirection, FillHandleMode } from "../../interfaces/gridOptions";

/**
 * The fill handle's arithmetic, with no grid in it: which cells a drag targets, and what value each
 * of them receives. Everything here is in body view-index rows × global leaf-column indices,
 * inclusive at both ends — the same space the selection range uses.
 */

/** A body rectangle: view-index rows × global leaf-column indices, inclusive. */
export interface FillRect {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

/** The one direction a fill runs in. A drag never fills two ways at once. */
export type FillAxis = "down" | "up" | "right" | "left";

/** The cells a fill writes (`rect` excludes the source) and the direction they extend in. */
export interface FillTarget {
  axis: FillAxis;
  rect: FillRect;
}

/** How one line of the fill (a column when filling vertically, a row when horizontally) is derived. */
export type FillLineMode = "copy" | "series";

/**
 * Where a drag from `source`'s handle to the cell under the pointer would fill. The pointer picks
 * one axis — the one it has travelled further along, rows winning a tie — and the target is the
 * source extended along it up to the pointer. A pointer inside the source (or beside it on an axis
 * the `direction` option forbids) targets nothing.
 */
export function computeFillTarget(
  source: FillRect,
  pointer: { row: number; col: number },
  direction: FillHandleDirection,
): FillTarget | null {
  const dr = pointer.row > source.rowEnd
    ? pointer.row - source.rowEnd
    : pointer.row < source.rowStart ? source.rowStart - pointer.row : 0;
  const dc = pointer.col > source.colEnd
    ? pointer.col - source.colEnd
    : pointer.col < source.colStart ? source.colStart - pointer.col : 0;
  const vertical = dr > 0 && direction !== "x";
  const horizontal = dc > 0 && direction !== "y";
  if (!vertical && !horizontal) return null;

  if (vertical && (!horizontal || dr >= dc)) {
    return pointer.row > source.rowEnd
      ? { axis: "down", rect: { rowStart: source.rowEnd + 1, rowEnd: pointer.row, colStart: source.colStart, colEnd: source.colEnd } }
      : { axis: "up", rect: { rowStart: pointer.row, rowEnd: source.rowStart - 1, colStart: source.colStart, colEnd: source.colEnd } };
  }
  return pointer.col > source.colEnd
    ? { axis: "right", rect: { rowStart: source.rowStart, rowEnd: source.rowEnd, colStart: source.colEnd + 1, colEnd: pointer.col } }
    : { axis: "left", rect: { rowStart: source.rowStart, rowEnd: source.rowEnd, colStart: pointer.col, colEnd: source.colStart - 1 } };
}

/** The smallest rectangle covering both. */
export function unionRect(a: FillRect, b: FillRect): FillRect {
  return {
    rowStart: Math.min(a.rowStart, b.rowStart),
    rowEnd: Math.max(a.rowEnd, b.rowEnd),
    colStart: Math.min(a.colStart, b.colStart),
    colEnd: Math.max(a.colEnd, b.colEnd),
  };
}

/**
 * Whether a line of source values can extend as a series: every value a finite number, or every
 * value a valid `Date`. Anything mixed, blank, or textual repeats instead.
 */
export function seriesKind(values: readonly unknown[]): "number" | "date" | null {
  if (values.length === 0) return null;
  if (values.every(v => typeof v === "number" && Number.isFinite(v))) return "number";
  if (values.every(v => v instanceof Date && !Number.isNaN(v.getTime()))) return "date";
  return null;
}

/**
 * Copy or series for one line. In `"auto"` mode the spreadsheet rules apply: two or more numbers
 * continue their trend, a lone number repeats, and dates always step (one day apart when there is
 * only one). `flip` — Ctrl/Cmd held when the drag ends — inverts that choice wherever a series is
 * possible, so a lone number counts up and a run of numbers repeats. `"copy"` mode is just that.
 */
export function resolveLineMode(values: readonly unknown[], mode: FillHandleMode, flip: boolean): FillLineMode {
  if (mode === "copy") return "copy";
  const kind = seriesKind(values);
  if (kind === null) return "copy";
  const series = kind === "date" || values.length >= 2;
  return (flip ? !series : series) ? "series" : "copy";
}

/**
 * The value at `index` of the pattern `values` repeated in both directions: indices `0..n-1` are
 * the source itself, `n` restarts the pattern, and `-1` is the pattern's last value — so filling
 * upward continues the pattern backward instead of mirroring it.
 */
export function copyAt(values: readonly unknown[], index: number): unknown {
  const n = values.length;
  return values[((index % n) + n) % n];
}

/**
 * The value at `index` of the series through `values` (indices `0..n-1`). Two or more values fit a
 * least-squares line — exact for an arithmetic progression, a trend otherwise (`1, 2, 6` continues
 * `8, 10.5, 13`, as spreadsheets do) — with floating-point crumbs removed, so `0.1, 0.2` continues
 * as `0.3`, not `0.30000000000000004`. A single number steps by one; a single date by one day.
 * Dates sharing a time of day advance in calendar days (so a daily series survives a DST change);
 * otherwise they advance in milliseconds. `values` must satisfy {@link seriesKind}.
 */
export function seriesAt(values: readonly unknown[], index: number): unknown {
  const kind = seriesKind(values);
  if (kind === "number") {
    // 15 significant digits is where a double's shortest round-trip text stops carrying noise.
    return Number(trend(values as number[], 1)(index).toPrecision(15));
  }
  if (kind === "date") {
    const dates = values as Date[];
    const first = dates[0];
    if (sameTimeOfDay(dates)) {
      const days = dates.map(localDayNumber);
      const predicted = Math.round(trend(days, 1)(index));
      return new Date(
        first.getFullYear(), first.getMonth(), first.getDate() + (predicted - days[0]),
        first.getHours(), first.getMinutes(), first.getSeconds(), first.getMilliseconds(),
      );
    }
    return new Date(Math.round(trend(dates.map(d => d.getTime()), 86_400_000)(index)));
  }
  return copyAt(values, index);
}

/** {@link copyAt} or {@link seriesAt}, by line mode. */
export function fillValueAt(values: readonly unknown[], index: number, lineMode: FillLineMode): unknown {
  return lineMode === "series" ? seriesAt(values, index) : copyAt(values, index);
}

// The least-squares line through (0, ys[0]) … (n-1, ys[n-1]); with one point, a line of slope
// `singleStep` through it.
function trend(ys: readonly number[], singleStep: number): (index: number) => number {
  const n = ys.length;
  if (n === 1) return index => ys[0] + singleStep * index;
  const meanX = (n - 1) / 2;
  let meanY = 0;
  for (const y of ys) meanY += y;
  meanY /= n;
  let num = 0;
  let den = 0;
  for (let x = 0; x < n; x++) {
    num += (x - meanX) * (ys[x] - meanY);
    den += (x - meanX) ** 2;
  }
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return index => intercept + slope * index;
}

function sameTimeOfDay(dates: readonly Date[]): boolean {
  const first = dates[0];
  return dates.every(d =>
    d.getHours() === first.getHours()
    && d.getMinutes() === first.getMinutes()
    && d.getSeconds() === first.getSeconds()
    && d.getMilliseconds() === first.getMilliseconds());
}

// Whole days since the epoch for the date's LOCAL calendar day — a DST-proof day index.
function localDayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}
