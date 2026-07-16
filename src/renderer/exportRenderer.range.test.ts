/**
 * Regression: an ungrouped range-selection export must include the FIRST selected row.
 *
 * The bug was a double row-slice — the ExportRenderer pre-sliced rows to the selection AND passed
 * `selectionRange`, so export.ts's resolveRows sliced the already-sliced array again by
 * `range.rowStart`, dropping the first selected row(s). The fix passes the full view rows (view-
 * index aligned) and lets export.ts do the single authoritative row+column slice.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import ExcelJS from "exceljs";
import { GridCore } from "../core/core";
import { ExportRenderer } from "./exportRenderer";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", name: "Alice", qty: 10 },
  { id: "2", name: "Bob", qty: 20 },
  { id: "3", name: "Carol", qty: 30 },
  { id: "4", name: "Dave", qty: 40 },
];

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER },
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
let capturedCsv: string | null = null;

beforeEach(() => {
  captured = null;
  capturedCsv = null;
  (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock");
  (globalThis as any).URL.revokeObjectURL = vi.fn();
  (globalThis as any).document = {
    createElement: () => ({ set href(_v: string) {}, set download(_v: string) {}, click() {} }),
  };
  const RealBlob = globalThis.Blob;
  vi.spyOn(globalThis, "Blob").mockImplementation((...args: any[]) => {
    const part = (args[0] ?? [])[0];
    if (typeof part === "string") capturedCsv = part;
    else if (part instanceof Uint8Array) captured = part;
    else if (part) captured = new Uint8Array(part as ArrayBuffer);
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

async function waitForCsv(): Promise<string> {
  for (let i = 0; i < 100 && capturedCsv == null; i++) await new Promise(r => setTimeout(r, 5));
  if (capturedCsv == null) throw new Error("no csv produced");
  return capturedCsv;
}

// Select a rectangular range spanning view rows [rowStart..rowEnd], all columns.
function selectRange(core: GridCore, rowStart: number, rowEnd: number) {
  core.dispatch({ type: "rangeSelectSet", viewIdx: rowStart, colIdx: 0, mode: "start" });
  core.dispatch({ type: "rangeSelectSet", viewIdx: rowEnd, colIdx: 1, mode: "extend" });
}

describe("ungrouped range-selection export includes the first selected row", () => {
  it("CSV keeps the first selected row (range starting at index 1)", async () => {
    const core = makeGrid();
    selectRange(core, 1, 3); // Bob, Carol, Dave
    makeExporter(core).exportCSV({ scope: "selection" });
    const csv = await waitForCsv();
    const lines = csv.split("\n");
    // Header + 3 data rows; first data row must be Bob (not skipped).
    expect(lines[0]).toBe("Name,Qty");
    expect(lines[1]).toBe("Bob,20");
    expect(lines).toContain("Carol,30");
    expect(lines).toContain("Dave,40");
    expect(lines.length).toBe(4);
  });

  it("Excel keeps the first selected row", async () => {
    const core = makeGrid();
    selectRange(core, 1, 3);
    makeExporter(core).exportExcel({ scope: "selection" });
    const ws = await waitForXlsx();
    // Row 1 header, rows 2-4 data. B-column values are the selected qtys.
    const names: string[] = [];
    for (let r = 2; r <= ws.rowCount; r++) names.push(String(ws.getRow(r).getCell(1).value ?? ""));
    expect(names).toEqual(["Bob", "Carol", "Dave"]);
  });

  it("honors the column span of the range too (single column)", async () => {
    const core = makeGrid();
    // Rows 0..1, only column 1 (Qty).
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 1, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 1, mode: "extend" });
    makeExporter(core).exportCSV({ scope: "selection" });
    const csv = await waitForCsv();
    expect(csv.split("\n")).toEqual(["Qty", "10", "20"]);
  });
});
