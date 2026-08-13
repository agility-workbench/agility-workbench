import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { FilterType } from "../interfaces/filter";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(): { core: GridCore; api: IGridAPI } {
  const core = new GridCore(measurer, { rowIdKey: "id" });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans-serif",
    cellFont: "12px sans-serif",
    reason: "test",
  });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name" },
    { colId: "active", key: "active", label: "Active" },
    { colId: "rank", key: "rank", label: "Rank" },
  ]);
  core.setRowData([
    { id: "a", name: "Alpha", active: true, rank: 3 },
    { id: "b", name: "Beta", active: false, rank: 1 },
    { id: "c", name: "Charlie", active: true, rank: 2 },
  ]);
  return { core, api: new GridAPI(core) };
}

describe("IGridAPI row iteration", () => {
  it("exposes filter-only and filter-then-sort traversal", () => {
    const { core, api } = makeGrid();
    api.setFilterModel([
      { colId: "active", filters: [{ type: FilterType.EQ, values: [true] }] },
    ]);
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "rank", dir: "asc" }] });

    const afterFilter: string[] = [];
    const afterFilterAndSort: string[] = [];
    api.forEachNodeAfterFilter(node => afterFilter.push(node.id));
    api.forEachNodeAfterFilterAndSort(node => afterFilterAndSort.push(node.id));

    expect(afterFilter).toEqual(["a", "c"]);
    expect(afterFilterAndSort).toEqual(["c", "a"]);
  });

  it("iterates the full filtered set rather than only the current page", () => {
    const { core, api } = makeGrid();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 0, pageSize: 1 });

    const ids: string[] = [];
    api.forEachNodeAfterFilterAndSort(node => ids.push(node.id));

    expect(core.getRowModel().getViewCount()).toBe(1);
    expect(ids).toEqual(["a", "b", "c"]);
  });
});
