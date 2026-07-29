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
