import { isoFromLocal, parseIsoDate } from "../../column/parsers";
import type { FillAxis, FillHandleDirection, FillHandleMode, FillLineMode } from "../../interfaces/gridOptions";

export type { FillAxis, FillLineMode };

/** Application cycles (`fillHandle.lists`), tried before the built-in name lists. */
type Lists = readonly (readonly string[])[];

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

/** The cells a fill writes (`rect` excludes the source) and the direction they extend in. */
export interface FillTarget {
  axis: FillAxis;
  rect: FillRect;
}

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
 * Where a double-click on the handle fills down to: the last row of the run of data that starts
 * in the row below `source` in a neighbouring column. `guides` are the candidate columns, nearest
 * on the left first, then nearest on the right — the first with data in that row is followed (the
 * spreadsheet rule), and the run ends at the first row where `hasData` says no, or at `rowCount`.
 * Null when no guide has data in the row below the source, or there is no row below it.
 */
export function adjacentBlockEnd(
  source: FillRect,
  guides: readonly number[],
  rowCount: number,
  hasData: (row: number, col: number) => boolean,
): number | null {
  const first = source.rowEnd + 1;
  if (first >= rowCount) return null;
  const guide = guides.find(col => hasData(first, col));
  if (guide === undefined) return null;
  let end = first;
  while (end + 1 < rowCount && hasData(end + 1, guide)) end++;
  return end;
}

/**
 * Whether a line of source values can extend as a series: every value a finite number, every value
 * a valid `Date`, or every value a string sharing a {@link textSeries} pattern (the application's
 * `lists` included). Anything mixed, blank, or otherwise textual repeats instead.
 */
export function seriesKind(values: readonly unknown[], lists: Lists = []): "number" | "date" | "text" | null {
  if (values.length === 0) return null;
  if (values.every(v => typeof v === "number" && Number.isFinite(v))) return "number";
  if (values.every(v => v instanceof Date && !Number.isNaN(v.getTime()))) return "date";
  if (textSeries(values, lists)) return "text";
  return null;
}

/**
 * Copy or series for one line. In `"auto"` mode the spreadsheet rules apply: two or more numbers
 * continue their trend, a lone number repeats, and dates and text patterns always step (a lone
 * date by a day, `Item 1` to `Item 2`, `Monday` to `Tuesday`). `flip` — Ctrl/Cmd held when the
 * drag ends — inverts that choice wherever a series is possible, so a lone number counts up and a
 * run of numbers repeats. `"copy"` mode is just that.
 */
export function resolveLineMode(
  values: readonly unknown[],
  mode: FillHandleMode,
  flip: boolean,
  lists: Lists = [],
): FillLineMode {
  if (mode === "copy") return "copy";
  const kind = seriesKind(values, lists);
  if (kind === null) return "copy";
  const series = kind !== "number" || values.length >= 2;
  return (flip ? !series : series) ? "series" : "copy";
}

/**
 * A line of text that can extend. A counter is text whose last run of digits counts (`Item 1`,
 * `Week 1 of 52`, `v08`): the rest must be the same in every cell, and the digits' width is kept
 * as a minimum, so `08` is followed by `09` and `10`. A cycle is a run of weekday or month names,
 * long or short, in English or the runtime's language, of quarters (`Q1`, `Qtr1`, `Quarter 1`), or
 * of the entries of an application list, matched regardless of case; application lists are tried
 * first, then the built-in ones, then the counter. Dates written as `YYYY-MM-DD` text step as
 * dates do and stay text, so `2026-05-31` is followed by `2026-06-01`.
 */
export type TextSeries =
  | { kind: "counter"; prefix: string; suffix: string; width: number; numbers: number[] }
  | { kind: "cycle"; names: readonly string[]; sample: string; indices: number[] }
  | { kind: "isoDate"; dates: Date[] };

/** The text pattern `values` share, or null when they are not all strings or share none. */
export function textSeries(values: readonly unknown[], lists: Lists = []): TextSeries | null {
  if (values.length === 0 || !values.every(v => typeof v === "string")) return null;
  const texts = values as string[];
  return nameCycle(texts, lists) ?? isoDates(texts) ?? counter(texts);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoDates(texts: readonly string[]): TextSeries | null {
  const dates: Date[] = [];
  for (const text of texts) {
    const date = ISO_DAY.test(text) ? parseIsoDate(text) : null;
    if (!date) return null;
    dates.push(date);
  }
  return { kind: "isoDate", dates };
}

// The lazy prefix and a digit-free suffix make the captured run the LAST one in the text.
const COUNTER = /^([\s\S]*?)(\d+)(\D*)$/;

function counter(texts: readonly string[]): TextSeries | null {
  let prefix: string | null = null;
  let suffix = "";
  let width = 0;
  const numbers: number[] = [];
  for (const text of texts) {
    const match = COUNTER.exec(text);
    // Text that is nothing but a number ("12", "-5", "1e3") is not a counter: on its own it would
    // count up where a lone number repeats, and "-5" would reach "-6". Nor is any other date-like
    // ISO text ("2026-05-06 09:30"), whose last digits are not a count of anything.
    if (!match || Number.isFinite(Number(text)) || parseIsoDate(text)) return null;
    if (prefix === null) {
      prefix = match[1];
      suffix = match[3];
      width = match[2].length;
    } else if (match[1] !== prefix || match[3] !== suffix) {
      return null;
    }
    numbers.push(Number(match[2]));
  }
  return prefix === null ? null : { kind: "counter", prefix, suffix, width, numbers };
}

function nameCycle(texts: readonly string[], lists: Lists): TextSeries | null {
  for (const names of [...usableLists(lists), ...nameLists()]) {
    const indices: number[] = [];
    for (const text of texts) {
      const wanted = text.trim().toLowerCase();
      const at = names.findIndex(name => name.trim().toLowerCase() === wanted);
      if (at < 0) break;
      indices.push(at);
    }
    if (indices.length === texts.length) {
      return { kind: "cycle", names, sample: texts[0].trim(), indices: unwrap(indices, names.length) };
    }
  }
  return null;
}

// An application list needs two entries to cycle; blanks and non-strings would never match a cell.
function usableLists(lists: Lists): Lists {
  return lists.filter(list =>
    list.length >= 2 && list.every(name => typeof name === "string" && name.trim() !== ""));
}

let cachedNameLists: readonly (readonly string[])[] | null = null;

// Weekday and month names, long then short, English first and then the runtime's language where
// it differs, then the quarter spellings spreadsheets know. Long lists come before short ones so
// "May" continues as "June", not "Jun".
function nameLists(): readonly (readonly string[])[] {
  if (cachedNameLists) return cachedNameLists;
  const lists: string[][] = [];
  const add = (list: string[]) => {
    const known = lists.some(l => l.length === list.length
      && l.every((name, i) => name.toLowerCase() === list[i].toLowerCase()));
    if (!known) lists.push(list);
  };
  for (const locale of ["en-US", undefined]) {
    for (const width of ["long", "short"] as const) {
      // 7 January 2024 is a Sunday.
      add(calendarNames(locale, { weekday: width }, 7, i => new Date(2024, 0, 7 + i)));
      add(calendarNames(locale, { month: width }, 12, i => new Date(2024, i, 1)));
    }
  }
  add(["Quarter 1", "Quarter 2", "Quarter 3", "Quarter 4"]);
  add(["Qtr 1", "Qtr 2", "Qtr 3", "Qtr 4"]);
  add(["Qtr1", "Qtr2", "Qtr3", "Qtr4"]);
  add(["Q1", "Q2", "Q3", "Q4"]);
  return (cachedNameLists = lists);
}

function calendarNames(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
  count: number,
  dateAt: (i: number) => Date,
): string[] {
  const format = new Intl.DateTimeFormat(locale, options);
  return Array.from({ length: count }, (_, i) => format.format(dateAt(i)));
}

// Positions on a cycle, each moved by whole turns to sit nearest the one before it, so that
// Fri, Sat, Sun, Mon reads 5, 6, 7, 8 rather than 5, 6, 0, 1 and its trend is one step forward.
function unwrap(indices: readonly number[], length: number): number[] {
  const out = [indices[0]];
  for (let k = 1; k < indices.length; k++) {
    let delta = (((indices[k] - out[k - 1]) % length) + length) % length;
    if (delta > length / 2) delta -= length;
    out.push(out[k - 1] + delta);
  }
  return out;
}

// `name` in the casing `sample` uses: all caps, all lower, or capitalised; otherwise as listed.
function matchCase(sample: string, name: string): string {
  const hasCase = sample.toUpperCase() !== sample.toLowerCase();
  if (hasCase && sample === sample.toUpperCase()) return name.toUpperCase();
  if (hasCase && sample === sample.toLowerCase()) return name.toLowerCase();
  const head = sample.charAt(0);
  if (head === head.toUpperCase() && sample.slice(1) === sample.slice(1).toLowerCase()) {
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }
  return name;
}

function padCount(n: number, width: number): string {
  const digits = String(Math.abs(n)).padStart(width, "0");
  return n < 0 ? `-${digits}` : digits;
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
 * otherwise they advance in milliseconds. A text counter's number follows the same trend, rounded
 * to a whole number; a name cycle's position does too, wrapping around the list. `values` must
 * satisfy {@link seriesKind} (with the same `lists`).
 */
export function seriesAt(values: readonly unknown[], index: number, lists: Lists = []): unknown {
  const kind = seriesKind(values, lists);
  if (kind === "number") {
    // 15 significant digits is where a double's shortest round-trip text stops carrying noise.
    return Number(trend(values as number[], 1)(index).toPrecision(15));
  }
  if (kind === "text") {
    const text = textSeries(values, lists)!;
    if (text.kind === "counter") {
      const n = Math.round(trend(text.numbers, 1)(index));
      return text.prefix + padCount(n, text.width) + text.suffix;
    }
    if (text.kind === "isoDate") return isoFromLocal(seriesAt(text.dates, index) as Date);
    const length = text.names.length;
    const wrap = (i: number) => text.names[((i % length) + length) % length];
    const name = wrap(Math.round(trend(text.indices, 1)(index)));
    // A sample spelled exactly as listed takes the list's own spelling ("Associate" → "VP"); one
    // typed in another casing carries that casing along ("MON" → "TUE", "associate" → "vp").
    return text.sample === wrap(text.indices[0]).trim() ? name.trim() : matchCase(text.sample, name);
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
export function fillValueAt(
  values: readonly unknown[],
  index: number,
  lineMode: FillLineMode,
  lists: Lists = [],
): unknown {
  return lineMode === "series" ? seriesAt(values, index, lists) : copyAt(values, index);
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
