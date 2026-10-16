/**
 * api.getSortModel / setSortModel and the sort half of get/applyColumnState — the typed doors
 * for what used to need `dispatch({ type: "sortModelSet" })` with instance ids.
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { GridOptions } from "../interfaces/gridOptions";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(options: Partial<GridOptions> = {}): { core: GridCore; api: IGridAPI } {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options } as GridOptions);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "revenue", key: "revenue", label: "Revenue", type: ColumnType.NUMBER },
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "fixed", key: "fixed", label: "Fixed", type: ColumnType.STRING, sortable: false },
  ]);
  core.setRowData([
    { id: "1", region: "B", revenue: 10, name: "a", fixed: "x" },
    { id: "2", region: "A", revenue: 30, name: "b", fixed: "y" },
    { id: "3", region: "A", revenue: 20, name: "c", fixed: "z" },
    { id: "4", region: "B", revenue: 40, name: "d", fixed: "w" },
  ]);
  return { core, api: new GridAPI(core) };
}

const order = (core: GridCore) =>
  Array.from({ length: core.getRowModel().getViewCount() }, (_, i) => core.getRowModel().getRowNodeAtViewIndex(i)!.id);

describe("api.getSortModel / setSortModel", () => {
  it("replaces the whole model by colId, in priority order, and sorts the rows", () => {
    const { core, api } = makeGrid();
    api.setSortModel([{ colId: "region", dir: "asc" }, { colId: "revenue", dir: "desc" }]);
    expect(api.getSortModel()).toEqual([
      { colId: "region", dir: "asc" },
      { colId: "revenue", dir: "desc" },
    ]);
    expect(order(core)).toEqual(["2", "3", "4", "1"]);

    // A second call replaces rather than merges.
    api.setSortModel([{ colId: "revenue", dir: "asc" }]);
    expect(api.getSortModel()).toEqual([{ colId: "revenue", dir: "asc" }]);
    expect(order(core)).toEqual(["1", "3", "2", "4"]);
  });

  it("reorders priority when the same columns are passed in another order", () => {
    const { api } = makeGrid();
    api.setSortModel([{ colId: "region", dir: "asc" }, { colId: "revenue", dir: "desc" }]);
    api.setSortModel([{ colId: "revenue", dir: "desc" }, { colId: "region", dir: "asc" }]);
    expect(api.getSortModel().map(item => item.colId)).toEqual(["revenue", "region"]);
  });

  it("an empty list clears; null dirs, repeats, unknown and non-sortable columns are skipped", () => {
    const { api } = makeGrid();
    api.setSortModel([
      { colId: "region", dir: "desc" },
      { colId: "region", dir: "asc" },
      { colId: "name", dir: null },
      { colId: "nope", dir: "asc" },
      { colId: "fixed", dir: "asc" },
    ]);
    expect(api.getSortModel()).toEqual([{ colId: "region", dir: "desc" }]);
    api.setSortModel([]);
    expect(api.getSortModel()).toEqual([]);
  });

  it("emits columnsChanged reason sort once per change, and nothing for an unchanged model", () => {
    const { api } = makeGrid();
    const reasons: string[] = [];
    api.on("columnsChanged", e => reasons.push(e.reason));
    api.setSortModel([{ colId: "region", dir: "asc" }, { colId: "revenue", dir: "asc" }]);
    expect(reasons).toEqual(["sort"]);
    api.setSortModel([{ colId: "region", dir: "asc" }, { colId: "revenue", dir: "asc" }]);
    expect(reasons).toEqual(["sort"]);
    api.setSortModel([]);
    expect(reasons).toEqual(["sort", "sort"]);
  });

  it("returns a copy", () => {
    const { api } = makeGrid();
    api.setSortModel([{ colId: "region", dir: "asc" }]);
    const model = api.getSortModel();
    model[0].dir = "desc";
    model.push({ colId: "name", dir: "asc" });
    expect(api.getSortModel()).toEqual([{ colId: "region", dir: "asc" }]);
  });

  it("addresses the auto-group column by its colId", () => {
    const { api } = makeGrid({ groupDisplayType: "singleColumn" });
    api.setRowGroupColumns(["region"]);
    const autoGroup = api.getColumnModel().getAutoGroupColumns()[0];
    api.setSortModel([{ colId: autoGroup.colId, dir: "desc" }]);
    expect(api.getSortModel()).toEqual([{ colId: autoGroup.colId, dir: "desc" }]);
  });
});

describe("ColumnState sort", () => {
  it("getColumnState reports sort and sortIndex (null when unsorted)", () => {
    const { api } = makeGrid();
    api.setSortModel([{ colId: "revenue", dir: "desc" }, { colId: "region", dir: "asc" }]);
    const byId = Object.fromEntries(api.getColumnState().map(s => [s.colId, s]));
    expect(byId.revenue).toMatchObject({ sort: "desc", sortIndex: 0 });
    expect(byId.region).toMatchObject({ sort: "asc", sortIndex: 1 });
    expect(byId.name).toMatchObject({ sort: null, sortIndex: null });
  });

  it("applyColumnState applies sort at sortIndex, clears on null, and leaves absent fields alone", () => {
    const { api } = makeGrid();
    api.setSortModel([{ colId: "region", dir: "asc" }]);
    api.applyColumnState([{ colId: "revenue", sort: "desc", sortIndex: 0 }]);
    expect(api.getSortModel()).toEqual([
      { colId: "revenue", dir: "desc" },
      { colId: "region", dir: "asc" },
    ]);
    // No `sort` field: the width changes, the sort does not.
    api.applyColumnState([{ colId: "region", widthPx: 150 }]);
    expect(api.getSortModel()).toHaveLength(2);
    api.applyColumnState([{ colId: "revenue", sort: null }]);
    expect(api.getSortModel()).toEqual([{ colId: "region", dir: "asc" }]);
    // Without a sortIndex a new sort is appended.
    api.applyColumnState([{ colId: "name", sort: "asc" }]);
    expect(api.getSortModel().map(s => s.colId)).toEqual(["region", "name"]);
  });

  it("defaultState { sort: null } clears every column the state does not name", () => {
    const { api } = makeGrid();
    api.setSortModel([{ colId: "region", dir: "asc" }, { colId: "name", dir: "asc" }]);
    api.applyColumnState([{ colId: "revenue", sort: "desc" }], { defaultState: { sort: null } });
    expect(api.getSortModel()).toEqual([{ colId: "revenue", dir: "desc" }]);
  });

  it("a getColumnState round trip restores the sort model exactly", () => {
    const { api } = makeGrid();
    api.setSortModel([{ colId: "name", dir: "desc" }, { colId: "region", dir: "asc" }]);
    const saved = api.getColumnState();
    api.setSortModel([{ colId: "revenue", dir: "asc" }]);
    api.applyColumnState(saved);
    expect(api.getSortModel()).toEqual([
      { colId: "name", dir: "desc" },
      { colId: "region", dir: "asc" },
    ]);
  });

  it("view states keep the sort in sortModel only", () => {
    const { api } = makeGrid();
    api.setSortModel([{ colId: "region", dir: "asc" }]);
    const view = api.captureViewState();
    expect(view.columns.every(c => !("sort" in c) && !("sortIndex" in c))).toBe(true);
    expect(view.sortModel).toEqual([{ colId: "region", dir: "asc" }]);
    // A hand-written per-column sort in a view is ignored: sortModel owns it.
    api.applyViewState({ ...view, columns: view.columns.map(c => ({ ...c, sort: "desc" as const })) });
    expect(api.getSortModel()).toEqual([{ colId: "region", dir: "asc" }]);
  });
});
