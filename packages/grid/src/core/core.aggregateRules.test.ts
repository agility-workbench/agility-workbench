import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";
import { IRowNode } from "../interfaces/iRowNode";
import { AggregateModelController } from "../renderer/aggregate/modelController";

const measurer = { measure: (t: string) => t.length * 7 };

function makeGrid(rows: object[]) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(rows);
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
  ]);
  return core;
}

function groupNode(core: GridCore, key: string): IRowNode {
  const model = core.getRowModel();
  for (let i = 0; i < model.getViewCount(); i++) {
    const node = model.getRowNodeAtViewIndex(i)!;
    if (node.isGroup && node.groupKey === key) return node;
  }
  throw new Error(`no group ${key}`);
}

describe("several aggregate types on one column (outside pivot)", () => {
  it("group rows and the footer both show the last type registered", () => {
    const core = makeGrid([
      { id: "1", region: "EMEA", sales: 10 },
      { id: "2", region: "EMEA", sales: 30 },
      { id: "3", region: "APAC", sales: 5 },
    ]);
    const sales = core.getColumnModel().getByColId("sales")!;
    core.setAggregateModel([
      { key: sales.instanceID, type: AggregateType.SUM },
      { key: sales.instanceID, type: AggregateType.MAX },
    ]);
    // Both types stay in the model; only the display picks one.
    expect(core.getAggregateModelByColId().map(a => a.type)).toEqual([AggregateType.SUM, AggregateType.MAX]);
    core.setAggregateScope("all");
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });

    expect(groupNode(core, "EMEA").aggregateValues?.[sales.instanceID]).toBe(30);
    expect(groupNode(core, "APAC").aggregateValues?.[sales.instanceID]).toBe(5);

    // The footer: its value and the function its menu button names.
    expect(core.getRowModel().getAggregateValues().get(sales.instanceID)).toBe(30);
    const footer = new AggregateModelController({
      core,
      leafColumns: () => [],
      selectedColumnIDs: () => new Set(),
      markAggregatesDirty: () => {},
      requestServerAggregates: () => {},
      renderAggregateRow: () => {},
    });
    expect(footer.getAggregateOpForColumn(sales)).toBe(AggregateType.MAX);
  });
});

describe("a group with no values to aggregate", () => {
  it("shows a blank group cell and footer value instead of 0", () => {
    const core = makeGrid([
      { id: "1", region: "EMEA", sales: 10 },
      { id: "2", region: "APAC", sales: null },
      { id: "3", region: "APAC", sales: "" },
    ]);
    const sales = core.getColumnModel().getByColId("sales")!;
    core.setAggregateModel([{ key: sales.instanceID, type: AggregateType.SUM }]);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });

    const apac = groupNode(core, "APAC");
    expect(apac.aggregateValues?.[sales.instanceID]).toBeNull();
    expect(core.getGroupCellValue(sales, apac)).toEqual({ value: undefined, formatted: "" });
    expect(groupNode(core, "EMEA").aggregateValues?.[sales.instanceID]).toBe(10);
  });
});
