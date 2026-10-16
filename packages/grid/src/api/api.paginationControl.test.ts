/**
 * api.setPagination and its page helpers — the typed door for `dispatch({ type: "paginationSet" })`.
 */
import { describe, expect, it, vi } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { GridEventPaginationChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(paginate = true): { core: GridCore; api: IGridAPI } {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", pageSize: 10, pageSizes: [10, 25] });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING }]);
  core.setRowData(Array.from({ length: 25 }, (_, i) => ({ id: String(i), name: `row ${i}` })));
  if (paginate) core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 0, pageSize: 10 });
  return { core, api: new GridAPI(core) };
}

const page = (api: IGridAPI) => {
  const { paginationEnabled, pageIndex, pageSize } = api.getPaginationInfo();
  return { paginationEnabled, pageIndex, pageSize };
};

describe("api.setPagination", () => {
  it("merges over the current state", () => {
    const { api } = makeGrid();
    api.setPagination({ pageIndex: 2 });
    expect(page(api)).toEqual({ paginationEnabled: true, pageIndex: 2, pageSize: 10 });
    expect(api.getDisplayedRowAtIndex(0)?.id).toBe("20");
  });

  it("clamps the page index to the known range", () => {
    const { api } = makeGrid();
    api.setPagination({ pageIndex: 99 });
    expect(page(api).pageIndex).toBe(2);
    api.setPagination({ pageIndex: -3 });
    expect(page(api).pageIndex).toBe(0);
    api.setPagination({ pageIndex: 1.7 });
    expect(page(api).pageIndex).toBe(1);
  });

  it("a new page size returns to the first page unless a page is given", () => {
    const { api } = makeGrid();
    api.setPagination({ pageIndex: 2 });
    api.setPagination({ pageSize: 5 });
    expect(page(api)).toEqual({ paginationEnabled: true, pageIndex: 0, pageSize: 5 });
    api.setPagination({ pageSize: 10, pageIndex: 1 });
    expect(page(api)).toEqual({ paginationEnabled: true, pageIndex: 1, pageSize: 10 });
  });

  it("turns pagination on and off; off lands on page 0", () => {
    const { api } = makeGrid(false);
    expect(page(api).paginationEnabled).toBe(false);
    api.setPagination({ enabled: true, pageIndex: 1 });
    expect(page(api)).toEqual({ paginationEnabled: true, pageIndex: 1, pageSize: 10 });
    api.setPagination({ enabled: false });
    expect(page(api).paginationEnabled).toBe(false);
    expect(page(api).pageIndex).toBe(0);
    expect(api.getDisplayedRowCount()).toBe(25);
  });

  it("emits paginationChanged once per change and nothing for a no-op", () => {
    const { api } = makeGrid();
    const events: GridEventPaginationChangedParams[] = [];
    api.on("paginationChanged", e => events.push(e));
    api.setPagination({ pageIndex: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].pageIndex).toBe(1);
    api.setPagination({ pageIndex: 1 });
    api.setPagination({});
    expect(events).toHaveLength(1);
  });

  it("refuses an invalid page size with a warning", () => {
    const { api } = makeGrid();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      api.setPagination({ pageSize: 0, pageIndex: 1 });
      api.setPagination({ pageSize: 2.5 });
      expect(warn).toHaveBeenCalledTimes(2);
      expect(page(api)).toEqual({ paginationEnabled: true, pageIndex: 0, pageSize: 10 });
    } finally {
      warn.mockRestore();
    }
  });

  it("does not clamp while the total row count is provisional", () => {
    const { core, api } = makeGrid();
    const rowModel = core.getRowModel() as { isTotalRowCountKnown?: () => boolean };
    rowModel.isTotalRowCountKnown = () => false;
    const dispatch = vi.spyOn(core, "dispatch");
    api.setPagination({ pageIndex: 7 });
    expect(dispatch).toHaveBeenCalledWith({ type: "paginationSet", enabled: true, pageIndex: 7, pageSize: 10 });
  });
});

describe("page helpers", () => {
  it("next / previous / first / last / goToPage", () => {
    const { api } = makeGrid();
    api.nextPage();
    expect(page(api).pageIndex).toBe(1);
    api.lastPage();
    expect(page(api).pageIndex).toBe(2);
    api.nextPage();
    expect(page(api).pageIndex).toBe(2);
    api.previousPage();
    expect(page(api).pageIndex).toBe(1);
    api.firstPage();
    expect(page(api).pageIndex).toBe(0);
    api.previousPage();
    expect(page(api).pageIndex).toBe(0);
    api.goToPage(2);
    expect(page(api).pageIndex).toBe(2);
  });

  it("setPageSize changes the size and returns to page 0", () => {
    const { api } = makeGrid();
    api.goToPage(2);
    api.setPageSize(25);
    expect(page(api)).toEqual({ paginationEnabled: true, pageIndex: 0, pageSize: 25 });
    expect(api.getPaginationInfo().totalPageCount).toBe(1);
  });

  it("page navigation is a no-op with pagination off", () => {
    const { api } = makeGrid(false);
    api.goToPage(1);
    api.nextPage();
    api.lastPage();
    expect(page(api).paginationEnabled).toBe(false);
    expect(api.getDisplayedRowCount()).toBe(25);
  });
});
