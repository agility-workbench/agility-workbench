/**
 * api.getColumnDefs / getColumn / getColumns / addSparklineColumn: the typed column reads, and the
 * typed door for the `addSparklineColumn` action (finding #137).
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import type { ColDef } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { GridEventColumnsChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

const rows = [
  { id: "1", region: "N", city: "A", q1: 1, q2: 2, price: 10, qty: 3, note: "x" },
  { id: "2", region: "S", city: "B", q1: 3, q2: 4, price: 20, qty: 4, note: "y" },
  { id: "3", region: "N", city: "C", q1: 5, q2: 6, price: 30, qty: 5, note: "z" },
];

function makeGrid(defs: ColDef[], extra: Record<string, unknown> = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id", rowModelType: "clientSide", rowNumbers: true, ...extra,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps(defs);
  core.setRowData(rows.map(r => ({ ...r })));
  return { core, api: new GridAPI(core) as IGridAPI };
}

const valueFormatter = ({ value }: { value: unknown }) => `$${value}`;

/** Groups (one with an expander), plus plain leaves to pin, hide, sort, group and aggregate. */
function sampleDefs(): ColDef[] {
  return [
    {
      colId: "place", label: "Place", children: [
        { colId: "region", key: "region", label: "Region" },
        { colId: "city", key: "city", label: "City", columnGroupShow: "open" },
      ],
    },
    {
      colId: "money", label: "Money", children: [
        { colId: "price", key: "price", label: "Price", type: "number" as any, valueFormatter },
        { colId: "qty", key: "qty", label: "Qty", type: "number" as any },
      ],
    },
    { colId: "q1", key: "q1", label: "Q1", type: "number" as any },
    { colId: "q2", key: "q2", label: "Q2", type: "number" as any },
    { colId: "note", key: "note", label: "Note" },
  ];
}

/** Every observable the round trip must reproduce. */
function snapshot(api: IGridAPI) {
  return {
    state: api.getColumnState(),
    sort: api.getSortModel(),
    groups: api.getRowGroupColumns(),
    aggregates: api.getAggregates(),
    groupState: api.getColumnGroupState(),
  };
}

function arrange(api: IGridAPI) {
  api.setColumnPinned("q1", "left");
  api.setColumnPinned("note", "right");
  api.setColumnVisible("q2", false);
  api.setColumnWidth("qty", 150);
  api.setSortModel([{ colId: "price", dir: "desc" }, { colId: "region", dir: "asc" }]);
  api.setRowGroupColumns(["region"]);
  api.setAggregates([{ colId: "qty", type: "sum" }, { colId: "price", type: "max" }]);
  api.setColumnGroupState([{ colId: "place", open: true }]);
}

describe("api.getColumnDefs", () => {
  it("writes the current state over each column's own definition", () => {
    const { api } = makeGrid(sampleDefs());
    arrange(api);
    const defs = api.getColumnDefs();

    // Display order, left section first; the group structure kept; no internal columns.
    expect(defs.map(d => d.colId)).toEqual(["q1", "place", "money", "q2", "note"]);
    expect(defs[1].children!.map(d => d.colId)).toEqual(["region", "city"]);
    expect(defs.flatMap(d => d.children ?? [d]).map(d => d.colId))
      .toEqual(["q1", "region", "city", "price", "qty", "q2", "note"]);
    expect(JSON.stringify(defs)).not.toContain("rowNumber");

    const byId = new Map(defs.flatMap(d => [d, ...(d.children ?? [])]).map(d => [d.colId, d]));
    expect(byId.get("q1")!.pinned).toBe("left");
    expect(byId.get("q2")!.hidden).toBe(true);
    expect(byId.get("note")!.pinned).toBe("right");
    expect(byId.get("place")!.pinned).toBeUndefined();
    expect(byId.get("qty")!.width).toBe(150);
    expect(byId.get("price")).toMatchObject({ sort: "desc", sortIndex: 0, aggFunc: "max" });
    expect(byId.get("region")).toMatchObject({ sort: "asc", sortIndex: 1 });
    expect(byId.get("qty")!.aggFunc).toBe("sum");
    expect(byId.get("city")!.sort).toBeUndefined();
    expect(byId.get("place")!.openByDefault).toBe(true);
    // The definition's own references come through as they were.
    expect(byId.get("price")!.valueFormatter).toBe(valueFormatter);
    // Every leaf has a width.
    for (const leaf of ["q1", "region", "city", "price", "qty", "note"]) {
      expect(typeof byId.get(leaf)!.width).toBe("number");
    }
  });

  it("includes hidden columns, marked hidden, and removes the marker once shown", () => {
    const { api } = makeGrid([...sampleDefs().slice(0, 2), { colId: "q1", key: "q1", label: "Q1", hidden: true }]);
    expect(api.getColumnDefs().find(d => d.colId === "q1")!.hidden).toBe(true);
    api.setColumnVisible("q1", true);
    expect("hidden" in api.getColumnDefs().find(d => d.colId === "q1")!).toBe(false);
  });

  it("spells out a shown column that defaultColDef would hide", () => {
    const { api } = makeGrid([{ colId: "a", key: "a", label: "A" }, { colId: "b", key: "b", label: "B" }],
      { defaultColDef: { hidden: true } });
    api.setColumnVisible("a", true);
    const defs = api.getColumnDefs();
    expect(defs.find(d => d.colId === "a")!.hidden).toBe(false);
    expect(defs.find(d => d.colId === "b")!.hidden).toBe(true);
  });

  it("returns the definitions before defaultColDef is merged in", () => {
    const { api } = makeGrid([{ colId: "a", key: "a", label: "A" }], { defaultColDef: { editable: true } });
    expect("editable" in api.getColumnDefs()[0]).toBe(false);
  });

  it("names a generated colId, and drops an unsorted column's stale sort", () => {
    const { api } = makeGrid([{ label: "No id" } as ColDef, { colId: "s", key: "s", label: "S", sort: "asc" }]);
    const generated = api.getColumnState()[0].colId;
    expect(api.getColumnDefs()[0].colId).toBe(generated);
    expect(api.getColumnDefs()[1]).toMatchObject({ sort: "asc", sortIndex: 0 });
    api.setSortModel([]);
    const s = api.getColumnDefs()[1];
    expect("sort" in s || "sortIndex" in s).toBe(false);
  });

  it("is a fresh tree: mutating it changes nothing", () => {
    const { api } = makeGrid(sampleDefs());
    const defs = api.getColumnDefs();
    defs[0].label = "changed";
    defs[0].children!.pop();
    expect(api.getColumnDefs()[0].label).toBe("Place");
    expect(api.getColumnDefs()[0].children).toHaveLength(2);
  });

  it("round-trips through setColumnDefs on the same grid", () => {
    const { api } = makeGrid(sampleDefs());
    arrange(api);
    const before = snapshot(api);
    const defs = api.getColumnDefs();
    api.setColumnDefs(defs);
    expect(snapshot(api)).toEqual(before);
    expect(api.getColumnDefs()).toEqual(defs);
  });

  it("round-trips a moved layout, a group split by a move included", () => {
    const { api } = makeGrid(sampleDefs());
    api.moveColumns(["note"], 0);
    // Move a group child out of its group: the group splits.
    api.moveColumn("qty", 0);
    const defs = api.getColumnDefs();
    expect(defs.map(d => `${d.colId}:${(d.children ?? []).map(c => c.colId).join(",")}`))
      .toEqual(["money:qty", "note:", "place:region,city", "money:price", "q1:", "q2:"]);
    // Widths aside: re-laying a split piece out widens its only child to the group's label (the
    // grid's group-fits-its-label rule), which the piece had not been measured against yet.
    const layout = () => snapshot(api).state.map(({ widthPx: _w, ...rest }) => rest);
    const before = { ...snapshot(api), state: layout() };
    api.setColumnDefs(defs);
    expect({ ...snapshot(api), state: layout() }).toEqual(before);
    expect(api.getColumnDefs().map(d => d.colId)).toEqual(defs.map(d => d.colId));
  });

  it("rebuilds the same layout, sort and single aggregates in a new grid", () => {
    const { api } = makeGrid(sampleDefs());
    arrange(api);
    const before = snapshot(api);
    const { api: fresh } = makeGrid(api.getColumnDefs());
    const after = snapshot(fresh);
    expect(after.state).toEqual(before.state);
    expect(after.sort).toEqual(before.sort);
    // Seeded from the definitions, so in definition order.
    expect(after.aggregates).toEqual(expect.arrayContaining(before.aggregates));
    expect(after.aggregates).toHaveLength(before.aggregates.length);
    expect(after.groupState).toEqual(before.groupState);
    // Row grouping is not a column-definition field (see the TSDoc).
    expect(after.groups).toEqual([]);
  });

  it("returns the source columns while pivoted", () => {
    const { api } = makeGrid(sampleDefs());
    api.setRowGroupColumns(["region"]);
    api.setPivotColumns(["city"]);
    api.setAggregates([{ colId: "qty", type: "sum" }]);
    api.setPivotMode(true);
    expect(api.getPivotMode()).toBe(true);
    const ids = api.getColumnDefs().flatMap(d => d.children ?? [d]).map(d => d.colId);
    expect(ids).toEqual(["region", "city", "price", "qty", "q1", "q2", "note"]);
  });
});

describe("api.getColumn / getColumns", () => {
  it("lists every leaf in display order, hidden included, internal columns excluded", () => {
    const { api, core } = makeGrid(sampleDefs());
    api.setColumnPinned("note", "left");
    api.setColumnVisible("q2", false);
    expect(api.getColumns().map(c => c.colId)).toEqual(api.getColumnState().map(s => s.colId));
    expect(api.getColumns().map(c => c.colId)).toEqual(["note", "region", "city", "price", "qty", "q1", "q2"]);
    expect(core.getColumnModel().getLeadingLeaves().length).toBeGreaterThan(0);
    expect(api.getColumns().some(c => c.isInternal())).toBe(false);
  });

  it("resolves an id tolerantly and leaves the internal columns out", () => {
    const { api, core } = makeGrid(sampleDefs());
    const price = api.getColumn("price")!;
    expect(price.colId).toBe("price");
    expect(api.getColumn(price.instanceID)).toBe(price);
    expect(api.getColumn("place")!.children.map(c => c.colId)).toEqual(["region", "city"]);
    expect(api.getColumn("nope")).toBeUndefined();
    const rowNumber = core.getColumnModel().getLeadingLeaves()[0];
    expect(api.getColumn(rowNumber.instanceID)).toBeUndefined();
    api.setRowGroupColumns(["region"]);
    const autoGroup = core.getColumnModel().getAutoGroupColumns()[0];
    expect(autoGroup).toBeDefined();
    expect(api.getColumn(autoGroup.instanceID)).toBeUndefined();
    expect(api.getColumn(autoGroup.colId)).toBeUndefined();
  });

  it("returns the live Column, with the app's definition on it", () => {
    const defs = sampleDefs();
    const { api } = makeGrid(defs);
    const price = api.getColumn("price")!;
    expect(price.explicitColDef.valueFormatter).toBe(valueFormatter);
    api.setColumnWidth("price", 222);
    expect(price.computedWidth).toBe(222);
  });
});

describe("api.addSparklineColumn", () => {
  function record(api: IGridAPI): GridEventColumnsChangedParams[] {
    const events: GridEventColumnsChangedParams[] = [];
    api.on("columnsChanged", e => events.push(e));
    return events;
  }

  it("adds a sparkline column over the given leaves and returns its colId", () => {
    const { api } = makeGrid(sampleDefs());
    const events = record(api);
    const colId = api.addSparklineColumn({ colIds: ["q1", "q2"], sparklineType: "bar" });
    expect(colId).toMatch(/^sparkline_/);
    const col = api.getColumn(colId!)!;
    expect(col.cellRendererParams.type).toBe("bar");
    expect(col.getValue({ data: rows[1] } as any)).toEqual([["Q1", 3], ["Q2", 4]]);
    expect(api.getColumns().at(-1)!.colId).toBe(colId);
    expect(events).toEqual([expect.objectContaining({ reason: "add", changedColIds: [colId], source: "api" })]);
  });

  it("takes a colId, and formats tooltip points with the target column's formatter", () => {
    const { api } = makeGrid(sampleDefs());
    api.addSparklineColumn({ colIds: ["qty", "price"], sparklineType: "line", targetColId: "price", colId: "trend" });
    const params = api.getColumn("trend")!.cellRendererParams;
    expect(params.tooltipValueFormatter({ xValue: "Qty", yValue: 5, rowNode: {} })).toBe("Qty: $5");
  });

  it("adds nothing and returns null when no id names a leaf", () => {
    const { api } = makeGrid(sampleDefs());
    const events = record(api);
    expect(api.addSparklineColumn({ colIds: ["nope", "money"], sparklineType: "area" })).toBeNull();
    expect(api.addSparklineColumn({ colIds: [], sparklineType: "area" })).toBeNull();
    expect(events).toEqual([]);
    expect(api.getColumns()).toHaveLength(7);
  });

  it("appears in getColumnDefs, and setColumnDefs without it drops it", () => {
    const { api } = makeGrid(sampleDefs());
    const colId = api.addSparklineColumn({ colIds: ["q1"], sparklineType: "line" })!;
    const defs = api.getColumnDefs();
    expect(defs.at(-1)!.colId).toBe(colId);
    api.setColumnDefs(defs);
    expect(api.getColumn(colId)).toBeDefined();
    api.setColumnDefs(sampleDefs());
    expect(api.getColumn(colId)).toBeUndefined();
  });
});
