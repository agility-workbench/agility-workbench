import { afterEach, describe, expect, it, vi } from "vitest";
import { ColumnType } from "../interfaces/column";
import type { ColDef } from "../interfaces/column";
import type { IRowNode } from "../interfaces/iRowNode";
import { Column } from "./column";
import { FormatterOptions, getFormatterByType, numberFormatter, resolveNumberFormatOptions } from "./formatters";

const node = { data: {} } as IRowNode;
const make = (def: Partial<ColDef>) => new Column({ colId: "c", key: "c", label: "C", ...def } as ColDef);
// Intl separates with no-break / narrow no-break spaces in some locales; compare on plain spaces.
const show = (col: Column, value: unknown) => col.formatValue(value, node).replace(/\s/g, " ");
const num = (formatterOptions: FormatterOptions) => make({ type: ColumnType.NUMBER, formatterOptions });

afterEach(() => vi.restoreAllMocks());

describe("numberFormatter", () => {
  it("is the NUMBER column's default formatter", () => {
    expect(getFormatterByType(ColumnType.NUMBER)).toBe(numberFormatter);
    expect(make({ type: ColumnType.NUMBER }).valueFormatter).toBe(numberFormatter);
  });

  it("keeps String(value) when no number option is set — a locale alone does not opt in", () => {
    for (const col of [make({ type: ColumnType.NUMBER }), num({ locale: "de-DE" })]) {
      expect(show(col, 1234567.891)).toBe("1234567.891");
      expect(show(col, -0.5)).toBe("-0.5");
      expect(show(col, null)).toBe("");
      expect(show(col, undefined)).toBe("");
    }
    expect(resolveNumberFormatOptions(ColumnType.NUMBER, { locale: "de-DE" })).toBeNull();
  });

  it("shows non-number values as-is", () => {
    const col = num({ fractionDigits: 2 });
    expect(show(col, "n/a")).toBe("n/a");
    expect(show(col, "1234")).toBe("1234");
  });

  it.each([
    // [options, value, en-US, de-DE]
    [{ style: "decimal" }, 1234567.891, "1,234,567.891", "1.234.567,891"],
    [{ useGrouping: true }, 1234.5, "1,234.5", "1.234,5"],
    [{ fractionDigits: 2 }, 1234.5, "1,234.50", "1.234,50"],
    [{ fractionDigits: 2, useGrouping: false }, 1234.5, "1234.50", "1234,50"],
    [{ minimumFractionDigits: 1, maximumFractionDigits: 3 }, 2, "2.0", "2,0"],
    [{ minimumFractionDigits: 1, maximumFractionDigits: 3 }, 2.34567, "2.346", "2,346"],
    [{ fractionDigits: 2, maximumFractionDigits: 4 }, 1.23456, "1.2346", "1,2346"],
    [{ maximumFractionDigits: 0 }, 1234.5, "1,235", "1.235"],
    [{ style: "percent" }, 0.125, "12.5%", "12,5 %"],
    [{ style: "percent", fractionDigits: 1 }, -0.5, "-50.0%", "-50,0 %"],
    [{ unit: "kilogram" }, 12, "12 kg", "12 kg"],
    [{ style: "unit", unit: "kilogram", unitDisplay: "long", fractionDigits: 1 }, 1234.5,
      "1,234.5 kilograms", "1.234,5 Kilogramm"],
    [{ unit: "kilometer-per-hour", unitDisplay: "narrow" }, 80, "80km/h", "80 km/h"],
    [{ notation: "compact" }, 1234567, "1.2M", "1,2 Mio."],
  ] as Array<[FormatterOptions, number, string, string]>)("%j formats %d per locale", (opts, value, en, de) => {
    expect(show(num(opts), value)).toBe(en);
    expect(show(num({ ...opts, locale: "en-US" }), value)).toBe(en);
    expect(show(num({ ...opts, locale: "de-DE" }), value)).toBe(de);
  });

  it("reads per-row options from a formatterOptions function", () => {
    const col = make({
      type: ColumnType.NUMBER,
      formatterOptions: ({ row }) => (row?.data?.pct ? { style: "percent" } : { fractionDigits: 2 }),
    });
    expect(col.formatValue(0.25, { data: { pct: true } } as IRowNode)).toBe("25%");
    expect(col.formatValue(0.25, { data: { pct: false } } as IRowNode)).toBe("0.25");
  });

  it("falls back to String(value), warning once, when Intl refuses the options", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const col = num({ unit: "not-a-unit" });
    expect(show(col, 5)).toBe("5");
    expect(show(col, 6)).toBe("6");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("currencyFormatter", () => {
  it("keeps its output for the existing options", () => {
    expect(show(make({ type: ColumnType.CURRENCY }), 1234.5)).toBe("$1,234.50");
    expect(show(make({ type: ColumnType.CURRENCY }), null)).toBe("");
    expect(show(make({ type: ColumnType.CURRENCY, formatterOptions: { locale: "de-DE", currency: "EUR" } }), -1234.5))
      .toBe("-1.234,50 €");
    expect(show(make({ type: ColumnType.CURRENCY, formatterOptions: { currency: "JPY" } }), 1234)).toBe("¥1,234");
  });

  it("shares the fraction-digit and grouping options", () => {
    const col = make({ type: ColumnType.CURRENCY, formatterOptions: { fractionDigits: 0, useGrouping: false } });
    expect(show(col, 1234.5)).toBe("$1235");
    const precise = make({ type: ColumnType.CURRENCY, formatterOptions: { maximumFractionDigits: 4 } });
    expect(show(precise, 0.12345)).toBe("$0.1235");
    expect(show(precise, 1)).toBe("$1.00");
  });
});
