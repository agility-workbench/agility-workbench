import { ColumnType } from "../interfaces/column";
import { REJECT } from "../interfaces/gridOptions";
import type { FormatterOptions } from "./formatters";

/**
 * What a built-in parser knows about the column it parses for, so it can read back what the
 * column's own formatter wrote. `Column.parseValue` supplies both.
 */
export interface TextParseContext {
  /** The column's resolved `formatterOptions`: `locale` and `currency` for numbers, `format` for dates. */
  options?: FormatterOptions;
  /** The column's display formatter. Breaks the tie when one text reads as two different numbers. */
  format?: (value: unknown) => string;
}

/**
 * Built-in text parsing for columns that have no `valueParser`, by `ColumnType`. Every write path
 * that carries text — an editor committing raw text, paste, the fill handle, Delete/Backspace
 * (an empty string), and a string handed to `setCellValue` — goes through here when the column
 * has no parser of its own, so a number column never ends up holding `"abc"` and a cleared number
 * cell holds `null`, not `""`. Text the type cannot hold is refused with {@link REJECT}, which the
 * commit paths treat exactly like an `onBeforeCellCommit` veto: the cell keeps its value and
 * nothing is recorded or reported.
 *
 * Besides canonical text, each parser accepts what the grid's own formatter for the column
 * produces (given `ctx`), so copying a cell and pasting it into a like column round-trips:
 * `"$1,234.00"` into a currency column, `"1.234,5"` into a `de-DE` one, `"31/01/2026"` into a
 * date column formatted `DD/MM/YYYY`.
 */
export function parseTextByType(type: ColumnType, text: string, oldValue: unknown, ctx: TextParseContext = {}): unknown {
  switch (type) {
    case ColumnType.NUMBER:
    case ColumnType.CURRENCY:
      return parseNumberText(text, type, ctx);
    case ColumnType.DATE:
      return parseDateText(text, oldValue, ctx.options?.format, ctx.options?.locale);
    case ColumnType.BOOLEAN:
      return parseBooleanText(text);
    default:
      return text;
  }
}

/**
 * A number from `Number()` text, or from the column's locale form: that locale's grouping and
 * decimal separators (`Intl.NumberFormat#formatToParts`, never a hard-coded `,`/`.`), a leading
 * minus or accounting parentheses, and — for a currency column — the column's currency symbol or
 * code. The locale form applies to a currency column (locale defaulting to `en-US` and currency to
 * `USD`, as its formatter does) and to a number column that sets `formatterOptions.locale`. Grouping
 * must sit where the locale puts it, so `"1,234"` is 1234 in `en-US`, 1.234 in `de-DE`, and never
 * both. When the two readings disagree (`"1.234"` in `de-DE`), the one the column's formatter
 * renders as exactly that text wins; failing that, the locale reading. Blank is `null`; anything
 * else (NaN, ±Infinity) is refused.
 */
export function parseNumberText(
  text: string,
  type: ColumnType = ColumnType.NUMBER,
  ctx: TextParseContext = {},
): number | null | typeof REJECT {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  const plain = Number.isFinite(n) ? n : null;
  const isCurrency = type === ColumnType.CURRENCY;
  // A currency column always has a locale form (its formatter's); a number column only when it
  // names a `locale` — its default display is plain `String(value)`.
  const locale = ctx.options?.locale || (isCurrency ? "en-US" : undefined);
  const localized = locale
    ? parseLocaleNumber(trimmed, locale, isCurrency ? ctx.options?.currency || "USD" : undefined)
    : null;
  if (localized == null) return plain ?? REJECT;
  if (plain == null || plain === localized) return localized;
  const { format } = ctx;
  if (format) {
    if (sameText(format(localized), trimmed)) return localized;
    if (sameText(format(plain), trimmed)) return plain;
  }
  return localized;
}

const sameText = (a: string, b: string) => normalizeSpaces(a.trim()) === normalizeSpaces(b);
const normalizeSpaces = (s: string) => s.replace(/[\s\u00a0\u202f]+/g, " ");

interface NumberSymbols {
  group: string;
  decimal: string;
  minus: string;
  currency: string[];
  digits: string[];
}

const symbolCache = new Map<string, NumberSymbols | null>();

// The separators, minus sign, native digits and currency marks a locale formats numbers with.
function numberSymbols(locale: string, currency?: string): NumberSymbols | null {
  const key = `${locale}|${currency ?? ""}`;
  if (symbolCache.has(key)) return symbolCache.get(key)!;
  let symbols: NumberSymbols | null = null;
  try {
    const nf = new Intl.NumberFormat(locale, { useGrouping: true, minimumFractionDigits: 1 });
    const parts = nf.formatToParts(-1234567.5);
    const part = (t: string) => parts.find(p => p.type === t)?.value ?? "";
    const digitFormat = new Intl.NumberFormat(locale, { useGrouping: false });
    const marks = new Set<string>();
    if (currency) {
      marks.add(currency.toUpperCase());
      for (const currencyDisplay of ["symbol", "narrowSymbol", "code"] as const) {
        try {
          const cf = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay });
          for (const p of cf.formatToParts(1)) if (p.type === "currency") marks.add(p.value);
        } catch { /* currencyDisplay unsupported on this platform */ }
      }
    }
    symbols = {
      group: part("group"),
      decimal: part("decimal") || ".",
      minus: part("minusSign") || "-",
      // Longest first, so "US$" is stripped before "$".
      currency: [...marks].filter(Boolean).sort((a, b) => b.length - a.length),
      digits: Array.from({ length: 10 }, (_, i) => digitFormat.format(i)),
    };
  } catch {
    symbols = null; // unknown locale or currency: only Number() text is accepted
  }
  symbolCache.set(key, symbols);
  return symbols;
}

/**
 * Read `text` as `locale` formats a number (a currency amount when `currency` is given). Returns
 * null when the text is not in that form. Exported for tests.
 */
export function parseLocaleNumber(text: string, locale: string, currency?: string): number | null {
  const sym = numberSymbols(locale, currency);
  if (!sym) return null;
  let s = text.trim();
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  for (const mark of sym.currency) s = s.split(mark).join("");
  // Group separators can be spaces (fr-FR's narrow no-break space); spacing carries no meaning.
  const groupIsSpace = /^[\s\u00a0\u202f]$/.test(sym.group);
  // Bidi marks (Arabic, Hebrew locales) carry no value either.
  s = s.replace(/[\s\u00a0\u202f\u200e\u200f\u061c]+/g, "");
  for (const minus of new Set([sym.minus, "-", "\u2212"])) {
    if (s.startsWith(minus)) { negative = !negative; s = s.slice(minus.length); break; }
    if (s.endsWith(minus)) { negative = !negative; s = s.slice(0, -minus.length); break; }
  }
  if (sym.digits[0] !== "0") {
    sym.digits.forEach((digit, i) => { s = s.split(digit).join(String(i)); });
  }
  const decimalAt = s.indexOf(sym.decimal);
  const intPart = decimalAt >= 0 ? s.slice(0, decimalAt) : s;
  const fracPart = decimalAt >= 0 ? s.slice(decimalAt + sym.decimal.length) : "";
  if (decimalAt >= 0 && !/^\d+$/.test(fracPart)) return null;
  let digits: string;
  if (sym.group && !groupIsSpace && intPart.includes(sym.group)) {
    const groups = intPart.split(sym.group);
    // First group 1-3 digits, inner groups 2-3 (en-IN groups by two), last group exactly 3.
    const ok = /^\d{1,3}$/.test(groups[0])
      && groups.slice(1, -1).every(g => /^\d{2,3}$/.test(g))
      && /^\d{3}$/.test(groups[groups.length - 1]);
    if (!ok) return null;
    digits = groups.join("");
  } else {
    if (!/^\d*$/.test(intPart)) return null;
    digits = intPart;
  }
  if (digits === "" && fracPart === "") return null;
  const n = Number(`${digits || "0"}${fracPart ? `.${fracPart}` : ""}`);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
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
 * ISO 8601 text — `yyyy-mm-dd`, optionally with a time and a zone — or text in the column's own
 * display `format` (`formatterOptions.format`, e.g. `DD/MM/YYYY` or `MMM D, YYYY`), in the shape
 * the cell already stores: ISO text stays text, an epoch number stays a number, and a `Date` (or
 * an empty cell) takes a `Date`. Mirrors the date editor's stepping rule, so a column keeps one
 * shape however its cells are written. Anything else is refused: `new Date("10")` would happily
 * make October 2001, and `01/02/2026` means nothing without the column's format to say which is
 * the day.
 */
export function parseDateText(
  text: string,
  oldValue: unknown,
  format?: string,
  locale?: string,
): Date | string | number | null | typeof REJECT {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const date = parseIsoDate(trimmed)
    ?? (format ? parseFormattedDate(trimmed, format, locale || "en-US", toLocalDate(oldValue)) : null);
  if (!date) return REJECT;
  if (typeof oldValue === "string") return isoFromLocal(date);
  if (typeof oldValue === "number") return date.getTime();
  return date;
}

// The date formatter's tokens (column/formatters.ts `dateFormatter`), longest first.
const DATE_TOKENS = /YYYY|yyyy|YY|yy|MMMM|mmmm|MMM|mmm|MM|mm|M|m|DD|dd|D|d/g;

const monthNameCache = new Map<string, string[]>();

function monthNames(locale: string, month: "short" | "long"): string[] {
  const key = `${locale}|${month}`;
  let names = monthNameCache.get(key);
  if (!names) {
    const df = new Intl.DateTimeFormat(locale, { month });
    names = Array.from({ length: 12 }, (_, i) => df.format(new Date(2000, i, 1)).toLocaleLowerCase(locale));
    monthNameCache.set(key, names);
  }
  return names;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Read `text` written in a date `format` made of the date formatter's tokens (YYYY, YY, MMMM, MMM,
 * MM, M, DD, D, either case) as a local-midnight `Date`; null when it does not match or names an
 * impossible date. A two-digit year lands in 2000-2049 or 1950-1999; a format without a year takes
 * `fallback`'s year (the cell's current value), else this year's. Exported for tests.
 */
export function parseFormattedDate(text: string, format: string, locale = "en-US", fallback: Date | null = null): Date | null {
  const fields: string[] = [];
  let pattern = "";
  let last = 0;
  for (const m of format.matchAll(DATE_TOKENS)) {
    pattern += escapeRegExp(format.slice(last, m.index)).replace(/\s+/g, "\\s+");
    const token = m[0].toUpperCase();
    fields.push(token);
    pattern += token === "YYYY" ? "(\\d{4})"
      : token === "MMMM" || token === "MMM" ? "(\\S(?:.*?\\S)?)"
        : "(\\d{1,2})";
    last = m.index! + m[0].length;
  }
  pattern += escapeRegExp(format.slice(last)).replace(/\s+/g, "\\s+");
  const match = new RegExp(`^${pattern}$`, "i").exec(text.trim());
  if (!match) return null;
  let year = fallback?.getFullYear() ?? new Date().getFullYear();
  let month = 0;
  let day = 1;
  for (let i = 0; i < fields.length; i++) {
    const raw = match[i + 1];
    switch (fields[i]) {
      case "YYYY": year = Number(raw); break;
      case "YY": {
        const yy = Number(raw);
        if (raw.length !== 2) return null;
        year = yy < 50 ? 2000 + yy : 1900 + yy;
        break;
      }
      case "MMMM":
      case "MMM": {
        const idx = monthNames(locale, fields[i] === "MMMM" ? "long" : "short").indexOf(raw.toLocaleLowerCase(locale));
        if (idx < 0) return null;
        month = idx + 1;
        break;
      }
      case "MM":
      case "M": month = Number(raw); break;
      default: day = Number(raw);
    }
  }
  if (month === 0) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
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
