/**
 * Live `pageSize` / `pageSizes` (updateGridOptions) and `paginationAutoPageSize` — the core half.
 * The renderer reports the body's height through `core.setPageViewportHeight`; here it is called
 * directly.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { GridOptions } from "../interfaces/gridOptions";
import { CREATION_ONLY_OPTION_KEYS, UPDATABLE_OPTION_KEYS } from "../interfaces/gridOptions";
import type { GridApiConfigController } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { GridEventPaginationChangedParams } from "../events/events";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(options: GridOptions = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    pagination: true,
    pageSize: 10,
    pageSizes: [10, 25],
    rowHeight: 40,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name", type: ColumnType.STRING }]);
  core.setRowData(Array.from({ length: 95 }, (_, i) => ({ id: String(i), name: `row ${i}` })));
  core.dispatch({ type: "paginationSet", enabled: core.getOptions().pagination ?? false, pageIndex: 0, pageSize: core.getPaginationInfo().pageSize });
  const api = new GridAPI(core);
  // updateGridOptions refuses to run before a renderer attached; the page-size options never reach
  // the renderer's controller, so a stub stands in for it.
  api.setConfigController(new Proxy({}, { get: () => () => undefined }) as GridApiConfigController);
  const events: GridEventPaginationChangedParams[] = [];
  core.on("paginationChanged", e => events.push(e));
  return { core, api, events };
}

afterEach(() => vi.restoreAllMocks());

describe("pageSize / pageSizes are updatable", () => {
  it("are no longer creation-only", () => {
    for (const key of ["pageSize", "pageSizes", "paginationAutoPageSize"] as const) {
      expect(UPDATABLE_OPTION_KEYS).toContain(key);
      expect(CREATION_ONLY_OPTION_KEYS).not.toContain(key);
    }
  });

  it("a new pageSize re-pages from the first page and emits once", () => {
    const { api, events } = makeGrid();
    api.goToPage(3);
    events.length = 0;
    api.updateGridOptions({ pageSize: 25 });
    expect(api.getPaginationInfo()).toMatchObject({ pageIndex: 0, pageSize: 25, totalPageCount: 4 });
    expect(events).toHaveLength(1);
    expect(api.getDisplayedRowAtIndex(0)?.id).toBe("0");
    expect(api.getGridOption("pageSize")).toBe(25);
  });

  it("an update to the size already in force changes nothing", () => {
    const { api, events } = makeGrid();
    api.goToPage(2);
    events.length = 0;
    api.updateGridOptions({ pageSize: 10 });
    expect(api.getPaginationInfo()).toMatchObject({ pageIndex: 2, pageSize: 10 });
    expect(events).toHaveLength(0);
  });

  it("adds a size missing from pageSizes, warning only when the list comes with it", () => {
    const { api } = makeGrid();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.updateGridOptions({ pageSize: 15 });
    expect(api.getPaginationInfo().pageSizes).toEqual([10, 15, 25]);
    expect(warn).not.toHaveBeenCalled();
    api.updateGridOptions({ pageSizes: [50, 100] });
    expect(api.getPaginationInfo().pageSizes).toEqual([15, 50, 100]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a new pageSizes list alone keeps the page and announces the change", () => {
    const { api, events } = makeGrid();
    api.goToPage(1);
    events.length = 0;
    api.updateGridOptions({ pageSizes: [5, 10, 20] });
    expect(api.getPaginationInfo()).toMatchObject({ pageIndex: 1, pageSize: 10, pageSizes: [5, 10, 20] });
    expect(events).toHaveLength(1);
    api.updateGridOptions({ pageSizes: [5, 10, 20] });
    expect(events).toHaveLength(1);
  });

  it("refuses an invalid pageSize", () => {
    const { api } = makeGrid();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.updateGridOptions({ pageSize: 0 });
    expect(api.getPaginationInfo().pageSize).toBe(10);
    expect(warn).toHaveBeenCalled();
  });

  it("applies with pagination off, for when it is turned on", () => {
    const { api } = makeGrid({ pagination: false });
    api.updateGridOptions({ pageSize: 25 });
    api.setPagination({ enabled: true });
    expect(api.getPaginationInfo()).toMatchObject({ paginationEnabled: true, pageSize: 25 });
  });
});

describe("paginationAutoPageSize", () => {
  it("sizes the page to the rows that fit the body, at least one", () => {
    const { core, api } = makeGrid({ paginationAutoPageSize: true });
    core.setPageViewportHeight(410); // 10.25 rows of 40px
    expect(api.getPaginationInfo().pageSize).toBe(10);
    core.setPageViewportHeight(250);
    expect(api.getPaginationInfo().pageSize).toBe(6);
    core.setPageViewportHeight(12);
    expect(api.getPaginationInfo().pageSize).toBe(1);
  });

  it("emits only when the row count that fits changes", () => {
    const { core, events } = makeGrid({ paginationAutoPageSize: true });
    core.setPageViewportHeight(400);
    const count = events.length;
    core.setPageViewportHeight(415);
    core.setPageViewportHeight(439);
    core.setPageViewportHeight(0); // detached / unmeasured: ignored
    expect(events).toHaveLength(count);
    core.setPageViewportHeight(440);
    expect(events).toHaveLength(count + 1);
  });

  it("keeps the page's first row on screen across a resize", () => {
    const { core, api } = makeGrid({ paginationAutoPageSize: true });
    core.setPageViewportHeight(400); // 10 rows
    api.goToPage(4); // rows 40-49
    core.setPageViewportHeight(800); // 20 rows: row 40 is on page 2
    expect(api.getPaginationInfo()).toMatchObject({ pageSize: 20, pageIndex: 2 });
    expect(api.getDisplayedRowAtIndex(0)?.id).toBe("40");
  });

  it("ignores pageSize and setPageSize while on, warning once", () => {
    const { core, api } = makeGrid({ paginationAutoPageSize: true });
    core.setPageViewportHeight(400);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.setPageSize(25);
    api.updateGridOptions({ pageSize: 50 });
    api.setPagination({ pageSize: 30, pageIndex: 1 });
    expect(api.getPaginationInfo()).toMatchObject({ pageSize: 10, pageIndex: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("the footer's size request is overridden too", () => {
    const { core, api } = makeGrid({ paginationAutoPageSize: true });
    core.setPageViewportHeight(400);
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 0, pageSize: 25 });
    expect(api.getPaginationInfo().pageSize).toBe(10);
  });

  it("turns on and off at runtime; off restores the configured size", () => {
    const { core, api } = makeGrid();
    core.setPageViewportHeight(280); // measured all along, applied only once on
    expect(api.getPaginationInfo().pageSize).toBe(10);
    api.updateGridOptions({ paginationAutoPageSize: true });
    expect(api.getPaginationInfo().pageSize).toBe(7);
    expect(api.getGridOption("paginationAutoPageSize")).toBe(true);
    api.updateGridOptions({ paginationAutoPageSize: false });
    expect(api.getPaginationInfo()).toMatchObject({ pageSize: 10, pageIndex: 0 });
  });

  it("announces a mode change even when the size happens to match", () => {
    const { core, api, events } = makeGrid();
    core.setPageViewportHeight(400); // 10 rows: same as the configured size
    events.length = 0;
    api.updateGridOptions({ paginationAutoPageSize: true });
    expect(events).toHaveLength(1);
    expect(api.getPaginationInfo().pageSize).toBe(10);
  });
});
