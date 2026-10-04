import { ColumnType } from "../interfaces/column";
import { REJECT } from "../interfaces/gridOptions";

/**
 * Built-in text parsing for columns that have no `valueParser`, by `ColumnType`. Every write path
 * that carries text — an editor committing raw text, paste, the fill handle, Delete/Backspace
 * (an empty string), and a string handed to `setCellValue` — goes through here when the column
 * has no parser of its own, so a number column never ends up holding `"abc"` and a cleared number
 * cell holds `null`, not `""`. Text the type cannot hold is refused with {@link REJECT}, which the
 * commit paths treat exactly like an `onBeforeCellCommit` veto: the cell keeps its value and
 * nothing is recorded or reported.
 */
export function parseTextByType(type: ColumnType, text: string, oldValue: unknown): unknown {
  switch (type) {
    case ColumnType.NUMBER:
    case ColumnType.CURRENCY:
      return parseNumberText(text);
    case ColumnType.DATE:
      return parseDateText(text, oldValue);
    case ColumnType.BOOLEAN:
      return parseBooleanText(text);
    default:
      return text;
  }
}

/** What `Number()` accepts, trimmed; blank is `null`; anything else (NaN, ±Infinity) is refused. */
export function parseNumberText(text: string): number | null | typeof REJECT {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : REJECT;
}

/** `true`/`false`, `yes`/`no`, `y`/`n`, `1`/`0`, case-insensitive; blank is `null`. */
export function parseBooleanText(text: string): boolean | null | typeof REJECT {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "") return null;
  if (trimmed === "true" || trimmed === "yes" || trimmed === "y" || trimmed === "1") return true;
  if (trimmed === "false" || trimmed === "no" || trimmed === "n" || trimmed === "0") return false;
  return REJECT;
}

/**
 * ISO 8601 text — `yyyy-mm-dd`, optionally with a time and a zone — in the shape the cell already
 * stores: ISO text stays text, an epoch number stays a number, and a `Date` (or an empty cell)
 * takes a `Date`. Mirrors the date editor's stepping rule, so a column keeps one shape however its
 * cells are written. Anything else is refused: `new Date("10")` would happily make October 2001.
 */
export function parseDateText(text: string, oldValue: unknown): Date | string | number | null | typeof REJECT {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const date = parseIsoDate(trimmed);
  if (!date) return REJECT;
  if (typeof oldValue === "string") return isoFromLocal(date);
  if (typeof oldValue === "number") return date.getTime();
  return date;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Strict ISO 8601. A date (or a zone-less date-time) is built from its parts in LOCAL time —
 * `new Date("2026-01-02")` is UTC midnight, a day early west of Greenwich — and a zoned date-time
 * is left to the platform. Impossible dates (`2026-02-30`) are refused rather than rolled over.
 */
export function parseIsoDate(text: string): Date | null {
  const m = ISO_DATE.exec(text);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", ms = "0", zone] = m;
  if (zone) {
    const parsed = new Date(text.replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const date = new Date(
    Number(y), Number(mo) - 1, Number(d),
    Number(h), Number(mi), Number(s), Number(ms.padEnd(3, "0")),
  );
  const valid = date.getFullYear() === Number(y)
    && date.getMonth() === Number(mo) - 1
    && date.getDate() === Number(d)
    && Number(h) < 24 && Number(mi) < 60 && Number(s) < 60;
  return valid ? date : null;
}

/** A stored date value — `Date`, epoch number, or date text — as a local `Date`, or null. */
export function toLocalDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** The local calendar date as `yyyy-mm-dd`. */
export function isoFromLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
