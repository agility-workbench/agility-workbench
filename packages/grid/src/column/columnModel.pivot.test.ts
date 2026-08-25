import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnModel } from "./columnModel";
import { Column } from "./column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { ColDef, ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";
import { buildPivotResultColDefs } from "./pivotResultColumns";
import { PivotDiscovery, PivotValueEntry } from "../interfaces/pivot";
import { BLANK_GROUP_KEY } from "../csrm/rowGroup";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const USER_DEFS: ColDef[] = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "quarter", key: "quarter", label: "Quarter" },
  { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
];

function makeModel(defs: ColDef[] = USER_DEFS): ColumnModel {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  const model = core.getColumnModel() as ColumnModel;
  model.setColumnDefs(defs);
  return model;
}

function entryFor(model: ColumnModel, colId: string, type: AggregateType): PivotValueEntry {
  const column = model.getByColId(colId)!;
  return { column, instanceID: column.instanceID, colId: column.colId, label: column.label, type };
}

// A one-level discovery over `quarter` with the given keys, valued by `revenue` sums.
function discoveryFor(model: ColumnModel, keys: string[], entries?: PivotValueEntry[]): PivotDiscovery {
  return {
    roots: keys.map(key => ({ key, value: key === BLANK_GROUP_KEY ? null : key, children: [] })),
    valueEntries: entries ?? [entryFor(model, "revenue", AggregateType.SUM)],
    pivotColumnCount: 1,
    truncatedLeafCount: 0,
  };
}

function defsFor(model: ColumnModel, keys: string[], overlay?: Partial<ColDef>, entries?: PivotValueEntry[]): ColDef[] {
  return buildPivotResultColDefs({
    discovery: discoveryFor(model, keys, entries),
    pivotColumns: [model.getByColId("quarter")!],
    pivotResultColumnDef: overlay,
  });
}

describe("buildPivotResultColDefs", () => {
  it("builds one group per pivot value with one leaf per value entry, deterministic ids", () => {
    const model = makeModel();
    const defs = defsFor(model, ["Q1", "Q2"]);
    expect(defs.map(d => d.colId)).toEqual(["pv:Q1", "pv:Q2"]);
    expect(defs.map(d => d.label)).toEqual(["Q1", "Q2"]);
    expect(defs[0].children!.map(c => c.colId)).toEqual(["pv:Q1|revenue|sum"]);
    expect(defs[0].children![0].label).toBe("Revenue");
  });

  it("suffixes the aggregate only when a source column carries several aggregates", () => {
    const model = makeModel();
    const entries = [
      entryFor(model, "revenue", AggregateType.SUM),
      entryFor(model, "revenue", AggregateType.AVG),
    ];
    const defs = defsFor(model, ["Q1"], undefined, entries);
    expect(defs[0].children!.map(c => c.label)).toEqual(["Revenue (sum)", "Revenue (avg)"]);
  });

  it("emits bare leaves at the root path when there are no pivot columns", () => {
    const model = makeModel();
    const discovery: PivotDiscovery = {
      roots: [],
      valueEntries: [entryFor(model, "revenue", AggregateType.SUM)],
      pivotColumnCount: 0,
      truncatedLeafCount: 0,
    };
    const defs = buildPivotResultColDefs({ discovery, pivotColumns: [] });
    expect(defs.map(d => d.colId)).toEqual(["pv:|revenue|sum"]);
    expect(defs[0].children).toBeUndefined();
  });

  it("lets the overlay style leaves but never override identity or behavior locks", () => {
    const model = makeModel();
    const defs = defsFor(model, ["Q1"], { width: 90, editable: true, movable: true, colId: "hijack" } as Partial<ColDef>);
    const leaf = defs[0].children![0];
    expect(leaf.width).toBe(90);
    expect(leaf.editable).toBe(false);
    expect(leaf.movable).toBe(false);
    expect(leaf.colId).toBe("pv:Q1|revenue|sum");
  });
});

describe("ColumnModel pivot display", () => {
  it("swaps to auto-group + generated columns, keeping source columns resolvable", () => {
    const model = makeModel();
    const revenue = model.getByColId("revenue")!;
    const { resolution, changed } = model.setPivotResultColumns(defsFor(model, ["Q1", "Q2"]));

    expect(changed).toBe(true);
    expect(model.isPivotDisplayActive()).toBe(true);
    const leaves = model.getLeaves();
    expect(leaves[0].isAutoGroupColumn()).toBe(true);
    expect(leaves.slice(1).every(c => c.isPivotResultColumn())).toBe(true);
    expect(leaves.slice(1).map(c => c.colId)).toEqual(["pv:Q1|revenue|sum", "pv:Q2|revenue|sum"]);
    // The mapping points at the live generated instances.
    expect(resolution.get("pv:Q1|revenue|sum")).toBe(leaves[1].instanceID);
    // Source columns stay resolvable for group/aggregate/filter reconciliation…
    expect(model.getByColId("revenue")).toBe(revenue);
    expect(model.getById(revenue.instanceID)).toBe(revenue);
    // …and are reported as the pivot sources.
    expect(model.getPivotSourceColumns().map(c => c.colId)).toEqual(["region", "quarter", "revenue"]);
    expect(model.getPivotSourceLeaves().map(c => c.colId)).toEqual(["region", "quarter", "revenue"]);
  });

  it("reuses generated instances by colId across re-discoveries, keeping runtime state", () => {
    const model = makeModel();
    model.setPivotResultColumns(defsFor(model, ["Q1", "Q2"]));
    const q1 = model.getLeaves()[1];
    q1.resizedWidth = 333;
    q1.computedWidth = 333;

    // Q2 vanishes (filter), Q3 appears — Q1 must be the SAME instance with its width intact.
    const { changed } = model.setPivotResultColumns(defsFor(model, ["Q1", "Q3"]));
    expect(changed).toBe(true);
    const leavesAfter = model.getLeaves();
    expect(leavesAfter[1]).toBe(q1);
    expect(leavesAfter[1].computedWidth).toBe(333);
    expect(leavesAfter.slice(1).map(c => c.colId)).toEqual(["pv:Q1|revenue|sum", "pv:Q3|revenue|sum"]);

    // Q2 returns: the registry still holds its instance from the first discovery.
    const before = new Set(leavesAfter.map(c => c.instanceID));
    model.setPivotResultColumns(defsFor(model, ["Q1", "Q2", "Q3"]));
    const q2 = model.getLeaves().find(c => c.colId === "pv:Q2|revenue|sum")!;
    expect(before.has(q2.instanceID)).toBe(false); // sanity: not one of the survivors…
    const again = model.setPivotResultColumns(defsFor(model, ["Q2"]));
    expect(again.resolution.get("pv:Q2|revenue|sum")).toBe(q2.instanceID); // …but stable itself
  });

  it("treats an identical discovery as a no-op", () => {
    const model = makeModel();
    const first = model.setPivotResultColumns(defsFor(model, ["Q1", "Q2"]));
    const second = model.setPivotResultColumns(defsFor(model, ["Q1", "Q2"]));
    expect(second.changed).toBe(false);
    expect([...second.resolution.entries()]).toEqual([...first.resolution.entries()]);
  });

  it("restores the source layout exactly on exit", () => {
    const model = makeModel();
    const beforeIds = model.getLeaves().map(c => c.instanceID);
    model.setPivotResultColumns(defsFor(model, ["Q1"]));
    model.setPivotDisplay(false);
    expect(model.isPivotDisplayActive()).toBe(false);
    expect(model.getLeaves().map(c => c.instanceID)).toEqual(beforeIds);
    expect(model.getLeaves().every(c => !c.isPivotResultColumn())).toBe(true);
  });

  it("captures column state from the stashed sources while pivoted", () => {
    const model = makeModel();
    model.setPivotResultColumns(defsFor(model, ["Q1", "Q2"]));
    const state = model.getColumnState();
    expect(state.map(s => s.colId)).toEqual(["region", "quarter", "revenue"]);
  });

  it("routes setColumnDefs to the stash while pivoted and keeps the pivot layout up", () => {
    const model = makeModel();
    model.setPivotResultColumns(defsFor(model, ["Q1"]));
    const revenueBefore = model.getByColId("revenue")!;
    model.setColumnDefs([
      { colId: "revenue", key: "revenue", label: "Revenue²", type: ColumnType.NUMBER },
      { colId: "margin", key: "margin", label: "Margin", type: ColumnType.NUMBER },
    ]);
    // Layout unchanged (still pivot)…
    expect(model.getLeaves().some(c => c.isPivotResultColumn())).toBe(true);
    // …stash swapped, instance reused by colId, new column resolvable.
    expect(model.getPivotSourceColumns().map(c => c.colId)).toEqual(["revenue", "margin"]);
    expect(model.getByColId("revenue")).toBe(revenueBefore);
    expect(model.getByColId("revenue")!.label).toBe("Revenue²");
    expect(model.getByColId("margin")).toBeDefined();
  });

  it("keeps the forced auto-group column when the group model changes while pivoted", () => {
    const model = makeModel();
    model.setPivotResultColumns(defsFor(model, ["Q1"]));
    const region = model.getByColId("region")!;
    model.setRowGroupColumns([region], "multipleColumns", false);
    const leaves = model.getLeaves();
    expect(leaves[0].isAutoGroupColumn()).toBe(true);
    expect(leaves.some(c => c.isPivotResultColumn())).toBe(true);
    // multipleColumns level tags do not apply while pivoted.
    expect(region.groupLevel).toBeUndefined();
  });
});
