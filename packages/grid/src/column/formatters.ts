import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";
import type { Column } from "./column";

export interface ValueFormatterParams<TData = any> {
  value: any;
  /** The row node the value belongs to (read the row off `row.data`). */
  row?: IRowNode<TData>;
  col?: Column;
}

export interface ValueParserParams<TData = any> {
  // The raw text the user typed into the cell editor.
  value: string;
  // The current (pre-edit) stored value of the cell.
  oldValue: any;
  // The row node being written (read the row off `row.data`).
  row?: IRowNode<TData>;
  col?: Column;
}

/**
 * Options the built-in formatters (and the built-in parsers, which read the same text back) take
 * from `ColDef.formatterOptions`. `locale` applies to every type; `format` is the date column's;
 * `currency` the currency column's; the rest shape numbers through `Intl.NumberFormat`.
 *
 * A NUMBER column displays `String(value)` until it sets one of the number options below
 * (`style`, `fractionDigits`, `minimumFractionDigits`, `maximumFractionDigits`, `useGrouping`,
 * `unit`, `unitDisplay`, `notation`) — `locale` alone does not switch formatting on, so existing
 * grids keep their display. `{ style: "decimal" }` is the minimal opt-in (locale grouping, up to
 * three decimals). A CURRENCY column always formats, and honours the fraction-digit, grouping and
 * notation options on top of `currency`.
 */
export interface FormatterOptions {
  /** ISO 4217 code for a currency column. Default `"USD"`. */
  currency?: string;
  /** BCP 47 locale for separators, month names and symbols. Default `"en-US"`. */
  locale?: string;
  /** A date column's display pattern (`YYYY-MM-DD` tokens). Default `"YYYY-MM-DD"`. */
  format?: string;
  /**
   * How a NUMBER column shows its value. `"percent"` treats the value as a fraction, as
   * `Intl.NumberFormat` does: `0.125` displays `12.5%`. `"unit"` appends {@link unit}. Default
   * `"decimal"` once any number option is set (`"unit"` when only `unit` is).
   */
  style?: NumberFormatStyle;
  /** Shorthand for both {@link minimumFractionDigits} and {@link maximumFractionDigits}. */
  fractionDigits?: number;
  /** Decimals always shown (zero-padded). Default 0 (2 for currency). Overrides `fractionDigits`. */
  minimumFractionDigits?: number;
  /**
   * Decimals at most (rounded). Default 3 for decimal, percent and unit (Intl's percent default
   * of 0 would show `0.125` as `13%`), 2 for currency. Overrides `fractionDigits`.
   */
  maximumFractionDigits?: number;
  /** Locale thousands grouping (`1,234` / `1.234`). Default true. */
  useGrouping?: boolean;
  /** An `Intl` unit identifier for `style: "unit"`: `"kilogram"`, `"kilometer-per-hour"`, `"percent"`… */
  unit?: string;
  /** How {@link unit} is written: `"short"` (`12 kg`, default), `"long"` (`12 kilograms`), `"narrow"` (`12kg`). */
  unitDisplay?: "short" | "long" | "narrow";
  /** `"compact"` abbreviates magnitudes (`1.2K`, `3.4M`); display only, it rounds. Default `"standard"`. */
  notation?: "standard" | "compact";
}

/** `FormatterOptions.style`: the `Intl.NumberFormat` styles a NUMBER column can take. */
export type NumberFormatStyle = "decimal" | "percent" | "unit";

// The options that switch a NUMBER column from String(value) to Intl formatting.
const NUMBER_OPTION_KEYS = [
  "style", "fractionDigits", "minimumFractionDigits", "maximumFractionDigits",
  "useGrouping", "unit", "unitDisplay", "notation",
] as const;

/**
 * The `Intl.NumberFormat` options a NUMBER or CURRENCY column formats with, built from its
 * resolved `formatterOptions` (locale excluded). Null for a NUMBER column that sets none of the
 * number options — it displays `String(value)` — and for any other type. The built-in parser reads
 * percent signs, units and compact suffixes back from the same object, so display and parse
 * cannot drift.
 */
export function resolveNumberFormatOptions(
  type: ColumnType | undefined,
  opts: FormatterOptions = {},
): Intl.NumberFormatOptions | null {
  const isCurrency = type === ColumnType.CURRENCY;
  if (!isCurrency && type !== ColumnType.NUMBER) return null;
  if (!isCurrency && !NUMBER_OPTION_KEYS.some(key => opts[key] !== undefined)) return null;
  const out: Intl.NumberFormatOptions = isCurrency
    ? { style: "currency", currency: opts.currency || "USD" }
    : { style: opts.style ?? (opts.unit !== undefined ? "unit" : "decimal") };
  if (out.style === "unit") {
    out.unit = opts.unit;
    if (opts.unitDisplay) out.unitDisplay = opts.unitDisplay;
  }
  const min = opts.minimumFractionDigits ?? opts.fractionDigits;
  let max = opts.maximumFractionDigits ?? opts.fractionDigits;
  // Intl's percent default rounds to whole percents; match the decimal default instead. Compact
  // notation keeps its own (significant-digit) rounding.
  if (min === undefined && max === undefined && out.style === "percent" && opts.notation !== "compact") {
    max = 3;
  }
  if (min !== undefined) out.minimumFractionDigits = min;
  if (max !== undefined) out.maximumFractionDigits = max;
  if (opts.useGrouping !== undefined) out.useGrouping = opts.useGrouping;
  if (opts.notation) out.notation = opts.notation;
  return out;
}

const numberFormatCache = new Map<string, Intl.NumberFormat | null>();

// One Intl.NumberFormat per distinct (locale, options): formatters run per rendered cell, and
// constructing a NumberFormat is far costlier than formatting with one. Null when Intl refuses the
// options (unknown unit, min > max digits) — warned once, and the caller falls back.
function getNumberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat | null {
  const key = `${locale}|${JSON.stringify(options)}`;
  if (numberFormatCache.has(key)) return numberFormatCache.get(key)!;
  let nf: Intl.NumberFormat | null = null;
  try {
    nf = new Intl.NumberFormat(locale, options);
  } catch (err) {
    console.warn(`[grid] formatterOptions rejected by Intl.NumberFormat (${locale}, ${JSON.stringify(options)}): ${(err as Error).message}; showing the raw value.`);
  }
  numberFormatCache.set(key, nf);
  return nf;
}

const isNumeric = (value: unknown): value is number | bigint =>
  typeof value === "number" || typeof value === "bigint";

/**
 * The NUMBER column's default formatter: `Intl.NumberFormat` driven by the column's number
 * options (see {@link FormatterOptions}), or `String(value)` when it sets none. Null and undefined
 * are `""`; a non-number value (text in a number column) is shown as-is.
 */
export function numberFormatter(params: ValueFormatterParams): string {
  const { value } = params;
  if (value == null) return "";
  if (!params.col || !isNumeric(value)) return String(value);
  const opts = getOptsFromCol(params);
  const options = resolveNumberFormatOptions(ColumnType.NUMBER, opts);
  const nf = options ? getNumberFormat(opts.locale || "en-US", options) : null;
  return nf ? nf.format(value) : String(value);
}

export interface FormatterOptionsParams {
  col: any;
  row?: any;
}

function getOptsFromCol(params: ValueFormatterParams): FormatterOptions {
  let opts = params.col?.formatterOptions || {};
  if (typeof opts === "function") {
    opts = opts({ col: params.col, row: params.row }) || {};
  }
  return opts;
}

/** A column's `formatterOptions` for one row, the function form resolved — what its formatter reads. */
export function resolveFormatterOptions(col: Column, row?: IRowNode): FormatterOptions {
  return getOptsFromCol({ value: undefined, col, row });
}

/**
 * The CURRENCY column's default formatter: `currency` (default USD) in `locale` (default en-US),
 * plus any fraction-digit, grouping or notation options the column sets.
 */
export function currencyFormatter(params: ValueFormatterParams): string {
  const { value } = params;
  if (value == null) return "";
  const opts = params.col ? getOptsFromCol(params) : {};
  const locale = opts.locale || "en-US";
  if (isNumeric(value)) {
    const nf = getNumberFormat(locale, resolveNumberFormatOptions(ColumnType.CURRENCY, opts)!);
    return nf ? nf.format(value) : String(value);
  }
  // Text and other non-numbers keep their own toLocaleString, as before.
  return value.toLocaleString(locale, { style: "currency", currency: opts.currency || "USD" });
}

const DATE_FORMAT_DEFAULT = "YYYY-MM-DD";

const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

const buildDate = (year: number, month: number, day: number): Date | null => {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

/** The date column's own reading of a cell value: Date, epoch number, or any of the text forms below. */
export const parseDateInput = (value: Date | string | number): Date | null => {
  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    return isValidDate(date) ? date : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{8}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6));
    const day = Number(trimmed.slice(6, 8));
    const date = buildDate(year, month, day);
    if (date) return date;
    const monthAlt = Number(trimmed.slice(0, 2));
    const dayAlt = Number(trimmed.slice(2, 4));
    const yearAlt = Number(trimmed.slice(4, 8));
    return buildDate(yearAlt, monthAlt, dayAlt);
  }

  if (/^\d{10}$/.test(trimmed)) {
    const date = new Date(Number(trimmed) * 1000);
    return isValidDate(date) ? date : null;
  }

  if (/^\d{13}$/.test(trimmed)) {
    const date = new Date(Number(trimmed));
    return isValidDate(date) ? date : null;
  }

  const parts = trimmed.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (parts) {
    const left = Number(parts[1]);
    const middle = Number(parts[2]);
    const right = Number(parts[3]);

    if (parts[1].length === 4) {
      const date = buildDate(left, middle, right);
      if (date) return date;
    } else if (parts[3].length === 4) {
      if (left > 12 && middle <= 12) {
        const date = buildDate(right, middle, left);
        if (date) return date;
      } else if (middle > 12 && left <= 12) {
        const date = buildDate(right, left, middle);
        if (date) return date;
      } else {
        const date = buildDate(right, left, middle);
        if (date) return date;
      }
    }
  }

  const parsed = new Date(trimmed);
  return isValidDate(parsed) ? parsed : null;
};

// dateFormatter formats a date-like input according to the provided format string in opts.format.
// The format string can include the following tokens (case-insensitive):
// YYYY - 4-digit year
// YY   - 2-digit year
// MM   - zero-padded month (01-12)
// M    - month (1-12)
// DD   - zero-padded day of month (01-31)
// D    - day of month (1-31)
// MMM  - abbreviated month name (Jan, Feb, etc.)
// MMMM - full month name (January, February, etc.)
// If opts.format is not provided, defaults to 'YYYY-MM-DD'.
export function dateFormatter(params: ValueFormatterParams): string {
  const date = parseDateInput(params.value);
  if (!date) return "";

  const opts = params.col ? getOptsFromCol(params) : {};

  const format = opts.format || DATE_FORMAT_DEFAULT;
  const locale = opts.locale || "en-US";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const needsShortMonth = /MMM/.test(format) || /mmm/.test(format);
  const needsLongMonth = /MMMM/.test(format) || /mmmm/.test(format);
  const shortMonth = needsShortMonth
    ? new Intl.DateTimeFormat(locale, { month: "short" }).format(date)
    : "";
  const longMonth = needsLongMonth
    ? new Intl.DateTimeFormat(locale, { month: "long" }).format(date)
    : "";

  const tokens: Record<string, string> = {
    YYYY: String(year),
    yyyy: String(year),
    YY: String(year % 100).padStart(2, "0"),
    yy: String(year % 100).padStart(2, "0"),
    MMMM: longMonth,
    mmmm: longMonth,
    MMM: shortMonth,
    mmm: shortMonth,
    MM: String(month).padStart(2, "0"),
    mm: String(month).padStart(2, "0"),
    M: String(month),
    m: String(month),
    DD: String(day).padStart(2, "0"),
    dd: String(day).padStart(2, "0"),
    D: String(day),
    d: String(day),
  };

  return format.replace(/YYYY|yyyy|YY|yy|MMMM|mmmm|MMM|mmm|MM|mm|M|m|DD|dd|D|d/g, match => tokens[match]);
}

export function getFormatterByType(type: ColumnType): ((params: ValueFormatterParams) => string) | null {
  switch (type) {
    case "number":
      return numberFormatter;
    case "currency":
      return currencyFormatter;
    case "date":
      return dateFormatter;
    default:
      return null;
  }
}
