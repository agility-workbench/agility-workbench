import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { ColumnMenuContext } from "./context";
import { ColumnMenuService } from "./columnMenuService";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

function makeGrid(nonAggregatable: string[] = []) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([{ id: "1", name: "A", qty: 10 }]);
  core.setColumnDefsFromProps([
    {
      colId: "name",
      key: "name",
      label: "Name",
      type: ColumnType.STRING,
      aggregatable: !nonAggregatable.includes("name"),
    },
    {
      colId: "qty",
      key: "qty",
      label: "Qty",
      type: ColumnType.NUMBER,
      aggregatable: !nonAggregatable.includes("qty"),
    },
  ]);
  return core;
}

function instanceId(core: GridCore, colId: string): string {
  return core.getColumnModel().getByColId(colId)!.instanceID;
}

function aggregateItem(core: GridCore, colIds: string[]) {
  const ctx: ColumnMenuContext = {
    trigger: "columnMenuButton",
    targetColId: colIds[0],
    colIds,
  };
  return new ColumnMenuService(core).buildDefaultColumnMenu(ctx).find(
    item => item.id === "aggregateColumns",
  );
}

describe("column menu aggregatable capability", () => {
  it("includes aggregation by default", () => {
    const core = makeGrid();
    expect(aggregateItem(core, [instanceId(core, "qty")])).toBeTruthy();
  });

  it("omits aggregation when the target column is not aggregatable", () => {
    const core = makeGrid(["qty"]);
    expect(aggregateItem(core, [instanceId(core, "qty")])).toBeUndefined();
  });

  it("omits aggregation when any selected column is not aggregatable", () => {
    const core = makeGrid(["name"]);
    expect(aggregateItem(core, [
      instanceId(core, "qty"),
      instanceId(core, "name"),
    ])).toBeUndefined();
  });
});
