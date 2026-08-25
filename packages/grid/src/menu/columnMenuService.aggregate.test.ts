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

describe("column menu additive aggregate toggles", () => {
  const ctxFor = (colIds: string[]): ColumnMenuContext => ({
    trigger: "columnMenuButton",
    targetColId: colIds[0],
    colIds,
  });
  const subItem = (core: GridCore, colIds: string[], id: string) =>
    aggregateItem(core, colIds)!.subMenu!.find(item => item.id === id)!;

  it("accumulates types per column and checkmarks the applied ones", () => {
    const core = makeGrid();
    const service = new ColumnMenuService(core);
    const qty = instanceId(core, "qty");

    service.execute(subItem(core, [qty], "aggSum"), ctxFor([qty]));
    expect(core.getAggregateModel()).toEqual([{ key: qty, type: "sum" }]);

    // A second type joins the first instead of replacing it — each is a distinct pivot measure.
    service.execute(subItem(core, [qty], "aggAvg"), ctxFor([qty]));
    expect(core.getAggregateModel()).toEqual([
      { key: qty, type: "sum" },
      { key: qty, type: "avg" },
    ]);

    expect(subItem(core, [qty], "aggSum").right).toBe("icon-check");
    expect(subItem(core, [qty], "aggAvg").right).toBe("icon-check");
    expect(subItem(core, [qty], "aggMin").right).toBeUndefined();
  });

  it("toggles an applied type off", () => {
    const core = makeGrid();
    const service = new ColumnMenuService(core);
    const qty = instanceId(core, "qty");

    service.execute(subItem(core, [qty], "aggSum"), ctxFor([qty]));
    service.execute(subItem(core, [qty], "aggAvg"), ctxFor([qty]));
    service.execute(subItem(core, [qty], "aggSum"), ctxFor([qty]));
    expect(core.getAggregateModel()).toEqual([{ key: qty, type: "avg" }]);
  });

  it("clears every type on the column through Clear Aggregation", () => {
    const core = makeGrid();
    const service = new ColumnMenuService(core);
    const qty = instanceId(core, "qty");

    service.execute(subItem(core, [qty], "aggSum"), ctxFor([qty]));
    service.execute(subItem(core, [qty], "aggAvg"), ctxFor([qty]));
    service.execute(subItem(core, [qty], "aggClear"), ctxFor([qty]));
    expect(core.getAggregateModel()).toEqual([]);
  });

  it("keeps single-choice semantics for a payload marked mode: replace (the footer picker)", () => {
    const core = makeGrid();
    const service = new ColumnMenuService(core);
    const qty = instanceId(core, "qty");

    service.execute(subItem(core, [qty], "aggSum"), ctxFor([qty]));
    const avg = subItem(core, [qty], "aggAvg");
    service.execute(
      { ...avg, payload: { ...avg.payload, mode: "replace" } },
      ctxFor([qty]),
    );
    expect(core.getAggregateModel()).toEqual([{ key: qty, type: "avg" }]);
  });
});
