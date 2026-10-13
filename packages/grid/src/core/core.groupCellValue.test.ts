/**
 * GridCore.getGroupCellValue — what a group row's cell holds: the aggregate stamped for that
 * column, else the group label on the group's label column, else the column's groupValueGetter
 * result, else nothing. Click payloads, menus
 * and the ActionFrame read it; the clipboard shares the same rule (groupCellValue).
 */
import { describe, expect, it, vi } from "vitest";
import { GridCore } from "./core";
import { AggregateType } from "../interfaces/aggregate";
import { ColDef, ColumnType, GroupValueGetterParams } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: object = {}, extraCols: ColDef[] = []) {
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
    ...extraCols,
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

describe("GridCore.getGroupCellValue — groupValueGetter", () => {
  const target = (getter: ColDef["groupValueGetter"], over: Partial<ColDef> = {}): ColDef => ({
    colId: "target", key: "target", label: "Target", type: ColumnType.NUMBER,
    groupValueGetter: getter,
    valueFormatter: ({ value }) => (value == null ? "" : `#${value}`),
    ...over,
  });

  it("holds the getter's result on a column with no aggregate, formatted by the column", () => {
    const core = makeGrid({}, [target(({ node }) => (node.groupKey === "EMEA" ? 10 : 20))]);
    expect(core.getGroupCellValue(col(core, "target"), groupNode(core, "EMEA")))
      .toEqual({ value: 10, formatted: "#10" });
    expect(core.getGroupCellValue(col(core, "target"), groupNode(core, "APAC")))
      .toEqual({ value: 20, formatted: "#20" });
  });

  it("loses to the aggregate when the column has both", () => {
    const getter = vi.fn(() => 999);
    const core = makeGrid();
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
      { colId: "headcount", key: "headcount", label: "Headcount", type: ColumnType.NUMBER, groupValueGetter: getter },
    ]);
    core.setAggregateModel([{ key: col(core, "headcount").instanceID, type: AggregateType.SUM }]);
    expect(core.getGroupCellValue(col(core, "headcount"), groupNode(core, "EMEA")).value).toBe(7.5);
    expect(getter).not.toHaveBeenCalled();
  });

  it("loses to the label on the group's label column", () => {
    const getter = vi.fn(() => "from getter");
    const core = makeGrid({ groupColumnDef: { groupValueGetter: getter } });
    const autoGroup = core.getColumnModel().getLeaves().find(c => c.isAutoGroupColumn())!;
    expect(autoGroup.groupValueGetter).toBe(getter);
    expect(core.getGroupCellValue(autoGroup, groupNode(core, "EMEA")).value).toBe("EMEA (2)");
    expect(getter).not.toHaveBeenCalled();
  });

  it("receives the group node, its aggregates by public colId, and no data client-side", () => {
    const seen: GroupValueGetterParams[] = [];
    const core = makeGrid({}, [target(p => { seen.push(p); return null; }, { colId: "tgt", key: "target" })]);
    const emea = groupNode(core, "EMEA");
    core.getGroupCellValue(col(core, "tgt"), emea);
    expect(seen).toHaveLength(1);
    expect(seen[0].node).toBe(emea);
    expect(seen[0].data).toBeUndefined();
    // Keyed by colId, not the instance id the node stamps them under.
    expect(seen[0].aggregates).toEqual({ headcount: 7.5 });
  });

  it("is never called for a leaf, which keeps the empty result", () => {
    const getter = vi.fn(() => 1);
    const core = makeGrid({ groupDefaultExpanded: -1 }, [target(getter)]);
    const leaf = viewNodes(core).find(n => !n.isGroup)!;
    expect(core.getGroupCellValue(col(core, "target"), leaf)).toEqual({ value: undefined, formatted: "" });
    expect(getter).not.toHaveBeenCalled();
  });

  it("inherits through defaultColDef like valueGetter", () => {
    const getter = vi.fn(() => 5);
    const core = makeGrid({ defaultColDef: { groupValueGetter: getter } });
    expect(col(core, "country").groupValueGetter).toBe(getter);
    expect(core.getGroupCellValue(col(core, "country"), groupNode(core, "EMEA")).value).toBe(5);
  });
});
