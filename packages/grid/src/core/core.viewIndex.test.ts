/**
 * `getViewIndexForRowId` is the renderer-facing reverse lookup: its answer must always be a slot
 * on the current page, never a node's stale/absolute internal stamp.
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { FilterType } from "../interfaces/filter";

const measurer = { measure: (text: string) => text.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    pagination: true,
    pageSize: 2,
    pageSizes: [2],
  });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans",
    cellFont: "12px sans",
    reason: "test",
  });
  core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name" }]);
  core.setRowData([
    { id: "1", name: "one" },
    { id: "2", name: "two" },
    { id: "3", name: "three" },
    { id: "4", name: "four" },
  ]);
  return core;
}

describe("GridCore getViewIndexForRowId", () => {
  it("returns current page-local slots and rejects flat CSRM stamps left on another page", () => {
    const core = makeGrid();
    expect(core.getViewIndexForRowId("1")).toBe(0);
    expect(core.getViewIndexForRowId("2")).toBe(1);

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 2 });
    expect(core.getViewIndexForRowId("3")).toBe(0);
    expect(core.getViewIndexForRowId("4")).toBe(1);
    expect(core.getViewIndexForRowId("1")).toBeNull();
    expect(core.getViewIndexForRowId("2")).toBeNull();
  });

  it("returns null for filtered-out and unknown rows", () => {
    const core = makeGrid();
    const name = core.getColumnModel().getByColId("name")!;
    core.setFilterModel([{
      col: name,
      key: name.key,
      filters: [{ type: FilterType.EQ, values: ["two"] }],
    }]);

    expect(core.getViewIndexForRowId("2")).toBe(0);
    expect(core.getViewIndexForRowId("1")).toBeNull();
    expect(core.getViewIndexForRowId("missing")).toBeNull();
  });
});
