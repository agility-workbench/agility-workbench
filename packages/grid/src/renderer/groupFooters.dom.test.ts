// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import type { ColDef } from "../interfaces/column";
import type { GridOptions } from "../interfaces/gridOptions";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { IRowNode } from "../interfaces/iRowNode";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { GRAND_TOTAL_ROW_ID, groupFooterNodeId, groupNodeId } from "../csrm/rowGroup";
import { ClipboardRenderer } from "./clipboard/clipboardRenderer";
import { ExportRenderer } from "./exportRenderer";
import { initDomRenderer } from "./dom";

/**
 * Group footer rows rendered by the body pool: an ordinary multi-cell row in every display type
 * (including "groupRows"), labelled "Total …" in the group's label column, with the header's
 * formatted aggregates and the footer classes; never docked by the sticky overlay, though a group's
 * push-out happens at its footer; ARIA row indexes like any body row; copy writes the shown text;
 * exports unchanged.
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

afterEach(() => vi.restoreAllMocks());

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};
const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

const DEFS: ColDef[] = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "name", key: "name", label: "Name" },
  { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
];

// r0..r(n/2-1) are AMER, the rest EMEA; total = the row's index.
function rows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    region: i < count / 2 ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  }));
}

async function mount(
  options: Partial<GridOptions> = {},
  { colDefs = DEFS, rowCount = 6, aggregate = AggregateType.SUM as string }:
    { colDefs?: ColDef[]; rowCount?: number; aggregate?: string } = {},
) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id", groupDefaultExpanded: -1, groupTotalRow: "bottom", ...options,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs);
  api.setRowData(rows(rowCount));
  core.setAggregateModel([{ key: core.getColumnModel().getByColId("total")!.instanceID, type: aggregate as any }]);
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
  await raf();
  return { container, core, api };
}

const colIdx = (core: GridCore, predicate: (c: any) => boolean) =>
  core.getColumnModel().getLeaves().findIndex(predicate);
const idx = (core: GridCore, colId: string) => colIdx(core, c => c.colId === colId);
const autoIdx = (core: GridCore) => colIdx(core, c => c.isAutoGroupColumn());

function bodyCell(container: HTMLElement, viewIdx: number, colIndex: number): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"] .pte-cell[data-col-idx="${colIndex}"]`,
  );
  if (!found) throw new Error(`no cell at ${viewIdx}/${colIndex}`);
  return found;
}

function centerRow(container: HTMLElement, viewIdx: number): HTMLElement {
  return container.querySelector<HTMLElement>(`.pte-center-viewport .pte-row[data-view-idx="${viewIdx}"]`)
    ?? [...container.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`)]
      .find(row => row.hasAttribute("aria-rowindex"))!;
}

function viewIndexOf(core: GridCore, predicate: (n: IRowNode) => boolean): number {
  const rm = core.getRowModel();
  for (let i = 0; i < rm.getViewCount(); i++) if (predicate(rm.getRowNodeAtViewIndex(i)!)) return i;
  throw new Error("no matching row in view");
}

const footerIdx = (core: GridCore, key: string) =>
  viewIndexOf(core, n => !!n.footer && n.groupKey === key);
const headerIdx = (core: GridCore, key: string) =>
  viewIndexOf(core, n => n.isGroup && !n.footer && n.groupKey === key);

describe("group footer rows: rendering", () => {
  it("singleColumn: 'Total' label without a chevron, the header's aggregate text, other cells blank", async () => {
    const { container, core } = await mount();
    const footer = footerIdx(core, "AMER");
    const header = headerIdx(core, "AMER");
    expect(footer).toBe(4);

    const label = bodyCell(container, footer, autoIdx(core));
    expect(label.querySelector(".pte-group-label")?.textContent).toBe("Total AMER");
    expect(label.querySelector(".pte-group-toggle")).toBeNull();
    expect(label.querySelector(".pte-tree-toggle-spacer")).toBeTruthy();

    const total = bodyCell(container, footer, idx(core, "total")).textContent;
    expect(total).toBe(bodyCell(container, header, idx(core, "total")).textContent);
    expect(total).toBe("3");
    expect(bodyCell(container, footer, idx(core, "name")).textContent).toBe("");

    const row = centerRow(container, footer);
    expect(row.classList).toContain("pte-row-footer");
    expect(row.classList).toContain("pte-group-row");
    expect(row.classList).not.toContain("pte-row-grand-total");
    expect(centerRow(container, header).classList).not.toContain("pte-row-footer");
  });

  it("marks the grand total and labels it 'Grand Total'", async () => {
    const { container, core } = await mount({ grandTotalRow: "bottom" });
    const gt = viewIndexOf(core, n => !!n.grandTotal);
    expect(centerRow(container, gt).classList).toContain("pte-row-grand-total");
    expect(centerRow(container, gt).classList).toContain("pte-row-footer");
    expect(bodyCell(container, gt, autoIdx(core)).textContent).toBe("Grand Total");
    expect(bodyCell(container, gt, idx(core, "total")).textContent).toBe("15");
  });

  it("shows a custom aggregate on the footer exactly as on the header", async () => {
    const joined = ({ values }: { values: unknown[] }) => values.join("+");
    const { container, core } = await mount({ aggFuncs: { joined } }, { aggregate: "joined" });
    const footer = footerIdx(core, "EMEA");
    const text = bodyCell(container, footer, idx(core, "total")).textContent;
    expect(text).toBe("3+4+5");
    expect(text).toBe(bodyCell(container, headerIdx(core, "EMEA"), idx(core, "total")).textContent);
  });

  it("runs a column's renderer on a footer with the group cell value and the footer node", async () => {
    const calls: any[] = [];
    const renderer = (p: any) => {
      calls.push(p);
      const el = document.createElement("b");
      el.textContent = `r:${p.value}`;
      return el;
    };
    const defs = DEFS.map(d => d.colId === "total" ? { ...d, cellRenderer: renderer } : d);
    const { container, core } = await mount({}, { colDefs: defs });
    const footer = footerIdx(core, "AMER");
    expect(bodyCell(container, footer, idx(core, "total")).textContent).toBe("r:3");
    const footerCall = calls.find(p => p.node?.footer);
    expect(footerCall).toMatchObject({ isGroup: true, value: 3 });
    expect(footerCall.node.groupNode.id).toBe(groupNodeId(["AMER"]));
  });

  it("groupRows: the footer is a multi-cell row with its label in the first column", async () => {
    const { container, core } = await mount({ groupDisplayType: "groupRows" });
    const footer = footerIdx(core, "AMER");
    const header = headerIdx(core, "AMER");
    expect(core.isFullWidthNode(core.getRowModel().getRowNodeAtViewIndex(header))).toBe(true);
    expect(core.isFullWidthNode(core.getRowModel().getRowNodeAtViewIndex(footer))).toBe(false);

    const row = centerRow(container, footer);
    expect(row.classList).not.toContain("pte-full-width-row");
    expect(bodyCell(container, footer, idx(core, "region")).textContent).toBe("Total AMER");
    expect(bodyCell(container, footer, idx(core, "total")).textContent).toBe("3");
    expect(bodyCell(container, footer, idx(core, "name")).textContent).toBe("");
  });

  it("multipleColumns: the label goes in the level's own column", async () => {
    const { container, core } = await mount({ groupDisplayType: "multipleColumns" });
    const footer = footerIdx(core, "EMEA");
    expect(bodyCell(container, footer, idx(core, "region")).textContent).toBe("Total EMEA");
  });

  it("hides the footer's checkbox and reports it unavailable", async () => {
    const { container, core } = await mount({ rowSelection: { checkboxes: true } as any });
    const footer = footerIdx(core, "AMER");
    const row = [...container.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${footer}"]`)]
      .find(r => r.querySelector(".pte-checkbox-cell"))!;
    const cell = row.querySelector<HTMLElement>(".pte-checkbox-cell")!;
    expect(row.classList).toContain("pte-row-footer");
    expect(cell.getAttribute("aria-disabled")).toBe("true");
  });

  it("repaints when the footer options change at runtime", async () => {
    const { container, core, api } = await mount({ groupTotalRow: undefined });
    expect(core.getRowModel().getRowNode(groupFooterNodeId(groupNodeId(["AMER"])))).toBeUndefined();
    api.updateGridOptions({ groupTotalRow: "top", grandTotalRow: "bottom" });
    await raf();
    expect(bodyCell(container, 1, autoIdx(core)).textContent).toBe("Total AMER");
    const last = core.getRowModel().getViewCount() - 1;
    expect(core.getRowModel().getRowNodeAtViewIndex(last)!.id).toBe(GRAND_TOTAL_ROW_ID);
    api.updateGridOptions({ groupTotalRowLabel: p => p.grandTotal ? "Everything" : `Σ ${p.groupLabel}` });
    await raf();
    expect(bodyCell(container, 1, autoIdx(core)).textContent).toBe("Σ AMER");
    expect(bodyCell(container, last, autoIdx(core)).textContent).toBe("Everything");
  });
});

describe("group footer rows: API, ARIA, copy and exports", () => {
  it("getDisplayedRowAtIndex returns footers; forEachLeafNode and getSelectedRows never do", async () => {
    const { core, api } = await mount({ grandTotalRow: "top" });
    expect(api.getDisplayedRowAtIndex(0)?.id).toBe(GRAND_TOTAL_ROW_ID);
    expect(api.getDisplayedRowAtIndex(footerIdx(core, "AMER"))?.footer).toBe(true);
    const leaves: string[] = [];
    api.forEachLeafNode(node => leaves.push(node.id));
    expect(leaves).toHaveLength(6);
    api.selectAllRows();
    expect(api.getSelectedRows()).toHaveLength(6);
    expect((api.getSelectedRows() as any[]).every(row => !row.__group)).toBe(true);
  });

  it("gives footer rows an aria-rowindex and a level, but no expanded state", async () => {
    const { container, core } = await mount();
    const footer = footerIdx(core, "AMER");
    const row = centerRow(container, footer);
    expect(row.getAttribute("aria-rowindex")).toBe(String(footer + 2));
    expect(row.hasAttribute("aria-expanded")).toBe(false);
    expect(row.getAttribute("aria-level")).toBe("1");
    // The two footers count as rows of the set.
    const rowCount = (c: HTMLElement) =>
      Number(c.querySelector<HTMLElement>("[role='treegrid'], [role='grid']")!.getAttribute("aria-rowcount"));
    const withFooters = rowCount(container);
    const plain = await mount({ groupTotalRow: undefined });
    expect(withFooters - rowCount(plain.container)).toBe(2);
  });

  it("copies a footer's cells as their formatted text, the groupRows label included", async () => {
    const copyRow = (core: GridCore, from: string, to: string) => {
      const footer = footerIdx(core, "AMER");
      core.dispatch({ type: "rangeSelectSet", viewIdx: footer, colIdx: idx(core, from), mode: "start" } as any);
      core.dispatch({ type: "rangeSelectSet", viewIdx: footer, colIdx: idx(core, to), mode: "extend" } as any);
      const writes: string[] = [];
      const clip = new ClipboardRenderer({ core, writeText: async t => { writes.push(t); }, readText: async () => "" });
      clip.copy();
      return writes[0];
    };
    const single = await mount({ groupRowsSelectable: true });
    expect(copyRow(single.core, "region", "total")).toBe("\t\t3");
    const groupRows = await mount({ groupRowsSelectable: true, groupDisplayType: "groupRows" });
    expect(copyRow(groupRows.core, "region", "total")).toBe("Total AMER\t\t3");
  });

  it("leaves the Excel export unchanged and CSV leaves-only", async () => {
    const exporterFor = (core: GridCore) => new ExportRenderer({
      core,
      leafColumns: () => core.getColumnModel().getLeaves().filter(c => !c.isInternal()),
      columnWidths: () => new Map(),
      selectionRange: () => core.getSelectionRange(),
      selectedColumnIDs: () => core.getSelectedColumnIds(),
    });
    const plain = (await mount({ groupTotalRow: undefined })).core;
    const plainCsv = exporterFor(plain).getDataAsCsv({ scope: "all" });
    const plainXlsx = await exporterFor(plain).getDataAsExcel({ scope: "all" });
    const footed = (await mount({ groupTotalRow: "bottom", grandTotalRow: "top" })).core;
    const csv = exporterFor(footed).getDataAsCsv({ scope: "all" });
    expect(csv).toBe(plainCsv);
    expect(csv).not.toContain("Total AMER");
    const xlsx = await exporterFor(footed).getDataAsExcel({ scope: "all" });
    expect(xlsx?.length).toBe(plainXlsx?.length);
  });
});

describe("group footer rows: sticky groups", () => {
  it("never docks a footer, and the group's push-out happens at its footer", async () => {
    const { container, core } = await mount({ groupRowsSticky: true }, { rowCount: 200 });
    const rowHeight = core.options.rowHeight;
    const footer = footerIdx(core, "AMER");
    expect(footer).toBe(101);
    const scroller = container.querySelector<HTMLElement>(".pte-body")!;
    const docked = () => [...container.querySelectorAll<HTMLElement>(".pte-sticky-rows .pte-sticky-row[data-row-id]")]
      .filter(el => el.style.display !== "none" && (el.closest(".pte-sticky-rows") as HTMLElement).style.display !== "none");
    const scrollTo = async (top: number) => {
      scroller.scrollTop = top;
      scroller.dispatchEvent(new Event("scroll"));
      await raf();
      await raf();
    };

    // With the footer at the top slot the AMER header is still docked at 0 — without the footer
    // in its block it would already have scrolled away.
    await scrollTo(footer * rowHeight);
    let rowsDocked = docked();
    expect(rowsDocked.length).toBeGreaterThan(0);
    expect(rowsDocked.every(el => el.dataset.rowId === groupNodeId(["AMER"]))).toBe(true);
    expect(rowsDocked[0].style.transform).toBe("translateY(0px)");

    // Half a row further, the footer pushes the header half out.
    await scrollTo(footer * rowHeight + rowHeight / 2);
    rowsDocked = docked();
    expect(rowsDocked[0].dataset.rowId).toBe(groupNodeId(["AMER"]));
    expect(rowsDocked[0].style.transform).toBe(`translateY(${-rowHeight / 2}px)`);

    // Nothing on screen ever docks a footer.
    for (const top of [0, 50, 101, 150, 202].map(i => i * rowHeight)) {
      await scrollTo(top);
      expect(docked().some(el => el.dataset.rowId?.endsWith("#footer"))).toBe(false);
    }
  });
});
