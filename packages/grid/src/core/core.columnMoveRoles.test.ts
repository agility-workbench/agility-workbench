/**
 * Role state survives moving the column that holds it.
 *
 * A move rebuilds the moved node, and it used to arrive with a fresh instanceID. Every model that
 * addresses a column by instanceID — row groups, pivot columns, aggregate entries — was then left
 * pointing at an id nothing resolved to. The column panel showed it first: the Group/Pivot/Value
 * chip on the moved column vanished the moment the move landed, while moving any OTHER column left
 * it alone. The aggregate model went further and dropped the entry outright, so a captured view
 * lost the Value role too.
 */
import { describe, it, expect } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { AggregateType } from "../interfaces/aggregate";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", region: "EMEA", country: "UK", sales: 10 },
  { id: "2", region: "APAC", country: "Japan", sales: 30 },
];

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
  ]);
  return core;
}

/** The live column for a public colId, i.e. what the panel renders a row (and its chips) from. */
const live = (core: GridCore, colId: string) => core.getColumnModel().getByColId(colId)!;

describe("moving a column keeps the roles it holds", () => {
  it("keeps the row-group role addressable by the moved column's instanceID", () => {
    const core = makeGrid();
    const region = live(core, "region");
    core.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });

    core.dispatch({ type: "columnMove", colId: region.instanceID, toIndex: 3, toSection: "center" });

    // What buildRolesStrip() asks: does a row-group entry name THIS column?
    const groups = core.getRowGroupColumns().map(col => col.instanceID);
    expect(groups).toContain(live(core, "region").instanceID);
    expect(core.getColumnModel().getById(region.instanceID)).toBeDefined();
  });

  it("keeps the pivot role addressable by the moved column's instanceID", () => {
    const core = makeGrid();
    const country = live(core, "country");
    core.dispatch({ type: "pivotColumnsSet", colIds: [country.instanceID] });

    core.dispatch({ type: "columnMove", colId: country.instanceID, toIndex: 0, toSection: "center" });

    const pivots = core.getPivotColumns().map(col => col.instanceID);
    expect(pivots).toContain(live(core, "country").instanceID);
  });

  it("keeps the aggregate entry, and keeps reporting it by colId", () => {
    const core = makeGrid();
    const sales = live(core, "sales");
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: sales.instanceID, type: AggregateType.SUM }],
    });

    core.dispatch({ type: "columnMove", colId: sales.instanceID, toIndex: 0, toSection: "center" });

    const keys = core.getAggregateModel().map(entry => entry.key);
    expect(keys).toContain(live(core, "sales").instanceID);
    // The colId-keyed projection is what the API and the view state report; the entry used to be
    // dropped here because its instanceID no longer resolved.
    expect(core.getAggregateModelByColId().map(entry => entry.colId)).toContain("sales");
  });

  it("keeps the role when the move is a pin, which relocates the column the same way", () => {
    const core = makeGrid();
    const region = live(core, "region");
    core.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });

    core.dispatch({ type: "columnPin", colIds: [region.instanceID], pinned: "left" });

    const groups = core.getRowGroupColumns().map(col => col.instanceID);
    expect(groups).toContain(live(core, "region").instanceID);
  });

  it("keeps a sort matched to the moved column", () => {
    // Same root cause, different symptom: sort-icon and toggleSort matching is instanceID-based, so
    // a re-minted id used to strand the sort on the moved column (its indicator went, and the next
    // click restarted the cycle instead of continuing it).
    const core = makeGrid();
    const sales = live(core, "sales");
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: sales.instanceID, dir: "asc" }] });

    core.dispatch({ type: "columnMove", colId: sales.instanceID, toIndex: 0, toSection: "center" });

    const sorted = core.getSortModel().items;
    expect(sorted.map(item => item.col.instanceID)).toContain(live(core, "sales").instanceID);
  });

  it("leaves an untouched column's role alone when its neighbour moves", () => {
    const core = makeGrid();
    const region = live(core, "region");
    core.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });

    core.dispatch({
      type: "columnMove",
      colId: live(core, "sales").instanceID,
      toIndex: 0,
      toSection: "center",
    });

    const groups = core.getRowGroupColumns().map(col => col.instanceID);
    expect(groups).toContain(live(core, "region").instanceID);
  });
});
