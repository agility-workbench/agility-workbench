import { l } from "node_modules/vite/dist/node/types.d-aGj9QkWt";
import { ColumnType } from "./types";
import { RowNode } from "./row_model/node";
import { Column } from "./column/Column";

export interface ValueFormatterParams {
  value: any;
  row?: RowNode;
  col?: Column;
}

export interface FormatterOptions {
  currency?: string;
  locale?: string;
  format?: string;
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

export function currencyFormatter(params: ValueFormatterParams): string {
  const opts = params.col ? getOptsFromCol(params) : {};
  return params.value ? params.value.toLocaleString(opts.locale || "en-US", {
    style: "currency",
    currency: opts.currency || "USD",
  }) : '';
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

const parseDateInput = (value: Date | string | number): Date | null => {
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
    case "currency":
      return currencyFormatter;
    case "date":
      return dateFormatter;
    default:
      return null;
  }
}
