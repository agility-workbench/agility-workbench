/**
 * Grouped exports write a column's `groupValueGetter` value on group header rows, typed as the
 * column's leaf cells are, where they used to leave the cell empty. The label column keeps the
 * label, an aggregated column keeps its subtotal (the aggregate wins, as on screen), and
 * `groupRows` display keeps its one merged heading.
 *
 * Drives a real GridCore + ExportRenderer and reads the produced .xlsx back with exceljs.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { GridCore } from "../core/core";
import { ExportRenderer } from "./exportRenderer";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import type { ColDef } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IServerSideDataSource } from "../interfaces/serverSide";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", title: "Manager", city: "NYC", salary: 100 },
  { id: "2", title: "Manager", city: "NYC", salary: 200 },
  { id: "3", title: "Analyst", city: "Boston", salary: 50 },
];

// Analyst first (groups sort alphabetically): salary sum 50; Manager 300.
const COLUMNS: ColDef[] = [
  { colId: "city", key: "city", label: "City", type: ColumnType.STRING },
  { colId: "title", key: "title", label: "Title", type: ColumnType.STRING },
  {
    colId: "salary", key: "salary", label: "Salary", type: ColumnType.NUMBER,
    // Has an aggregate too: the subtotal must win over this.
    groupValueGetter: () => 999,
  },
  {
    colId: "double", key: "double", label: "Double", type: ColumnType.NUMBER,
    groupValueGetter: ({ aggregates }) => (aggregates.salary as number) * 2,
  },
  {
    colId: "team", key: "team", label: "Team", type: ColumnType.STRING,
    groupValueGetter: ({ node }) => node.groupKey,
    valueFormatter: ({ value }) => (value == null ? "" : `Team ${value}`),
  },
];

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id", rowModelType: "clientSide", groupDefaultExpanded: -1, ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps(COLUMNS);
  core.setAggregateModel([{ key: "salary", type: AggregateType.SUM }]);
  core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
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

async function readBack(bytes: Uint8Array | null): Promise<ExcelJS.Worksheet> {
  expect(bytes).not.toBeNull();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes!) as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

/** Raw exceljs cell values of one sheet row (formula cells stay objects). */
function rawRow(ws: ExcelJS.Worksheet, r: number, cols: number): any[] {
  return Array.from({ length: cols }, (_, c) => ws.getRow(r).getCell(c + 1).value);
}

const isFormula = (v: any) => v != null && typeof v === "object" && "formula" in v;

describe("grouped export: groupValueGetter cells on group header rows", () => {
  it("writes the getter value beside the label and the subtotal, typed like the column's leaves", async () => {
    const core = makeGrid({ groupDisplayType: "singleColumn" });
    const ws = await readBack(await makeExporter(core).getDataAsExcel());

    expect(rawRow(ws, 1, 6)).toEqual(["Group", "City", "Title", "Salary", "Double", "Team"]);
    const [label, city, title, salary, double, team] = rawRow(ws, 2, 6);
    expect(String(label)).toMatch(/^Analyst/);
    // A plain column stays empty on a group header.
    expect(city).toBeNull();
    expect(title).toBeNull();
    expect(isFormula(salary)).toBe(true);
    expect(salary.formula).toMatch(/^SUBTOTAL\(/);
    expect(salary.result).toBe(50);
    // A number column's getter value is a real number, not text.
    expect(double).toBe(100);
    // A text column writes the formatted value.
    expect(team).toBe("Team Analyst");

    const manager = rawRow(ws, 4, 6);
    expect(String(manager[0])).toMatch(/^Manager/);
    expect(manager[3].result).toBe(300);
    expect(manager[4]).toBe(600);
    expect(manager[5]).toBe("Team Manager");

    // Leaves are unchanged: the getter never runs there, so its columns read the (absent) field.
    const leaf = rawRow(ws, 3, 6);
    expect(leaf[3]).toBe(50);
    expect(leaf[4]).toBeNull();
    expect(leaf[5]).toBeNull();
  });

  it("an aggregated column keeps its subtotal even when it also has a getter", async () => {
    const core = makeGrid({ groupDisplayType: "singleColumn" });
    const ws = await readBack(await makeExporter(core).getDataAsExcel());
    for (const r of [2, 4]) {
      const salary = rawRow(ws, r, 6)[3];
      expect(isFormula(salary)).toBe(true);
      expect(salary.result).not.toBe(999);
    }
  });

  it("multipleColumns: the level's label column keeps the label", async () => {
    const core = makeGrid({ groupDisplayType: "multipleColumns" });
    const ws = await readBack(await makeExporter(core).getDataAsExcel());
    expect(rawRow(ws, 1, 5)).toEqual(["City", "Title", "Salary", "Double", "Team"]);
    const header = rawRow(ws, 2, 5);
    expect(String(header[1])).toMatch(/^Analyst/);
    expect(header[3]).toBe(100);
    expect(header[4]).toBe("Team Analyst");
  });

  it("groupRows: the heading stays merged across the row, with no getter cells", async () => {
    const core = makeGrid({ groupDisplayType: "groupRows" });
    const ws = await readBack(await makeExporter(core).getDataAsExcel());
    const header = rawRow(ws, 2, 5);
    expect(String(header[0])).toMatch(/^Analyst/);
    expect(ws.getCell("A2").isMerged).toBe(true);
    expect(ws.getCell("E2").isMerged).toBe(true);
    // A merged range reports its master's value in every cell; nothing else was written there.
    expect(header.slice(1).every(v => v === header[0])).toBe(true);
  });

  it("CSV has no group header rows, so its output is the leaves alone", () => {
    const core = makeGrid({ groupDisplayType: "singleColumn" });
    const csv = makeExporter(core).getDataAsCsv()!.split("\n");
    expect(csv).toEqual([
      "City,Title,Salary,Double,Team",
      "Boston,Analyst,50,,",
      "NYC,Manager,100,,",
      "NYC,Manager,200,,",
    ]);
  });
});

describe("server-side grouped export: groupValueGetter cells", () => {
  const DATA = [
    { id: "1", region: "EMEA", sales: 10 },
    { id: "2", region: "EMEA", sales: 25 },
    { id: "3", region: "APAC", sales: 85 },
  ];

  // Group rows carry a count and the requested sums; leaves are the raw rows.
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      if (request.groupKeys.length === 0) {
        const rows = ["APAC", "EMEA"].map(region => {
          const leaves = DATA.filter(r => r.region === region);
          return { region, count: leaves.length, sales: leaves.reduce((s, r) => s + r.sales, 0) };
        });
        success({ rows, totalRows: rows.length });
        return;
      }
      const rows = DATA.filter(r => r.region === request.groupKeys[0].value);
      success({ rows, totalRows: rows.length });
    },
  };

  const flush = async () => {
    for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
  };

  it("writes the server's static subtotals and the getter values (data is the server's group row)", async () => {
    const core = new GridCore(measurer, {
      rowIdKey: "id", rowModelType: "serverSide", getGroupChildCount: (row: any) => row.count,
    });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
      { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
      {
        colId: "count", key: "count", label: "Count", type: ColumnType.NUMBER,
        groupValueGetter: ({ data }) => data?.count,
      },
    ]);
    core.setServerSideDataSource(source);
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.setAggregateModel([{ key: "sales", type: AggregateType.SUM }]);
    await flush();

    const ws = await readBack(await makeExporter(core).getDataAsExcel());
    expect(rawRow(ws, 1, 4)).toEqual(["Group", "Region", "Sales", "Count"]);
    const apac = rawRow(ws, 2, 4);
    expect(String(apac[0])).toMatch(/^APAC/);
    expect(apac[2]).toBe(85);
    expect(apac[3]).toBe(1);
    const emea = rawRow(ws, 3, 4);
    expect(emea[2]).toBe(35);
    expect(emea[3]).toBe(2);
  });
});
