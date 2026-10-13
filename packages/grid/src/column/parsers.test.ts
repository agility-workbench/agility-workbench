import { describe, expect, it } from "vitest";
import { ColumnType } from "../interfaces/column";
import { REJECT } from "../interfaces/gridOptions";
import type { IRowNode } from "../interfaces/iRowNode";
import type { ColDef } from "../interfaces/column";
import { Column } from "./column";
import {
  parseBooleanText, parseDateText, parseFormattedDate, parseIsoDate, parseLocaleNumber, parseNumberText, parseTextByType,
} from "./parsers";

describe("parseNumberText", () => {
  it("accepts what Number() accepts, trimmed, and blank is null", () => {
    expect(parseNumberText("42")).toBe(42);
    expect(parseNumberText(" -1.5 ")).toBe(-1.5);
    expect(parseNumberText("1e3")).toBe(1000);
    expect(parseNumberText("")).toBeNull();
    expect(parseNumberText("   ")).toBeNull();
  });

  it("refuses text that is not a finite number", () => {
    expect(parseNumberText("abc")).toBe(REJECT);
    expect(parseNumberText("1,234")).toBe(REJECT);
    expect(parseNumberText("$5")).toBe(REJECT);
    expect(parseNumberText("Infinity")).toBe(REJECT);
  });
});

describe("parseBooleanText", () => {
  it("reads the usual spellings, case-insensitively", () => {
    expect(["true", "YES", "y", "1"].map(parseBooleanText)).toEqual([true, true, true, true]);
    expect(["false", "No", "n", "0"].map(parseBooleanText)).toEqual([false, false, false, false]);
    expect(parseBooleanText("")).toBeNull();
    expect(parseBooleanText("maybe")).toBe(REJECT);
  });
});

describe("parseIsoDate", () => {
  it("builds a date-only or zone-less date-time in local time", () => {
    expect(parseIsoDate("2026-01-02")).toEqual(new Date(2026, 0, 2));
    expect(parseIsoDate("2026-01-02T09:30")).toEqual(new Date(2026, 0, 2, 9, 30));
    expect(parseIsoDate("2026-01-02 09:30:15.5")).toEqual(new Date(2026, 0, 2, 9, 30, 15, 500));
  });

  it("leaves a zoned date-time to the platform", () => {
    expect(parseIsoDate("2026-01-02T00:00:00Z")?.getTime()).toBe(Date.UTC(2026, 0, 2));
    expect(parseIsoDate("2026-01-02T01:00+01:00")?.getTime()).toBe(Date.UTC(2026, 0, 2));
  });

  it("refuses anything that is not ISO 8601, and impossible dates", () => {
    expect(parseIsoDate("10")).toBeNull();
    expect(parseIsoDate("01/02/2026")).toBeNull();
    expect(parseIsoDate("Fri Jan 02 2026")).toBeNull();
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-01-02T24:00")).toBeNull();
  });
});

describe("parseDateText", () => {
  it("keeps the cell's stored shape", () => {
    expect(parseDateText("2026-03-04", new Date(2026, 0, 1))).toEqual(new Date(2026, 2, 4));
    expect(parseDateText("2026-03-04", null)).toEqual(new Date(2026, 2, 4));
    expect(parseDateText("2026-03-04T10:00", "2026-01-01")).toBe("2026-03-04");
    expect(parseDateText("2026-03-04", Date.UTC(2026, 0, 1))).toBe(new Date(2026, 2, 4).getTime());
  });

  it("blank is null and non-dates are refused", () => {
    expect(parseDateText("", new Date())).toBeNull();
    expect(parseDateText("10", new Date())).toBe(REJECT);
  });
});

describe("parseTextByType", () => {
  it("dispatches on the column type and leaves strings alone", () => {
    expect(parseTextByType(ColumnType.NUMBER, "7", null)).toBe(7);
    expect(parseTextByType(ColumnType.CURRENCY, "7.25", null)).toBe(7.25);
    expect(parseTextByType(ColumnType.DATE, "2026-01-02", null)).toEqual(new Date(2026, 0, 2));
    expect(parseTextByType(ColumnType.BOOLEAN, "yes", null)).toBe(true);
    expect(parseTextByType(ColumnType.STRING, " 7 ", null)).toBe(" 7 ");
    expect(parseTextByType(ColumnType.NUMBER, "seven", null)).toBe(REJECT);
  });
});

// Copy writes a cell's formatted text; paste parses it back through the same column. These pin
// that the built-in parsers read what the grid's own formatters write (finding A10).
describe("built-in parsers read back the column's own formatted text", () => {
  const node = { data: {} } as IRowNode;
  const make = (def: Partial<ColDef>) => new Column({ colId: "c", key: "c", label: "C", editable: true, ...def } as ColDef);
  const roundTrip = (col: Column, value: unknown) => col.parseValue(col.formatValue(value, node), node, value);

  it("en-US currency: parse(format(v)) is v", () => {
    const col = make({ type: ColumnType.CURRENCY });
    for (const v of [0, 5, 1234, 1234.5, -1234.56, 1234567.89, 0.99, -0.01]) {
      expect(roundTrip(col, v)).toBe(v);
    }
    expect(col.formatValue(1234, node)).toBe("$1,234.00");
    expect(col.parseValue("$1,234.00", node, 0)).toBe(1234);
    expect(col.parseValue("($1,234.50)", node, 0)).toBe(-1234.5);
    expect(col.parseValue("USD 12", node, 0)).toBe(12);
    // Plain Number() text still lands; misplaced grouping and foreign currencies do not.
    expect(col.parseValue("1234.5", node, 0)).toBe(1234.5);
    expect(col.parseValue("1,23", node, 0)).toBe(REJECT);
    expect(col.parseValue("€5", node, 0)).toBe(REJECT);
  });

  it("de-DE EUR currency round-trips, including negatives", () => {
    const col = make({ type: ColumnType.CURRENCY, formatterOptions: { locale: "de-DE", currency: "EUR" } });
    for (const v of [0, 1234, 1234.5, -1234.56, 1234567.89]) {
      expect(roundTrip(col, v)).toBe(v);
    }
  });

  it("de-DE number: the locale's separators, never en-US's", () => {
    const de = new Intl.NumberFormat("de-DE");
    const col = make({
      type: ColumnType.NUMBER,
      formatterOptions: { locale: "de-DE" },
      valueFormatter: ({ value }) => (value == null ? "" : de.format(value)),
    });
    for (const v of [0, 1.234, 1234, 1234.5, -9876543.21]) {
      expect(roundTrip(col, v)).toBe(v);
    }
    expect(col.parseValue("1.234,5", node, 0)).toBe(1234.5);
    expect(col.parseValue("1,234", node, 0)).toBe(1.234);
    // "1.234" is 1234 here: the formatter renders 1234 that way, not 1.234.
    expect(col.parseValue("1.234", node, 0)).toBe(1234);
  });

  it("de-DE number without a formatter displays String(v), and that reads back too", () => {
    const col = make({ type: ColumnType.NUMBER, formatterOptions: { locale: "de-DE" } });
    for (const v of [1.234, 1234.5, -3]) expect(roundTrip(col, v)).toBe(v);
    expect(col.parseValue("1,234", node, 0)).toBe(1.234);
  });

  it("a number column with no locale keeps the plain Number() contract", () => {
    const col = make({ type: ColumnType.NUMBER });
    expect(col.parseValue("1,234", node, 0)).toBe(REJECT);
    expect(col.parseValue("1234.5", node, 0)).toBe(1234.5);
  });

  it("dd/MM/yyyy date column round-trips Date, epoch and ISO-text cells", () => {
    const col = make({ type: ColumnType.DATE, formatterOptions: { format: "dd/MM/yyyy" } });
    const date = new Date(2026, 0, 31);
    expect(col.formatValue(date, node)).toBe("31/01/2026");
    expect(roundTrip(col, date)).toEqual(date);
    expect(roundTrip(col, date.getTime())).toBe(date.getTime());
    expect(roundTrip(col, "2026-01-31")).toBe("2026-01-31");
    expect(roundTrip(col, new Date(1999, 11, 5))).toEqual(new Date(1999, 11, 5));
    // The column's own order only: 01/31 is no day of a dd/MM column; ISO still works.
    expect(col.parseValue("01/31/2026", node, date)).toBe(REJECT);
    expect(col.parseValue("2026-02-01", node, date)).toEqual(new Date(2026, 1, 1));
  });

  it("month-name date formats round-trip in their locale", () => {
    const en = make({ type: ColumnType.DATE, formatterOptions: { format: "MMM D, YYYY" } });
    const fr = make({ type: ColumnType.DATE, formatterOptions: { format: "D MMMM YYYY", locale: "fr-FR" } });
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 9);
      expect(roundTrip(en, d)).toEqual(d);
      expect(roundTrip(fr, d)).toEqual(d);
    }
    expect(en.parseValue("feb 30, 2026", node, null)).toBe(REJECT);
  });
});

describe("parseLocaleNumber", () => {
  it("handles space grouping, native digits and a trailing currency mark", () => {
    expect(parseLocaleNumber(new Intl.NumberFormat("fr-FR").format(1234567.5), "fr-FR")).toBe(1234567.5);
    expect(parseLocaleNumber(new Intl.NumberFormat("ar-EG").format(-1234.5), "ar-EG")).toBe(-1234.5);
    expect(parseLocaleNumber(new Intl.NumberFormat("en-IN").format(1234567), "en-IN")).toBe(1234567);
    expect(parseLocaleNumber("abc", "en-US")).toBeNull();
  });
});

describe("parseFormattedDate", () => {
  it("reads two-digit years into 1950-2049 and refuses impossible dates", () => {
    expect(parseFormattedDate("05/03/26", "DD/MM/YY")).toEqual(new Date(2026, 2, 5));
    expect(parseFormattedDate("05/03/71", "DD/MM/YY")).toEqual(new Date(1971, 2, 5));
    expect(parseFormattedDate("31/02/2026", "DD/MM/YYYY")).toBeNull();
    expect(parseFormattedDate("2026/01/31", "DD/MM/YYYY")).toBeNull();
  });
});
