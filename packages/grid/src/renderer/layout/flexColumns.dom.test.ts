// @vitest-environment happy-dom
/**
 * `ColDef.flex` on a mounted grid (finding #25). happy-dom has no layout engine, so the centre
 * section's `clientWidth` is stubbed and the grid's ResizeObserver is a fake fired by hand — the
 * same rig as resizePath.test.ts. Pinned here: flex columns share the centre width the others leave
 * over (bounds, pinned/hidden columns, utility columns), re-share on resize and column changes, emit
 * one settled `columnWidthsChanged` per change and none for a no-op pass, give way to explicit
 * resizes / auto-sizes (which fix them), survive data auto-sizing, and round-trip through column
 * state and `getColumnDefs`.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../../createGrid";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { ColDef } from "../../interfaces/column";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let widths: Record<string, number>;
let observers: Array<{ fire: () => void; targets: Element[] }>;
const OriginalObserver = globalThis.ResizeObserver;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
let host: HTMLElement;
const apis: IGridAPI[] = [];

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  widths = {};
  observers = [];
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      for (const cls of Object.keys(widths)) if (this.classList.contains(cls)) return widths[cls];
      return 0;
    },
  });
  globalThis.ResizeObserver = class {
    private entry: { fire: () => void; targets: Element[] };
    constructor(cb: () => void) {
      this.entry = { fire: () => cb(), targets: [] };
      observers.push(this.entry);
    }
    observe(el: Element) { this.entry.targets.push(el); }
    unobserve() {}
    disconnect() {}
  } as any;
});

afterEach(() => {
  while (apis.length) apis.pop()!.destroy();
  globalThis.ResizeObserver = OriginalObserver;
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
});

/** Resize the centre section to `px` and run the grid's resize path. */
function resizeCentre(px: number) {
  widths = { "pte-root": px + 200, "pte-spacer": px };
  for (const o of observers) {
    if (o.targets.some(t => (t as HTMLElement).classList?.contains("pte-root"))) o.fire();
  }
}

const rowData = [{ id: "1", a: "x", b: "y", c: "z", d: "w", p: "p" }];

function mount(columnDefs: ColDef[], extra: Record<string, unknown> = {}): IGridAPI {
  const api = createGrid(host, { rowIdKey: "id", columnDefs, rowData, ...extra } as any);
  apis.push(api);
  return api;
}

const w = (api: IGridAPI, colId: string) => api.getColumnModel().getByColId(colId)!.computedWidth;
const flexOf = (api: IGridAPI, colId: string) => api.getColumnState().find(s => s.colId === colId)?.flex;

function widthEvents(api: IGridAPI) {
  const events: Array<{ changedColIds: string[]; final: boolean }> = [];
  api.on("columnWidthsChanged", e => events.push(e as any));
  return events;
}

const basic: ColDef[] = [
  { colId: "a", key: "a", label: "A", width: 100 },
  { colId: "b", key: "b", label: "B", flex: 1 },
  { colId: "c", key: "c", label: "C", flex: 2 },
  { colId: "p", key: "p", label: "P", width: 80, pinned: "left", flex: 1 },
];

describe("flex columns", () => {
  it("share the centre width left after the fixed columns, by weight", () => {
    const api = mount(basic);
    resizeCentre(700);
    expect(w(api, "a")).toBe(100);
    expect(w(api, "b")).toBe(200);
    expect(w(api, "c")).toBe(400);
    // Pinned: flex is ignored, the declared width stands.
    expect(w(api, "p")).toBe(80);
  });

  it("lays the body, header and centre row out at the flexed widths", () => {
    const api = mount(basic);
    resizeCentre(700);
    const b = api.getColumnModel().getByColId("b")!;
    expect(host.querySelector<HTMLElement>(`.pte-hcell[id="${b.instanceID}"]`)!.style.width).toBe("200px");
    const row = host.querySelector<HTMLElement>(".pte-spacer .pte-row")!;
    expect(row.style.width).toBe("700px");
  });

  it("re-shares on resize with one settled event, and none when nothing moved", () => {
    const api = mount(basic);
    resizeCentre(700);
    const events = widthEvents(api);
    resizeCentre(1000);
    expect(w(api, "b")).toBe(300);
    expect(w(api, "c")).toBe(600);
    expect(events).toHaveLength(1);
    expect(events[0].final).toBe(true);
    expect(events[0].changedColIds.sort()).toEqual(["b", "c"]);
    resizeCentre(1000);
    expect(events).toHaveLength(1);
  });

  it("sums to the centre width exactly with an odd remainder", () => {
    const api = mount([
      { colId: "a", key: "a", label: "A", flex: 1 },
      { colId: "b", key: "b", label: "B", flex: 1 },
      { colId: "c", key: "c", label: "C", flex: 1 },
    ]);
    resizeCentre(1001);
    expect(w(api, "a") + w(api, "b") + w(api, "c")).toBe(1001);
  });

  it("respects minWidth / maxWidth, overflowing rather than going below a min", () => {
    const api = mount([
      { colId: "a", key: "a", label: "A", flex: 1, maxWidth: 150 },
      { colId: "b", key: "b", label: "B", flex: 1, minWidth: 300 },
      { colId: "c", key: "c", label: "C", flex: 1 },
    ]);
    resizeCentre(900);
    expect(w(api, "a")).toBe(150);
    expect(w(api, "b")).toBe(375);
    expect(w(api, "c")).toBe(375);
    resizeCentre(400);
    // b at its min, the others at the grid's minResizeWidth (75): 450 > 400, the centre scrolls.
    expect(w(api, "b")).toBe(300);
    expect(w(api, "a")).toBe(75);
    expect(w(api, "c")).toBe(75);
  });

  it("re-shares when a column is hidden, shown, pinned or unpinned", () => {
    const api = mount(basic);
    resizeCentre(700);
    api.setColumnVisible("a", false);
    expect(w(api, "b") + w(api, "c")).toBe(700);
    expect(w(api, "c")).toBe(467);
    api.setColumnVisible("a", true);
    expect(w(api, "b")).toBe(200);
    api.setColumnPinned("c", "left");
    expect(w(api, "b")).toBe(600);
    api.setColumnPinned("c", null);
    expect(w(api, "b")).toBe(200);
    expect(w(api, "c")).toBe(400);
  });

  it("follows a non-flex column's resize, in the same event", () => {
    const api = mount(basic);
    resizeCentre(700);
    const events = widthEvents(api);
    api.setColumnWidth("a", 160);
    expect(w(api, "b")).toBe(180);
    expect(w(api, "c")).toBe(360);
    expect(events).toHaveLength(1);
    expect(events[0].changedColIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("api.setColumnWidth fixes a flex column at the new width", () => {
    const api = mount(basic);
    resizeCentre(700);
    api.setColumnWidth("b", 250);
    expect(w(api, "b")).toBe(250);
    expect(flexOf(api, "b")).toBeNull();
    expect(w(api, "c")).toBe(350);
    resizeCentre(1000);
    expect(w(api, "b")).toBe(250);
    expect(w(api, "c")).toBe(650);
  });

  it("api.autoSizeColumns fixes a flex column at its content width", () => {
    const api = mount(basic);
    resizeCentre(700);
    api.autoSizeColumns(["c"]);
    expect(flexOf(api, "c")).toBeNull();
    expect(w(api, "c")).not.toBe(400);
    expect(w(api, "b")).toBe(600 - w(api, "c"));
  });

  it("a header drag resize fixes a flex column", () => {
    const api = mount(basic);
    resizeCentre(700);
    api.dispatch({ type: "columnResize", source: "user", colId: "b", widthPx: 220 } as any);
    expect(w(api, "b")).toBe(220);
    expect(flexOf(api, "b")).toBeNull();
    expect(w(api, "c")).toBe(380);
  });

  it("api.sizeColumnsToFit leaves flex columns alone", () => {
    const api = mount(basic);
    resizeCentre(700);
    api.sizeColumnsToFit();
    expect(flexOf(api, "b")).toBe(1);
    expect(flexOf(api, "c")).toBe(2);
    expect(w(api, "a") + w(api, "b") + w(api, "c")).toBe(700);
  });

  it("is not re-measured by data auto-sizing", () => {
    const api = mount(basic, { autosizeColumnsOnDataChange: true });
    resizeCentre(700);
    api.setRowData([{ id: "1", a: "x", b: "a much longer value than before ".repeat(5), c: "z" }]);
    expect(w(api, "b")).toBe(200);
    expect(w(api, "c")).toBe(400);
  });

  it("applies through defaultColDef, never to the row-number column", () => {
    const api = mount([
      { colId: "a", key: "a", label: "A" },
      { colId: "b", key: "b", label: "B" },
    ], { defaultColDef: { flex: 1 }, rowNumbers: true });
    resizeCentre(600);
    expect(w(api, "a")).toBe(300);
    expect(w(api, "b")).toBe(300);
  });

  it("flexes the auto-group column through groupColumnDef.flex", () => {
    const api = mount([
      { colId: "a", key: "a", label: "A" },
      { colId: "b", key: "b", label: "B", width: 100 },
    ], { groupColumnDef: { flex: 1 } } as any);
    resizeCentre(600);
    api.setRowGroupColumns(["a"]);
    const group = api.getColumnModel().getAutoGroupColumns()[0];
    expect(group).toBeDefined();
    const fixed = api.getColumnModel().getCenterLeaves()
      .filter(col => col.isVisible() && col !== group)
      .reduce((s, col) => s + col.computedWidth, 0);
    expect(group.computedWidth).toBe(600 - fixed);
  });

  it("follows live column-def changes", () => {
    const api = mount(basic);
    resizeCentre(700);
    api.setColumnDefs([
      { colId: "a", key: "a", label: "A", width: 100 },
      { colId: "b", key: "b", label: "B", flex: 3 },
      { colId: "c", key: "c", label: "C", width: 150 },
    ]);
    expect(w(api, "c")).toBe(150);
    expect(w(api, "b")).toBe(450);
  });

  it("round-trips through column state and getColumnDefs", () => {
    const api = mount(basic);
    resizeCentre(700);
    const state = api.getColumnState();
    expect(state.find(s => s.colId === "a")!.flex).toBeNull();
    expect(state.find(s => s.colId === "b")!.flex).toBe(1);
    expect(state.find(s => s.colId === "c")!.flex).toBe(2);

    // null turns flex off, fixing the column where it stands (or at widthPx).
    api.applyColumnState([{ colId: "b", flex: null }, { colId: "c", flex: null, widthPx: 300 }]);
    expect(flexOf(api, "b")).toBeNull();
    expect(w(api, "b")).toBe(200);
    expect(w(api, "c")).toBe(300);
    expect(api.getColumnDefs().find(d => d.colId === "b")!.flex).toBeUndefined();

    // A captured state restores flex (and its stale widthPx is ignored).
    api.applyColumnState(state);
    expect(flexOf(api, "b")).toBe(1);
    expect(w(api, "b")).toBe(200);
    expect(w(api, "c")).toBe(400);
    expect(api.getColumnDefs().find(d => d.colId === "c")!.flex).toBe(2);

    // A positive number turns flex on for a fixed column.
    api.applyColumnState([{ colId: "a", flex: 1 }]);
    expect(w(api, "a") + w(api, "b") + w(api, "c")).toBe(700);
    expect(w(api, "a")).toBe(w(api, "b"));
  });

  it("spells flex: 0 in getColumnDefs for a fixed column under a flex defaultColDef", () => {
    const api = mount([{ colId: "a", key: "a", label: "A" }], { defaultColDef: { flex: 1 } });
    resizeCentre(500);
    api.setColumnWidth("a", 120);
    expect(api.getColumnDefs()[0].flex).toBe(0);
  });

  it("sizes flex columns like any other before the centre is laid out", () => {
    const api = mount([{ colId: "a", key: "a", label: "A", width: 130, flex: 1 }]);
    expect(w(api, "a")).toBe(130);
  });
});
