// @vitest-environment happy-dom
/**
 * api.isDestroyed, api.getGridOption and api.scrollTo (the typed door for the dead `scrollSet`
 * action, finding #137) on a real mounted grid.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createGrid } from "../createGrid";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { CanvasMeasurer, initDomRenderer } from "../renderer";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { CellRendererParams, ICellRenderer } from "../renderer/renderer";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const apis: IGridAPI[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (apis.length) apis.pop()!.destroy();
  document.body.innerHTML = "";
});

const rows = Array.from({ length: 200 }, (_, i) => ({ id: String(i), name: `Row ${i}`, n: i }));

function mount(extra: Record<string, unknown> = {}): { api: IGridAPI; host: HTMLElement } {
  const host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "300px";
  document.body.appendChild(host);
  const api = createGrid(host, {
    rowIdKey: "id",
    columnDefs: [
      { colId: "name", key: "name", label: "Name", width: 400 },
      { colId: "n", key: "n", label: "N", width: 400 },
      { colId: "pin", key: "n", label: "Pinned", pinned: "left" },
    ],
    rowData: rows,
    ...extra,
  } as any);
  apis.push(api);
  return { api, host };
}

describe("api.isDestroyed", () => {
  it("is false while mounted and true after destroy, already during the teardown", () => {
    let seenDuringTeardown: boolean | undefined;
    class Probe implements ICellRenderer {
      private el = document.createElement("span");
      private api!: IGridAPI;
      init(p: CellRendererParams) { this.api = p.api as IGridAPI; }
      getGui() { return this.el; }
      refresh() { return true; }
      destroy() { seenDuringTeardown ??= this.api.isDestroyed(); }
    }
    const { api } = mount({
      columnDefs: [{ colId: "name", key: "name", label: "Name", cellRenderer: Probe }],
    });
    expect(api.isDestroyed()).toBe(false);
    api.destroy();
    expect(api.isDestroyed()).toBe(true);
    expect(seenDuringTeardown).toBe(true);
    api.destroy();
    expect(api.isDestroyed()).toBe(true);
  });

  it("marks the bare initDomRenderer api, which destroy does not detach", () => {
    const core = new GridCore(new CanvasMeasurer(), {});
    const { renderer, api } = initDomRenderer(core);
    const host = document.createElement("div");
    document.body.appendChild(host);
    renderer.attach(host);
    api.destroy();
    expect(api.isDestroyed()).toBe(true);
    expect(host.childElementCount).toBeGreaterThan(0);
    renderer.detach();
    renderer.destroy();
  });

  it("keeps later calls from throwing: reads report, writes go nowhere visible", () => {
    const { api, host } = mount();
    api.destroy();
    expect(host.childElementCount).toBe(0);
    expect(() => {
      api.setRowData(rows.slice(0, 3));
      api.updateGridOptions({ zebraRows: true });
      api.setSortModel([{ colId: "n", dir: "desc" }]);
      api.setFocusedCell({ rowId: "1", colId: "name" });
      api.scrollTo({ topPx: 100 });
      api.ensureRowVisible("2");
      api.refreshCells();
    }).not.toThrow();
    expect(api.getDisplayedRowCount()).toBe(3);
    expect(api.getSortModel()).toEqual([{ colId: "n", dir: "desc" }]);
    expect(host.childElementCount).toBe(0);
  });
});

describe("api.getGridOption", () => {
  it("reads a creation option as supplied, the same reference", () => {
    const rowSelection = { mode: "single" as const, checkboxes: true };
    const { api } = mount({ rowSelection, zebraRows: true, pageSize: 50 });
    expect(api.getGridOption("rowSelection")).toBe(rowSelection);
    expect(api.getGridOption("zebraRows")).toBe(true);
    expect(api.getGridOption("pageSize")).toBe(50);
    expect(api.getGridOption("rowIdKey")).toBe("id");
  });

  it("reads undefined for an option never set: no defaults are filled in", () => {
    const { api } = mount();
    expect(api.getGridOption("rowHeight")).toBeUndefined();
    expect(api.getGridOption("editTrigger")).toBeUndefined();
    expect(api.getGridOption("onCellClicked")).toBeUndefined();
  });

  it("follows updateGridOptions, an undefined value reading as the reset", () => {
    const getRowClass = () => "x";
    const { api } = mount({ zebraRows: false, toolbar: { sorting: true } });
    api.updateGridOptions({ zebraRows: true, getRowClass, quickFilter: true });
    expect(api.getGridOption("zebraRows")).toBe(true);
    expect(api.getGridOption("getRowClass")).toBe(getRowClass);
    expect(api.getGridOption("quickFilter")).toBe(true);
    expect(api.getGridOption("toolbar")).toEqual({ sorting: true });
    api.updateGridOptions({ toolbar: undefined, quickFilter: false });
    expect(api.getGridOption("toolbar")).toBeUndefined();
    expect(api.getGridOption("quickFilter")).toBe(false);
  });

  it("records nothing from a key updateGridOptions rejects", () => {
    const { api } = mount({ rowHeight: 30 });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.updateGridOptions({ rowHeight: 50 } as any);
    expect(api.getGridOption("rowHeight")).toBe(30);
  });

  it("reads pivot mode and pivot columns live", () => {
    const { api } = mount({ pivotMode: false });
    expect(api.getGridOption("pivotMode")).toBe(false);
    api.setRowGroupColumns(["name"]);
    api.setPivotColumns(["n"]);
    api.setPivotMode(true);
    expect(api.getGridOption("pivotMode")).toBe(true);
    expect(api.getGridOption("pivotColumns")).toEqual(["n"]);
  });
});

describe("api.scrollTo", () => {
  const body = (host: HTMLElement) => host.querySelector<HTMLElement>(".pte-body")!;
  const center = (host: HTMLElement) => host.querySelector<HTMLElement>(".pte-spacer")!;

  it("sets each axis it is given and leaves the other", () => {
    const { api, host } = mount();
    api.scrollTo({ topPx: 120, leftPx: 30 });
    expect(body(host).scrollTop).toBe(120);
    expect(center(host).scrollLeft).toBe(30);
    api.scrollTo({ topPx: 40 });
    expect(body(host).scrollTop).toBe(40);
    expect(center(host).scrollLeft).toBe(30);
    api.scrollTo({ leftPx: 0 });
    expect(body(host).scrollTop).toBe(40);
    expect(center(host).scrollLeft).toBe(0);
  });

  it("clamps negatives to 0 and ignores non-finite offsets", () => {
    const { api, host } = mount();
    api.scrollTo({ topPx: 80, leftPx: 20 });
    api.scrollTo({ topPx: -5, leftPx: Number.NaN });
    expect(body(host).scrollTop).toBe(0);
    expect(center(host).scrollLeft).toBe(20);
    api.scrollTo({ topPx: Infinity });
    expect(body(host).scrollTop).toBe(0);
  });

  it("warns and does nothing on an api no renderer is wired to", () => {
    const api = new GridAPI(new GridCore(new CanvasMeasurer(), {}));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.scrollTo({ topPx: 10 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("scrollTo"));
  });
});
