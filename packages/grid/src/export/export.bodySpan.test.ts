/**
 * Body-level colSpan and full-width rows in exports: the .xlsx should reproduce the grid's merged
 * cells, and CSV (which has no merge concept) should mirror the visible content (spanning value in
 * the start column, covered columns blank).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import ExcelJS from "exceljs";
import { Column } from "../column/column";
import { ColDef, ColumnType } from "../interfaces/column";
import { buildCSV, exportExcel, ExportConfig } from "./export";

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
    const part = (args[0] ?? [])[0];
    captured = part instanceof Uint8Array ? part : part ? new Uint8Array(part as ArrayBuffer) : null;
    return new RealBlob(args[0] ?? []);
  });
});

function col(def: ColDef): Column {
  return new Column(def);
}

async function readBack(bytes: Uint8Array): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

async function runExcel(config: ExportConfig): Promise<ExcelJS.Worksheet> {
  await exportExcel(config);
  if (!captured) throw new Error("no xlsx produced");
  return readBack(captured);
}

const A = col({ colId: "a", key: "a", label: "A", type: ColumnType.STRING });
const B = col({ colId: "b", key: "b", label: "B", type: ColumnType.STRING });
const C = col({ colId: "c", key: "c", label: "C", type: ColumnType.STRING });

describe("colSpan → Excel cell merges", () => {
  it("merges the spanning cell across covered columns and leaves covered cells empty", async () => {
    const config: ExportConfig = {
      columns: [A, B, C],
      rows: [
        { a: "span", b: "b1", c: "c1" }, // A spans 2 → merge A2:B2
        { a: "x", b: "b2", c: "c2" },     // no span
      ],
      getCellColSpan: (row, c) => (c.colId === "a" && row.a === "span" ? 2 : 1),
    };
    const ws = await runExcel(config);
    // Header row 1, data rows 2-3. (exceljs reports a merge's covered cells as the anchor value, so
    // assert the anchor + the merge range, not covered-cell emptiness.)
    expect(ws.getCell("A2").value).toBe("span");
    expect(ws.getCell("C2").value).toBe("c1");
    // Row 3 unspanned — its own per-column values.
    expect(ws.getCell("A3").value).toBe("x");
    expect(ws.getCell("B3").value).toBe("b2");

    const merges: string[] = (ws as any).model?.merges ?? [];
    expect(merges).toContain("A2:B2");
    expect(merges.some(m => m.startsWith("A3"))).toBe(false);
  });

  it("clamps a span to the exported columns (never past the last column)", async () => {
    const config: ExportConfig = {
      columns: [A, B, C],
      rows: [{ a: "a1", b: "b1", c: "c1" }],
      getCellColSpan: (_row, c) => (c.colId === "c" ? 5 : 1), // C is last → clamps to 1
    };
    const ws = await runExcel(config);
    const merges: string[] = (ws as any).model?.merges ?? [];
    expect(merges.filter(m => /[A-C]2/.test(m)).length).toBe(0);
    expect(ws.getCell("C2").value).toBe("c1");
  });
});

describe("full-width rows → Excel merge across all columns", () => {
  it("puts the text in column 0 and merges across every column", async () => {
    const config: ExportConfig = {
      columns: [A, B, C],
      rows: [
        { a: "a1", b: "b1", c: "c1" },
        { section: "Totals", full: true },
        { a: "a2", b: "b2", c: "c2" },
      ],
      isFullWidthRow: (row) => !!row.full,
      fullWidthText: (row) => String(row.section ?? ""),
    };
    const ws = await runExcel(config);
    // Row 3 is the full-width row (header=1, data starts row 2). exceljs reports covered cells as the
    // anchor value, so assert the anchor text + the full-row merge.
    expect(ws.getCell("A3").value).toBe("Totals");
    const merges: string[] = (ws as any).model?.merges ?? [];
    expect(merges).toContain("A3:C3");
    // Surrounding data rows are untouched.
    expect(ws.getCell("A2").value).toBe("a1");
    expect(ws.getCell("B4").value).toBe("b2");
  });
});

describe("CSV mirrors visible content (no merges)", () => {
  it("blanks covered columns for a colSpan and full-width rows", () => {
    const config: ExportConfig = {
      columns: [A, B, C],
      rows: [
        { a: "span", b: "b1", c: "c1" },
        { section: "Totals", full: true },
        { a: "x", b: "b2", c: "c2" },
      ],
      getCellColSpan: (row, c) => (c.colId === "a" && row.a === "span" ? 2 : 1),
      isFullWidthRow: (row) => !!row.full,
      fullWidthText: (row) => String(row.section ?? ""),
    };
    const csv = buildCSV(config);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("A,B,C");
    expect(lines[1]).toBe("span,,c1");  // B blanked by the span
    expect(lines[2]).toBe("Totals,,");  // full-width: value in col 0, rest blank
    expect(lines[3]).toBe("x,b2,c2");
  });
});
