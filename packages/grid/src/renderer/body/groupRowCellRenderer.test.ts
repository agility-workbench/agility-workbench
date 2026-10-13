// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import type { ColDef } from "../../interfaces/column";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { IRowNode } from "../../interfaces/iRowNode";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { ChangeFlashCellRenderer } from "../../cellRenderers/changeFlashRenderer";
import type { CellRendererParams, ICellRenderer } from "../renderer";
import { initDomRenderer } from "../dom";

/**
 * A column's cellRenderer paints its cells on group rows (singleColumn / multipleColumns) with the
 * group cell value and `isGroup: true`; label columns keep the chevron + label, groupRows mode keeps
 * its full-width host, and one pooled instance follows a slot across leaf ↔ group.
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

// A function renderer that records every params object it is handed, keyed by its column.
function recording(tag: string, calls: CellRendererParams[]) {
  return (p: CellRendererParams) => {
    calls.push(p);
    const el = document.createElement("span");
    el.className = `r-${tag}`;
    el.textContent = `${tag}:${p.isGroup ? "group" : "leaf"}:${p.value ?? ""}`;
    return el;
  };
}

function baseDefs(extra: { total?: Partial<ColDef>; name?: Partial<ColDef>; region?: Partial<ColDef> } = {}): ColDef[] {
  return [
    { colId: "region", key: "region", label: "Region", ...extra.region },
    { colId: "name", key: "name", label: "Name", ...extra.name },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER, ...extra.total },
  ];
}

async function mountGrouped(
  options: Partial<GridOptions> = {},
  colDefs: ColDef[] = baseDefs(),
  { rowCount = 6, groupBy = ["region"], aggregate = true }: { rowCount?: number; groupBy?: string[]; aggregate?: boolean } = {},
) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id", groupDisplayType: "singleColumn", groupDefaultExpanded: -1, ...options,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs);
  api.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: `r${i}`,
    region: i < rowCount / 2 ? "AMER" : "EMEA",
    kind: i % 2 === 0 ? "even" : "odd",
    name: `Account ${i}`,
    total: i,
  })));
  if (aggregate) {
    core.setAggregateModel([{ key: core.getColumnModel().getByColId("total")!.instanceID, type: AggregateType.SUM }]);
  }
  core.dispatch({ type: "rowGroupSet", colIds: groupBy } as any);
  await raf();
  return { container, core, api };
}

function colIdx(core: GridCore, predicate: (c: Column) => boolean): number {
  return core.getColumnModel().getLeaves().findIndex(predicate);
}

function idx(core: GridCore, colId: string): number {
  return colIdx(core, c => c.colId === colId);
}

function bodyCell(container: HTMLElement, viewIdx: number, colIndex: number): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"] .pte-cell[data-col-idx="${colIndex}"]`,
  );
  if (!found) throw new Error(`no cell at ${viewIdx}/${colIndex}`);
  return found;
}

function viewIndexOf(core: GridCore, predicate: (n: IRowNode) => boolean): number {
  const rm = core.getRowModel();
  for (let i = 0; i < rm.getViewCount(); i++) {
    if (predicate(rm.getRowNodeAtViewIndex(i)!)) return i;
  }
  throw new Error("no matching row in view");
}

function node(core: GridCore, viewIdx: number): IRowNode {
  return core.getRowModel().getRowNodeAtViewIndex(viewIdx)!;
}

describe("cell renderers on group rows", () => {
  it("runs a column's renderer on a group row with the aggregate, isGroup and the node", async () => {
    const calls: CellRendererParams[] = [];
    const { container, core } = await mountGrouped({}, baseDefs({ total: { cellRenderer: recording("total", calls) } }));
    const group = node(core, 0);
    expect(group.isGroup).toBe(true);
    const totalCol = core.getColumnModel().getByColId("total")!;

    const cell = bodyCell(container, 0, idx(core, "total"));
    expect(cell.querySelector(".r-total")?.textContent).toBe("total:group:3");
    expect(cell.classList).toContain("pte-cell-custom-renderer");
    expect(cell.classList).toContain("pte-group-cell");

    const p = calls.find(c => c.node === group)!;
    expect(p.isGroup).toBe(true);
    // AMER holds r0..r2: 0 + 1 + 2.
    expect(p.value).toBe(3);
    expect(p.valueFormatted).toBe(core.getGroupCellValue(totalCol, group).formatted);
    expect(p.valueFormatted).not.toBe("");
    // `data` has always been the row node on the per-column path.
    expect(p.data).toBe(group);
  });

  it("hands a renderer on a column without an aggregate an undefined value and empty text", async () => {
    const calls: CellRendererParams[] = [];
    const { container, core } = await mountGrouped({}, baseDefs({ name: { cellRenderer: recording("name", calls) } }));
    const group = node(core, 0);

    expect(bodyCell(container, 0, idx(core, "name")).querySelector(".r-name")?.textContent).toBe("name:group:");
    const p = calls.find(c => c.node === group)!;
    expect(p.isGroup).toBe(true);
    expect(p.value).toBeUndefined();
    expect(p.valueFormatted).toBe("");
  });

  it("hands a renderer the column's groupValueGetter result", async () => {
    const calls: CellRendererParams[] = [];
    const { container, core } = await mountGrouped({}, baseDefs({
      name: {
        cellRenderer: recording("name", calls),
        groupValueGetter: ({ node: n }) => `${n.groupKey} accounts`,
      },
    }));
    const group = node(core, 0);

    expect(bodyCell(container, 0, idx(core, "name")).querySelector(".r-name")?.textContent)
      .toBe("name:group:AMER accounts");
    expect(calls.find(c => c.node === group)!.value).toBe("AMER accounts");
  });

  it("passes isGroup false and the node to a leaf renderer", async () => {
    const calls: CellRendererParams[] = [];
    const { core } = await mountGrouped({}, baseDefs({ total: { cellRenderer: recording("total", calls) } }));
    const leaf = node(core, 1);
    expect(leaf.isGroup).toBeFalsy();

    const p = calls.find(c => c.node === leaf)!;
    expect(p.isGroup).toBe(false);
    expect(p.value).toBe(leaf.data.total);
    expect(p.data).toBe(leaf);
  });

  it("never runs the auto-group column's renderer on a group row, but does on a leaf", async () => {
    const calls: CellRendererParams[] = [];
    const { container, core } = await mountGrouped({
      groupColumnDef: { cellRenderer: recording("auto", calls) },
    });
    const autoIdx = colIdx(core, c => c.isAutoGroupColumn());

    const groupCell = bodyCell(container, 0, autoIdx);
    expect(groupCell.textContent).toContain("AMER");
    expect(groupCell.querySelector(".pte-group-toggle")).toBeTruthy();
    expect(groupCell.querySelector(".r-auto")).toBeNull();
    expect(groupCell.classList).not.toContain("pte-cell-custom-renderer");
    expect(calls.some(c => c.isGroup)).toBe(false);

    const leafCell = bodyCell(container, 1, autoIdx);
    expect(leafCell.querySelector(".r-auto")).toBeTruthy();
    expect(leafCell.classList).toContain("pte-cell-custom-renderer");
  });

  it("multipleColumns: a level-tagged column never runs its renderer on any group row", async () => {
    const regionCalls: CellRendererParams[] = [];
    const kindCalls: CellRendererParams[] = [];
    const defs: ColDef[] = [
      ...baseDefs({ region: { cellRenderer: recording("region", regionCalls) } }),
      { colId: "kind", key: "kind", label: "Kind", cellRenderer: recording("kind", kindCalls) },
    ];
    const { container, core } = await mountGrouped(
      { groupDisplayType: "multipleColumns" }, defs, { groupBy: ["region", "kind"] },
    );
    const regionIdx = idx(core, "region");
    const kindIdx = idx(core, "kind");
    const top = viewIndexOf(core, n => n.isGroup && n.level === 0);
    const sub = viewIndexOf(core, n => n.isGroup && n.level === 1);
    const leaf = viewIndexOf(core, n => !n.isGroup);

    // Own level: the label.
    expect(bodyCell(container, top, regionIdx).textContent).toContain("AMER");
    expect(bodyCell(container, sub, kindIdx).textContent).toContain("even");
    // Another level: blank text, still no renderer.
    expect(bodyCell(container, sub, regionIdx).textContent).toBe("");
    expect(bodyCell(container, top, kindIdx).textContent).toBe("");
    for (const [r, c] of [[top, regionIdx], [sub, regionIdx], [top, kindIdx], [sub, kindIdx]]) {
      expect(bodyCell(container, r, c).classList).not.toContain("pte-cell-custom-renderer");
    }
    expect(regionCalls.some(c => c.isGroup)).toBe(false);
    expect(kindCalls.some(c => c.isGroup)).toBe(false);

    // Leaves keep running both.
    expect(bodyCell(container, leaf, regionIdx).querySelector(".r-region")).toBeTruthy();
    expect(bodyCell(container, leaf, kindIdx).querySelector(".r-kind")).toBeTruthy();
  });

  it("keeps one pooled instance across leaf → group → leaf, refreshed with isGroup flipped", async () => {
    const log: Array<{ inst: number; op: "init" | "refresh" | "destroy"; isGroup?: boolean; rowId?: string }> = [];
    let next = 0;
    class Recorder implements ICellRenderer {
      private id = next++;
      private el = document.createElement("span");
      init(p: CellRendererParams) {
        (this.el as any).__inst = this.id;
        log.push({ inst: this.id, op: "init", isGroup: p.isGroup, rowId: p.rowId });
      }
      getGui() { return this.el; }
      refresh(p: CellRendererParams) {
        log.push({ inst: this.id, op: "refresh", isGroup: p.isGroup, rowId: p.rowId });
        return true;
      }
      destroy() { log.push({ inst: this.id, op: "destroy" }); }
    }
    const { container, core } = await mountGrouped({}, baseDefs({ total: { cellRenderer: Recorder } }));
    const totalIdx = idx(core, "total");
    const instAt = (viewIdx: number) => (bodyCell(container, viewIdx, totalIdx).firstElementChild as any).__inst as number;

    // Expanded: view 1 is the leaf r0.
    expect(node(core, 1).id).toBe("r0");
    const inst = instAt(1);
    expect(log.find(e => e.inst === inst && e.op === "init")!.isGroup).toBe(false);

    // Collapse AMER: view 1 becomes the EMEA group row.
    const amer = node(core, 0);
    core.dispatch({ type: "groupToggleExpand", groupId: amer.id, expanded: false } as any);
    await raf();
    expect(node(core, 1).isGroup).toBe(true);
    expect(instAt(1)).toBe(inst);

    // Expand again: view 1 is the leaf once more.
    core.dispatch({ type: "groupToggleExpand", groupId: amer.id, expanded: true } as any);
    await raf();
    expect(node(core, 1).isGroup).toBeFalsy();
    expect(instAt(1)).toBe(inst);

    const mine = log.filter(e => e.inst === inst);
    expect(mine.filter(e => e.op === "init")).toHaveLength(1);
    expect(mine.some(e => e.op === "destroy")).toBe(false);
    const flips = mine.filter(e => e.op === "refresh").map(e => e.isGroup);
    const firstGroup = flips.indexOf(true);
    expect(firstGroup).toBeGreaterThanOrEqual(0);
    expect(flips.indexOf(false, firstGroup)).toBeGreaterThan(firstGroup);
  });

  it("rebuilds the instance on the group row when refresh returns false", async () => {
    const created: Array<{ isGroup?: boolean; destroyed: boolean }> = [];
    class Rebuilder implements ICellRenderer {
      private rec!: { isGroup?: boolean; destroyed: boolean };
      private el = document.createElement("span");
      init(p: CellRendererParams) {
        this.rec = { isGroup: p.isGroup, destroyed: false };
        created.push(this.rec);
        (this.el as any).__rec = this.rec;
      }
      getGui() { return this.el; }
      refresh() { return false; }
      destroy() { this.rec.destroyed = true; }
    }
    const { container, core } = await mountGrouped({}, baseDefs({ total: { cellRenderer: Rebuilder } }));
    const totalIdx = idx(core, "total");
    const before = (bodyCell(container, 1, totalIdx).firstElementChild as any).__rec;
    expect(before.isGroup).toBe(false);

    core.dispatch({ type: "groupToggleExpand", groupId: node(core, 0).id, expanded: false } as any);
    await raf();

    const after = (bodyCell(container, 1, totalIdx).firstElementChild as any).__rec;
    expect(after).not.toBe(before);
    expect(after.isGroup).toBe(true);
    expect(before.destroyed).toBe(true);
  });

  it("groupRows mode: per-column renderers do not run on the full-width group row", async () => {
    const calls: CellRendererParams[] = [];
    const { container, core } = await mountGrouped(
      { groupDisplayType: "groupRows" }, baseDefs({ total: { cellRenderer: recording("total", calls) } }),
    );
    expect(node(core, 0).isGroup).toBe(true);
    expect(calls.some(c => c.isGroup)).toBe(false);
    // The slot's per-column cells sit hidden under the full-width host; the host is what shows.
    const host = container.querySelector<HTMLElement>(
      `.pte-row:not(.pte-sticky-row)[data-view-idx="0"] .pte-full-width-cell`,
    )!;
    expect(host.textContent).toContain("AMER");
    expect(host.querySelector(".r-total")).toBeNull();
    // Leaves still run it.
    expect(calls.some(c => c.isGroup === false)).toBe(true);
  });

  it("the full-width renderer receives isGroup next to the node", async () => {
    const calls: CellRendererParams[] = [];
    const { core } = await mountGrouped({
      groupDisplayType: "groupRows", fullWidthCellRenderer: recording("fw", calls),
    });
    const group = node(core, 0);
    const p = calls.find(c => c.node === group)!;
    expect(p.isGroup).toBe(true);
  });

  it("the change-flash renderer paints the formatted aggregate on a group row", async () => {
    const { container, core } = await mountGrouped({}, baseDefs({ total: { cellRenderer: ChangeFlashCellRenderer } }));
    const group = node(core, 0);
    const expected = core.getGroupCellValue(core.getColumnModel().getByColId("total")!, group).formatted;
    expect(bodyCell(container, 0, idx(core, "total")).querySelector(".pte-cell-flash")?.textContent).toBe(expected);
  });

  it("the sticky mirror of a docked group row carries the renderer's group output", async () => {
    const calls: CellRendererParams[] = [];
    const { container, core } = await mountGrouped(
      { groupRowsSticky: true }, baseDefs({ total: { cellRenderer: recording("total", calls) } }), { rowCount: 200 },
    );
    const group = node(core, 0);
    const scroller = container.querySelector<HTMLElement>(".pte-body")!;
    scroller.scrollTop = 5 * core.options.rowHeight;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();

    const mirror = container.querySelector<HTMLElement>(
      `.pte-sticky-row[data-row-id="${group.id}"] .pte-cell[data-col-idx="${idx(core, "total")}"]`,
    );
    expect(mirror).toBeTruthy();
    // AMER holds r0..r99: 0 + … + 99.
    expect(mirror!.querySelector(".r-total")?.textContent).toBe("total:group:4950");
  });

  it("tree data: a non-tree column's renderer runs on an expandable data row; the tree column keeps its cell", async () => {
    const calls: CellRendererParams[] = [];
    document.body.innerHTML = "";
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      treeData: { mode: "path", getPath: (row: any) => row.path },
      groupDefaultExpanded: -1,
    } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach(container);
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name", cellRenderer: recording("name", calls) }]);
    api.setRowData([
      { id: "europe", name: "Europe", path: ["Europe"] },
      { id: "paris", name: "Paris", path: ["Europe", "Paris"] },
    ]);
    await raf();

    const parentIdx = viewIndexOf(core, n => n.id === "europe");
    const parent = node(core, parentIdx);
    expect(parent.isTreeData).toBe(true);
    expect(parent.isGroup).toBeFalsy();

    expect(bodyCell(container, parentIdx, idx(core, "name")).querySelector(".r-name")?.textContent).toBe("name:leaf:Europe");
    const p = calls.find(c => c.node === parent)!;
    expect(p.isGroup).toBe(false);

    const treeCell = bodyCell(container, parentIdx, colIdx(core, c => c.isTreeColumn()));
    expect(treeCell.classList).toContain("pte-group-cell");
    expect(treeCell.querySelector(".pte-group-toggle")).toBeTruthy();
  });

  it("the menu-built sparkline draws the group's sums on a group row", async () => {
    vi.spyOn(console, "warn");
    const defs: ColDef[] = [
      { colId: "region", key: "region", label: "Region" },
      { colId: "a", key: "a", label: "A", type: ColumnType.NUMBER },
      { colId: "b", key: "b", label: "B", type: ColumnType.NUMBER },
      { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
    ];
    document.body.innerHTML = "";
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, { rowIdKey: "id", groupDefaultExpanded: -1 } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach(container);
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps(defs);
    api.setRowData([
      { id: "1", region: "x", a: 10, b: 20, total: 0 },
      { id: "2", region: "x", a: 1, b: 2, total: 0 },
    ]);
    const id = (colId: string) => core.getColumnModel().getByColId(colId)!.instanceID;
    core.setAggregateModel([
      { key: id("a"), type: AggregateType.SUM },
      { key: id("b"), type: AggregateType.SUM },
    ]);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
    core.dispatch({
      type: "addSparklineColumn", targetColId: id("b"), colIds: [id("a"), id("b")], sparklineType: "line", newColId: "trend",
    } as any);
    await raf();

    const group = node(core, 0);
    expect(group.isGroup).toBe(true);
    const svg = bodyCell(container, 0, idx(core, "trend")).querySelector("svg.pte-sparkline");
    expect(svg).toBeTruthy();
    expect(svg!.querySelector("path, polyline, circle")).toBeTruthy();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
