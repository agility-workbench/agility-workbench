/**
 * Date cells in CSV are written on the LOCAL calendar (finding A2.2): the formatted path (the
 * column's date format) and the unformatted fallback (a formatter that leaves the value as-is)
 * agree on the displayed day. `toISOString` used to move a local-midnight date to the previous day
 * east of Greenwich (UTC+5:30: 2026-03-01 → 2026-02-28T18:30:00.000Z).
 *
 * The Dates are built from local components and the expectations from local getters, so these
 * hold in any time zone; run with TZ=Asia/Kolkata or TZ=America/Los_Angeles to see the old shift.
 */
import { describe, expect, it } from "vitest";
import { Column } from "../column/column";
import { ColDef, ColumnType } from "../interfaces/column";
import { buildCSV, ExportConfig } from "./export";

const col = (def: ColDef) => new Column(def);
const csvBody = (config: ExportConfig) => buildCSV({ ...config, includeHeaders: false }).split("\n");

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

describe("CSV date cells use the local calendar date", () => {
  const midnight = new Date(2026, 2, 1); // 2026-03-01, local midnight

  it("formatted path: the default date format writes the local day", () => {
    const rows = csvBody({
      columns: [col({ key: "when", label: "When", type: ColumnType.DATE })],
      rows: [{ when: midnight }],
    });
    expect(rows).toEqual([localDay(midnight)]);
    expect(rows[0]).toBe("2026-03-01");
  });

  it("formatted path: a column format is honoured", () => {
    const rows = csvBody({
      columns: [col({ key: "when", label: "When", type: ColumnType.DATE, formatterOptions: { format: "DD/MM/YYYY" } } as ColDef)],
      rows: [{ when: midnight }],
    });
    expect(rows).toEqual(["01/03/2026"]);
  });

  it("unformatted path: a Date the formatter leaves as-is is written as the local YYYY-MM-DD", () => {
    const rows = csvBody({
      columns: [col({ key: "when", label: "When", type: ColumnType.DATE, valueFormatter: ({ value }) => String(value ?? "") })],
      rows: [{ when: midnight }, { when: midnight.getTime() }],
    });
    expect(rows).toEqual(["2026-03-01", "2026-03-01"]);
  });

  it("unformatted path: date-only text stays the same day (no UTC time appended)", () => {
    const rows = csvBody({
      columns: [col({ key: "when", label: "When", type: ColumnType.DATE })],
      rows: [{ when: "2026-03-01" }],
    });
    expect(rows).toEqual(["2026-03-01"]);
  });

  it("a value with a time of day keeps it, on the local clock and without a zone", () => {
    const at = new Date(2026, 2, 1, 9, 5, 7);
    const rows = csvBody({
      columns: [col({ key: "when", label: "When", type: ColumnType.DATE, valueFormatter: ({ value }) => String(value ?? "") })],
      rows: [{ when: at }],
    });
    expect(rows).toEqual(["2026-03-01T09:05:07"]);
  });

  it("an unreadable date value falls through as its text", () => {
    const rows = csvBody({
      columns: [col({ key: "when", label: "When", type: ColumnType.DATE, valueFormatter: ({ value }) => String(value ?? "") })],
      rows: [{ when: "not a date" }],
    });
    expect(rows).toEqual(["not a date"]);
  });
});
