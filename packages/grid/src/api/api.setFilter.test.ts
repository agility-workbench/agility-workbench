/**
 * Intent-level set-filter helpers on IGridAPI: check/uncheck/get/set values against the column's
 * value universe. Consumers never see the in/notIn storage representation; the one observable
 * semantic — what happens to values that arrive after filtering — is the explicit `mode`.
 */
import { describe, expect, it, vi } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { FilterType } from "../interfaces/filter";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(rows: Record<string, unknown>[]) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.setColumnDefsFromProps([
    {
      colId: "region",
      key: "region",
      label: "Region",
      filter: "set",
      // Condition-count configuration must not truncate the set-filter value universe.
      filterParams: { maxNumConditions: 2 },
    },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, filter: "set" },
    {
      colId: "owner",
      key: "owner",
      label: "Owner",
      filter: "set",
      filterParams: { filterValues: ({ success }) => success(["Ava", "Liam"]) },
    },
    { colId: "name", key: "name", label: "Name" }, // text filter — not a set column
  ]);
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans-serif",
    cellFont: "12px sans-serif",
    reason: "test",
  });
  core.setRowData(rows);
  return { core, api: new GridAPI(core) };
}

const ROWS: Record<string, unknown>[] = [
  { id: "1", region: "APAC", qty: 1, name: "a" },
  { id: "2", region: "EMEA", qty: 2, name: "b" },
  { id: "3", region: "EMEA", qty: 2, name: "c" },
  { id: "4", region: null, qty: 3, name: "d" },
];

function viewIds(core: GridCore): string[] {
  const out: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) {
    out.push(core.getRowIdAtViewIndex(i)!);
  }
  return out;
}

describe("IGridAPI set-filter helpers", () => {
  it("getSetFilterValues returns the complete universe regardless of maxNumConditions", async () => {
    const { api } = makeGrid(ROWS);
    expect(await api.getSetFilterValues("region")).toEqual([null, "APAC", "EMEA"]);
    expect(await api.getSetFilterValues("qty")).toEqual([1, 2, 3]);
    expect(await api.getSetFilterValues("owner")).toEqual(["Ava", "Liam"]);
  });

  it("uncheck hides the value's rows; state reports intent, not storage", async () => {
    const { core, api } = makeGrid(ROWS);
    await api.uncheckSetFilterValue("region", "EMEA");
    expect(viewIds(core)).toEqual(["1", "4"]);
    expect(await api.getSetFilterState("region")).toEqual({
      mode: "exclude",
      checked: [null, "APAC"],
      unchecked: ["EMEA"],
    });
    expect(api.getFilterModel()).toEqual([
      { colId: "region", filters: [{ type: FilterType.NOT_IN, values: ["EMEA"] }], join: "and" },
    ]);
  });

  it("re-checking removes the filter; redundant toggles don't dispatch", async () => {
    const { core, api } = makeGrid(ROWS);
    await api.uncheckSetFilterValue("region", "EMEA");
    await api.checkSetFilterValue("region", "EMEA");
    expect(await api.getSetFilterState("region")).toBeNull();
    expect(viewIds(core)).toEqual(["1", "2", "3", "4"]);

    let filterEvents = 0;
    core.on("columnsChanged", ev => { if (ev.reason === "filter") filterEvents++; });
    await api.checkSetFilterValue("region", "EMEA"); // already checked
    await api.uncheckSetFilterValue("region", "zzz"); // not in the universe
    expect(filterEvents).toBe(0);
  });

  it("heals typed inputs: unchecking the string \"2\" excludes the numeric 2", async () => {
    const { core, api } = makeGrid(ROWS);
    await api.uncheckSetFilterValue("qty", "2");
    expect(viewIds(core)).toEqual(["1", "4"]);
    expect(api.getFilterModel()[0].filters[0].values).toEqual([2]);
  });

  it("null addresses the blanks bucket and hides blank cells", async () => {
    const { core, api } = makeGrid(ROWS);
    await api.uncheckSetFilterValue("region", null);
    expect(viewIds(core)).toEqual(["1", "2", "3"]);
    expect((await api.getSetFilterState("region"))!.unchecked).toEqual([null]);
  });

  it("builds the universe with an unguarded keyCreator, blanks included", async () => {
    // The headless helpers reuse the menu's universe builder, so the blank policy has to hold here
    // too: this keyCreator would throw the moment it saw the null region.
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.setColumnDefsFromProps([{
      colId: "region", key: "region", label: "Region", filter: "set",
      filterParams: {
        keyCreator: (value: any) => value.code,
        valueFormatter: ({ value }: any) => value.name,
      },
    }]);
    core.dispatch({
      type: "themeFontSet", headerFont: "12px sans-serif", cellFont: "12px sans-serif", reason: "test",
    });
    core.setRowData([
      { id: "1", region: { code: "APAC", name: "Asia Pacific" } },
      { id: "2", region: null },
      { id: "3", region: { code: "EMEA", name: "Europe" } },
    ]);
    const api = new GridAPI(core);

    // null for the blanks bucket, then the real values in label order.
    expect(await api.getSetFilterValues("region")).toEqual([
      null,
      { code: "APAC", name: "Asia Pacific" },
      { code: "EMEA", name: "Europe" },
    ]);

    await api.uncheckSetFilterValue("region", null);
    expect(viewIds(core)).toEqual(["1", "3"]);
    await api.uncheckSetFilterValue("region", { code: "APAC" });
    expect(viewIds(core)).toEqual(["3"]);
  });

  it("include mode pins intent: values arriving later stay hidden and toggles keep the mode", async () => {
    const { core, api } = makeGrid(ROWS);
    await api.setSetFilterValues("region", ["EMEA"], { mode: "include" });
    expect(viewIds(core)).toEqual(["2", "3"]);

    core.applyTransaction({ add: [{ id: "5", region: "LATAM", qty: 9, name: "e" }] });
    expect(viewIds(core)).toEqual(["2", "3"]); // LATAM arrived after filtering — hidden

    await api.checkSetFilterValue("region", "LATAM");
    expect(viewIds(core)).toEqual(["2", "3", "5"]);
    const def = api.getFilterModel()[0].filters[0];
    expect(def.type).toBe(FilterType.IN);
    expect(def.mode).toBe("include");

    // Checking every value under include mode keeps an explicit in-list (future values hidden)
    // instead of collapsing to "no filter".
    await api.checkSetFilterValue("region", "APAC");
    await api.checkSetFilterValue("region", null);
    expect((await api.getSetFilterState("region"))!.mode).toBe("include");
    expect(api.getFilterModel()[0].filters[0].type).toBe(FilterType.IN);
  });

  it("exclude mode: values arriving later stay visible", async () => {
    const { core, api } = makeGrid(ROWS);
    await api.setSetFilterValues("region", ["EMEA"], { mode: "exclude" });
    expect(viewIds(core)).toEqual(["1", "4"]);

    core.applyTransaction({ add: [{ id: "5", region: "LATAM", qty: 9, name: "e" }] });
    expect(viewIds(core)).toEqual(["1", "4", "5"]);
    expect((await api.getSetFilterState("region"))!.mode).toBe("exclude");
  });

  it("warns and no-ops on non-set and unknown columns", async () => {
    const { api } = makeGrid(ROWS);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await api.uncheckSetFilterValue("name", "a");
      await api.uncheckSetFilterValue("ghost", "a");
      expect(await api.getSetFilterValues("name")).toEqual([]);
      expect(api.getFilterModel()).toEqual([]);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
