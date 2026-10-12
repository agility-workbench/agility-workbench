/**
 * GridCore.getGroupCellValue — what a group row's cell holds: the aggregate stamped for that
 * column, else the group label on the group's label column, else nothing. Click payloads, menus
 * and the ActionFrame read it; the clipboard shares the same rule (groupCellValue).
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", region: "EMEA", country: "UK", headcount: 4.5 },
    { id: "2", region: "EMEA", country: "France", headcount: 3 },
    { id: "3", region: "APAC", country: "Japan", headcount: 2 },
  ]);
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    { colId: "headcount", key: "headcount", label: "Headcount", type: ColumnType.NUMBER },
  ]);
  core.setAggregateModel([{ key: core.getColumnModel().getByColId("headcount")!.instanceID, type: AggregateType.SUM }]);
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
  return core;
}

function viewNodes(core: GridCore): IRowNode[] {
  const rm = core.getRowModel();
  const out: IRowNode[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) out.push(rm.getRowNodeAtViewIndex(i)!);
  return out;
}

const groupNode = (core: GridCore, key: string) => viewNodes(core).find(n => n.isGroup && n.groupKey === key)!;
const col = (core: GridCore, colId: string) => core.getColumnModel().getByColId(colId)!;

describe("GridCore.getGroupCellValue", () => {
  it("reads the aggregate stamped for an aggregated column, formatted by the column", () => {
    const core = makeGrid();
    const headcount = col(core, "headcount");
    const emea = groupNode(core, "EMEA");
    const cell = core.getGroupCellValue(headcount, emea);
    expect(cell.value).toBe(7.5);
    expect(cell.formatted).toBe(headcount.formatValue(7.5, emea));
  });

  it("reads the group label on the auto-group column, with the groupChildCount policy applied", () => {
    const core = makeGrid();
    const autoGroup = core.getColumnModel().getLeaves().find(c => c.isAutoGroupColumn())!;
    expect(autoGroup).toBeDefined();
    const emea = groupNode(core, "EMEA");
    expect(core.getGroupCellValue(autoGroup, emea)).toEqual({ value: "EMEA (2)", formatted: "EMEA (2)" });

    core.setGroupChildCount(false);
    expect(core.getGroupCellValue(autoGroup, emea)).toEqual({ value: "EMEA", formatted: "EMEA" });
  });

  it("is empty for a column that is neither aggregated nor the label column", () => {
    const core = makeGrid();
    expect(core.getGroupCellValue(col(core, "country"), groupNode(core, "EMEA")))
      .toEqual({ value: undefined, formatted: "" });
  });

  it("returns the empty result for a leaf instead of throwing", () => {
    const core = makeGrid({ groupDefaultExpanded: -1 });
    const leaf = viewNodes(core).find(n => !n.isGroup)!;
    expect(leaf).toBeDefined();
    expect(core.getGroupCellValue(col(core, "headcount"), leaf)).toEqual({ value: undefined, formatted: "" });
  });
});
