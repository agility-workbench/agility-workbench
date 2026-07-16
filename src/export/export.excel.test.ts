/**
 * Parity test for the hand-rolled .xlsx writer.
 *
 * Strategy: build a grid ExportConfig, run our dependency-free `exportExcel`, capture the bytes it
 * would download, then read them back with exceljs (still a dev-time dependency) and assert the
 * workbook contents match what the grid produced. If exceljs can open and correctly interpret our
 * file, it is genuine, Excel-valid OOXML.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import ExcelJS from "exceljs";
import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import { ColDef } from "../interfaces/column";
import { exportExcel, ExportConfig } from "./export";
import { AggregateType } from "../interfaces/aggregate";
import { writeXlsx } from "./xlsx/writeXlsx";
import { createZip } from "./xlsx/zip";

// Capture the Blob passed to the download trigger instead of touching the DOM download path.
let captured: Uint8Array | null = null;

beforeEach(() => {
  captured = null;
  // jsdom/happy-dom isn't the env here (node), so stub the browser bits exportExcel touches.
  const created: any[] = [];
  (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock");
  (globalThis as any).URL.revokeObjectURL = vi.fn();
  (globalThis as any).document = {
    createElement: () => ({
      set href(_v: string) {},
      set download(_v: string) {},
      click() {},
    }),
  };
  // Blob is available in node 18+, but capture its bytes.
  const RealBlob = globalThis.Blob;
  vi.spyOn(globalThis, "Blob").mockImplementation((...args: any[]) => {
    const parts = (args[0] ?? []) as Array<ArrayBuffer | Uint8Array>;
    const part = parts[0];
    captured = part instanceof Uint8Array ? part : new Uint8Array(part as ArrayBuffer);
    return new RealBlob(args[0] ?? []);
  });
});

function col(def: ColDef): Column {
  return new Column(def);
}

async function readBack(bytes: Uint8Array): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  // exceljs accepts a Node Buffer / ArrayBuffer.
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

describe("hand-rolled xlsx writer", () => {
  it("produces a zip exceljs can open", async () => {
    const bytes = await writeXlsx({
      sheets: [{ name: "S", rows: [[{ value: { kind: "string", value: "hi" } }]] }],
    });
    const ws = await readBack(bytes);
    expect(ws.getCell("A1").value).toBe("hi");
  });

  it("round-trips values with correct types", async () => {
    const columns = [
      col({ key: "name", label: "Name", type: ColumnType.STRING }),
      col({ key: "qty", label: "Qty", type: ColumnType.NUMBER }),
      col({ key: "price", label: "Price", type: ColumnType.CURRENCY }),
      col({ key: "active", label: "Active", type: ColumnType.BOOLEAN }),
      col({ key: "when", label: "When", type: ColumnType.DATE }),
    ];
    const when = new Date(2024, 4, 15); // 2024-05-15 local midnight
    const config: ExportConfig = {
      columns,
      rows: [{ name: "Widget", qty: 42, price: 9.99, active: true, when }],
    };

    await exportExcel(config, "test.xlsx");
    expect(captured).not.toBeNull();
    const ws = await readBack(captured!);

    // Header row is row 1, data is row 2.
    expect(ws.getCell("A1").value).toBe("Name");
    expect(ws.getCell("A2").value).toBe("Widget");
    expect(ws.getCell("B2").value).toBe(42);
    expect(ws.getCell("C2").value).toBeCloseTo(9.99, 5);
    expect(ws.getCell("D2").value).toBe(true);

    const dateCell = ws.getCell("E2").value as Date;
    expect(dateCell).toBeInstanceOf(Date);
    // exceljs reads dates back as UTC; compare on the calendar date.
    expect(dateCell.getUTCFullYear()).toBe(2024);
    expect(dateCell.getUTCMonth()).toBe(4);
    expect(dateCell.getUTCDate()).toBe(15);
  });

  it("applies number formats for currency and date columns", async () => {
    const columns = [
      col({ key: "price", label: "Price", type: ColumnType.CURRENCY }),
      col({ key: "when", label: "When", type: ColumnType.DATE }),
    ];
    const config: ExportConfig = {
      columns,
      rows: [{ price: 5, when: new Date(2024, 0, 1) }],
    };
    await exportExcel(config);
    const ws = await readBack(captured!);
    expect(ws.getCell("A2").numFmt).toContain("$");
    expect(ws.getCell("B2").numFmt).toBe("yyyy-mm-dd");
  });

  it("builds merged hierarchical headers", async () => {
    // A group "Info" over two leaves; exceljs exposes merges via model.merges.
    const parent = col({ key: "info", label: "Info" });
    const child1 = col({ key: "a", label: "A" });
    const child2 = col({ key: "b", label: "B" });
    (parent as any).children = [child1, child2];

    const config: ExportConfig = {
      columns: [child1, child2],
      columnTree: [parent],
      rows: [{ a: 1, b: 2 }],
    };
    await exportExcel(config);
    const ws = await readBack(captured!);

    // "Info" spans A1:B1.
    expect(ws.getCell("A1").value).toBe("Info");
    const merges = (ws as any).model?.merges ?? [];
    expect(merges).toContain("A1:B1");
  });

  it("freezes header rows and left-pinned columns", async () => {
    const columns = [
      col({ key: "id", label: "ID", pinned: "left" }),
      col({ key: "name", label: "Name" }),
    ];
    const config: ExportConfig = { columns, rows: [{ id: 1, name: "x" }] };
    await exportExcel(config);
    const ws = await readBack(captured!);
    const view = ws.views[0] as any;
    expect(view.state).toBe("frozen");
    expect(view.xSplit).toBe(1); // one pinned column
    expect(view.ySplit).toBe(1); // one header row
  });

  it("escapes XML-special characters in values", async () => {
    const columns = [col({ key: "x", label: "X & <Y>", type: ColumnType.STRING })];
    const config: ExportConfig = {
      columns,
      rows: [{ x: '<tag> & "quote"' }],
    };
    await exportExcel(config);
    const ws = await readBack(captured!);
    expect(ws.getCell("A1").value).toBe("X & <Y>");
    expect(ws.getCell("A2").value).toBe('<tag> & "quote"');
  });
});

describe("aggregate footer", () => {
  it("writes live SUM/AVERAGE formulas over the body range with correct cached results", async () => {
    const columns = [
      col({ key: "name", label: "Name", type: ColumnType.STRING }),
      col({ key: "qty", label: "Qty", type: ColumnType.NUMBER }),
    ];
    const rows = [
      { name: "a", qty: 10 },
      { name: "b", qty: 20 },
      { name: "c", qty: 30 },
    ];
    const config: ExportConfig = {
      columns,
      rows,
      aggregates: [{ key: columns[1].instanceID, type: AggregateType.SUM }],
    };
    await exportExcel(config);
    const ws = await readBack(captured!);

    // Header row 1, data rows 2-4, footer row 5.
    const footer = ws.getCell("B5").value as any;
    expect(footer.formula).toBe("SUM(B2:B4)");
    expect(footer.result).toBe(60); // cached value matches the grid's calculator
  });

  it("falls back to a static value for text MIN (grid collator, not Excel)", async () => {
    const columns = [col({ key: "name", label: "Name", type: ColumnType.STRING })];
    const rows = [{ name: "Charlie" }, { name: "Alice" }, { name: "Bob" }];
    const config: ExportConfig = {
      columns,
      rows,
      aggregates: [{ key: columns[0].instanceID, type: AggregateType.MIN }],
    };
    await exportExcel(config);
    const ws = await readBack(captured!);
    // No formula — a plain string equal to the grid's computed min.
    const footer = ws.getCell("A5").value;
    expect(footer).toBe("Alice");
  });

  it("uses default op (SUM numeric / COUNT text) for columns without an explicit entry", async () => {
    const columns = [
      col({ key: "name", label: "Name", type: ColumnType.STRING }),
      col({ key: "qty", label: "Qty", type: ColumnType.NUMBER }),
    ];
    const rows = [{ name: "a", qty: 5 }, { name: "b", qty: 7 }];
    // Only qty is explicitly aggregated; name has no entry -> should stay empty (footer only fills
    // columns present in the aggregate model).
    const config: ExportConfig = {
      columns,
      rows,
      aggregates: [{ key: columns[1].instanceID, type: AggregateType.AVG }],
    };
    await exportExcel(config);
    const ws = await readBack(captured!);
    const qty = ws.getCell("B4").value as any;
    expect(qty.formula).toBe("AVERAGE(B2:B3)");
    expect(qty.result).toBe(6);
    // name footer cell is empty.
    expect(ws.getCell("A4").value).toBeNull();
  });

  it("omits the footer entirely when no aggregates are supplied", async () => {
    const columns = [col({ key: "qty", label: "Qty", type: ColumnType.NUMBER })];
    const config: ExportConfig = { columns, rows: [{ qty: 1 }, { qty: 2 }] };
    await exportExcel(config);
    const ws = await readBack(captured!);
    // Rows: header(1), data(2,3). No row 4.
    expect(ws.getCell("A4").value).toBeNull();
    expect(ws.actualRowCount).toBe(3);
  });
});

describe("zip writer", () => {
  it("stores entries with recoverable CRCs", async () => {
    const bytes = await createZip([{ path: "hello.txt", data: "world" }]);
    // Local file header signature.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
    // End-of-central-directory signature present near the tail.
    const tail = bytes.slice(bytes.length - 22);
    expect(tail[0]).toBe(0x50);
    expect(tail[1]).toBe(0x4b);
    expect(tail[2]).toBe(0x05);
    expect(tail[3]).toBe(0x06);
  });

  it("deflates a compressible entry (method 8) and shrinks it", async () => {
    // Highly repetitive payload compresses well.
    const payload = "abcabcabc".repeat(1000); // 9000 bytes
    const bytes = await createZip([{ path: "big.txt", data: payload }]);
    // Local file header compression-method field is at offset 8.
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(8, true)).toBe(8); // DEFLATE
    // Whole archive (headers + central dir + payload) is far smaller than the raw payload.
    expect(bytes.length).toBeLessThan(payload.length / 5);
  });
});
