// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import type { ColDef } from "../../interfaces/column";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

// Column (horizontal) virtualization of the centre section. happy-dom does no layout, so every
// test declares the centre section's client width: with none (0) the grid renders every column,
// which is what the rest of the suite runs on.

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

// Each test mounts a 50-column grid with real cell renderers under happy-dom (1–2 s alone); under
// the full suite's load the default 5 s budget is not enough.
vi.setConfig({ testTimeout: 30_000 });

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const CENTER = 50;
const WIDTH = 100;
const VIEW = 600;

/** Per-column counts of renderer lifecycles, so a test can tell created / destroyed / refreshed. */
const created = new Map<string, number>();
const destroyed = new Map<string, number>();
const refreshed = new Map<string, number>();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
class CountingRenderer {
  private el = document.createElement("span");
  private colId = "";
  init(params: any) {
    this.colId = params.colDef.colId;
    bump(created, this.colId);
    this.el.textContent = String(params.value);
  }
  getGui() {
    return this.el;
  }
  refresh(params: any) {
    bump(refreshed, this.colId);
    this.el.textContent = String(params.value);
    return true;
  }
  destroy() {
    bump(destroyed, this.colId);
  }
}

beforeEach(() => {
  created.clear();
  destroyed.clear();
  refreshed.clear();
});

function centerDefs(count = CENTER, extra: Partial<ColDef> = {}): ColDef[] {
  return Array.from({ length: count }, (_, i) => ({
    colId: `c${i}`,
    key: `c${i}`,
    label: `C${i}`,
    width: WIDTH,
    cellRenderer: CountingRenderer as any,
    editable: true,
    ...extra,
  }));
}

function mountGrid(options: Record<string, unknown> = {}, defs?: ColDef[], rowCount = 100) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", rowHeight: 40, ...options });
  currentCore = core;
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(defs ?? [
    { colId: "name", key: "name", label: "Name", pinned: "left", width: 120 },
    ...centerDefs(),
    { colId: "tot", key: "tot", label: "Total", pinned: "right", width: 80 },
  ]);
  api.setRowData(Array.from({ length: rowCount }, (_, r) => {
    const row: Record<string, unknown> = { id: `r${r}`, name: `Row ${r}`, tot: r };
    for (let c = 0; c < CENTER; c++) row[`c${c}`] = `${r}:${c}`;
    return row;
  }));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  const body = container.querySelector<HTMLElement>(".pte-body")!;
  Object.defineProperty(body, "clientHeight", { value: 400, configurable: true });
  const center = container.querySelector<HTMLElement>(".pte-spacer")!;
  const leftSection = container.querySelector<HTMLElement>(".pte-spacer-left")!;
  const rightSection = container.querySelector<HTMLElement>(".pte-spacer-right")!;
  return { container, core, api, root, body, center, leftSection, rightSection };
}

/** Give the centre section a width, and let the grid observe it the way a resize would. */
async function measure(center: HTMLElement, width = VIEW) {
  Object.defineProperty(center, "clientWidth", { value: width, configurable: true });
  center.dispatchEvent(new Event("scroll"));
  await raf();
}

async function scrollCenter(center: HTMLElement, left: number) {
  center.scrollLeft = left;
  center.dispatchEvent(new Event("scroll"));
  await raf();
}

/** The centre rows of the shown slots. */
function centerRows(center: HTMLElement): HTMLElement[] {
  return [...center.querySelectorAll<HTMLElement>(".pte-row")].filter((r) => r.style.display !== "none");
}

let currentCore: GridCore;
/** A column's instance id: what `data-col-id` carries. */
const iid = (colId: string) => currentCore.getColumnModel().resolve(colId)!.instanceID;
const sel = (colId: string) => `[data-col-id="${iid(colId)}"]`;

function renderedColIds(row: HTMLElement): string[] {
  return [...row.querySelectorAll<HTMLElement>(":scope > .pte-cell[data-col-id]")]
    .filter((c) => !c.classList.contains("pte-full-width-cell"))
    .map((c) => currentCore.getColumnModel().getById(c.dataset.colId!)?.colId ?? "?");
}

const ids = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `c${from + i}`);

describe("column virtualization", () => {
  it("renders every column while the centre section is unmeasured", () => {
    const { center } = mountGrid();
    for (const row of centerRows(center)) expect(renderedColIds(row)).toEqual(ids(0, CENTER));
    expect(center.querySelector(".pte-col-gap")).toBeNull();
  });

  it("renders only the viewport's columns plus the overscan once measured", async () => {
    const { center } = mountGrid();
    // Let the mount's own deferred pool sizing settle first.
    await raf();
    await raf();
    destroyed.clear();
    await measure(center);
    const rows = centerRows(center);
    expect(rows.length).toBeGreaterThan(0);
    // 600px of 100px columns from 0: c0..c5 visible, +2 overscan on the far side.
    for (const row of rows) expect(renderedColIds(row)).toEqual(ids(0, 8));
    // Destroyed: every renderer outside the window, once per pooled row.
    expect(destroyed.get("c8")).toBe(rows.length);
    expect(destroyed.get("c0")).toBeUndefined();
  });

  it("moves the window with a horizontal scroll, keeping the row's full width with a leading gap", async () => {
    const { center } = mountGrid();
    await measure(center);
    await scrollCenter(center, 1000);
    for (const row of centerRows(center)) {
      expect(renderedColIds(row)).toEqual(ids(8, 18));
      const gap = row.firstElementChild as HTMLElement;
      expect(gap.classList.contains("pte-col-gap")).toBe(true);
      expect(gap.style.width).toBe("800px");
      expect(gap.getAttribute("aria-hidden")).toBe("true");
      expect(gap.dataset.colIdx).toBeUndefined();
      expect(row.style.width).toBe(`${CENTER * WIDTH}px`);
    }
  });

  it("creates the entering columns' renderers, destroys the leaving ones, and leaves the rest alone", async () => {
    const { center } = mountGrid();
    await measure(center);
    const rows = centerRows(center).length;
    const cell = center.querySelector<HTMLElement>(`.pte-row .pte-cell${sel("c6")}`)!;
    created.clear();
    destroyed.clear();
    refreshed.clear();

    await scrollCenter(center, 300); // visible c3..c8 → window c1..c10
    expect([...created.keys()].sort()).toEqual(["c10", "c8", "c9"]);
    expect(created.get("c8")).toBe(rows);
    expect([...destroyed.keys()]).toEqual(["c0"]);
    expect(destroyed.get("c0")).toBe(rows);
    // A column that stayed kept its element and was not re-rendered.
    expect(refreshed.size).toBe(0);
    expect(center.querySelector(`.pte-row .pte-cell${sel("c6")}`)).toBe(cell);
    expect(cell.isConnected).toBe(true);
  });

  it("paints entering cells with their row's values", async () => {
    const { center, core } = mountGrid();
    await measure(center);
    await scrollCenter(center, 2000);
    const row = centerRows(center)[3];
    const viewIdx = Number(row.dataset.viewIdx);
    const rowId = core.getRowIdAtViewIndex(viewIdx);
    const cell = row.querySelector<HTMLElement>(`${sel("c22")}`)!;
    expect(cell.textContent).toBe(`${String(rowId).slice(1)}:22`);
  });

  it("re-stitches aria-owns to the rendered cells, with column-derived ids", async () => {
    const { center, leftSection, core } = mountGrid();
    await measure(center);
    await scrollCenter(center, 1000);
    const row = centerRows(center)[0];
    const owned = row.getAttribute("aria-owns")!.split(" ");
    const leftCell = leftSection.querySelector<HTMLElement>(".pte-row .pte-cell")!;
    expect(owned[0]).toBe(leftCell.id);
    const centreIds = owned.filter((id) => document.getElementById(id)?.parentElement === row
      && !document.getElementById(id)!.classList.contains("pte-full-width-cell"));
    expect(centreIds.map((id) => currentCore.getColumnModel().getById(document.getElementById(id)!.dataset.colId!)?.colId)).toEqual(ids(8, 18));
    for (const id of owned) expect(document.getElementById(id)).not.toBeNull();
    // c8 is global column 9 (after the pinned-left column).
    expect(centreIds[0]).toMatch(new RegExp(`^${core.id}-r\\d+-c9$`));
  });

  it("leaves the pinned sections fully rendered", async () => {
    const { center, leftSection, rightSection } = mountGrid();
    await measure(center);
    await scrollCenter(center, 3000);
    expect(leftSection.querySelectorAll(".pte-row")[0].querySelectorAll(".pte-cell").length).toBe(1);
    expect(rightSection.querySelectorAll(".pte-row")[0].querySelectorAll(".pte-cell").length).toBe(1);
  });

  it("reads the offset from the inline-start edge in RTL (negative scrollLeft)", async () => {
    const { center } = mountGrid({ enableRtl: true });
    await measure(center);
    await scrollCenter(center, -1000);
    expect(renderedColIds(centerRows(center)[0])).toEqual(ids(8, 18));
  });

  it("renders every column with columnVirtualization: false", async () => {
    const { center } = mountGrid({ columnVirtualization: false });
    await measure(center);
    await scrollCenter(center, 1000);
    for (const row of centerRows(center)) expect(renderedColIds(row)).toEqual(ids(0, CENTER));
  });

  it("honours overscanColumnCount", async () => {
    const { center } = mountGrid({ overscanColumnCount: 0 });
    await measure(center);
    await scrollCenter(center, 1000);
    expect(renderedColIds(centerRows(center)[0])).toEqual(ids(10, 16));
  });

  it("renders every column when a centre column defines colSpan", async () => {
    const defs: ColDef[] = [
      { colId: "name", key: "name", label: "Name", pinned: "left", width: 120 },
      ...centerDefs().map((d, i) => (i === 3 ? { ...d, colSpan: () => 1 } : d)),
    ];
    const { center } = mountGrid({}, defs);
    await measure(center);
    await scrollCenter(center, 1000);
    for (const row of centerRows(center)) expect(renderedColIds(row)).toEqual(ids(0, CENTER));
  });

  it("recomputes the window on a column width change without a rebuild", async () => {
    const { center, api } = mountGrid();
    await measure(center);
    expect(renderedColIds(centerRows(center)[0])).toEqual(ids(0, 8));
    api.setColumnWidth("c0", 400); // c0 now fills 0..400: visible c0..c2
    await raf();
    expect(renderedColIds(centerRows(center)[0])).toEqual(ids(0, 5));
    await scrollCenter(center, 1000); // 1000..1600 → c7..c12 → window c5..c14, gap = 400 + 4×100
    const row = centerRows(center)[0];
    expect(renderedColIds(row)).toEqual(ids(5, 15));
    expect((row.firstElementChild as HTMLElement).style.width).toBe("800px");
  });

  it("follows the centre section's width on resize", async () => {
    const { center } = mountGrid();
    await measure(center, 300);
    expect(renderedColIds(centerRows(center)[0])).toEqual(ids(0, 5));
    await measure(center, 900);
    expect(renderedColIds(centerRows(center)[0])).toEqual(ids(0, 11));
  });

  it("keeps the window consistent across column hide, move and pin", async () => {
    const { center, api, leftSection } = mountGrid();
    await measure(center);
    await scrollCenter(center, 1000);

    api.setColumnsVisible(["c9", "c10"], false);
    await raf();
    let row = centerRows(center)[0];
    // c9/c10 gone: centre index 8 is c8, 9 is c11, … and the window (indexes 8..17) runs to c19.
    expect(renderedColIds(row)).toEqual(["c8", ...ids(11, 20)]);

    api.setColumnPinned("c12", "left");
    await raf();
    row = centerRows(center)[0];
    expect(renderedColIds(row)).not.toContain("c12");
    expect(leftSection.querySelector(`.pte-row .pte-cell${sel("c12")}`)).not.toBeNull();

    api.moveColumn("c40", 1);
    await raf();
    row = centerRows(center)[0];
    const cells = [...row.querySelectorAll<HTMLElement>(":scope > .pte-cell[data-col-idx]")]
      .filter((c) => !c.classList.contains("pte-full-width-cell"));
    // Rendered cells are contiguous in global column index.
    const idx = cells.map((c) => Number(c.dataset.colIdx));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBe(idx[i - 1] + 1);
  });

  it("keeps an open editor alive while its column scrolls out", async () => {
    const { center, core } = mountGrid();
    await measure(center);
    const row = centerRows(center)[1];
    const rowId = row.getAttribute("row-id")!;
    core.dispatch({ type: "editStart", cell: { rowId, colId: "c2" } });
    const cell = row.querySelector<HTMLElement>(`${sel("c2")}`)!;
    const editor = cell.querySelector("input, textarea");
    expect(editor).not.toBeNull();

    await scrollCenter(center, 2000);
    expect(core.getEditingCell()).not.toBeNull();
    expect(cell.isConnected).toBe(true);
    expect(cell.contains(editor)).toBe(true);
    // Kept in every row, after a gap, ahead of the window`s own run.
    const ids2 = renderedColIds(centerRows(center)[0]);
    expect(ids2[0]).toBe("c2");
    expect(ids2.slice(1)).toEqual(ids(18, 28));
    const gaps = centerRows(center)[0].querySelectorAll(":scope > .pte-col-gap");
    expect([...gaps].map((g) => (g as HTMLElement).style.width)).toEqual(["200px", "1500px"]);

    core.dispatch({ type: "editCancel", cell: { rowId, colId: "c2" } });
    await scrollCenter(center, 2100);
    expect(renderedColIds(centerRows(center)[0])).not.toContain("c2");
  });

  it("mounts an editor on a column outside the window", async () => {
    const { center, core } = mountGrid();
    await measure(center);
    const rowId = centerRows(center)[1].getAttribute("row-id")!;
    core.dispatch({ type: "editStart", cell: { rowId, colId: "c30" } });
    const cell = center.querySelector<HTMLElement>(`.pte-row[row-id="${rowId}"] ${sel("c30")}`);
    expect(cell).not.toBeNull();
    expect(cell!.querySelector("input, textarea")).not.toBeNull();
    expect(center.scrollLeft).toBeGreaterThan(0);
  });

  it("paints focus and names the cell after ensureColumnVisible and keyboard navigation", async () => {
    const { center, api, root } = mountGrid();
    await measure(center);
    // c40 is global column 41.
    api.setFocusedCell(2, 41);
    api.ensureColumnVisible("c40");
    let active = document.getElementById(root.getAttribute("aria-activedescendant") ?? "");
    expect(active?.dataset.colId).toBe(iid("c40"));
    expect(active!.isConnected).toBe(true);

    // Keyboard: move right onto c41 (the window already holds it).
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    await raf();
    active = document.getElementById(root.getAttribute("aria-activedescendant") ?? "");
    expect(active?.dataset.colId).toBe(iid("c41"));

    // Focus c3, then scroll the centre away from it by hand: the focused cell leaves the DOM and
    // the root stops naming it rather than pointing at a detached element.
    api.setFocusedCell(2, 4);
    await scrollCenter(center, 3000);
    expect(renderedColIds(centerRows(center)[0])).not.toContain("c4");
    expect(document.getElementById(root.getAttribute("aria-activedescendant") ?? "")?.isConnected ?? false)
      .toBe(false);
    // ArrowRight moves onto c4, which is not rendered: the scroll back renders it synchronously.
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", bubbles: true, cancelable: true }));
    active = document.getElementById(root.getAttribute("aria-activedescendant") ?? "");
    expect(active?.dataset.colId).toBe(iid("c4"));
    expect(active!.isConnected).toBe(true);
    await raf();
    active = document.getElementById(root.getAttribute("aria-activedescendant") ?? "");
    expect(active?.dataset.colId).toBe(iid("c4"));
    expect(renderedColIds(centerRows(center)[0])).toContain("c4");
  });

  it("re-applies selection classes to cells that enter", async () => {
    const { center, api } = mountGrid();
    await measure(center);
    // A range over c20..c22 in rows 0..2 (global columns 21..23).
    api.selectRange(0, 21);
    api.extendRangeTo(2, 23);
    await scrollCenter(center, 1800);
    const rows = centerRows(center).slice(0, 3);
    for (const row of rows) {
      for (const id of ["c20", "c21", "c22"]) {
        expect(row.querySelector(sel(id))!.classList.contains("selected")).toBe(true);
      }
      expect(row.querySelector(`${sel("c23")}`)!.classList.contains("selected")).toBe(false);
    }
  });

  it("treats refreshCells and flashCells on an unrendered column as no-ops", async () => {
    const { center, api } = mountGrid();
    await measure(center);
    refreshed.clear();
    expect(() => api.refreshCells({ colIds: ["c40"] })).not.toThrow();
    expect(() => api.refreshCells({ colIds: ["c40"], force: true })).not.toThrow();
    expect(() => api.flashCells({ colIds: ["c40"] } as any)).not.toThrow();
    expect(refreshed.get("c40")).toBeUndefined();
    api.refreshCells({ colIds: ["c3"] });
    expect(refreshed.get("c3")).toBeGreaterThan(0);
  });

  it("leaves full-width rows unaffected", async () => {
    const { center } = mountGrid({
      isFullWidthRow: (node: any) => node.id === "r1",
      fullWidthCellRenderer: () => "full width",
    });
    await measure(center);
    await scrollCenter(center, 1000);
    const fw = center.querySelector<HTMLElement>('.pte-row[row-id="r1"]')!;
    expect(fw).not.toBeNull();
    {
      expect(fw.classList.contains("pte-full-width-row")).toBe(true);
      const host = fw.querySelector<HTMLElement>(".pte-full-width-cell")!;
      expect(host.style.display).not.toBe("none");
      for (const cell of fw.querySelectorAll<HTMLElement>(":scope > .pte-cell:not(.pte-full-width-cell)")) {
        expect(cell.style.display).toBe("none");
      }
    }
    // Other rows still virtualize.
    const other = center.querySelector<HTMLElement>('.pte-row[row-id="r2"]')!;
    expect(renderedColIds(other)).toEqual(ids(8, 18));
  });
});
