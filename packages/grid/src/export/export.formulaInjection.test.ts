/**
 * CSV formula-injection guard (finding A12). A spreadsheet that opens a CSV evaluates a text cell
 * starting with =, +, -, @, tab or CR as a formula, so such text is written with a leading single
 * quote. Numeric cells are written as numbers and left alone. The Excel export needs no guard: data
 * strings are written as inline-string cells (never formulas); only the exporter's own aggregate
 * formulas are formula cells.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import ExcelJS from "exceljs";
import { Column } from "../column/column";
import { ColDef, ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";
import { buildCSV, exportExcel, ExportConfig } from "./export";

const col = (def: ColDef) => new Column(def);

const csvBody = (config: ExportConfig) => buildCSV({ ...config, includeHeaders: false }).split("\n");

describe("CSV formula-injection guard", () => {
  it("prefixes a text cell that would be read as a formula", () => {
    const rows = csvBody({
      columns: [col({ key: "s", label: "S", type: ColumnType.STRING })],
      rows: [
        { s: "=1+1" },
        { s: "+1" },
        { s: "-abc" },
        { s: "@SUM(A1)" },
        { s: "\t=1" },
        { s: "\r=1" },
        { s: "a=1" },
        { s: "plain" },
      ],
    });
    expect(rows).toEqual([
      "'=1+1",
      "'+1",
      "'-abc",
      "'@SUM(A1)",
      "'\t=1",
      // CR forces CSV quoting; the guard is inside the quotes.
      "\"'\r=1\"",
      "a=1",
      "plain",
    ]);
  });

  it("guards and quotes together when the payload also needs CSV quoting", () => {
    const rows = csvBody({
      columns: [col({ key: "s", label: "S" })],
      rows: [{ s: '=HYPERLINK("http://x","y")' }],
    });
    expect(rows).toEqual([`"'=HYPERLINK(""http://x"",""y"")"`]);
  });

  it("leaves numbers alone: -5 in a NUMBER column, and a numeric raw in any column", () => {
    const rows = csvBody({
      columns: [
        col({ key: "n", label: "N", type: ColumnType.NUMBER }),
        col({ key: "ns", label: "NS", type: ColumnType.NUMBER }),
        col({ key: "any", label: "Any" }),
      ],
      rows: [{ n: -5, ns: "-7", any: -3 }],
    });
    expect(rows).toEqual(["-5,-7,-3"]);
  });

  it("guards a numeric-looking string in a text column (it is written as text)", () => {
    const rows = csvBody({
      columns: [col({ key: "s", label: "S", type: ColumnType.STRING })],
      rows: [{ s: "-5" }],
    });
    expect(rows).toEqual(["'-5"]);
  });

  it("guards formatted output and header labels too", () => {
    const csv = buildCSV({
      columns: [
        col({ key: "a", label: "=cmd", valueFormatter: ({ value }) => `=${value}` }),
        col({ key: "b", label: "Plain, with comma" }),
      ],
      rows: [{ a: "x", b: "y" }],
    });
    expect(csv.split("\n")).toEqual(["'=cmd,\"Plain, with comma\"", "'=x,y"]);
  });

  it("guards a full-width row's text", () => {
    const rows = csvBody({
      columns: [col({ key: "a", label: "A" }), col({ key: "b", label: "B" })],
      rows: [{ a: 1 }],
      isFullWidthRow: () => true,
      fullWidthText: () => "-group",
    });
    expect(rows).toEqual(["'-group,"]);
  });
});

describe("Excel export needs no formula guard", () => {
  let captured: Uint8Array | null = null;

  beforeEach(() => {
    captured = null;
    (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock");
    (globalThis as any).URL.revokeObjectURL = vi.fn();
    (globalThis as any).document = {
      createElement: () => ({ set href(_v: string) {}, set download(_v: string) {}, click() {} }),
    };
    const RealBlob = globalThis.Blob;
    vi.spyOn(globalThis, "Blob").mockImplementation((...args: any[]) => {
      const part = ((args[0] ?? []) as Array<ArrayBuffer | Uint8Array>)[0];
      captured = part instanceof Uint8Array ? part : new Uint8Array(part as ArrayBuffer);
      return new RealBlob(args[0] ?? []);
    });
  });

  it("writes a formula-looking string as literal text while its own aggregate formulas stay formulas", async () => {
    const n = col({ key: "n", label: "N", type: ColumnType.NUMBER });
    await exportExcel({
      columns: [col({ key: "s", label: "S", type: ColumnType.STRING }), n],
      rows: [{ s: "=1+1", n: 2 }, { s: "-abc", n: 3 }],
      aggregates: [{ key: n.instanceID, type: AggregateType.SUM }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(captured!) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    // Unmodified literal strings, no quote prefix, no formula.
    expect(ws.getCell("A2").value).toBe("=1+1");
    expect(ws.getCell("A3").value).toBe("-abc");
    const footer = ws.getCell("B4").value as any;
    expect(footer?.formula ?? footer?.sharedFormula).toMatch(/SUM|SUBTOTAL/);
  });
});
