import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { AggregateType } from "../interfaces/aggregate";
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

  // Two expander-controlled groups (an unset + "open" child mix shows the expander and hides the
  // "open" child while closed): Money starts closed, Geo starts open via openByDefault.
  function makeGroupedGrid() {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.setColumnDefsFromProps([
      { colId: "name", key: "name", label: "Name" },
      {
        colId: "money",
        label: "Money",
        children: [
          { colId: "revenue", key: "revenue", label: "Revenue" },
          { colId: "margin", key: "margin", label: "Margin", columnGroupShow: "open" },
        ],
      },
      {
        colId: "geo",
        label: "Geo",
        openByDefault: true,
        children: [
          { colId: "region", key: "region", label: "Region" },
          { colId: "country", key: "country", label: "Country", columnGroupShow: "open" },
        ],
      },
    ]);
    core.dispatch({
      type: "themeFontSet",
      headerFont: "12px sans-serif",
      cellFont: "12px sans-serif",
      reason: "test",
    });
    core.setRowData([
      { id: "1", name: "A", revenue: 20, margin: 5, region: "APAC", country: "India" },
      { id: "2", name: "B", revenue: 10, margin: 2, region: "EMEA", country: "France" },
    ]);
    const leaves = () => core.getColumnModel().getCenterLeaves().map(col => col.colId);
    const toggle = (colId: string) => core.dispatch({ type: "headerAction", action: "toggleGroupExpand", colId });
    return { core, api: new GridAPI(core), leaves, toggle };
  }

  it("round-trips column-group expanders and leaves them alone for captures without the field", () => {
    const { core, api, leaves, toggle } = makeGroupedGrid();
    expect(leaves()).toEqual(["name", "revenue", "region", "country"]);

    toggle("money");
    toggle("geo");
    expect(leaves()).toEqual(["name", "revenue", "margin", "region"]);

    const captured = JSON.parse(JSON.stringify(api.captureViewState()));
    expect(captured.columnGroupState).toEqual([
      { colId: "money", open: true },
      { colId: "geo", open: false },
    ]);

    toggle("money");
    toggle("geo");
    expect(leaves()).toEqual(["name", "revenue", "region", "country"]);
    api.applyViewState(captured);
    expect(leaves()).toEqual(["name", "revenue", "margin", "region"]);
    expect(core.getColumnModel().getColumnGroupState()).toEqual(captured.columnGroupState);

    // A capture saved before the field existed leaves every group as it is.
    const { columnGroupState: _dropped, ...legacy } = captured;
    toggle("money");
    expect(leaves()).toEqual(["name", "revenue", "region"]);
    api.applyViewState(legacy);
    expect(leaves()).toEqual(["name", "revenue", "region"]);

    // Groups the list does not name keep their state; ids that resolve to no group, or to a leaf,
    // are ignored.
    api.applyViewState({
      ...captured,
      columnGroupState: [{ colId: "geo", open: true }, { colId: "nope", open: true }, { colId: "name", open: true }],
    });
    expect(leaves()).toEqual(["name", "revenue", "region", "country"]);
  });

  it("restores captured widths over the autosize that opening a group triggers", () => {
    const { core, api, leaves, toggle } = makeGroupedGrid();
    toggle("money");
    const marginId = core.getColumnModel().getByColId("margin")!.instanceID;
    core.dispatch({ type: "columnResize", colId: marginId, widthPx: 333 });
    const captured = api.captureViewState();

    toggle("money");
    expect(leaves()).not.toContain("margin");
    api.applyViewState(captured);
    expect(leaves()).toContain("margin");
    expect(api.getColumnState().find(column => column.colId === "margin")?.widthPx).toBe(333);
  });

  it("reads and sets column-group expanders through the public API", () => {
    const { core, api, leaves, toggle } = makeGroupedGrid();
    expect(api.getColumnGroupState()).toEqual([
      { colId: "money", open: false },
      { colId: "geo", open: true },
    ]);

    api.setColumnGroupState([{ colId: "money", open: true }]);
    expect(leaves()).toEqual(["name", "revenue", "margin", "region", "country"]);
    // The header expander and the API read the same state.
    toggle("geo");
    expect(api.getColumnGroupState()).toEqual([
      { colId: "money", open: true },
      { colId: "geo", open: false },
    ]);
    // Unknown ids and leaves are skipped; a group not named keeps its state.
    api.setColumnGroupState([{ colId: "nope", open: true }, { colId: "name", open: true }, { colId: "geo", open: true }]);
    expect(leaves()).toEqual(["name", "revenue", "margin", "region", "country"]);
    expect(core.getColumnModel().getByColId("money")!.groupExpandState).toBe("open");
  });

  it("sets many groups in one dispatch and is silent when nothing changes", () => {
    const { core, leaves } = makeGroupedGrid();
    const changes: string[][] = [];
    core.on("columnsChanged", ev => changes.push(ev.changedColIds ?? []));

    core.dispatch({ type: "columnGroupStateSet", groups: [{ colId: "money", open: true }, { colId: "geo", open: false }] });
    expect(leaves()).toEqual(["name", "revenue", "margin", "region"]);
    expect(changes).toEqual([["money", "geo"]]);

    // Already in the requested state: no rebuild, no event.
    core.dispatch({ type: "columnGroupStateSet", groups: [{ colId: "money", open: true }, { colId: "nope", open: false }] });
    expect(changes).toHaveLength(1);
  });

  it("captures and restores the source groups while pivoted", () => {
    const { core, api, leaves, toggle } = makeGroupedGrid();
    toggle("money");
    core.dispatch({ type: "aggregateModelSet", aggregateModels: [{ key: "revenue", type: AggregateType.SUM }] });
    core.dispatch({ type: "pivotColumnsSet", colIds: ["region"] });
    core.dispatch({ type: "pivotModeSet", on: true });
    expect(core.getPivotMode()).toBe(true);

    // The generated pivot header is derived data: the capture still describes the user's groups.
    const captured = JSON.parse(JSON.stringify(api.captureViewState()));
    expect(captured.columnGroupState).toEqual([
      { colId: "money", open: true },
      { colId: "geo", open: true },
    ]);

    core.dispatch({ type: "pivotModeSet", on: false });
    toggle("money");
    toggle("geo");
    expect(leaves()).toEqual(["name", "revenue", "region"]);

    // Restoring the pivoted view re-enters pivot mode; leaving it again lands on the restored
    // expander state, not the one the mode was entered with.
    api.applyViewState(captured);
    expect(core.getPivotMode()).toBe(true);
    core.dispatch({ type: "pivotModeSet", on: false });
    expect(leaves()).toEqual(["name", "revenue", "margin", "region", "country"]);
  });
});

describe("GridAPI saved view state: aggregate scope, runtime pins, quick-filter settings", () => {
  /** An in-memory stand-in for the renderer's pin controller (the renderer owns the real map). */
  function fakePins() {
    const overrides = new Map<string, "top" | "bottom" | null>();
    return {
      overrides,
      controller: {
        setPinnedTopRowData: () => {},
        setPinnedBottomRowData: () => {},
        setRowPinned: (rowId: string | number, position: "top" | "bottom" | null) => {
          if (position) overrides.set(String(rowId), position);
          else overrides.delete(String(rowId));
        },
        getRowPinnedOverrides: () => Array.from(overrides, ([rowId, position]) => ({ rowId, position })),
        setRowPinnedOverrides: (list: Array<{ rowId: string; position: "top" | "bottom" | null }>) => {
          overrides.clear();
          for (const pin of list) overrides.set(pin.rowId, pin.position);
        },
      },
    };
  }

  function makePinnedGrid() {
    const grid = makeGrid();
    const pins = fakePins();
    grid.api.setPinnedRowsController(pins.controller);
    return { ...grid, pins };
  }

  it("captures and restores the live aggregate scope on a fresh grid", () => {
    const { core, api } = makePinnedGrid();
    core.dispatch({ type: "aggregateModelSet", aggregateModels: [{ key: "revenue", type: AggregateType.SUM }] });
    core.setAggregateScope("all");
    const captured = JSON.parse(JSON.stringify(api.captureViewState()));
    expect(captured.aggregateScope).toBe("all");

    // Restoring the aggregate model alone would turn the footer on at page scope.
    const fresh = makePinnedGrid();
    fresh.api.applyViewState(captured);
    expect(fresh.core.getAggregateScope()).toBe("all");

    // A scope of "none" with aggregates configured survives too (the footer is hidden, not cleared).
    core.setAggregateScope("none");
    const hidden = api.captureViewState();
    const fresh2 = makePinnedGrid();
    fresh2.api.applyViewState(hidden);
    expect(fresh2.core.getAggregateScope()).toBe("none");
    expect(fresh2.core.getAggregateModel()).toHaveLength(1);
  });

  it("captures and restores runtime row pins on a fresh grid", () => {
    const { api } = makePinnedGrid();
    api.setRowPinned("1", "top");
    api.setRowPinned("2", "bottom");
    const captured = JSON.parse(JSON.stringify(api.captureViewState()));
    expect(captured.rowPinning).toEqual([
      { rowId: "1", position: "top" },
      { rowId: "2", position: "bottom" },
    ]);

    const fresh = makePinnedGrid();
    fresh.api.setRowPinned("2", "top");
    fresh.api.applyViewState(captured);
    expect(Array.from(fresh.pins.overrides)).toEqual([["1", "top"], ["2", "bottom"]]);

    // An empty list is a view with no pins: it clears.
    fresh.api.applyViewState({ ...captured, rowPinning: [] });
    expect(fresh.pins.overrides.size).toBe(0);
  });

  it("captures and restores the quick filter's match mode, case sensitivity and behavior", () => {
    const { core, api } = makePinnedGrid();
    api.setQuickFilter("ind", { matchMode: "wholeCell", caseSensitive: true, behavior: "find" });
    const captured = JSON.parse(JSON.stringify(api.captureViewState()));
    expect(captured.quickFilterText).toBe("ind");
    expect(captured.quickFilterSettings).toEqual({ matchMode: "wholeCell", caseSensitive: true, behavior: "find" });

    const fresh = makePinnedGrid();
    fresh.api.applyViewState(captured);
    expect(fresh.core.getQuickFilterText()).toBe("ind");
    expect(fresh.core.getQuickFilterMatchSettings()).toEqual({ matchMode: "wholeCell", caseSensitive: true });
    expect(fresh.core.getQuickFilterBehavior()).toBe("find");
    expect(core.getQuickFilterBehavior()).toBe("find");
  });

  it("apply then capture yields the same object", () => {
    const { core, api } = makePinnedGrid();
    core.dispatch({ type: "aggregateModelSet", aggregateModels: [{ key: "revenue", type: AggregateType.SUM }] });
    core.setAggregateScope("all");
    api.setRowPinned("2", "top");
    api.setQuickFilter("a", { matchMode: "substring", caseSensitive: false, behavior: "filter" });
    const captured = JSON.parse(JSON.stringify(api.captureViewState()));

    const fresh = makePinnedGrid();
    fresh.api.applyViewState(captured);
    expect(JSON.parse(JSON.stringify(fresh.api.captureViewState()))).toEqual(captured);
    // And applying it again onto itself changes nothing.
    fresh.api.applyViewState(captured);
    expect(JSON.parse(JSON.stringify(fresh.api.captureViewState()))).toEqual(captured);
  });

  it("an old view without the new fields leaves scope, pins and match settings alone", () => {
    const { core, api, pins } = makePinnedGrid();
    const old = api.captureViewState() as any;
    delete old.aggregateScope;
    delete old.rowPinning;
    delete old.quickFilterSettings;
    old.quickFilterText = "a";

    core.dispatch({ type: "aggregateModelSet", aggregateModels: [{ key: "revenue", type: AggregateType.SUM }] });
    core.setAggregateScope("all");
    api.setRowPinned("1", "bottom");
    api.setQuickFilter("", { matchMode: "wholeCell", caseSensitive: true, behavior: "filter" });

    api.applyViewState(old);
    expect(core.getAggregateScope()).toBe("all");
    expect(Array.from(pins.overrides)).toEqual([["1", "bottom"]]);
    expect(core.getQuickFilterText()).toBe("a");
    expect(core.getQuickFilterMatchSettings()).toEqual({ matchMode: "wholeCell", caseSensitive: true });
  });
});
