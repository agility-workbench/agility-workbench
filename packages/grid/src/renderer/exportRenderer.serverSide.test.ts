/**
 * Exports of the server-side row model. Its store holds only the rows the client has fetched, and
 * its group rows carry server-stamped aggregates, so an export is the displayed tree — expanded
 * parents with their loaded children, collapsed ones alone — with the grid's own numbers written
 * as static cells. Before this, a grouped server-side export produced nothing at all (every root
 * was a group row with no `children`, so the exporter's leaf collection came back empty) and a
 * tree export wrote only the loaded roots.
 *
 * Drives a real GridCore + ExportRenderer against an in-memory server and reads the produced .xlsx
 * back with exceljs.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { GridCore } from "../core/core";
import { ExportRenderer } from "./exportRenderer";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IServerSideAggregationParams, IServerSideDataSource, IServerSideRequest } from "../interfaces/serverSide";
import { groupNodeId } from "../csrm/rowGroup";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// Region → Country → sales. Whole-dataset sum 120; EMEA 35 (UK 30, France 5); APAC 85.
const DATA = [
  { id: "1", region: "EMEA", country: "UK", sales: 10 },
  { id: "2", region: "EMEA", country: "UK", sales: 20 },
  { id: "3", region: "EMEA", country: "France", sales: 5 },
  { id: "4", region: "APAC", country: "Japan", sales: 30 },
  { id: "5", region: "APAC", country: "Japan", sales: 40 },
  { id: "6", region: "APAC", country: "India", sales: 15 },
];

/** The server-side grouping contract in memory: group rows (count + requested sums) above the
 * leaf level, raw leaves at it, sliced to the requested block. */
function makeDataSource() {
  const requests: IServerSideRequest[] = [];
  const source: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      requests.push(request);
      const subset = DATA.filter(row => request.groupKeys.every(k => (row as any)[k.key] === k.value));
      let rows: any[];
      if (request.groupKeys.length < request.groupBy.length) {
        const key = request.groupBy[request.groupKeys.length];
        const byValue = new Map<string, any[]>();
        for (const row of subset) {
          const v = String((row as any)[key]);
          if (!byValue.has(v)) byValue.set(v, []);
          byValue.get(v)!.push(row);
        }
        rows = Array.from(byValue.keys()).sort().map(v => {
          const leaves = byValue.get(v)!;
          const groupRow: any = { [key]: (leaves[0] as any)[key], count: leaves.length };
          for (const agg of request.aggregates) {
            if (agg.type === AggregateType.SUM) {
              groupRow[agg.key] = leaves.reduce((s, r) => s + (r as any)[agg.key], 0);
            }
          }
          return groupRow;
        });
      } else {
        rows = subset;
      }
      const start = request.startRow ?? 0;
      const end = request.endRow ?? rows.length;
      success({ rows: rows.slice(start, end), totalRows: rows.length });
    },
  };
  return { source, requests };
}

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

function makeGrid(options: object = {}) {
  const ds = makeDataSource();
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "serverSide",
    getGroupChildCount: (row: any) => row.count,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
  ]);
  core.setServerSideDataSource(ds.source);
  return { core, ds };
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

/** The sheet as a matrix of `cols` columns; formula cells read as their cached result. */
function sheetRows(ws: ExcelJS.Worksheet, cols: number): any[][] {
  const out: any[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row: any[] = [];
    for (let c = 1; c <= cols; c++) {
      const v = ws.getRow(r).getCell(c).value as any;
      row.push(v && typeof v === "object" && "result" in v ? v.result : v);
    }
    out.push(row);
  }
  return out;
}

const outlineLevels = (ws: ExcelJS.Worksheet): number[] =>
  Array.from({ length: ws.rowCount }, (_, i) => ws.getRow(i + 1).outlineLevel ?? 0);

/** True for a number written as is — the exporter's static aggregate cell, not a formula. */
const isStaticNumber = (ws: ExcelJS.Worksheet, r: number, c: number) =>
  typeof ws.getRow(r).getCell(c).value === "number";

const salesInstanceId = (core: GridCore) => core.getColumnModel().getByColId("sales")!.instanceID;

describe("server-side grouped export", () => {
  it("exports collapsed group rows with the server's subtotals, where before it produced nothing", async () => {
    const { core } = makeGrid({
      serverSideAggregationSource: ({ success }: IServerSideAggregationParams) => success({ values: { sales: 120 } }),
    });
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.setAggregateModel([{ key: "sales", type: AggregateType.SUM }]);
    core.setAggregateScope("all");
    await flush();

    const exporter = makeExporter(core);
    // CSV carries leaf rows only, and none is loaded — but the export exists.
    expect(exporter.getDataAsCsv()).toBe("Region,Country,Sales");

    const ws = await readBack(await exporter.getDataAsExcel());
    expect(sheetRows(ws, 4)).toEqual([
      ["Group", "Region", "Country", "Sales"],
      ["APAC (3)", null, null, 85],
      ["EMEA (3)", null, null, 35],
      // The footer is the grid's: the server's whole-dataset total.
      [null, null, null, 120],
    ]);
    // Static numbers: a formula over the exported rows could not reproduce any of them.
    expect([2, 3, 4].every(r => isStaticNumber(ws, r, 4))).toBe(true);
    expect(outlineLevels(ws)).toEqual([0, 1, 1, 0]);
  });

  it("writes expanded groups with their loaded children and keeps the server's subtotals", async () => {
    const { core } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    await flush();
    core.setAggregateModel([{ key: "sales", type: AggregateType.SUM }]);
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA", "UK"]) });
    await flush();

    const exporter = makeExporter(core);
    expect(exporter.getDataAsCsv()!.split("\n")).toEqual(["Region,Country,Sales", "EMEA,UK,10", "EMEA,UK,20"]);

    const ws = await readBack(await exporter.getDataAsExcel());
    const displayedFooter = core.getRowModel().getAggregateValues().get(salesInstanceId(core));
    expect(sheetRows(ws, 4)).toEqual([
      ["Group", "Region", "Country", "Sales"],
      ["APAC (3)", null, null, 85],
      // EMEA's subtotal is the server's 35, though the leaves below it sum to 30; France shows
      // its 5 with no leaf loaded at all.
      ["EMEA (3)", null, null, 35],
      ["France (1)", null, null, 5],
      ["UK (2)", null, null, 30],
      [null, "EMEA", "UK", 10],
      [null, "EMEA", "UK", 20],
      [null, null, null, displayedFooter],
    ]);
    expect(displayedFooter).toBe(30); // page scope: the visible leaves
    expect([2, 3, 4, 5, 8].every(r => isStaticNumber(ws, r, 4))).toBe(true);
    expect(outlineLevels(ws)).toEqual([0, 1, 1, 2, 2, 3, 3, 0]);
  });

  it("writes only the blocks a listing has fetched, from every page", async () => {
    const { core } = makeGrid({ pagination: true, pageSize: 2, serverSideBlockSize: 2 });
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.setAggregateModel([{ key: "sales", type: AggregateType.SUM }]);
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();
    // EMEA's children sit past page 1; visiting page 2 fetches its first block of two. Its third
    // row is never requested.
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    await flush();

    const exporter = makeExporter(core);
    expect(exporter.getDataAsCsv()!.split("\n")).toEqual(["Region,Country,Sales", "EMEA,UK,10", "EMEA,UK,20"]);

    const ws = await readBack(await exporter.getDataAsExcel());
    const displayedFooter = core.getRowModel().getAggregateValues().get(salesInstanceId(core));
    expect(sheetRows(ws, 4)).toEqual([
      ["Group", "Region", "Country", "Sales"],
      ["APAC (3)", null, null, 85], // page 1, still exported
      ["EMEA (3)", null, null, 35], // the server's count and sum, not the two fetched rows'
      [null, "EMEA", "UK", 10],
      [null, "EMEA", "UK", 20],
      [null, null, null, displayedFooter],
    ]);
    expect(displayedFooter).toBe(30);
  });

  it("prunes a row selection to the selected leaves under their group headings", async () => {
    const { core } = makeGrid();
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: groupNodeId(["EMEA"]) });
    await flush();
    core.selectRowsById(["2"]);

    const ws = await readBack(await makeExporter(core).getDataAsExcel({ scope: "selection" }));
    expect(sheetRows(ws, 4)).toEqual([
      ["Group", "Region", "Country", "Sales"],
      ["EMEA (1)", null, null, null],
      [null, "EMEA", "UK", 20],
    ]);
  });
});

describe("server-side flat export", () => {
  it("writes the grid's displayed footer total, not a sum over the exported rows", async () => {
    // One block of 100 holds all six rows, while the footer sums the current page's two.
    const { core } = makeGrid({ pagination: true, pageSize: 2, serverSideBlockSize: 100 });
    await flush();
    core.setAggregateModel([{ key: "sales", type: AggregateType.SUM }]);
    await flush();

    const ws = await readBack(await makeExporter(core).getDataAsExcel());
    const rows = sheetRows(ws, 3);
    expect(rows).toHaveLength(1 + 6 + 1);
    expect(rows[7]).toEqual([null, null, 30]);
    expect(isStaticNumber(ws, 8, 3)).toBe(true);
  });
});

describe("server-side tree export", () => {
  type Node = { id: string; name: string; kind: "folder" | "file"; parent: string | null; size: number };
  const TREE: Node[] = [
    { id: "docs", name: "docs", kind: "folder", parent: null, size: 0 },
    { id: "spec", name: "spec.md", kind: "file", parent: "docs", size: 40 },
    { id: "images", name: "images", kind: "folder", parent: "docs", size: 0 },
    { id: "logo", name: "logo.png", kind: "file", parent: "images", size: 90 },
    { id: "readme", name: "readme.md", kind: "file", parent: null, size: 12 },
  ];

  function makeTreeGrid() {
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        const parentId = request.treeParent?.id ?? null;
        const rows = TREE.filter(n => n.parent === parentId);
        success({ rows: rows.map(r => ({ ...r })), totalRows: rows.length });
      },
    };
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "serverSide",
      treeData: { mode: "server", hasChildren: (row: any) => row.kind === "folder", getLabel: (row: any) => row.name },
    });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps([
      { colId: "kind", key: "kind", label: "Kind", type: ColumnType.STRING },
      { colId: "size", key: "size", label: "Size", type: ColumnType.NUMBER },
    ]);
    core.setServerSideDataSource(source);
    return core;
  }

  it("writes an expanded parent's loaded children at their depth and a collapsed one alone", async () => {
    const core = makeTreeGrid();
    await flush();
    core.dispatch({ type: "groupToggleExpand", groupId: "docs" });
    await flush();

    const ws = await readBack(await makeExporter(core).getDataAsExcel());
    expect(sheetRows(ws, 3)).toEqual([
      ["Hierarchy", "Kind", "Size"],
      ["docs", "folder", 0],
      ["spec.md", "file", 40],
      ["images", "folder", 0], // collapsed: its child never fetched
      ["readme.md", "file", 12],
    ]);
    expect(outlineLevels(ws)).toEqual([0, 1, 2, 2, 1]);
  });
});
