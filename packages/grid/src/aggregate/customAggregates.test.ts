import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridAPI } from "../api/api";
import { GridCore } from "../core/core";
import { AggregateFunction, AggregateType } from "../interfaces/aggregate";
import { ColDef, ColumnType } from "../interfaces/column";
import { GridOptions } from "../interfaces/gridOptions";
import { IRowNode } from "../interfaces/iRowNode";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { ColumnMenuService } from "../menu/columnMenuService";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

// Revenue-weighted average price: what a plain avg of prices gets wrong.
const weightedPrice: AggregateFunction = ({ rows }) => {
  let revenue = 0;
  let units = 0;
  for (const row of rows) {
    revenue += row.data.price * row.data.units;
    units += row.data.units;
  }
  return units === 0 ? null : revenue / units;
};
const joined: AggregateFunction = ({ values }) =>
  [...new Set(values.filter(v => v != null && v !== ""))].join(", ");

const ROWS = [
  { id: "1", region: "West", rep: "Ann", units: 1, price: 10 },
  { id: "2", region: "West", rep: "Bob", units: 3, price: 20 },
  { id: "3", region: "East", rep: "", units: 2, price: 30 },
  { id: "4", region: "East", rep: "Cid", units: 2, price: 40 },
];

const DEFS: ColDef[] = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "rep", key: "rep", label: "Rep" },
  { colId: "units", key: "units", label: "Units", type: ColumnType.NUMBER },
  { colId: "price", key: "price", label: "Price", type: ColumnType.NUMBER },
];

function makeGrid(defs: ColDef[] = DEFS, options: GridOptions = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", aggFuncs: { weightedPrice, joined }, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps(defs);
  core.setRowData(ROWS.map(row => ({ ...row })));
  return { core, api: new GridAPI(core) };
}

const withAggFunc = (colId: string, aggFunc: string, extra: Partial<ColDef> = {}): ColDef[] =>
  DEFS.map(def => (def.colId === colId ? { ...def, aggFunc, ...extra } : def));

function instanceId(core: GridCore, colId: string): string {
  return core.getColumnModel().getByColId(colId)!.instanceID;
}

function groupNode(core: GridCore, key: string): IRowNode {
  const model = core.getRowModel();
  for (let i = 0; i < model.getViewCount(); i++) {
    const node = model.getRowNodeAtViewIndex(i);
    if (node?.type === "group" && node.groupKey === key) return node;
  }
  throw new Error(`no group row ${key}`);
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe("ColDef.aggFunc", () => {
  it("joins the initial aggregate model as if setAggregates had listed it (footer on at page scope)", () => {
    const { core, api } = makeGrid(withAggFunc("price", "weightedPrice"));
    expect(api.getAggregates()).toEqual([{ colId: "price", type: "weightedPrice" }]);
    expect(core.getAggregateScope()).toBe("page");
  });

  it("is the column's default function for the footer and the menu's current function", () => {
    const { core, api } = makeGrid(withAggFunc("units", AggregateType.MAX));
    const units = core.getColumnModel().getByColId("units")!;
    expect(core.getDefaultAggregateType(units)).toBe(AggregateType.MAX);
    // Removing it from the model keeps it as the default the footer computes with.
    api.setAggregates([{ colId: "price", type: AggregateType.SUM }]);
    expect(core.getRowModel().getAggregateValues().get(units.instanceID)).toBe(3);
  });

  it("does not re-seed: setAggregates([]) clears it and a colDef swap leaves the removal in place", () => {
    const defs = withAggFunc("price", "weightedPrice");
    const { core, api } = makeGrid(defs);
    api.setAggregates([]);
    expect(api.getAggregates()).toEqual([]);
    core.setColumnDefsFromProps(defs.map(def => ({ ...def })));
    expect(api.getAggregates()).toEqual([]);
  });

  it("shows its per-group values on group rows", () => {
    const { core, api } = makeGrid(withAggFunc("price", "weightedPrice"));
    api.setRowGroupColumns(["region"]);
    const price = instanceId(core, "price");
    // West: (10·1 + 20·3) / 4 = 17.5; East: (30·2 + 40·2) / 4 = 35.
    expect(groupNode(core, "West").aggregateValues?.[price]).toBe(17.5);
    expect(groupNode(core, "East").aggregateValues?.[price]).toBe(35);
  });

  it("an unknown name warns once and the column keeps the built-in rule (and is not seeded)", () => {
    const defs = withAggFunc("price", "typo");
    const { core, api } = makeGrid(defs);
    core.setColumnDefsFromProps(defs.map(def => ({ ...def })));
    expect(api.getAggregates()).toEqual([]);
    expect(core.getDefaultAggregateType(core.getColumnModel().getByColId("price")!)).toBe(AggregateType.SUM);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("typo");
  });

  it("is ignored with a warning on an aggregatable: false column", () => {
    const { core, api } = makeGrid(withAggFunc("price", AggregateType.AVG, { aggregatable: false }));
    expect(api.getAggregates()).toEqual([]);
    expect(core.getDefaultAggregateType(core.getColumnModel().getByColId("price")!)).toBe(AggregateType.SUM);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("not aggregatable");
  });
});

describe("custom names in the aggregate model", () => {
  it("setAggregates accepts a registered name; getAggregates reads it back as given", () => {
    const { api } = makeGrid();
    api.setAggregates([{ colId: "rep", type: "joined" }, { colId: "price", type: AggregateType.LAST }]);
    expect(api.getAggregates()).toEqual([
      { colId: "rep", type: "joined" },
      { colId: "price", type: AggregateType.LAST },
    ]);
  });

  it("an unknown name warns once and falls back to the column's default function", () => {
    const { api } = makeGrid(withAggFunc("units", AggregateType.MIN));
    api.setAggregates([{ colId: "units", type: "nope" }, { colId: "price", type: "nope" }]);
    expect(api.getAggregates()).toEqual([
      { colId: "units", type: AggregateType.MIN }, // its ColDef.aggFunc
      { colId: "price", type: AggregateType.SUM }, // the built-in rule
    ]);
    api.setAggregates([{ colId: "price", type: "nope" }]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("computes the footer over the page or the whole dataset, per scope", () => {
    const { core, api } = makeGrid(DEFS, { pagination: true, pageSize: 2 });
    api.setAggregates([{ colId: "price", type: "weightedPrice" }, { colId: "rep", type: "joined" }]);
    const price = instanceId(core, "price");
    const rep = instanceId(core, "rep");
    expect(core.getAggregateScope()).toBe("page");
    expect(core.getRowModel().getAggregateValues().get(price)).toBe(17.5);
    expect(core.getRowModel().getAggregateValues().get(rep)).toBe("Ann, Bob");
    core.setAggregateScope("all");
    expect(core.getRowModel().getAggregateValues().get(price)).toBe(26.25); // 210 / 8
    expect(core.getRowModel().getAggregateValues().get(rep)).toBe("Ann, Bob, Cid");
  });

  it("first / last follow the display order, after sorting", () => {
    const { core, api } = makeGrid();
    api.setRowGroupColumns(["region"]);
    api.setAggregates([{ colId: "rep", type: AggregateType.FIRST }, { colId: "units", type: AggregateType.LAST }]);
    const rep = instanceId(core, "rep");
    expect(groupNode(core, "West").aggregateValues?.[rep]).toBe("Ann");
    // East's first rep is blank, so first skips to the next non-blank one.
    expect(groupNode(core, "East").aggregateValues?.[rep]).toBe("Cid");
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "rep", dir: "desc" }] });
    expect(groupNode(core, "West").aggregateValues?.[rep]).toBe("Bob");
  });

  it("round-trips through a saved view", () => {
    const { api } = makeGrid();
    api.setAggregates([{ colId: "price", type: "weightedPrice" }, { colId: "rep", type: AggregateType.FIRST }]);
    const state = api.captureViewState();
    const other = makeGrid();
    other.api.applyViewState(JSON.parse(JSON.stringify(state)));
    expect(other.api.getAggregates()).toEqual([
      { colId: "price", type: "weightedPrice" },
      { colId: "rep", type: AggregateType.FIRST },
    ]);
  });

  it("pivots on a custom measure: a generated column per path, valued by the function", () => {
    const { core, api } = makeGrid();
    api.setRowGroupColumns(["region"]);
    api.setAggregates([{ colId: "price", type: "weightedPrice" }]);
    api.setPivotColumns(["rep"]);
    api.setPivotMode(true);
    const leaves = api.getPivotResultColumns();
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.every(desc => desc.aggregateType === "weightedPrice" && desc.valueColId === "price")).toBe(true);
    const bob = leaves.find(desc => desc.groupPath[0] === "Bob")!;
    const bobCol = core.getColumnModel().getPivotResultLeaf(bob.colId)!;
    expect(groupNode(core, "West").aggregateValues?.[bobCol.instanceID]).toBe(20);
  });

  it("a custom name with the colId separator still makes a parseable pivot id", () => {
    const { api } = makeGrid(DEFS, { aggFuncs: { "p|95": () => 1 } });
    api.setAggregates([{ colId: "price", type: "p|95" }]);
    api.setPivotMode(true);
    expect(api.getPivotResultColumns().map(desc => desc.aggregateType)).toEqual(["p|95"]);
  });
});

describe("aggregate menu", () => {
  function subMenuIds(core: GridCore, colId: string) {
    const item = new ColumnMenuService(core)
      .buildDefaultColumnMenu({ trigger: "columnMenuButton", targetColId: instanceId(core, colId), colIds: [instanceId(core, colId)] })
      .find(entry => entry.id === "aggregateColumns")!;
    return item.subMenu!.map(sub => ({ id: sub.id, label: sub.label, agg: sub.payload?.agg }));
  }

  it("lists first / last and then the custom functions, by name, after the built-ins", () => {
    const { core } = makeGrid();
    expect(subMenuIds(core, "price")).toEqual([
      { id: "aggSum", label: "Sum", agg: AggregateType.SUM },
      { id: "aggAvg", label: "Average", agg: AggregateType.AVG },
      { id: "aggMin", label: "Min", agg: AggregateType.MIN },
      { id: "aggMax", label: "Max", agg: AggregateType.MAX },
      { id: "aggMedian", label: "Median", agg: AggregateType.MEDIAN },
      { id: "aggFirst", label: "First", agg: AggregateType.FIRST },
      { id: "aggLast", label: "Last", agg: AggregateType.LAST },
      { id: "aggCustom:weightedPrice", label: "weightedPrice", agg: "weightedPrice" },
      { id: "aggCustom:joined", label: "joined", agg: "joined" },
    ]);
  });

  it("toggles a custom function onto the column like a built-in", () => {
    const { core, api } = makeGrid();
    const service = new ColumnMenuService(core);
    const ctx = { trigger: "columnMenuButton" as const, targetColId: instanceId(core, "rep"), colIds: [instanceId(core, "rep")] };
    const item = service.buildDefaultColumnMenu(ctx).find(entry => entry.id === "aggregateColumns")!
      .subMenu!.find(sub => sub.id === "aggCustom:joined")!;
    service.execute(item, ctx);
    expect(api.getAggregates()).toEqual([{ colId: "rep", type: "joined" }]);
  });
});
