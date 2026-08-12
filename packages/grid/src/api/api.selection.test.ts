/**
 * A1 selection contract for an external selection owner:
 *  - selectRowsById(ids, "set" | "add" | "remove") drives the grid programmatically
 *  - selectAllScope: "filtered" (default) makes select-all / areAllRowsSelected span every page
 *    of the filtered set; "page" restores the old page-only behavior
 *  - selectionPersistence: "keep" retains the row selection across filter / sort / quick-filter
 *    model changes ("clear", the default, discards it)
 *  - getSelectedRowIds()/getSelectedColumnIds() return copies, never live internal state
 *  - export scope "selection" honors the full cross-page row selection
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { GridOptions } from "../interfaces/gridOptions";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { FilterType } from "../interfaces/filter";
import { ExportRenderer } from "../renderer/exportRenderer";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(options: Partial<GridOptions> = {}, rowCount = 10) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    rowSelection: true,
    quickFilter: true,
    ...options,
  });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name" },
    { colId: "bucket", key: "bucket", label: "Bucket" },
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
  })));
  return { core, api: new GridAPI(core) };
}

const selectedIds = (api: GridAPI) => [...api.getSelection().selectedRowIds].sort();

describe("selectRowsById", () => {
  it("sets, adds, and removes selection by stable row id", () => {
    const { api } = makeGrid();
    api.selectRowsById(["1", "3"]);
    expect(selectedIds(api)).toEqual(["1", "3"]);
    api.selectRowsById(["5"], "add");
    expect(selectedIds(api)).toEqual(["1", "3", "5"]);
    api.selectRowsById(["3", "5"], "remove");
    expect(selectedIds(api)).toEqual(["1"]);
    api.selectRowsById(["8", "9"], "set");
    expect(selectedIds(api)).toEqual(["8", "9"]);
  });

  it("drops unknown ids and emits selectionChanged with reason 'api'", () => {
    const { core, api } = makeGrid();
    const reasons: (string | undefined)[] = [];
    core.on("selectionChanged", ev => reasons.push(ev.reason));
    api.selectRowsById(["1", "ghost"]);
    expect(selectedIds(api)).toEqual(["1"]);
    expect(reasons).toEqual(["api"]);
  });

  it("selects rows that are currently filtered out (id-based, not view-based)", () => {
    const { api } = makeGrid();
    api.setFilterModel([
      { colId: "bucket", filters: [{ type: FilterType.EQ, values: ["even"] }] },
    ]);
    api.selectRowsById(["1"]); // odd row — filtered out, but a real row
    expect(selectedIds(api)).toEqual(["1"]);
  });
});

describe("selectAllScope", () => {
  it("default 'filtered': select-all spans every page and areAllRowsSelected agrees", () => {
    const { core, api } = makeGrid({ pagination: true, pageSize: 3, pageSizes: [3] });
    expect(core.getRowModel().getViewCount()).toBe(3); // one page rendered
    api.selectAllRows();
    expect(api.getSelection().selectedRowIds).toHaveLength(10);
    expect(api.areAllRowsSelected()).toBe(true);
    api.selectRowsById(["7"], "remove"); // a row on another page
    expect(api.areAllRowsSelected()).toBe(false);
  });

  it("'filtered' scope covers the filtered set, not the whole data set", () => {
    const { api } = makeGrid({ pagination: true, pageSize: 3, pageSizes: [3] });
    api.setFilterModel([
      { colId: "bucket", filters: [{ type: FilterType.EQ, values: ["even"] }] },
    ]);
    api.selectAllRows();
    expect(selectedIds(api)).toEqual(["0", "2", "4", "6", "8"]);
    expect(api.areAllRowsSelected()).toBe(true);
  });

  it("'page' scope restores page-only select-all", () => {
    const { api } = makeGrid({ pagination: true, pageSize: 3, pageSizes: [3], selectAllScope: "page" });
    api.selectAllRows();
    expect(selectedIds(api)).toEqual(["0", "1", "2"]);
    expect(api.areAllRowsSelected()).toBe(true);
  });
});

describe("selectionPersistence", () => {
  it("default 'clear': filter, sort, and quick-filter changes clear the row selection", () => {
    const { core, api } = makeGrid();
    api.selectRowsById(["1", "2"]);
    api.setFilterModel([
      { colId: "bucket", filters: [{ type: FilterType.EQ, values: ["even"] }] },
    ]);
    expect(api.getSelection().selectedRowIds).toEqual([]);

    api.selectRowsById(["2", "4"]);
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "name", dir: "desc" }] });
    expect(api.getSelection().selectedRowIds).toEqual([]);

    api.selectRowsById(["2", "4"]);
    api.setQuickFilter("row");
    expect(api.getSelection().selectedRowIds).toEqual([]);
  });

  it("default 'clear': header-click sort (toggleSort) clears the selection like API sort", () => {
    const { core, api } = makeGrid();
    api.selectRowsById(["1", "2"]);
    const nameCol = core.getColumnModel().getByColId("name")!;
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: nameCol.instanceID });
    expect(api.getSelection().selectedRowIds).toEqual([]);
  });

  it("'keep': the row selection survives header-click sort (toggleSort)", () => {
    const { core, api } = makeGrid({ selectionPersistence: "keep" });
    api.selectRowsById(["1", "2"]);
    const nameCol = core.getColumnModel().getByColId("name")!;
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: nameCol.instanceID });
    expect(selectedIds(api)).toEqual(["1", "2"]);
  });

  it("'keep': the row selection survives filter, sort, and quick-filter changes", () => {
    const { core, api } = makeGrid({ selectionPersistence: "keep" });
    const reasons: (string | undefined)[] = [];
    core.on("selectionChanged", ev => reasons.push(ev.reason));
    api.selectRowsById(["1", "2"]);
    api.setFilterModel([
      { colId: "bucket", filters: [{ type: FilterType.EQ, values: ["even"] }] },
    ]);
    expect(selectedIds(api)).toEqual(["1", "2"]); // "1" is filtered out but stays selected
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "name", dir: "desc" }] });
    api.setQuickFilter("row");
    expect(selectedIds(api)).toEqual(["1", "2"]);
    // Model changes still announce themselves (the range is cleared, the view shifted).
    expect(reasons).toContain("model");
  });
});

describe("selection reads", () => {
  it("getSelectedRowIds / getSelectedColumnIds return copies", () => {
    const { core, api } = makeGrid();
    api.selectRowsById(["1"]);
    const ids = core.getSelectedRowIds();
    ids.add("999");
    ids.delete("1");
    expect(selectedIds(api)).toEqual(["1"]);
    core.getSelectedColumnIds().add("bogus");
    expect(core.getSelectedColumnIds().has("bogus")).toBe(false);
  });
});

describe("export scope 'selection' with a cross-page row selection", () => {
  it("exports every selected row, not just the current page's", () => {
    const { core, api } = makeGrid({ pagination: true, pageSize: 3, pageSizes: [3] });
    api.selectRowsById(["1", "8"]); // page 1 and page 3
    const exporter = new ExportRenderer({
      core,
      leafColumns: () => core.getColumnModel().getLeaves().filter(c => !c.isInternal()),
      columnWidths: () => new Map(),
      selectionRange: () => core.getSelectionRange(),
      selectedColumnIDs: () => core.getSelectedColumnIds(),
    });
    const csv = exporter.getDataAsCsv({ scope: "selection" })!;
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3); // header + both rows
    expect(csv).toContain("row 1");
    expect(csv).toContain("row 8");
  });
});
