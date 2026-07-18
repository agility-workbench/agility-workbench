import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnModel } from "./columnModel";
import { ITextMeasurer, TextMeasureParams } from "../interfaces/iTextMeasure";
import { IRowNode } from "../interfaces/iRowNode";
import { ColumnType } from "../interfaces/column";

// Width proportional to text length so content-based sizing is observable.
const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };
const measureParams: TextMeasureParams = { headerFont: "14px Arial", cellFont: "14px Arial" };

const rowNode = (data: any): IRowNode => ({ data } as IRowNode);

function makeModel(): ColumnModel {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  const model = core.getColumnModel() as ColumnModel;
  model.setColumnDefs([
    { colId: "a", key: "a", label: "A", type: ColumnType.STRING },
    { colId: "b", key: "b", label: "B", type: ColumnType.STRING },
  ]);
  return model;
}

describe("manual column resize persistence", () => {
  it("keeps a user-resized width through a later computeColumnWidths recompute", () => {
    const model = makeModel();
    const rows = [rowNode({ a: "x", b: "y" })];

    const a = model.getByColId("a")!;
    model.resizeColumn(a.instanceID, 321);
    expect(a.computedWidth).toBe(321);
    expect(a.resizedWidth).toBe(321);

    // A column-state action (grouping / data refresh / etc.) triggers a full re-measure.
    model.computeColumnWidths(measurer, measureParams, rows);

    // The manually-resized column holds; siblings are free to re-measure.
    expect(a.computedWidth).toBe(321);
  });

  it("does not pin columns that were never manually resized", () => {
    const model = makeModel();
    const rows = [rowNode({ a: "x", b: "a very long value that forces a wide column" })];

    const b = model.getByColId("b")!;
    expect(b.resizedWidth).toBeUndefined();

    model.computeColumnWidths(measurer, measureParams, rows);
    // b auto-fit to its content (no manual override), so it grew past the default.
    expect(b.computedWidth).toBeGreaterThan(200);
    expect(b.resizedWidth).toBeUndefined();
  });

  it("preserves a resized width across grouping (which reuses the same Column instances)", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "14px Arial", cellFont: "14px Arial", reason: "test" });
    const model = core.getColumnModel() as ColumnModel;
    core.setRowData([
      { id: "1", region: "EMEA", sales: 10 },
      { id: "2", region: "APAC", sales: 20 },
    ]);
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
      { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
    ]);

    const sales = () => model.getByColId("sales")!;
    core.dispatch({ type: "columnResize", colId: sales().instanceID, widthPx: 300 });
    expect(sales().computedWidth).toBe(300);

    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    // Grouping runs an implicit autosize; the manual width must survive it.
    expect(sales().computedWidth).toBe(300);
  });

  it("explicit autosize (columnAutosize) clears the manual override and re-measures", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "14px Arial", cellFont: "14px Arial", reason: "test" });
    const model = core.getColumnModel() as ColumnModel;
    core.setRowData([{ id: "1", region: "EMEA" }]);
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    ]);

    const region = () => model.getByColId("region")!;
    core.dispatch({ type: "columnResize", colId: region().instanceID, widthPx: 300 });
    expect(region().resizedWidth).toBe(300);

    core.dispatch({ type: "columnAutosize", colId: region().instanceID });
    // Fit-to-content wins: override cleared and width re-measured (not the 300 manual value).
    expect(region().resizedWidth).toBeUndefined();
    expect(region().computedWidth).not.toBe(300);
  });
});
