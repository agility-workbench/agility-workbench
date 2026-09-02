import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { FilterType } from "../interfaces/filter";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    quickFilter: true,
  });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "country", key: "country", label: "Country" },
    { colId: "revenue", key: "revenue", label: "Revenue" },
  ]);
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans-serif",
    cellFont: "12px sans-serif",
    reason: "test",
  });
  core.setRowData([
    { id: "1", region: "APAC", country: "India", revenue: 20 },
    { id: "2", region: "EMEA", country: "France", revenue: 10 },
  ]);
  return { core, api: new GridAPI(core) };
}

describe("GridAPI saved view state", () => {
  it("round-trips serializable layout, grouping, sort, filters, quick filter, and expansion", () => {
    const { core, api } = makeGrid();
    const countryId = core.getColumnModel().getByColId("country")!.instanceID;
    const revenueId = core.getColumnModel().getByColId("revenue")!.instanceID;
    const regionId = core.getColumnModel().getByColId("region")!.instanceID;
    core.dispatch({ type: "columnPin", colIds: [countryId], pinned: "left" });
    core.dispatch({ type: "columnVisibility", colIds: [revenueId], hidden: true });
    core.dispatch({ type: "columnResize", colId: regionId, widthPx: 222 });
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const apac = core.getRowModel().getGroupNodes().find(node => node.groupKey === "APAC")!;
    core.dispatch({ type: "groupToggleExpand", groupId: apac.id, expanded: true });
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "revenue", dir: "desc" }] });
    core.setFilterModel([{
      col: core.getColumnModel().getByColId("country")!,
      key: "country",
      filters: [{ type: FilterType.CONTAINS, values: ["a"] }],
    }]);
    core.dispatch({ type: "quickFilterSet", text: "a" });

    const captured = api.captureViewState();
    const persisted = JSON.parse(JSON.stringify(captured));
    expect(persisted.version).toBe(1);
    expect(JSON.stringify(persisted)).not.toContain("computedWidth");

    core.dispatch({ type: "rowGroupSet", colIds: [] });
    core.dispatch({ type: "columnPin", colIds: [countryId], pinned: null });
    core.dispatch({ type: "columnVisibility", colIds: [revenueId], hidden: false });
    core.dispatch({ type: "columnResize", colId: regionId, widthPx: 100 });
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "revenue", dir: null }] });
    core.setFilterModel([]);
    core.dispatch({ type: "quickFilterSet", text: "" });

    api.applyViewState(persisted);

    const columns = new Map(api.getColumnState().map(state => [state.colId, state]));
    expect(columns.get("country")?.pinned).toBe("left");
    expect(columns.get("revenue")?.hidden).toBe(true);
    expect(columns.get("region")?.widthPx).toBe(222);
    expect(core.getRowGroupColumns().map(col => col.colId)).toEqual(["region"]);
    expect(core.getSortModel().items.map(item => [item.col.colId, item.dir]))
      .toEqual([["revenue", "desc"]]);
    expect(core.getFilterModel().items.map(item => item.col.colId)).toEqual(["country"]);
    expect(core.getQuickFilterText()).toBe("a");
    expect(core.getRowModel().getGroupNodes().find(node => node.id === apac.id)?.isExpanded)
      .toBe(true);
  });

  it("round-trips the page under pagination, clamped to the current dataset", () => {
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "clientSide",
      pagination: true,
      pageSize: 2,
      pageSizes: [2, 4],
    });
    core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name" }]);
    core.dispatch({
      type: "themeFontSet",
      headerFont: "12px sans-serif",
      cellFont: "12px sans-serif",
      reason: "test",
    });
    core.setRowData(Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `row ${i}` })));
    const api = new GridAPI(core);

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 3, pageSize: 2 });
    const captured = api.captureViewState();
    expect(captured.pagination).toEqual({ pageIndex: 3, pageSize: 2 });

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 0, pageSize: 4 });
    api.applyViewState(captured);
    expect(core.getPaginationInfo()).toMatchObject({ pageIndex: 3, pageSize: 2 });

    // A shrunk dataset clamps the restored page to the new last page.
    core.setRowData(Array.from({ length: 3 }, (_, i) => ({ id: String(i), name: `row ${i}` })));
    api.applyViewState(captured);
    expect(core.getPaginationInfo()).toMatchObject({ pageIndex: 1, pageSize: 2 });
  });

  it("omits pagination when disabled and leaves the page untouched for old captures", () => {
    const { core, api } = makeGrid();
    const captured = api.captureViewState();
    expect(captured.pagination).toBeUndefined();
    expect(() => api.applyViewState(JSON.parse(JSON.stringify(captured)))).not.toThrow();
    expect(core.getPaginationInfo().paginationEnabled).toBe(false);
  });

  it("round-trips a sort on the auto-group column", () => {
    const { core, api } = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const groupCol = () => core.getColumnModel().getAutoGroupColumns()[0];
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: groupCol().instanceID });
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: groupCol().instanceID });
    expect(core.getSortModel().items.map(item => [item.col.colId, item.dir]))
      .toEqual([["__pte_group__", "desc"]]);

    // The auto-group column is internal, so its instanceID is a per-grid UUID and the capture can
    // only name its colId — which the public column lookups deliberately do not hold.
    const persisted = JSON.parse(JSON.stringify(api.captureViewState()));
    expect(persisted.sortModel).toEqual([{ colId: "__pte_group__", dir: "desc" }]);

    core.dispatch({ type: "sortModelSet", sortItems: [{ key: groupCol().instanceID, dir: null }] });
    expect(core.getSortModel().items).toEqual([]);

    api.applyViewState(persisted);
    expect(core.getSortModel().items.map(item => [item.col.colId, item.dir]))
      .toEqual([["__pte_group__", "desc"]]);
    expect(core.getSortModel().items[0].col).toBe(groupCol());
    expect(core.getRowModel().getGroupNodes().map(node => node.groupKey)).toEqual(["EMEA", "APAC"]);
  });

  it("drops a captured group-column sort when the restored grid has no group column", () => {
    const source = makeGrid();
    source.core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const groupCol = source.core.getColumnModel().getAutoGroupColumns()[0];
    source.core.dispatch({ type: "headerAction", action: "toggleSort", colId: groupCol.instanceID });
    const persisted = JSON.parse(JSON.stringify(source.api.captureViewState()));
    expect(persisted.sortModel).toEqual([{ colId: "__pte_group__", dir: "asc" }]);

    // `groupRows` display surfaces the label on a full-width row instead of a column, so the
    // captured id addresses nothing here — the sort must stay dropped rather than revive a column
    // this grid never puts in its layout.
    const target = makeGrid();
    target.core.setGroupDisplayType("groupRows");
    target.api.applyViewState(persisted);
    expect(target.core.getRowGroupColumns().map(col => col.colId)).toEqual(["region"]);
    expect(target.core.getColumnModel().getAutoGroupColumns()).toEqual([]);
    expect(target.core.getSortModel().items).toEqual([]);
  });

  it("supports exact and merge column restoration", () => {
    const { core, api } = makeGrid();
    const state = api.captureViewState();
    const notesId = core.getColumnModel().addColumnDef({
      colId: "notes",
      key: "notes",
      label: "Notes",
    });

    api.applyViewState(state);
    expect(api.getColumnState().find(column => column.colId === "notes")?.hidden).toBe(true);

    core.dispatch({ type: "columnVisibility", colIds: [notesId], hidden: false });
    api.applyViewState(state, { columns: "merge" });
    expect(api.getColumnState().find(column => column.colId === "notes")?.hidden).toBe(false);
  });
});
