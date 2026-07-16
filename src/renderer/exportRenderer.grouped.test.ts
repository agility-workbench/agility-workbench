/**
 * Regression test for the "grouped grid + Select All → Export Excel yields headers only" bug.
 *
 * Select All (Ctrl+A / the demo button) produces a cell RANGE spanning the whole view, so the body
 * menu resolves the export scope to "selection". Before the fix, a "selection" scope skipped the
 * grouped export path and fell back to slicing the grouped VIEW by row index — which, when grouped,
 * is synthetic group-header nodes whose `data` is `{ __group: true }`. Every real column read empty,
 * so the file had headers and no data. The fix: when the grid is row-grouped, always drive the
 * export from the group tree regardless of scope.
 *
 * This drives a real GridCore + ExportRenderer and reads the produced .xlsx back with exceljs.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import ExcelJS from "exceljs";
import { GridCore } from "../core/core";
import { ExportRenderer } from "./exportRenderer";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", title: "Manager", city: "NYC", salary: 100 },
  { id: "2", title: "Manager", city: "NYC", salary: 200 },
  { id: "3", title: "Analyst", city: "Boston", salary: 50 },
];

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "title", key: "title", label: "Title", type: ColumnType.STRING },
    { colId: "city", key: "city", label: "City", type: ColumnType.STRING },
    { colId: "salary", key: "salary", label: "Salary", type: ColumnType.NUMBER },
  ]);
  return core;
}

/** Every numeric cell value across the sheet (column-agnostic). */
function numericCells(ws: ExcelJS.Worksheet): number[] {
  const out: number[] = [];
  const n = ws.actualColumnCount || ws.columnCount;
  for (let r = 1; r <= ws.rowCount; r++) {
    for (let c = 1; c <= n; c++) {
      const v = ws.getRow(r).getCell(c).value;
      if (typeof v === "number") out.push(v);
    }
  }
  return out;
}

/** Read a whole sheet row's cell values (formula cells → their cached result). */
function rowValues(ws: ExcelJS.Worksheet, r: number): any[] {
  const n = ws.actualColumnCount || ws.columnCount;
  const out: any[] = [];
  for (let c = 1; c <= n; c++) {
    const v = ws.getRow(r).getCell(c).value as any;
    out.push(v && typeof v === "object" && "result" in v ? v.result : v);
  }
  return out;
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
    const part = (args[0] ?? [])[0] as ArrayBuffer | Uint8Array;
    captured = part instanceof Uint8Array ? part : new Uint8Array(part as ArrayBuffer);
    return new RealBlob(args[0] ?? []);
  });
});

async function readBack(bytes: Uint8Array): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

/** ExportRenderer.exportExcel is fire-and-forget (returns void); wait for the async write to land. */
async function waitForCapture(): Promise<Uint8Array> {
  for (let i = 0; i < 100 && captured == null; i++) {
    await new Promise(r => setTimeout(r, 5));
  }
  if (captured == null) throw new Error("export produced no file");
  return captured;
}

describe("grouped export via ExportRenderer", () => {
  it("exports full grouped body when Select All (a cell range → 'selection' scope) is active", async () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["title", "city"] });
    // Expand everything so leaves are in the view — the bug reproduced even so, but this makes the
    // "headers only" symptom unambiguous (there ARE visible leaves, yet the old code dropped them).
    core.dispatch({ type: "selectAll" });
    expect(core.getSelectionRange()).not.toBeNull(); // select-all is a RANGE, not a row selection

    makeExporter(core).exportExcel({ scope: "selection" });
    const bytes = await waitForCapture();
    const ws = await readBack(bytes);

    // Collect every numeric cell across the sheet (salary is the only numeric column). Column-
    // agnostic so it survives the singleColumn "Group" column being prepended.
    const salaries = numericCells(ws);
    // All three leaf salaries must be present — the regression produced an empty body.
    expect(salaries).toContain(100);
    expect(salaries).toContain(200);
    expect(salaries).toContain(50);
    expect(salaries.length).toBe(3);

    // And the group structure is present (outline levels > 0 on group header rows).
    let maxOutline = 0;
    for (let r = 1; r <= ws.rowCount; r++) maxOutline = Math.max(maxOutline, ws.getRow(r).outlineLevel ?? 0);
    expect(maxOutline).toBeGreaterThan(0);
  });

  it("also exports the grouped body for an explicit 'all' scope", async () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });

    makeExporter(core).exportExcel({ scope: "all" });
    const ws = await readBack(await waitForCapture());
    expect(numericCells(ws).sort((a, b) => a - b)).toEqual([50, 100, 200]);
  });
});

describe("group headings respect groupDisplayType", () => {
  it("singleColumn: prepends a 'Group' column holding every level's heading", async () => {
    const core = makeGrid({ groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title", "city"] });
    makeExporter(core).exportExcel({ scope: "all" });
    const ws = await readBack(await waitForCapture());

    // Column A is the synthesized group column; the real columns follow.
    expect(rowValues(ws, 1)).toEqual(["Group", "Name", "Title", "City", "Salary"]);
    // Groups sort alphabetically, so "Analyst" is first. Its heading sits in column A; the real
    // Title/City columns are blank on the group row.
    const analystHeader = rowValues(ws, 2);
    expect(String(analystHeader[0])).toMatch(/^Analyst /);
    expect(analystHeader[2]).toBeNull(); // Title column blank on a group row
    // Row 2 = Analyst, row 3 = Boston (its only city), row 4 = the leaf. The leaf leaves column A
    // blank and carries its data in the real columns.
    const leaf = rowValues(ws, 4);
    expect(leaf[0]).toBeNull();
    expect(leaf[4]).toBe(50); // Analyst's sole salary
  });

  it("multipleColumns: puts each level's heading under its own grouped column", async () => {
    const core = makeGrid({ groupDisplayType: "multipleColumns", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title", "city"] });
    makeExporter(core).exportExcel({ scope: "all" });
    const ws = await readBack(await waitForCapture());

    // No prepended column — the real columns only.
    expect(rowValues(ws, 1)).toEqual(["Name", "Title", "City", "Salary"]);
    // Level-0 (Title) header (Analyst, alphabetically first): label under the Title column (index
    // 1), City blank.
    const titleHeader = rowValues(ws, 2);
    expect(String(titleHeader[1])).toMatch(/^Analyst /);
    expect(titleHeader[2]).toBeNull();
    // Level-1 (City) header: label under the City column (index 2), Title blank.
    const cityHeader = rowValues(ws, 3);
    expect(cityHeader[1]).toBeNull();
    expect(String(cityHeader[2])).toMatch(/^Boston /);
  });

  it("groupRows: puts headings in the first column and adds no group column", async () => {
    const core = makeGrid({ groupDisplayType: "groupRows", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title", "city"] });
    makeExporter(core).exportExcel({ scope: "all" });
    const ws = await readBack(await waitForCapture());

    expect(rowValues(ws, 1)).toEqual(["Name", "Title", "City", "Salary"]);
    // Both levels' headings land in column 0 (Name); groups sort alphabetically (Analyst → Boston).
    expect(String(rowValues(ws, 2)[0])).toMatch(/^Analyst /);
    expect(String(rowValues(ws, 3)[0])).toMatch(/^Boston /);
  });
});

/** Find the view index of the first group row whose key matches. */
function groupRowViewIdx(core: GridCore, key: string): number {
  const rm = core.getRowModel();
  for (let i = 0; i < rm.getViewCount(); i++) {
    const n = rm.getRowNodeAtViewIndex(i);
    if (n?.isGroup && n.groupKey === key) return i;
  }
  throw new Error(`group row '${key}' not found`);
}

describe("grouped export respects the selection", () => {
  it("selecting one group row exports only that group's subtree (tree mode)", async () => {
    const core = makeGrid({ groupDisplayType: "singleColumn", groupDefaultExpanded: -1, groupRowsSelectable: true });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: core.getColumnModel().getByColId("salary")!.instanceID, type: "sum" as any }],
    });
    // Select the "Analyst" group (its sole leaf salary is 50).
    core.dispatch({ type: "rowSelectSet", viewIdx: groupRowViewIdx(core, "Analyst"), mode: "toggle" });

    makeExporter(core).exportExcel({ groupMode: "tree" });
    const ws = await readBack(await waitForCapture());
    // Only Analyst's leaf (50) is present — Manager's 100/200 are excluded.
    expect(numericCells(ws).filter(v => v === 100 || v === 200)).toEqual([]);
    expect(numericCells(ws)).toContain(50);
  });

  it("leaves mode: flat rows with the leaf's full group path in the Group column", async () => {
    const core = makeGrid({ groupDisplayType: "singleColumn", groupDefaultExpanded: -1, groupRowsSelectable: true });
    core.dispatch({ type: "rowGroupSet", colIds: ["title", "city"] });
    core.dispatch({ type: "rowSelectSet", viewIdx: groupRowViewIdx(core, "Manager"), mode: "toggle" });

    makeExporter(core).exportExcel({ groupMode: "leaves" });
    const ws = await readBack(await waitForCapture());

    // No group-header rows: every body row is a leaf. Manager has two NYC leaves.
    // Column A (Group) carries the full path; the real columns carry the data.
    const bodyRows: any[][] = [];
    for (let r = 2; r <= ws.rowCount; r++) bodyRows.push(rowValues(ws, r));
    // Both Manager leaves present, each with path "Manager / NYC" in column A.
    const managerLeaves = bodyRows.filter(row => row[0] === "Manager / NYC");
    expect(managerLeaves.length).toBe(2);
    // Analyst not selected → absent.
    expect(bodyRows.some(row => String(row[0]).startsWith("Analyst"))).toBe(false);
  });

  it("collapsed selected group still exports its children, marked hidden (collapsed) in Excel", async () => {
    // groupDefaultExpanded: 0 → all groups collapsed.
    const core = makeGrid({ groupDisplayType: "singleColumn", groupDefaultExpanded: 0, groupRowsSelectable: true });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    core.dispatch({ type: "rowSelectSet", viewIdx: groupRowViewIdx(core, "Manager"), mode: "toggle" });

    makeExporter(core).exportExcel({ groupMode: "tree" });
    const ws = await readBack(await waitForCapture());

    // The two Manager leaves are exported (100, 200) but hidden (collapsed group).
    expect(numericCells(ws)).toEqual(expect.arrayContaining([100, 200]));
    let hiddenLeafCount = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      const vals = rowValues(ws, r);
      if (vals.includes(100) || vals.includes(200)) {
        if (ws.getRow(r).hidden) hiddenLeafCount++;
      }
    }
    expect(hiddenLeafCount).toBe(2);
  });

  it("honors a cell range's column span in a grouped export", async () => {
    const core = makeGrid({ groupDisplayType: "groupRows", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    // Build a range covering every view row but only columns 0..1 (Name, Title) — excludes Salary.
    const lastRow = core.getRowModel().getViewCount() - 1;
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: lastRow, colIdx: 1, mode: "extend" });

    makeExporter(core).exportExcel({ scope: "selection" });
    const ws = await readBack(await waitForCapture());
    // Salary column excluded → no numeric salary cells anywhere.
    expect(numericCells(ws)).toEqual([]);
    // Title heading (groupRows → first column) still present.
    expect(rowValues(ws, 1)).toEqual(["Name", "Title"]);
  });

  it("omits the singleColumn Group column when the range excludes it", async () => {
    // singleColumn → global leaf layout is [0]=Group, [1]=Name, [2]=Title, [3]=City, [4]=Salary.
    const core = makeGrid({ groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    // Range over all rows but columns 1..4 (Name..Salary) — EXCLUDES the group column at index 0.
    const lastRow = core.getRowModel().getViewCount() - 1;
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 1, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: lastRow, colIdx: 4, mode: "extend" });

    // Leaf export: the Group column must NOT be conjured back in.
    makeExporter(core).exportExcel({ scope: "selection", groupMode: "leaves" });
    let ws = await readBack(await waitForCapture());
    expect(rowValues(ws, 1)).toEqual(["Name", "Title", "City", "Salary"]);
    expect(rowValues(ws, 1)).not.toContain("Group");
  });

  it("keeps the singleColumn Group column when the range includes it", async () => {
    const core = makeGrid({ groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    // Range starting at column 0 includes the group column.
    const lastRow = core.getRowModel().getViewCount() - 1;
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: lastRow, colIdx: 4, mode: "extend" });

    makeExporter(core).exportExcel({ scope: "selection", groupMode: "leaves" });
    const ws = await readBack(await waitForCapture());
    expect(rowValues(ws, 1)).toEqual(["Group", "Name", "Title", "City", "Salary"]);
  });
});
