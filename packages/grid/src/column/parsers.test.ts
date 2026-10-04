import { describe, expect, it } from "vitest";
import { ColumnType } from "../interfaces/column";
import { REJECT } from "../interfaces/gridOptions";
import { parseBooleanText, parseDateText, parseIsoDate, parseNumberText, parseTextByType } from "./parsers";

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
