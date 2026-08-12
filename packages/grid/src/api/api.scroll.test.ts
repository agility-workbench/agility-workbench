/**
 * C3 scroll/navigation API: ensureRowVisible / ensureColumnVisible / ensureCellVisible.
 *
 * These cover the model half — resolving a row id to the view slot the renderer will draw it at,
 * which is where pagination and group expansion make it interesting — with a stub scroll controller
 * standing in for the renderer's scrollers. The scrolling half (where in the viewport the row lands)
 * is covered in renderer/scroll.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { GridAPI, GridApiScrollController } from "./api";
import { GridCore } from "../core/core";
import { GridOptions } from "../interfaces/gridOptions";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { FilterType } from "../interfaces/filter";
import { RowScrollPosition } from "../interfaces/iGridAPI";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

type ScrollCall = { viewIdx: number; rowPinned?: string; position?: RowScrollPosition };

function makeGrid(options: Partial<GridOptions> = {}, rowCount = 50) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    ...options,
  });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name" },
    { colId: "bucket", key: "bucket", label: "Bucket" },
    { colId: "hidden", key: "hidden", label: "Hidden", hidden: true },
  ]);
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans-serif",
    cellFont: "12px sans-serif",
    reason: "test",
  });
  core.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: String(i),
    name: `row ${i}`,
    bucket: i % 2 === 0 ? "even" : "odd",
    hidden: i,
  })));

  const api = new GridAPI(core);
  const rows: ScrollCall[] = [];
  const cols: number[] = [];
  const controller: GridApiScrollController = {
    ensureRowVisible: (viewIdx, rowPinned, position) => rows.push({ viewIdx, rowPinned, position }),
    ensureColumnVisible: (colIdx) => cols.push(colIdx),
  };
  api.setScrollController(controller);
  return { core, api, rows, cols };
}

describe("ensureRowVisible", () => {
  it("scrolls to a row on the current page and reports the view slot it occupies", () => {
    const { api, rows } = makeGrid();
    expect(api.ensureRowVisible("7")).toBe(true);
    expect(rows).toEqual([{ viewIdx: 7, rowPinned: undefined, position: "auto" }]);
  });

  it("passes the requested position through", () => {
    const { api, rows } = makeGrid();
    api.ensureRowVisible("7", { position: "middle" });
    expect(rows[0].position).toBe("middle");
  });

  it("pages to the row and hands the renderer a page-local view index", () => {
    const { api, core, rows } = makeGrid({ pagination: true, pageSize: 10, pageSizes: [10] });
    expect(core.getPaginationInfo().pageIndex).toBe(0);

    expect(api.ensureRowVisible("42")).toBe(true);
    expect(core.getPaginationInfo().pageIndex).toBe(4);
    // Row 42 is the third row of page 5 — the renderer indexes within the page, not the dataset.
    expect(rows).toEqual([{ viewIdx: 2, rowPinned: undefined, position: "auto" }]);
  });

  it("does not change the page when the row is already on it", () => {
    const { api, core, rows } = makeGrid({ pagination: true, pageSize: 10, pageSizes: [10] });
    const pageChanges: number[] = [];
    core.on("paginationChanged", ev => pageChanges.push(ev.pageIndex));

    expect(api.ensureRowVisible("3")).toBe(true);
    expect(pageChanges).toEqual([]);
    expect(rows[0].viewIdx).toBe(3);
  });

  it("resolves the slot against the sorted order, not the row's position in the data", () => {
    const { api, core, rows } = makeGrid({ pagination: true, pageSize: 10, pageSizes: [10] }, 20);
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "name", dir: "desc" }] });

    // Descending by name puts "row 9" first, so row id 0 ("row 0") lands last of 20.
    expect(api.ensureRowVisible("0")).toBe(true);
    expect(core.getPaginationInfo().pageIndex).toBe(1);
    expect(rows[0].viewIdx).toBe(9);
  });

  it("reports false for a row the filter excludes, without scrolling", () => {
    const { api, rows } = makeGrid();
    api.setFilterModel([{ colId: "bucket", filters: [{ type: FilterType.EQ, values: ["even"] }] }]);

    expect(api.ensureRowVisible("3")).toBe(false);
    expect(rows).toEqual([]);
    // An even row is still reachable, at its post-filter slot.
    expect(api.ensureRowVisible("6")).toBe(true);
    expect(rows[0].viewIdx).toBe(3);
  });

  it("reports false for an unknown row id", () => {
    const { api, rows } = makeGrid();
    expect(api.ensureRowVisible("nope")).toBe(false);
    expect(rows).toEqual([]);
  });

  it("warns and reports false before the grid is rendered", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    const api = new GridAPI(core);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(api.ensureRowVisible("0")).toBe(false);
    expect(warn).toHaveBeenCalledOnce();

    // One warning per call, even though ensureCellVisible funnels through both halves.
    warn.mockClear();
    expect(api.ensureCellVisible({ rowId: "0", colId: "name" })).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("ensureRowVisible while grouping", () => {
  function makeGroupedGrid(options: Partial<GridOptions> = {}, rowCount = 10) {
    const grid = makeGrid(options, rowCount);
    grid.core.dispatch({ type: "rowGroupSet", colIds: ["bucket"] });
    return grid;
  }
  const groupNode = (core: GridCore, key: string) =>
    core.getRowModel().getGroupNodes().find(node => node.groupKey === key);

  it("expands the row's collapsed ancestors so it has a slot at all", () => {
    const { api, core, rows } = makeGroupedGrid();
    // Both group rows are collapsed: the only visible rows are the two group headers.
    expect(core.getRowModel().getViewCount()).toBe(2);

    expect(api.ensureRowVisible("4")).toBe(true);
    expect(groupNode(core, "even")?.isExpanded).toBe(true);
    // Ancestors expand, so the "even" bucket's rows (0, 2, 4, 6, 8) now sit under its header:
    // header at 0, then rows 0, 2, 4 → view index 3.
    expect(rows).toEqual([{ viewIdx: 3, rowPinned: undefined, position: "auto" }]);
  });

  it("leaves an unrelated collapsed group alone", () => {
    const { api, core } = makeGroupedGrid();
    api.ensureRowVisible("4");
    expect(groupNode(core, "odd")?.isExpanded).toBe(false);
  });

  it("reveals a group row itself", () => {
    const { api, core, rows } = makeGroupedGrid();
    const oddGroupId = groupNode(core, "odd")!.id;
    expect(api.ensureRowVisible(oddGroupId)).toBe(true);
    expect(rows[0].viewIdx).toBe(1);
  });

  it("counts group headers when paging to a grouped row", () => {
    const { api, core, rows } = makeGroupedGrid(
      { groupDefaultExpanded: -1, pagination: true, pageSize: 4, pageSizes: [4] },
      10,
    );
    // Flattened view: [even header, 0, 2, 4] [6, 8, odd header, 1] [3, 5, 7, 9]
    expect(api.ensureRowVisible("7")).toBe(true);
    expect(core.getPaginationInfo().pageIndex).toBe(2);
    expect(rows[0].viewIdx).toBe(2);
  });
});

describe("ensureRowVisible with pinned rows", () => {
  it("routes a row mirrored into a frozen band to that band", () => {
    const { api, core, rows } = makeGrid({ isRowPinned: (node: any) => node.data.id === "5" ? "top" : null });
    // The renderer owns band composition; emulate what it publishes to the core on render.
    const pinned = core.getRowModel().getRowNode("5")!;
    core.setDisplayedPinnedRows([pinned], []);

    expect(api.ensureRowVisible("5")).toBe(true);
    expect(rows).toEqual([{ viewIdx: 0, rowPinned: "top", position: "auto" }]);
  });
});

describe("ensureColumnVisible", () => {
  it("resolves a public colId to its leaf index", () => {
    const { api, core, cols } = makeGrid();
    const expected = core.getColumnModel().getLeaves()
      .findIndex(col => col.colId === "bucket");
    expect(api.ensureColumnVisible("bucket")).toBe(true);
    expect(cols).toEqual([expected]);
  });

  it("accepts a column instance id too", () => {
    const { api, core, cols } = makeGrid();
    const col = core.getColumnModel().getByColId("bucket")!;
    expect(api.ensureColumnVisible(col.instanceID)).toBe(true);
    expect(cols).toHaveLength(1);
  });

  it("reports false for an unknown or hidden column, without scrolling", () => {
    const { api, cols } = makeGrid();
    expect(api.ensureColumnVisible("nope")).toBe(false);
    expect(api.ensureColumnVisible("hidden")).toBe(false);
    expect(cols).toEqual([]);
  });
});

describe("ensureCellVisible", () => {
  it("scrolls both axes", () => {
    const { api, rows, cols } = makeGrid();
    expect(api.ensureCellVisible({ rowId: "12", colId: "bucket" })).toBe(true);
    expect(rows[0].viewIdx).toBe(12);
    expect(cols).toHaveLength(1);
  });

  it("still reveals the row when the column half fails", () => {
    const { api, rows, cols } = makeGrid();
    expect(api.ensureCellVisible({ rowId: "12", colId: "nope" })).toBe(false);
    expect(rows[0].viewIdx).toBe(12);
    expect(cols).toEqual([]);
  });
});
