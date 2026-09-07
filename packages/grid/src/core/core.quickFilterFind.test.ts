import { describe, expect, it, beforeEach } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GridEventQuickFilterFindChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", name: "Acme Corp", region: "West" },
  { id: "2", name: "Acme Labs", region: "East" },
  { id: "3", name: "Globex", region: "West" },
  { id: "4", name: "Initech", region: "South" },
];

function makeGrid(options: Record<string, any> = {}, rows = ROWS) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    quickFilter: { behavior: "find" },
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(rows);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
  ]);
  return core;
}

function viewIds(core: GridCore): string[] {
  const out: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) out.push(core.getRowIdAtViewIndex(i)!);
  return out;
}

/** Every match, walked from the top with findNext, as "rowId:colId". */
function walkMatches(core: GridCore): string[] {
  const out: string[] = [];
  for (let i = 0; i < core.getFindState().matchCount; i++) {
    const m = core.findNext()!;
    out.push(`${m.rowId}:${m.colId}`);
  }
  return out;
}

describe("GridCore quick-filter find behavior", () => {
  let core: GridCore;
  beforeEach(() => { core = makeGrid(); });

  it("highlights instead of filtering: every row stays in the view", () => {
    core.dispatch({ type: "quickFilterSet", text: "acme" });
    expect(viewIds(core)).toEqual(["1", "2", "3", "4"]);
    expect(core.getQuickFilterText()).toBe("acme");
    expect(core.getQuickFilterBehavior()).toBe("find");
  });

  it("counts matching CELLS, not rows", () => {
    // "e" is in Acme Corp/West, Acme Labs/East, Globex/West and Initech — 7 cells over 4 rows.
    core.dispatch({ type: "quickFilterSet", text: "e" });
    expect(core.getFindState().matchCount).toBe(7);
    core.dispatch({ type: "quickFilterSet", text: "west" });
    expect(core.getFindState().matchCount).toBe(2);
  });

  it("matches within one cell only — the filter's multiTerm mode does not apply", () => {
    // As a filter, "acme west" matches row 1 (both terms somewhere in the row). As a find, no single
    // cell contains the whole run.
    core.dispatch({ type: "quickFilterSet", text: "acme west", matchMode: "multiTerm" });
    expect(core.getFindState().matchCount).toBe(0);
    expect(viewIds(core)).toEqual(["1", "2", "3", "4"]);
  });

  it("honours case sensitivity", () => {
    core.dispatch({ type: "quickFilterSet", text: "ACME" });
    expect(core.getFindState().matchCount).toBe(2);
    core.dispatch({ type: "quickFilterSet", text: "ACME", caseSensitive: true });
    expect(core.getFindState().matchCount).toBe(0);
    core.dispatch({ type: "quickFilterSet", text: "Acme", caseSensitive: true });
    expect(core.getFindState().matchCount).toBe(2);
  });

  it("walks matches in display order — row by row, then column by column", () => {
    core.dispatch({ type: "quickFilterSet", text: "e" });
    expect(walkMatches(core)).toEqual([
      "1:name", "1:region", "2:name", "2:region", "3:name", "3:region", "4:name",
    ]);
  });

  it("wraps at both ends and tracks a 1-based active index", () => {
    core.dispatch({ type: "quickFilterSet", text: "west" });
    expect(core.getFindState().activeIndex).toBe(0);
    expect(core.findNext()!.rowId).toBe("1");
    expect(core.getFindState().activeIndex).toBe(1);
    expect(core.findNext()!.rowId).toBe("3");
    expect(core.getFindState().activeIndex).toBe(2);
    // Past the end, back to the first.
    expect(core.findNext()!.rowId).toBe("1");
    expect(core.getFindState().activeIndex).toBe(1);
    // Before the start, round to the last.
    expect(core.findPrevious()!.rowId).toBe("3");
    expect(core.getFindState().activeIndex).toBe(2);
  });

  it("reports no matches, and navigates to nothing, when the text matches no cell", () => {
    core.dispatch({ type: "quickFilterSet", text: "nowhere" });
    const state = core.getFindState();
    expect(state.matchCount).toBe(0);
    expect(state.activeMatch).toBeNull();
    expect(core.findNext()).toBeNull();
    expect(core.findPrevious()).toBeNull();
  });

  it("keeps the active match across a re-sort", () => {
    core.dispatch({ type: "quickFilterSet", text: "west" });
    core.findNext();
    core.findNext();
    expect(core.getFindState().activeMatch!.rowId).toBe("3");
    expect(core.getFindState().activeIndex).toBe(2);
    // Descending by name puts Globex (row 3) ahead of Acme Corp (row 1): the same cell is still
    // active, now as match 1 of 2.
    core.setSortModel([{ key: "name", dir: "desc" }]);
    expect(core.getFindState().activeMatch!.rowId).toBe("3");
    expect(core.getFindState().activeIndex).toBe(1);
  });

  it("re-counts when the row data changes", () => {
    core.dispatch({ type: "quickFilterSet", text: "acme" });
    expect(core.getFindState().matchCount).toBe(2);
    core.applyTransaction({ add: [{ id: "5", name: "Acme Holdings", region: "North" }] });
    expect(core.getFindState().matchCount).toBe(3);
    core.applyTransaction({ remove: ["1"] });
    expect(core.getFindState().matchCount).toBe(2);
  });

  it("re-counts when a column filter hides matching rows", () => {
    core.dispatch({ type: "quickFilterSet", text: "acme" });
    expect(core.getFindState().matchCount).toBe(2);
    const regionCol = core.getColumnModel().getByColId("region")!;
    core.setFilterModel([
      { col: regionCol, key: "region", filters: [{ type: "contains" as any, values: ["West"] }] },
    ]);
    expect(core.getFindState().matchCount).toBe(1);
  });

  it("does not search a hidden column", () => {
    core.dispatch({ type: "quickFilterSet", text: "west" });
    expect(core.getFindState().matchCount).toBe(2);
    core.dispatch({ type: "columnVisibility", colIds: ["region"], hidden: true });
    expect(core.getFindState().matchCount).toBe(0);
  });

  it("finds matches on other pages and inside collapsed groups", () => {
    const grid = makeGrid({ pagination: true, pageSize: 2 });
    grid.dispatch({ type: "quickFilterSet", text: "initech" });
    // Row 4 is on page 2, but the find covers the whole view.
    expect(grid.getFindState().matchCount).toBe(1);
    const match = grid.findNext()!;
    expect(match.rowId).toBe("4");
    // findNext reveals its row: the grid paged to it.
    expect(viewIds(grid)).toContain("4");
  });

  it("finds inside collapsed groups and expands to reveal", () => {
    const grid = makeGrid();
    grid.setRowGroupModel(["region"]);
    grid.dispatch({ type: "quickFilterSet", text: "initech" });
    expect(grid.getFindState().matchCount).toBe(1);
    expect(viewIds(grid)).not.toContain("4");
    grid.findNext();
    expect(viewIds(grid)).toContain("4");
  });

  it("switching behavior re-derives the view with the same text", () => {
    core.dispatch({ type: "quickFilterSet", text: "acme" });
    expect(viewIds(core)).toEqual(["1", "2", "3", "4"]);
    expect(core.getFindState().matchCount).toBe(2);

    core.dispatch({ type: "quickFilterSet", text: "acme", behavior: "filter" });
    expect(viewIds(core)).toEqual(["1", "2"]);
    expect(core.getFindState().matchCount).toBe(0);
    expect(core.getFindState().activeMatch).toBeNull();

    core.dispatch({ type: "quickFilterSet", text: "acme", behavior: "find" });
    expect(viewIds(core)).toEqual(["1", "2", "3", "4"]);
    expect(core.getFindState().matchCount).toBe(2);
  });

  it("never fires filterChanged for a find-only change", () => {
    const sources: string[] = [];
    core.on("filterChanged", (ev) => sources.push(ev.source));
    core.dispatch({ type: "quickFilterSet", text: "acme" });
    core.dispatch({ type: "quickFilterSet", text: "acmex" });
    core.findNext();
    expect(sources).toEqual([]);
    // Switching to filtering with text in the box is an effective filter change, and reports.
    core.dispatch({ type: "quickFilterSet", text: "acmex", behavior: "filter" });
    expect(sources).toEqual(["quickFilter"]);
  });

  it("emits quickFilterFindChanged for query edits, navigation and model changes", () => {
    const events: GridEventQuickFilterFindChangedParams[] = [];
    core.on("quickFilterFindChanged", (ev) => events.push(ev));

    core.dispatch({ type: "quickFilterSet", text: "west" });
    expect(events.at(-1)).toMatchObject({ reason: "query", matchCount: 2, activeIndex: 0 });

    core.findNext();
    expect(events.at(-1)).toMatchObject({ reason: "navigate", activeIndex: 1 });

    core.applyTransaction({ add: [{ id: "6", name: "Westward", region: "West" }] });
    expect(events.at(-1)).toMatchObject({ reason: "model", matchCount: 4 });
  });

  it("stays quiet while merely filtering", () => {
    const grid = makeGrid({ quickFilter: true });
    const events: GridEventQuickFilterFindChangedParams[] = [];
    grid.on("quickFilterFindChanged", (ev) => events.push(ev));
    grid.dispatch({ type: "quickFilterSet", text: "acme" });
    grid.dispatch({ type: "quickFilterSet", text: "acme corp" });
    expect(events).toEqual([]);
    // Switching into finding reports, and switching back out reports the state going away.
    grid.dispatch({ type: "quickFilterSet", text: "acme corp", behavior: "find" });
    expect(events.at(-1)).toMatchObject({ reason: "query", behavior: "find", matchCount: 1 });
    grid.dispatch({ type: "quickFilterSet", text: "acme corp", behavior: "filter" });
    expect(events.at(-1)).toMatchObject({ reason: "query", behavior: "filter", matchCount: 0 });
  });

  it("keeps the row selection and the page while finding", () => {
    const grid = makeGrid({ pagination: true, pageSize: 2, rowSelection: true });
    grid.selectRowsById(["1"]);
    grid.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    grid.dispatch({ type: "quickFilterSet", text: "acme" });
    expect([...grid.getSelectedRowIds()]).toEqual(["1"]);
    expect(grid.getPaginationInfo().pageIndex).toBe(1);
  });

  it("is inert on the server-side row model", () => {
    const grid = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "serverSide",
      quickFilter: { behavior: "find" },
      serverSideDataSource: { getRows: () => {} } as any,
    });
    grid.dispatch({ type: "quickFilterSet", text: "acme" });
    expect(grid.getFindState().matchCount).toBe(0);
    expect(grid.getQuickFilterText()).toBe("");
  });

  it("defaults to the filter behavior when the option does not ask for find", () => {
    const grid = makeGrid({ quickFilter: true });
    grid.dispatch({ type: "quickFilterSet", text: "acme" });
    expect(grid.getQuickFilterBehavior()).toBe("filter");
    expect(viewIds(grid)).toEqual(["1", "2"]);
    expect(grid.getFindState().matchCount).toBe(0);
  });
});
