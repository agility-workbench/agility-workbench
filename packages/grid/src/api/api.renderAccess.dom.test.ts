// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createGrid } from "../createGrid";
import { IGridAPI } from "../interfaces/iGridAPI";
import type { CellRendererParams, ICellRenderer } from "../renderer/renderer";

/** The renderer-backed API: refreshCells, redrawRows, flashCells, the rendered window, and
 * sizeColumnsToFit, on a real mounted grid. */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const apis: IGridAPI[] = [];
afterEach(() => {
  vi.useRealTimers();
  while (apis.length) apis.pop()!.destroy();
  document.body.innerHTML = "";
});

const log: string[] = [];
let label = "v";
class CountingRenderer implements ICellRenderer {
  private el = document.createElement("span");
  private rowId = "";
  init(p: CellRendererParams) {
    this.rowId = p.rowId;
    log.push(`init:${p.rowId}`);
    this.el.textContent = `${label}${p.value}`;
  }
  getGui() { return this.el; }
  refresh(p: CellRendererParams) {
    log.push(`refresh:${p.rowId}`);
    this.el.textContent = `${label}${p.value}`;
    return true;
  }
  destroy() { log.push(`destroy:${this.rowId}`); }
}

function mount(extra: Record<string, unknown> = {}): { api: IGridAPI; host: HTMLElement } {
  log.length = 0;
  label = "v";
  const host = document.createElement("div");
  host.style.height = "400px";
  document.body.appendChild(host);
  const api = createGrid(host, {
    rowIdKey: "id",
    columnDefs: [
      { colId: "name", key: "name", label: "Name" },
      { colId: "n", key: "n", label: "N", cellRenderer: CountingRenderer },
    ],
    rowData: [{ id: "1", name: "One", n: 1 }, { id: "2", name: "Two", n: 2 }, { id: "3", name: "Three", n: 3 }],
    ...extra,
  } as any);
  apis.push(api);
  return { api, host };
}

const nCell = (api: IGridAPI, host: HTMLElement, rowId: string): HTMLElement => {
  const colIdx = api.getColumnModel().getLeaves().findIndex(col => col.colId === "n");
  const viewIdx = [0, 1, 2].find(i => api.getDisplayedRowAtIndex(i)?.id === rowId);
  return host.querySelector<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"] .pte-cell[data-col-idx="${colIdx}"]`)!;
};

describe("api.refreshCells", () => {
  it("re-runs renderers through refresh() without touching the data", () => {
    const { api, host } = mount();
    expect(nCell(api, host, "2").textContent).toBe("v2");
    log.length = 0;
    label = "w";
    api.refreshCells();
    expect(nCell(api, host, "2").textContent).toBe("w2");
    expect(log.filter(e => e.startsWith("init") || e.startsWith("destroy"))).toEqual([]);
    expect(log).toEqual(expect.arrayContaining(["refresh:1", "refresh:2", "refresh:3"]));
  });

  it("limits the repaint to the named rows and columns", () => {
    const { api, host } = mount();
    log.length = 0;
    label = "w";
    api.refreshCells({ rowIds: ["2"], colIds: ["n"] });
    expect(log).toEqual(["refresh:2"]);
    expect(nCell(api, host, "2").textContent).toBe("w2");
    expect(nCell(api, host, "1").textContent).toBe("v1");
    // Naming only other columns leaves the renderer column alone.
    log.length = 0;
    api.refreshCells({ colIds: ["name"] });
    expect(log).toEqual([]);
  });

  it("force rebuilds the renderer instead of refreshing it", () => {
    const { api } = mount();
    log.length = 0;
    api.refreshCells({ rowIds: ["1"], force: true });
    expect(log).toEqual(["destroy:1", "init:1"]);
  });

  it("re-runs a formatter that reads outside state", () => {
    let suffix = "!";
    const { api, host } = mount({
      columnDefs: [{ colId: "name", key: "name", label: "Name", valueFormatter: ({ value }: any) => `${value}${suffix}` }],
    });
    const colIdx = 0;
    const text = () => host.querySelector<HTMLElement>(`.pte-row[data-view-idx="0"] .pte-cell[data-col-idx="${colIdx}"]`)!.textContent;
    expect(text()).toBe("One!");
    suffix = "?";
    api.refreshCells({ colIds: ["name"] });
    expect(text()).toBe("One?");
  });
});

describe("api.redrawRows", () => {
  it("destroys and recreates the named rows' renderers only", () => {
    const { api } = mount();
    log.length = 0;
    api.redrawRows({ rowIds: ["3"] });
    expect(log).toEqual(["destroy:3", "init:3"]);
    log.length = 0;
    api.redrawRows();
    expect(log.filter(e => e.startsWith("destroy")).sort()).toEqual(["destroy:1", "destroy:2", "destroy:3"]);
    expect(log.filter(e => e.startsWith("init")).sort()).toEqual(["init:1", "init:2", "init:3"]);
  });
});

describe("api.flashCells", () => {
  it("flashes the named cells with the change-flash classes, then clears them", () => {
    vi.useFakeTimers();
    const { api, host } = mount();
    api.flashCells({ rowIds: ["2"], colIds: ["n"], flashDuration: 100, fadeDuration: 50 });
    const el = nCell(api, host, "2");
    expect(el.classList.contains("pte-cell-flash-neutral")).toBe(true);
    expect(el.style.getPropertyValue("--pte-cell-flash-fade-duration")).toBe("50ms");
    expect(nCell(api, host, "1").classList.contains("pte-cell-flash-neutral")).toBe(false);
    vi.advanceTimersByTime(100);
    expect(el.classList.contains("pte-cell-flash-fading")).toBe(true);
    vi.advanceTimersByTime(50);
    expect(el.classList.contains("pte-cell-flash-neutral")).toBe(false);
    expect(el.classList.contains("pte-cell-flash-fading")).toBe(false);
  });

  it("defaults to every rendered data cell", () => {
    const { api, host } = mount({ rowNumbers: true });
    api.flashCells();
    const flashed = host.querySelectorAll(".pte-cell.pte-cell-flash-neutral");
    // 3 rows x 2 data columns; the row-number cells are not flashed.
    expect(flashed.length).toBe(6);
  });

  it("flashes a pinned band row in its band", () => {
    const { api, host } = mount();
    api.setRowPinned("2", "top");
    api.flashCells({ rowIds: ["2"], colIds: ["name"] });
    expect(host.querySelectorAll(".pte-pinned-rows-top .pte-cell.pte-cell-flash-neutral").length).toBe(1);
  });
});

describe("rendered window", () => {
  it("reports the rendered index range and nodes, bands included", () => {
    const { api } = mount();
    expect(api.getFirstDisplayedRowIndex()).toBe(0);
    expect(api.getLastDisplayedRowIndex()).toBe(2);
    expect(api.getRenderedNodes().map(n => n.id)).toEqual(["1", "2", "3"]);
    api.setPinnedTopRowData([{ id: "t", name: "Top", n: 0 }]);
    expect(api.getRenderedNodes().map(n => n.id)).toEqual(["p:top:t", "1", "2", "3"]);
  });

  it("is empty when no row is displayed", () => {
    const { api } = mount({ rowData: [] });
    expect(api.getFirstDisplayedRowIndex()).toBe(-1);
    expect(api.getLastDisplayedRowIndex()).toBe(-1);
    expect(api.getRenderedNodes()).toEqual([]);
  });
});

describe("api.sizeColumnsToFit", () => {
  const setViewport = (host: HTMLElement, width: number) => {
    Object.defineProperty(host.querySelector(".pte-spacer")!, "clientWidth", { configurable: true, value: width });
  };

  it("fills the centre viewport, keeping proportions and bounds, in one event", () => {
    const { api, host } = mount({
      columnDefs: [
        { colId: "a", key: "a", label: "A", width: 100 },
        { colId: "b", key: "b", label: "B", width: 200 },
        { colId: "c", key: "c", label: "C", width: 100, maxWidth: 120 },
        { colId: "d", key: "d", label: "D", width: 50, resizable: false },
        { colId: "p", key: "p", label: "P", width: 80, pinned: "left" },
      ],
      rowData: [{ id: "1" }],
      maxColumnWidth: 2000,
    });
    setViewport(host, 800);
    const events: unknown[] = [];
    api.on("columnWidthsChanged", e => events.push(e));
    api.sizeColumnsToFit();
    const w = (id: string) => api.getColumnModel().getByColId(id)!.computedWidth;
    expect(w("c")).toBe(120);
    expect(w("d")).toBe(50);
    expect(w("p")).toBe(80);
    expect(w("a") + w("b") + w("c") + w("d")).toBe(800);
    expect(w("b")).toBe(w("a") * 2);
    expect(events).toHaveLength(1);
  });

  it("is a no-op before the centre is laid out", () => {
    const { api } = mount();
    const before = api.getColumnState().map(s => s.widthPx);
    api.sizeColumnsToFit();
    expect(api.getColumnState().map(s => s.widthPx)).toEqual(before);
  });
});
