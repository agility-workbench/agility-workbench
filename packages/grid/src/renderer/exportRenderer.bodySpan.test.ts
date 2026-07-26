/**
 * End-to-end: a grid configured with a ColDef.colSpan / groupDisplayType:"groupRows" exports .xlsx
 * with the matching body cell merges — proving the ExportRenderer forwards the grid's spanning to
 * the exporter (not just that export.ts can merge when handed resolvers).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import ExcelJS from "exceljs";
import { GridCore } from "../core/core";
import { ExportRenderer } from "./exportRenderer";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", region: "EMEA", category: "Services", rep: "Ava", units: 10 },
  { id: "2", region: "EMEA", category: "Hardware", rep: "Bo", units: 20 },
  { id: "3", region: "APAC", category: "Services", rep: "Cy", units: 30 },
];

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    // Category spans across Sales Rep on "Services" rows (same demo rule).
    {
      colId: "category", key: "category", label: "Category", type: ColumnType.STRING,
      colSpan: (p: any) => (p.value === "Services" ? 2 : 1),
    },
    { colId: "rep", key: "rep", label: "Sales Rep", type: ColumnType.STRING },
    { colId: "units", key: "units", label: "Units", type: ColumnType.NUMBER },
  ]);
  return core;
}

function makeExporter(core: GridCore) {
  return new ExportRenderer({
    core,
    leafColumns: () => core.getColumnModel().getLeaves().filter(c => !c.isInternal()),
    columnWidths: () => new Map(),
    selectionRange: () => core.getSelectionRange(),
    selectedColumnIDs: () => core.getSelectedColumnIds(),
  });
}

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

async function waitForXlsx(): Promise<ExcelJS.Worksheet> {
  for (let i = 0; i < 100 && captured == null; i++) await new Promise(r => setTimeout(r, 5));
  if (captured == null) throw new Error("no xlsx produced");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(captured) as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

describe("ColDef.colSpan → export merges (end-to-end)", () => {
  it("merges Category across Sales Rep on Services rows only", async () => {
    const core = makeGrid();
    makeExporter(core).exportExcel({ scope: "all" });
    const ws = await waitForXlsx();
    const merges: string[] = (ws as any).model?.merges ?? [];
    // Columns: A=Region B=Category C=SalesRep D=Units. Header row 1; data rows 2-4 in row order.
    // Row 2 (EMEA/Services) and row 4 (APAC/Services) merge B:C; row 3 (Hardware) does not.
    expect(merges).toContain("B2:C2");
    expect(merges).toContain("B4:C4");
    expect(merges.some(m => m.startsWith("B3"))).toBe(false);
    expect(ws.getCell("B2").value).toBe("Services");
  });
});

describe("groupDisplayType 'groupRows' → full-width merges (end-to-end)", () => {
  it("emits a full-row merge for each group header row", async () => {
    const core = makeGrid({ groupDisplayType: "groupRows", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    makeExporter(core).exportExcel({ scope: "all" });
    const ws = await waitForXlsx();
    const merges: string[] = (ws as any).model?.merges ?? [];
    // Group header rows (summary-above) should each merge across all exported columns (A:D).
    const fullRowMerges = merges.filter(m => /^A\d+:D\d+$/.test(m));
    expect(fullRowMerges.length).toBeGreaterThanOrEqual(2); // EMEA + APAC group headers
  });
});
