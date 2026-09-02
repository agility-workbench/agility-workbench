/**
 * Pivot-mode export: the whole on-screen pivot table — auto-group labels down the side, the
 * generated nested pivot header across the top, aggregate values in the cells. Generated columns
 * are `exportable: false` (column-scoped export of one value leaf is meaningless), so the pivot
 * path admits them explicitly.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { GridCore } from "../core/core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { ExportRenderer } from "./exportRenderer";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// Region → Quarter × Revenue: EMEA Q1=20 Q2=10, APAC Q1=5 Q2=40.
const ROWS = [
  { id: "1", region: "EMEA", quarter: "Q2", revenue: 10 },
  { id: "2", region: "EMEA", quarter: "Q1", revenue: 20 },
  { id: "3", region: "APAC", quarter: "Q1", revenue: 5 },
  { id: "4", region: "APAC", quarter: "Q2", revenue: 40 },
];

function makePivotedGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "quarter", key: "quarter", label: "Quarter", type: ColumnType.STRING },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
  ]);
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
  core.dispatch({
    type: "aggregateModelSet",
    aggregateModels: [{ key: "revenue", type: AggregateType.SUM }],
  });
  core.dispatch({ type: "pivotColumnsSet", colIds: ["quarter"] });
  core.dispatch({ type: "pivotModeSet", on: true });
  const exporter = new ExportRenderer({
    core,
    leafColumns: () => core.getColumnModel().getLeaves().filter(c => !c.isInternal()),
    columnWidths: () => new Map(),
    selectionRange: () => core.getSelectionRange(),
    selectedColumnIDs: () => core.getSelectedColumnIds(),
  });
  return { core, exporter };
}

describe("pivot export", () => {
  it("emits the nested generated header and per-group aggregate rows as CSV", () => {
    const { exporter } = makePivotedGrid();
    const csv = exporter.getDataAsCsv()!;
    const lines = csv.split("\n");

    // Two header rows: the pivot-value groups, then the value leaves under them.
    expect(lines[1]).toBe(",Revenue,Revenue");
    expect(lines[0].split(",").slice(1)).toEqual(["Q1", "Q2"]);

    // One row per group node, labels with leaf counts, cells the stamped sums (Q1 then Q2).
    expect(lines).toContain("EMEA (2),20,10");
    expect(lines).toContain("APAC (2),5,40");
    expect(lines).toHaveLength(4);
  });

  it("honors a columnIds filter (the auto-group column's own export)", () => {
    const { core, exporter } = makePivotedGrid();
    const autoGroup = core.getColumnModel().getHierarchyColumn()!;
    const csv = exporter.getDataAsCsv({ columnIds: [autoGroup.instanceID] })!;
    const lines = csv.split("\n");
    expect(lines).toContain("EMEA (2)");
    expect(lines).toContain("APAC (2)");
    expect(lines.every(line => !line.includes("20,10"))).toBe(true);
  });

  it("writes real numbers for aggregate cells in the Excel export", async () => {
    const { exporter } = makePivotedGrid();
    const bytes = (await exporter.getDataAsExcel())!;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as any);
    const ws = wb.worksheets[0];

    const numbers: number[] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      for (let c = 1; c <= (ws.actualColumnCount || ws.columnCount); c++) {
        const value = ws.getRow(r).getCell(c).value;
        if (typeof value === "number") numbers.push(value);
      }
    }
    expect(numbers.sort((a, b) => a - b)).toEqual([5, 10, 20, 40]);
  });

  it("indents deeper group levels in the label column", () => {
    const { core, exporter } = makePivotedGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "quarter"] });
    const csv = exporter.getDataAsCsv()!;
    // Level-1 rows carry a two-space indent under their level-0 parent.
    expect(csv.split("\n").some(line => /^"? {2}Q1 \(\d\)/.test(line))).toBe(true);
  });
});
