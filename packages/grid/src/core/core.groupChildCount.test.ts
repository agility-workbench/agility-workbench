/**
 * gridOptions.groupChildCount — what a group row shows in the parentheses after its label:
 *  - true (default): the group's row count, as before;
 *  - false: no count on any group;
 *  - a function: its result per group — a number, a string ("12.5 FTE"), or null for no count —
 *    given the node, the default count, the group's aggregates by colId, and (server-side) the
 *    raw group row.
 * One resolver, GridCore.getGroupRowLabel, feeds the cell renderer, the sticky bands' signature,
 * the clipboard, and both exports, so none of them can disagree with the screen.
 */
import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { GridCore } from "./core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { GroupChildCountParams } from "../interfaces/gridOptions";
import { IRowNode } from "../interfaces/iRowNode";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IServerSideDataSource } from "../interfaces/serverSide";
import { serializeNodesToTSV } from "../renderer/clipboard/tsv";
import { ExportRenderer } from "../renderer/exportRenderer";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", region: "EMEA", country: "UK", headcount: 4.5 },
  { id: "2", region: "EMEA", country: "France", headcount: 3 },
  { id: "3", region: "APAC", country: "Japan", headcount: 2 },
  { id: "4", region: "APAC", country: "India", headcount: 6 },
  { id: "5", region: "APAC", country: "India", headcount: 1 },
];

const COLUMN_DEFS = [
  { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
  { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
  { colId: "headcount", key: "headcount", label: "Headcount", type: ColumnType.NUMBER },
];

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps(COLUMN_DEFS);
  return core;
}

const sumHeadcount = (core: GridCore) =>
  core.setAggregateModel([{ key: core.getColumnModel().getByColId("headcount")!.instanceID, type: AggregateType.SUM }]);

function viewNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) out.push(rm.getRowNodeAtViewIndex(i)!);
  return out;
}

const groupNodes = (core: GridCore) => viewNodes(core).filter(n => n.isGroup);

/** Each visible group row's label by its key — the text the group cell paints. */
function labelByKey(core: GridCore): Record<string, string> {
  const out: Record<string, string> = {};
  for (const node of groupNodes(core)) out[node.groupKey!] = core.getGroupRowLabel(node);
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

/** Column A of the produced workbook, top to bottom — where every group label lands. */
async function firstColumn(bytes: Uint8Array | null): Promise<string[]> {
  expect(bytes).not.toBeNull();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes!) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const out: string[] = [];
  for (let r = 1; r <= ws.rowCount; r++) out.push(String(ws.getRow(r).getCell(1).value ?? ""));
  return out;
}

describe("groupChildCount — what a group row shows after its label", () => {
  it("defaults to the row count, as before", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(labelByKey(core)).toEqual({ APAC: "APAC (3)", EMEA: "EMEA (2)" });
  });

  it("false shows no count on any group", () => {
    const core = makeGrid({ groupChildCount: false });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(labelByKey(core)).toEqual({ APAC: "APAC", EMEA: "EMEA" });
  });

  it("a function writes a number, a string, or nothing per group, from the group's aggregates by colId", () => {
    const seen: GroupChildCountParams[] = [];
    const core = makeGrid({
      groupChildCount: (p: GroupChildCountParams) => {
        seen.push(p);
        // A headcount total instead of a row count; one group opts out of a count altogether.
        if (p.node.groupKey === "EMEA") return null;
        return `${p.aggregates.headcount} FTE`;
      },
    });
    sumHeadcount(core);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });

    expect(labelByKey(core)).toEqual({ APAC: "APAC (9 FTE)", EMEA: "EMEA" });
    const apac = seen.find(p => p.node.groupKey === "APAC")!;
    expect(apac.rowCount).toBe(3);
    expect(apac.aggregates).toEqual({ headcount: 9 });
    // A client-side group row is synthesized: there is no data row of its own to hand over.
    expect(apac.data).toBeUndefined();
  });

  it("an empty string is no count, not empty parentheses", () => {
    const core = makeGrid({ groupChildCount: () => "" });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(labelByKey(core)).toEqual({ APAC: "APAC", EMEA: "EMEA" });
  });

  it("applies at every grouping level", () => {
    const core = makeGrid({
      groupDefaultExpanded: -1,
      groupChildCount: (p: GroupChildCountParams) => `L${p.node.level}:${p.rowCount}`,
    });
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    expect(labelByKey(core)).toEqual({
      APAC: "APAC (L0:3)", EMEA: "EMEA (L0:2)",
      India: "India (L1:2)", Japan: "Japan (L1:1)", UK: "UK (L1:1)", France: "France (L1:1)",
    });
  });

  it("setGroupChildCount changes the policy in place and asks for one repaint", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const onRows = vi.fn();
    core.on("rowsChanged", onRows);

    core.setGroupChildCount(false);
    expect(labelByKey(core)).toEqual({ APAC: "APAC", EMEA: "EMEA" });
    expect(onRows).toHaveBeenCalledTimes(1);
    expect(onRows.mock.calls[0][0]).toMatchObject({ reason: "refresh", firstRowIndex: 0, lastRowIndex: 1 });

    core.setGroupChildCount(false); // unchanged: nothing to repaint
    expect(onRows).toHaveBeenCalledTimes(1);

    core.setGroupChildCount(undefined); // back to the default
    expect(labelByKey(core)).toEqual({ APAC: "APAC (3)", EMEA: "EMEA (2)" });
    expect(onRows).toHaveBeenCalledTimes(2);
  });
});

describe("groupChildCount — one owner for every surface", () => {
  it("the clipboard copies the label the screen shows", () => {
    const core = makeGrid({ groupChildCount: (p: GroupChildCountParams) => `${p.rowCount} rows` });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const groupCol = core.getColumnModel().getAutoGroupColumns()[0];
    const tsv = serializeNodesToTSV([groupCol], groupNodes(core), false, n => core.getGroupRowLabel(n));
    expect(tsv.split("\n").sort()).toEqual(["APAC (3 rows)", "EMEA (2 rows)"]);
  });

  it("the Excel export's group headers carry the same label", async () => {
    const core = makeGrid({ groupChildCount: (p: GroupChildCountParams) => `${p.aggregates.headcount} FTE` });
    sumHeadcount(core);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const column = await firstColumn(await makeExporter(core).getDataAsExcel());
    expect(column).toContain("APAC (9 FTE)");
    expect(column).toContain("EMEA (7.5 FTE)");
    expect(column.join("\n")).not.toMatch(/\(\d+\)/);
  });

  it("the groupRows-mode export writes the same label — never \"(0)\" when there is no count", async () => {
    const core = makeGrid({ groupDisplayType: "groupRows", groupChildCount: false });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const column = await firstColumn(await makeExporter(core).getDataAsExcel());
    expect(column).toContain("APAC");
    expect(column).toContain("EMEA");
    expect(column.join("\n")).not.toMatch(/\(\d+\)/);
  });
});

describe("groupChildCount — server-side row model", () => {
  /** The server-side grouping contract in memory: GROUP BY rows (value, COUNT(*), and a headcount
   * total the app presents) above the leaf level, raw leaves at it. */
  function makeDataSource(): IServerSideDataSource {
    return {
      getRows: ({ request, success }) => {
        const subset = ROWS.filter(row => request.groupKeys.every(k => (row as any)[k.key] === k.value));
        let rows: any[];
        if (request.groupKeys.length < request.groupBy.length) {
          const key = request.groupBy[request.groupKeys.length];
          const byValue = new Map<string, typeof ROWS>();
          for (const row of subset) {
            const v = String((row as any)[key]);
            if (!byValue.has(v)) byValue.set(v, []);
            byValue.get(v)!.push(row);
          }
          rows = Array.from(byValue.keys()).sort().map(v => {
            const leaves = byValue.get(v)!;
            return {
              [key]: (leaves[0] as any)[key],
              count: leaves.length,
              fte: leaves.reduce((s, r) => s + r.headcount, 0),
            };
          });
        } else {
          rows = subset;
        }
        const start = request.startRow ?? 0;
        const end = request.endRow ?? rows.length;
        success({ rows: rows.slice(start, end), totalRows: rows.length });
      },
    };
  }

  const flush = async () => {
    for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
  };

  it("hands the function the raw group row and getGroupChildCount's count", async () => {
    const seen: GroupChildCountParams[] = [];
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "serverSide",
      getGroupChildCount: (row: any) => row.count,
      groupChildCount: (p: GroupChildCountParams) => {
        seen.push(p);
        return `${p.data.fte} FTE`;
      },
    });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps(COLUMN_DEFS);
    core.setServerSideDataSource(makeDataSource());
    await flush();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await flush();

    expect(labelByKey(core)).toEqual({ APAC: "APAC (9 FTE)", EMEA: "EMEA (7.5 FTE)" });
    const apac = seen.find(p => p.node.groupKey === "APAC")!;
    // What the "(N)" badge would have shown: the server's count via getGroupChildCount.
    expect(apac.rowCount).toBe(3);
    expect(apac.data).toMatchObject({ region: "APAC", count: 3, fte: 9 });
  });
});
