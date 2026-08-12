/**
 * Public filter-model surface on IGridAPI (get/set/add/removeFilterModel): serializable
 * {colId, filters, join} shapes addressed by the PUBLIC colId — no getCore() cast, no Column
 * objects, no captureViewState() detour.
 */
import { describe, expect, it, vi } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { FilterType } from "../interfaces/filter";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "country", key: "country", label: "Country" },
  ]);
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans-serif",
    cellFont: "12px sans-serif",
    reason: "test",
  });
  core.setRowData([
    { id: "1", region: "APAC", country: "India" },
    { id: "2", region: "EMEA", country: "France" },
    { id: "3", region: "EMEA", country: "Germany" },
  ]);
  return { core, api: new GridAPI(core) };
}

function viewIds(core: GridCore): string[] {
  const out: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) {
    out.push(core.getRowIdAtViewIndex(i)!);
  }
  return out;
}

describe("GridAPI filter model", () => {
  it("setFilterModel filters rows and getFilterModel reads back the public shape", () => {
    const { core, api } = makeGrid();
    api.setFilterModel([
      { colId: "region", filters: [{ type: FilterType.EQ, values: ["EMEA"] }] },
    ]);
    expect(viewIds(core)).toEqual(["2", "3"]);
    expect(api.getFilterModel()).toEqual([
      { colId: "region", filters: [{ type: FilterType.EQ, values: ["EMEA"] }], join: undefined },
    ]);
  });

  it("addFilterModel replaces one column's filter and keeps the others", () => {
    const { core, api } = makeGrid();
    api.setFilterModel([
      { colId: "region", filters: [{ type: FilterType.EQ, values: ["EMEA"] }] },
    ]);
    api.addFilterModel({ colId: "country", filters: [{ type: FilterType.CONTAINS, values: ["Fran"] }] });
    expect(viewIds(core)).toEqual(["2"]);
    expect(api.getFilterModel().map(item => item.colId)).toEqual(["region", "country"]);

    api.addFilterModel({ colId: "country", filters: [{ type: FilterType.CONTAINS, values: ["Germ"] }] });
    expect(viewIds(core)).toEqual(["3"]);
    expect(api.getFilterModel().map(item => item.colId)).toEqual(["region", "country"]);
  });

  it("removeFilterModel removes one column's filter; unknown/unfiltered colIds are no-ops", () => {
    const { core, api } = makeGrid();
    api.setFilterModel([
      { colId: "region", filters: [{ type: FilterType.EQ, values: ["EMEA"] }] },
      { colId: "country", filters: [{ type: FilterType.CONTAINS, values: ["Fran"] }] },
    ]);
    api.removeFilterModel("country");
    expect(viewIds(core)).toEqual(["2", "3"]);
    expect(api.getFilterModel().map(item => item.colId)).toEqual(["region"]);

    let filterEvents = 0;
    core.on("columnsChanged", ev => { if (ev.reason === "filter") filterEvents++; });
    api.removeFilterModel("country");
    api.removeFilterModel("nope");
    expect(filterEvents).toBe(0);
  });

  it("setFilterModel([]) clears every filter; unknown colIds drop out", () => {
    const { core, api } = makeGrid();
    api.setFilterModel([
      { colId: "region", filters: [{ type: FilterType.EQ, values: ["EMEA"] }] },
      { colId: "missing", filters: [{ type: FilterType.EQ, values: ["x"] }] },
    ]);
    expect(api.getFilterModel().map(item => item.colId)).toEqual(["region"]);
    api.setFilterModel([]);
    expect(api.getFilterModel()).toEqual([]);
    expect(viewIds(core)).toEqual(["1", "2", "3"]);
  });

  it("getFilterModel returns copies — mutating the result does not affect the grid", () => {
    const { api } = makeGrid();
    api.setFilterModel([
      { colId: "region", filters: [{ type: FilterType.EQ, values: ["EMEA"] }] },
    ]);
    const model = api.getFilterModel();
    model[0].filters[0].values.push("APAC");
    expect(api.getFilterModel()[0].filters[0].values).toEqual(["EMEA"]);
  });
});

describe("canonical filterChanged event", () => {
  it("fires exactly once per set/add/remove, with source 'filter' and public colIds", () => {
    const { core, api } = makeGrid();
    const events: Array<{ source: string; changedColIds: string[] }> = [];
    core.on("filterChanged", ev => events.push({ source: ev.source, changedColIds: ev.changedColIds }));

    api.setFilterModel([
      { colId: "region", filters: [{ type: FilterType.EQ, values: ["EMEA"] }] },
    ]);
    api.addFilterModel({ colId: "country", filters: [{ type: FilterType.CONTAINS, values: ["Fran"] }] });
    api.removeFilterModel("country");

    // The API funnels through the filterModelSet action, whose changed set is the union of the
    // previous and next filtered columns (same ids the legacy columnsChanged emit carries).
    expect(events).toEqual([
      { source: "filter", changedColIds: ["region"] },
      { source: "filter", changedColIds: ["region", "country"] },
      { source: "filter", changedColIds: ["region", "country"] },
    ]);
  });

  it("fires with source 'columns' when a columnDefs update drops an active filter", () => {
    const { core, api } = makeGrid();
    api.setFilterModel([
      { colId: "country", filters: [{ type: FilterType.CONTAINS, values: ["Fran"] }] },
    ]);
    const events: Array<{ source: string; changedColIds: string[] }> = [];
    const legacyEvents: string[][] = [];
    core.on("filterChanged", ev => events.push({ source: ev.source, changedColIds: ev.changedColIds }));
    core.on("columnsChanged", ev => {
      if (ev.reason === "filter") legacyEvents.push(ev.changedColIds ?? []);
    });

    // Unrelated defs update — the country filter survives, so neither filter signal fires.
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region (renamed)" },
      { colId: "country", key: "country", label: "Country" },
    ]);
    expect(events).toEqual([]);
    expect(legacyEvents).toEqual([]);
    expect(viewIds(core)).toEqual(["2"]);

    // Defs update that removes the filtered column — the filter is dropped, the row model is
    // immediately re-filtered, and both signals identify only the removed filtered column.
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
    ]);
    expect(events).toEqual([{ source: "columns", changedColIds: ["country"] }]);
    expect(legacyEvents).toEqual([["country"]]);
    expect(api.getFilterModel()).toEqual([]);
    expect(viewIds(core)).toEqual(["1", "2", "3"]);
  });

  it("re-requests the server-side row model when a columnDefs update drops a filter", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "serverSide" });
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
      { colId: "country", key: "country", label: "Country" },
    ]);
    const api = new GridAPI(core);
    api.setFilterModel([
      { colId: "country", filters: [{ type: FilterType.CONTAINS, values: ["Fran"] }] },
    ]);

    const applyRequest = vi.spyOn(core.getRowModel(), "applyRequest");
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
    ]);

    expect(applyRequest).toHaveBeenCalledTimes(1);
    expect(applyRequest.mock.calls[0][0].reason).toBe("filter");
    expect(applyRequest.mock.calls[0][0].filterModel.items).toEqual([]);
  });
});
