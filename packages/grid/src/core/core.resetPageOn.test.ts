/**
 * B3 `resetPageOn` page policy. Default []: no model change resets the page — the current page is
 * kept, clamped to the last page when the change shrinks the row count past it. Listing a trigger
 * ("filter" | "sort" | "quickFilter") opts back into jump-to-page-1 for that scope. Sort covers
 * BOTH gestures: the sortModelSet action and header-click toggleSort. (Quick-filter cases live in
 * core.quickFilter.test.ts.)
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { GridOptions } from "../interfaces/gridOptions";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { FilterType } from "../interfaces/filter";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// Six rows, pageSize 2 = 3 pages. Filtering bucket "small" keeps 4 rows (2 pages);
// bucket "tiny" keeps 1 row (1 page).
function makeGrid(options: Partial<GridOptions> = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    pagination: true,
    pageSize: 2,
    pageSizes: [2],
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "a", bucket: "small" },
    { id: "2", name: "b", bucket: "small" },
    { id: "3", name: "c", bucket: "small" },
    { id: "4", name: "d", bucket: "small" },
    { id: "5", name: "e", bucket: "tiny" },
    { id: "6", name: "f", bucket: "big" },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "bucket", key: "bucket", label: "Bucket", type: ColumnType.STRING },
  ]);
  return core;
}

function viewIds(core: GridCore): string[] {
  const out: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) out.push(core.getRowIdAtViewIndex(i)!);
  return out;
}

function goToPage(core: GridCore, pageIndex: number): void {
  core.dispatch({ type: "paginationSet", enabled: true, pageIndex, pageSize: 2 });
}

function filterBucket(core: GridCore, value: string): void {
  const bucket = core.getColumnModel().getByColId("bucket")!;
  core.setFilterModel([{ col: bucket, key: "bucket", filters: [{ type: FilterType.EQ, values: [value] }] }]);
}

describe("resetPageOn default [] — keep the page", () => {
  it("a column-filter change keeps a still-valid page", () => {
    const core = makeGrid();
    goToPage(core, 1);
    filterBucket(core, "small");
    // 4 matches = 2 pages; page 2 is still valid and shows filtered rows 3-4.
    expect(core.getPaginationInfo().pageIndex).toBe(1);
    expect(viewIds(core)).toEqual(["3", "4"]);
  });

  it("a column-filter change clamps an out-of-range page to the last page", () => {
    const core = makeGrid();
    goToPage(core, 2);
    expect(viewIds(core)).toEqual(["5", "6"]);
    filterBucket(core, "tiny");
    // 1 match = 1 page; page 3 no longer exists — land on the last page, never an empty view.
    expect(core.getPaginationInfo().pageIndex).toBe(0);
    expect(viewIds(core)).toEqual(["5"]);
  });

  it("sort keeps the current page (sortModelSet and header-click toggleSort)", () => {
    const core = makeGrid();
    goToPage(core, 1);
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "name", dir: "desc" }] });
    expect(core.getPaginationInfo().pageIndex).toBe(1);
    expect(viewIds(core)).toEqual(["4", "3"]);

    const nameCol = core.getColumnModel().getByColId("name")!;
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: nameCol.instanceID });
    expect(core.getPaginationInfo().pageIndex).toBe(1);
  });
});

describe("resetPageOn opt-in — jump to page 1", () => {
  it("['filter'] resets on a column-filter change", () => {
    const core = makeGrid({ resetPageOn: ["filter"] });
    goToPage(core, 1);
    filterBucket(core, "small");
    expect(core.getPaginationInfo().pageIndex).toBe(0);
    expect(viewIds(core)).toEqual(["1", "2"]);
  });

  it("['sort'] resets via the sortModelSet action", () => {
    const core = makeGrid({ resetPageOn: ["sort"] });
    goToPage(core, 1);
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "name", dir: "desc" }] });
    expect(core.getPaginationInfo().pageIndex).toBe(0);
    expect(viewIds(core)).toEqual(["6", "5"]);
  });

  it("['sort'] resets via header-click toggleSort", () => {
    const core = makeGrid({ resetPageOn: ["sort"] });
    goToPage(core, 1);
    const nameCol = core.getColumnModel().getByColId("name")!;
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: nameCol.instanceID });
    expect(core.getPaginationInfo().pageIndex).toBe(0);
    expect(viewIds(core)).toEqual(["1", "2"]);
  });

  it("['sort'] does not make filter changes reset", () => {
    const core = makeGrid({ resetPageOn: ["sort"] });
    goToPage(core, 1);
    filterBucket(core, "small");
    expect(core.getPaginationInfo().pageIndex).toBe(1);
  });
});
