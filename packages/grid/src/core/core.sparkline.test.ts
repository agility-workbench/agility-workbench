import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IRowNode } from "../interfaces/iRowNode";
import { SparklineRenderer, SparklineParams } from "../cellRenderers/sparklineRenderer";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeCore(columns: Parameters<GridCore["setColumnDefsFromProps"]>[0]) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans",
    cellFont: "12px sans",
    reason: "test",
  });
  core.setRowData([{ id: "1", a: 10, b: 20, c: 30 }]);
  core.setColumnDefsFromProps(columns);
  return core;
}

function addSparkline(
  core: GridCore,
  targetColId: string,
  colIds: string[],
) {
  core.dispatch({
    type: "addSparklineColumn",
    targetColId,
    colIds,
    sparklineType: "line",
    newColId: "trend",
  });
  return core.getColumnModel().getByColId("trend")!;
}

function row(core: GridCore): IRowNode {
  return core.getRowModel().getRowNode("1")!;
}

describe("menu-created sparkline columns", () => {
  it("derives its array value from the selected columns and passes no colIds to the renderer", () => {
    const core = makeCore([
      { colId: "a", key: "a", label: "A", type: ColumnType.NUMBER },
      { colId: "b", key: "b", label: "B", type: ColumnType.NUMBER },
      { colId: "c", key: "c", label: "C", type: ColumnType.NUMBER },
    ]);
    const ids = ["c", "a"].map(id => core.getColumnModel().getByColId(id)!.instanceID);
    const trend = addSparkline(core, ids[0], ids);

    expect(trend.getValue(row(core))).toEqual([["C", 30], ["A", 10]]);
    expect(trend.cellRenderer).toBe(SparklineRenderer);
    expect(trend.cellRendererParams).toMatchObject({
      type: "line",
      showPoints: true,
    });
    expect(trend.cellRendererParams).not.toHaveProperty("colIds");
  });

  it("uses the target column's explicit formatter before every selected-column formatter", () => {
    const core = makeCore([
      {
        colId: "a",
        key: "a",
        label: "A",
        type: ColumnType.NUMBER,
        valueFormatter: ({ value, col }) => `target:${col?.label}:${value}`,
      },
      {
        colId: "b",
        key: "b",
        label: "B",
        type: ColumnType.NUMBER,
        valueFormatter: ({ value }) => `other:${value}`,
      },
    ]);
    const a = core.getColumnModel().getByColId("a")!.instanceID;
    const b = core.getColumnModel().getByColId("b")!.instanceID;
    const trend = addSparkline(core, a, [b, a]);
    const formatter = (trend.cellRendererParams as SparklineParams).tooltipValueFormatter!;

    expect(formatter({
      xValue: "B",
      yValue: 20,
      value: 20,
      index: 0,
      data: row(core).data,
      rowNode: row(core),
      rowId: "1",
      rowIndex: 0,
      colDef: trend,
      api: {} as any,
    })).toBe("B: target:A:20");
  });

  it("falls back to the first explicitly formatted selected column", () => {
    const core = makeCore([
      { colId: "a", key: "a", label: "A", type: ColumnType.NUMBER },
      {
        colId: "b",
        key: "b",
        label: "B",
        type: ColumnType.NUMBER,
        valueFormatter: ({ value, col }) => `selected:${col?.label}:${value}`,
      },
      {
        colId: "c",
        key: "c",
        label: "C",
        type: ColumnType.NUMBER,
        valueFormatter: ({ value }) => `later:${value}`,
      },
    ]);
    const ids = ["a", "b", "c"].map(id => core.getColumnModel().getByColId(id)!.instanceID);
    const trend = addSparkline(core, ids[0], ids);
    const formatter = (trend.cellRendererParams as SparklineParams).tooltipValueFormatter!;

    expect(formatter({
      xValue: "B",
      yValue: 20,
      value: 20,
      index: 1,
      data: row(core).data,
      rowNode: row(core),
      rowId: "1",
      rowIndex: 0,
      colDef: trend,
      api: {} as any,
    })).toBe("B: selected:B:20");
  });

  it("uses the target datatype's default formatter when none is explicit", () => {
    const core = makeCore([
      {
        colId: "a",
        key: "a",
        label: "A",
        type: ColumnType.CURRENCY,
        formatterOptions: { currency: "EUR", locale: "en-IE" },
      },
      {
        colId: "b",
        key: "b",
        label: "B",
        type: ColumnType.CURRENCY,
      },
    ]);
    const ids = ["a", "b"].map(id => core.getColumnModel().getByColId(id)!.instanceID);
    const trend = addSparkline(core, ids[0], ids);
    const formatter = (trend.cellRendererParams as SparklineParams).tooltipValueFormatter!;

    expect(formatter({
      xValue: "A",
      yValue: 0,
      value: 0,
      index: 0,
      data: row(core).data,
      rowNode: row(core),
      rowId: "1",
      rowIndex: 0,
      colDef: trend,
      api: {} as any,
    })).toContain("€");
  });
});
