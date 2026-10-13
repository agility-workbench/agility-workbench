// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import type { ColDef } from "../../interfaces/column";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { IRowNode } from "../../interfaces/iRowNode";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import type { CellRendererParams, ICellRenderer } from "../renderer";
import { initDomRenderer } from "../dom";

/**
 * A slot bound to a full-width row (groupRows group rows) hides its per-column cells under the
 * host: it must release the leaf renderer instances those cells held, and data / resize refreshes
 * must repaint the host rather than mount renderers inside the hidden cells.
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

type LogEntry = { op: "init" | "refresh" | "destroy"; isGroup?: boolean; rowId?: string; node?: IRowNode; reason?: string };

// A class renderer that records its lifecycle with the row it was handed.
function recorder(log: LogEntry[]) {
  return class Recorder implements ICellRenderer {
    private el = document.createElement("span");
    init(p: CellRendererParams) {
      this.el.className = "rec";
      this.el.textContent = `${p.rowId}`;
      log.push({ op: "init", isGroup: p.isGroup, rowId: p.rowId, node: p.node, reason: p.refreshReason });
    }
    getGui() { return this.el; }
    refresh(p: CellRendererParams) {
      this.el.textContent = `${p.rowId}`;
      log.push({ op: "refresh", isGroup: p.isGroup, rowId: p.rowId, node: p.node, reason: p.refreshReason });
      return true;
    }
    destroy() { log.push({ op: "destroy" }); }
  };
}

const defs = (total: Partial<ColDef>): ColDef[] => [
  { colId: "region", key: "region", label: "Region" },
  { colId: "name", key: "name", label: "Name" },
  { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER, ...total },
];

async function mountGroupRows(options: Partial<GridOptions>, colDefs: ColDef[]) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id", groupDisplayType: "groupRows", groupDefaultExpanded: -1, ...options,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs);
  api.setRowData(Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`, region: i < 3 ? "AMER" : "EMEA", name: `Account ${i}`, total: i,
  })));
  core.setAggregateModel([{ key: core.getColumnModel().getByColId("total")!.instanceID, type: AggregateType.SUM }]);
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
  await raf();
  return { container, core, api };
}

function rowEl(container: HTMLElement, viewIdx: number): HTMLElement {
  const found = container.querySelector<HTMLElement>(`.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"]`);
  if (!found) throw new Error(`no row at ${viewIdx}`);
  return found;
}

function totalCell(container: HTMLElement, core: GridCore, viewIdx: number): HTMLElement {
  const colIndex = core.getColumnModel().getLeaves().findIndex(c => c.colId === "total");
  return rowEl(container, viewIdx).querySelector<HTMLElement>(`.pte-cell[data-col-idx="${colIndex}"]`)!;
}

const node = (core: GridCore, viewIdx: number) => core.getRowModel().getRowNodeAtViewIndex(viewIdx)!;

async function collapseAmer(core: GridCore) {
  core.dispatch({ type: "groupToggleExpand", groupId: node(core, 0).id, expanded: false } as any);
  await raf();
}

describe("full-width slots and per-column renderers", () => {
  it("a slot that binds a group row destroys the leaf renderer it held and empties the hidden cell", async () => {
    const log: LogEntry[] = [];
    const { container, core } = await mountGroupRows({}, defs({ cellRenderer: recorder(log) }));
    // Expanded: view 1 is the leaf r0.
    expect(node(core, 1).id).toBe("r0");
    expect(totalCell(container, core, 1).querySelector(".rec")?.textContent).toBe("r0");
    const destroysBefore = log.filter(e => e.op === "destroy").length;

    // Collapse AMER: view 1 becomes the EMEA group row (full-width).
    await collapseAmer(core);
    expect(node(core, 1).isGroup).toBe(true);
    expect(log.filter(e => e.op === "destroy").length).toBe(destroysBefore + 1);

    const hidden = totalCell(container, core, 1);
    expect(hidden.childNodes).toHaveLength(0);
    expect(hidden.classList).not.toContain("pte-cell-custom-renderer");
    const host = rowEl(container, 1).querySelector<HTMLElement>(".pte-full-width-cell")!;
    expect(host.textContent).toContain("EMEA");
    expect(log.some(e => e.isGroup === true)).toBe(false);
  });

  it("a resize refresh repaints the full-width host, not the hidden per-column cells", async () => {
    const colLog: LogEntry[] = [];
    const hostLog: LogEntry[] = [];
    const { core } = await mountGroupRows(
      { fullWidthCellRenderer: recorder(hostLog) }, defs({ cellRenderer: recorder(colLog) }),
    );
    const group = node(core, 0);
    expect(group.isGroup).toBe(true);
    const hostBefore = hostLog.length;

    const totalId = core.getColumnModel().getByColId("total")!.instanceID;
    core.dispatch({ type: "columnResize", colId: totalId, widthPx: 240 } as any);
    await raf();

    expect(colLog.some(e => (e.op === "init" || e.op === "refresh") && e.isGroup === true)).toBe(false);
    const after = hostLog.slice(hostBefore);
    expect(after.some(e => e.op === "refresh" && e.node === group && e.reason === "resize")).toBe(true);
  });

  it("a slot returning to a leaf paints the renderer column fresh", async () => {
    const log: LogEntry[] = [];
    const { container, core } = await mountGroupRows({}, defs({ cellRenderer: recorder(log) }));
    await collapseAmer(core);
    const mark = log.length;

    core.dispatch({ type: "groupToggleExpand", groupId: node(core, 0).id, expanded: true } as any);
    await raf();
    expect(node(core, 1).id).toBe("r0");
    const inits = log.slice(mark).filter(e => e.op === "init");
    expect(inits.some(e => e.rowId === "r0" && e.isGroup === false)).toBe(true);
    expect(totalCell(container, core, 1).querySelector(".rec")?.textContent).toBe("r0");
    expect(totalCell(container, core, 1).classList).toContain("pte-cell-custom-renderer");
  });
});
