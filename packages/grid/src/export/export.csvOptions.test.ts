/**
 * CSV output options (finding #95): separator, line ending, BOM, cell/header processors,
 * prepended/appended content and quote suppression. Each is CSV only; the Excel path ignores them.
 * The quoting rule and the A12 formula guard must hold for any separator.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Column } from "../column/column";
import { ColDef, ColumnType } from "../interfaces/column";
import type { CsvExportCellParams } from "../interfaces/exportParams";
import { GridCore } from "../core/core";
import { ExportRenderer } from "../renderer/exportRenderer";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { buildCSV, ExportConfig } from "./export";

const col = (def: ColDef) => new Column(def);

const nameCol = () => col({ key: "name", label: "Name", type: ColumnType.STRING });
const qtyCol = () => col({ key: "qty", label: "Qty", type: ColumnType.NUMBER });

const base = (extra: Partial<ExportConfig> = {}): ExportConfig => ({
  columns: [nameCol(), qtyCol()],
  rows: [{ name: "Alice", qty: 10 }, { name: "Bob", qty: 20 }],
  ...extra,
});

describe("columnSeparator", () => {
  it("joins fields with the given separator", () => {
    expect(buildCSV(base({ columnSeparator: ";" }))).toBe("Name;Qty\nAlice;10\nBob;20");
    expect(buildCSV(base({ columnSeparator: "\t" }))).toBe("Name\tQty\nAlice\t10\nBob\t20");
  });

  it("falls back to a comma for an empty separator", () => {
    expect(buildCSV(base({ columnSeparator: "" }))).toBe("Name,Qty\nAlice,10\nBob,20");
  });

  it("quotes a field containing the separator, and stops quoting a bare comma", () => {
    const csv = buildCSV({
      columns: [nameCol()],
      rows: [{ name: "a;b" }, { name: "a,b" }, { name: 'say "hi"' }],
      includeHeaders: false,
      columnSeparator: ";",
    });
    expect(csv.split("\n")).toEqual(['"a;b"', "a,b", '"say ""hi"""']);
  });

  it("keeps the formula guard with a non-default separator (guard inside the quotes)", () => {
    const csv = buildCSV({
      columns: [nameCol(), qtyCol()],
      rows: [{ name: "=SUM(A1;A2)", qty: -5 }, { name: "\t=1", qty: 1 }],
      includeHeaders: false,
      columnSeparator: "\t",
    });
    // The tab-led payload is guarded, then quoted because it contains the separator; -5 stays a number.
    expect(csv.split("\n")).toEqual(["'=SUM(A1;A2)\t-5", "\"'\t=1\"\t1"]);
  });
});

describe("lineEnding", () => {
  it("defaults to LF and writes CRLF on request", () => {
    expect(buildCSV(base())).toBe("Name,Qty\nAlice,10\nBob,20");
    expect(buildCSV(base({ lineEnding: "\r\n" }))).toBe("Name,Qty\r\nAlice,10\r\nBob,20");
  });
});

describe("includeBom", () => {
  it("starts the text with U+FEFF only when asked", () => {
    expect(buildCSV(base()).charCodeAt(0)).toBe("N".charCodeAt(0));
    const csv = buildCSV(base({ includeBom: true }));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("Name,Qty\nAlice,10\nBob,20");
  });
});

describe("suppressQuotes", () => {
  it("writes fields unquoted but still formula-guarded", () => {
    const csv = buildCSV({
      columns: [nameCol()],
      rows: [{ name: "a,b" }, { name: "=x" }],
      includeHeaders: false,
      suppressQuotes: true,
    });
    expect(csv.split("\n")).toEqual(["a,b", "'=x"]);
  });
});

describe("processCellForCsv", () => {
  it("replaces cell text, keeps the default on undefined, and sees the Excel-shaped params", () => {
    const seen: CsvExportCellParams[] = [];
    const csv = buildCSV(base({
      pinnedTopRows: [{ name: "Top", qty: 1 }],
      pinnedBottomRows: [{ name: "Bottom", qty: 2 }],
      processCellForCsv: params => {
        seen.push(params);
        return params.column.key === "name" ? `<${params.formattedValue}>` : undefined;
      },
    }));
    expect(csv.split("\n")).toEqual([
      "Name,Qty", "<Top>,1", "<Alice>,10", "<Bob>,20", "<Bottom>,2",
    ]);
    const names = seen.filter(p => p.column.key === "name");
    expect(names.map(p => [p.rowType, p.rowIndex, p.value])).toEqual([
      ["pinnedTop", 0, "Top"],
      ["body", 0, "Alice"],
      ["body", 1, "Bob"],
      ["pinnedBottom", 0, "Bottom"],
    ]);
    expect(names[1].data).toEqual({ name: "Alice", qty: 10 });
  });

  it("formula-guards and quotes the result, but leaves a plain number alone", () => {
    const csv = buildCSV({
      columns: [nameCol()],
      rows: [{ name: "a" }, { name: "b" }, { name: "c" }],
      includeHeaders: false,
      processCellForCsv: ({ value }) => (value === "a" ? "=evil()" : value === "b" ? "-5" : "x,y"),
    });
    expect(csv.split("\n")).toEqual(["'=evil()", "-5", '"x,y"']);
  });

  it("is not called for headers and ignores the Excel processor", () => {
    const processCellForExcel = vi.fn(() => ({ value: "excel" }));
    const csv = buildCSV({
      columns: [nameCol()],
      rows: [{ name: "a" }],
      processCellForExcel,
      processCellForCsv: () => "csv",
    });
    expect(csv).toBe("Name\ncsv");
    expect(processCellForExcel).not.toHaveBeenCalled();
  });
});

describe("processHeaderForCsv", () => {
  it("replaces leaf and column-group labels, with the column each belongs to", () => {
    const parent = col({ key: "info", label: "Info" });
    const a = col({ key: "a", label: "A" });
    const b = col({ key: "b", label: "B" });
    (parent as any).children = [a, b];
    const csv = buildCSV({
      columns: [a, b],
      columnTree: [parent],
      rows: [{ a: 1, b: 2 }],
      processHeaderForCsv: ({ column, label }) =>
        column === b ? undefined : `${label.toUpperCase()}:${column.key}`,
    });
    expect(csv.split("\n")).toEqual(["INFO:info,", "A:a,B", "1,2"]);
  });

  it("guards the processed label", () => {
    const csv = buildCSV({ ...base(), processHeaderForCsv: () => "+x" });
    expect(csv.split("\n")[0]).toBe("'+x,'+x");
  });
});

describe("prependContent / appendContent", () => {
  it("writes a string verbatim as its own line(s)", () => {
    const csv = buildCSV(base({ prependContent: "Report, Q3\nGenerated", appendContent: "=end" }));
    expect(csv.split("\n")).toEqual([
      "Report, Q3", "Generated", "Name,Qty", "Alice,10", "Bob,20", "=end",
    ]);
  });

  it("writes a 2-D array as CSV rows with the export's separator, quoting and guard", () => {
    const csv = buildCSV(base({
      columnSeparator: ";",
      lineEnding: "\r\n",
      prependContent: [["Title", "a;b"], []],
      appendContent: [["Total", "30"], ["=1+1", "-2"]],
    }));
    expect(csv.split("\r\n")).toEqual([
      'Title;"a;b"', "", "Name;Qty", "Alice;10", "Bob;20", "Total;30", "'=1+1;-2",
    ]);
  });

  it("writes the extra content even without headers or rows", () => {
    const csv = buildCSV({
      columns: [nameCol()], rows: [], includeHeaders: false,
      prependContent: "before", appendContent: [["after"]],
    });
    expect(csv).toBe("before\nafter");
  });
});

describe("combined options", () => {
  it("applies separator, CRLF, BOM, processors and extra content together", () => {
    const csv = buildCSV(base({
      columnSeparator: ";",
      lineEnding: "\r\n",
      includeBom: true,
      prependContent: [["Exported", "Café; Zürich"]],
      appendContent: "-- end --",
      processHeaderForCsv: ({ label }) => label.toLowerCase(),
      processCellForCsv: ({ column, value }) =>
        column.key === "name" ? String(value).replace(/./g, "*") : undefined,
    }));
    expect(csv).toBe(
      "﻿" + ['Exported;"Café; Zürich"', "name;qty", "*****;10", "***;20", "-- end --"].join("\r\n"),
    );
  });
});

// --- Through the grid's exporter: download and getDataAsCsv agree, grouped grids honor options. ---

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", title: "Manager", name: "Ann", salary: 100 },
    { id: "2", title: "Analyst", name: "Bo", salary: 50 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "title", key: "title", label: "Title", type: ColumnType.STRING },
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "salary", key: "salary", label: "Salary", type: ColumnType.NUMBER },
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

describe("ExportRenderer passes the CSV options through", () => {
  let blobParts: unknown[] | null = null;

  beforeEach(() => {
    blobParts = null;
    (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:mock");
    (globalThis as any).URL.revokeObjectURL = vi.fn();
    (globalThis as any).document = {
      createElement: () => ({ set href(_v: string) {}, set download(_v: string) {}, click() {} }),
    };
    const RealBlob = globalThis.Blob;
    vi.spyOn(globalThis, "Blob").mockImplementation((...args: any[]) => {
      blobParts = args[0] ?? [];
      return new RealBlob(args[0] ?? []);
    });
  });

  it("downloads exactly the text getDataAsCsv returns, BOM included, encoded as UTF-8", async () => {
    const exporter = makeExporter(makeGrid());
    const params = { columnSeparator: ";", includeBom: true, lineEnding: "\r\n" as const };
    const text = exporter.getDataAsCsv(params);
    exporter.exportCSV(params);
    expect(blobParts).toEqual([text]);
    expect(text!.startsWith("﻿Title;Name;Salary\r\n")).toBe(true);
    const bytes = new Uint8Array(await new Blob([text!]).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("honors the options in a row-grouped grid, in both group modes", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    const exporter = makeExporter(core);
    for (const groupMode of ["tree", "leaves"] as const) {
      const rowTypes = new Set<string>();
      const csv = exporter.getDataAsCsv({
        groupMode,
        columnSeparator: "|",
        processCellForCsv: ({ column, value, rowType }) => {
          rowTypes.add(rowType);
          return column.key === "name" ? `#${value}` : undefined;
        },
      })!;
      const lines = csv.split("\n");
      expect(lines.every(l => !l.includes(","))).toBe(true);
      expect(lines.some(l => l.includes("#Ann"))).toBe(true);
      expect(lines.some(l => l.includes("#Bo"))).toBe(true);
      expect([...rowTypes]).toEqual(["body"]);
    }
  });
});
