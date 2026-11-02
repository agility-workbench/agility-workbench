// @vitest-environment happy-dom
/**
 * Tree parents paint their aggregates (#82): the body cell of an aggregated column on a real tree
 * parent or a synthetic path prefix shows the aggregate over its leaves (formatted, or through the
 * column's own renderer), other columns keep the row's own data, and the CSV / Excel exports write
 * what the screen shows.
 */
import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { ColDef } from "../interfaces/column";
import type { GridOptions } from "../interfaces/gridOptions";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { CellRendererParams } from "./renderer";
import { initDomRenderer } from "./dom";
import { ExportRenderer } from "./exportRenderer";

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
const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

const ROWS = [
  { id: "work", name: "Work", size: 100, owner: "ann", path: ["Docs", "Work"] },
  { id: "a", name: "alpha", size: 10, owner: "bob", path: ["Docs", "Work", "a"] },
  { id: "b", name: "beta", size: 20, owner: "cy", path: ["Docs", "Work", "b"] },
  { id: "c", name: "gamma", size: 5, owner: "dee", path: ["Docs", "c"] },
];
const DOCS = "t:path:Docs";

function columns(size: Partial<ColDef> = {}): ColDef[] {
  return [
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    {
      colId: "size", key: "size", label: "Size", type: ColumnType.NUMBER, aggFunc: "sum",
      valueFormatter: ({ value }) => (value == null ? "" : `${value} KB`), ...size,
    },
    { colId: "owner", key: "owner", label: "Owner", type: ColumnType.STRING },
  ];
}

async function mountTree(colDefs: ColDef[] = columns(), options: Partial<GridOptions> = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    groupDefaultExpanded: -1,
    treeData: { mode: "path", getPath: (row: any) => row.path },
    ...options,
  } as GridOptions);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs);
  api.setRowData(ROWS.map(r => ({ ...r })));
  await raf();
  return { container, core, api };
}

function cellEl(container: HTMLElement, core: GridCore, rowId: string, colId: string): HTMLElement {
  const viewIdx = core.getViewIndexForRowId(rowId);
  const colIdx = core.getColumnModel().getLeaves().findIndex(c => c.colId === colId);
  const cell = container.querySelector<HTMLElement>(
    `.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"] .pte-cell[data-col-idx="${colIdx}"]`,
  );
  if (!cell) throw new Error(`no cell ${rowId}/${colId}`);
  return cell;
}

function cellText(container: HTMLElement, core: GridCore, rowId: string, colId: string): string {
  const viewIdx = core.getViewIndexForRowId(rowId);
  const colIdx = core.getColumnModel().getLeaves().findIndex(c => c.colId === colId);
  const cell = container.querySelector<HTMLElement>(
    `.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"] .pte-cell[data-col-idx="${colIdx}"]`,
  );
  if (!cell) throw new Error(`no cell ${rowId}/${colId}`);
  return cell.textContent ?? "";
}

function makeExporter(core: GridCore) {
  return new ExportRenderer({
    core,
    leafColumns: () => core.getColumnModel().getLeaves().filter(c => !c.isInternal()),
    columnWidths: () => new Map(),
    selectionRange: () => core.getSelectionRange(),
    selectedColumnIDs: () => core.getSelectedColumnIds(),
  });
}

describe("tree parents paint their aggregates", () => {
  it("a real parent and a synthetic prefix show the formatted aggregate; other cells their own data", async () => {
    const { container, core } = await mountTree();
    expect(cellText(container, core, "work", "size")).toBe("30 KB");
    expect(cellText(container, core, DOCS, "size")).toBe("35 KB");
    expect(cellText(container, core, "a", "size")).toBe("10 KB");
    expect(cellText(container, core, "work", "owner")).toBe("ann");
    expect(cellText(container, core, "work", "name")).toBe("Work");
  });

  it("repaints when a transaction changes a leaf", async () => {
    const { container, core, api } = await mountTree();
    api.applyTransaction({ update: [{ rowId: "a", row: { ...ROWS[1], size: 15 } }] });
    await raf();
    expect(cellText(container, core, "work", "size")).toBe("35 KB");
    expect(cellText(container, core, DOCS, "size")).toBe("40 KB");
  });

  it("runs the column's own renderer with the aggregate on a real parent", async () => {
    const calls: CellRendererParams[] = [];
    const { container, core, api } = await mountTree(columns({
      cellRenderer: (p: CellRendererParams) => {
        calls.push(p);
        const el = document.createElement("span");
        el.textContent = `r:${p.value}:${p.valueFormatted}`;
        return el;
      },
    }));
    expect(cellText(container, core, "work", "size")).toBe("r:30:30 KB");
    expect(cellText(container, core, "a", "size")).toBe("r:10:10 KB");
    expect(calls.find(p => p.node?.id === "work")?.isGroup).toBe(false);
    expect(api.getCellValue({ rowId: "work", colId: "size" })).toBe(30);
  });
  it("a tooltip on a parent's aggregated cell gets the aggregate", async () => {
    const seen: Array<{ rowId: string | undefined; value: unknown; valueFormatted: unknown }> = [];
    const { container, core } = await mountTree(columns({
      tooltipValueGetter: ({ rowId, value, valueFormatted }) => {
        seen.push({ rowId, value, valueFormatted });
        return `tip ${valueFormatted}`;
      },
    }), { tooltip: { showDelay: 0, hideDelay: 0 } } as Partial<GridOptions>);
    cellEl(container, core, "work", "size")
      .dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, button: 0 }));
    await new Promise<void>(resolve => setTimeout(resolve, 5));
    expect(seen.at(-1)).toEqual({ rowId: "work", value: 30, valueFormatted: "30 KB" });
    expect(document.querySelector(".pte-tooltip")?.textContent).toBe("tip 30 KB");
  });
});

describe("tree parents export their aggregates", () => {
  it("CSV writes the parent's aggregate in aggregated columns", async () => {
    const { core } = await mountTree();
    const csv = makeExporter(core).getDataAsCsv()!;
    const lines = csv.trim().split("\n");
    const workLine = lines.find(line => line.includes("ann"))!;
    expect(workLine).toContain("30 KB");
    expect(workLine).not.toContain("100");
  });

  it("Excel writes SUBTOTAL formulas over each parent's rows and a footer matching the screen", async () => {
    const { core } = await mountTree();
    core.setAggregateScope("all");
    const bytes = await makeExporter(core).getDataAsExcel();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes!) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const header = (ws.getRow(1).values as any[]).slice(1);
    const sizeCol = header.indexOf("Size") + 1;
    const rowOf = (label: string) => {
      for (let r = 2; r <= ws.rowCount; r++) {
        if ((ws.getRow(r).values as any[]).some(v => v === label)) return ws.getRow(r);
      }
      throw new Error(`no row ${label}`);
    };
    const docs = rowOf("Docs").getCell(sizeCol).value as any;
    const work = rowOf("ann").getCell(sizeCol).value as any;
    expect(docs.formula).toMatch(/^SUBTOTAL\(9,/);
    expect(docs.result).toBe(35);
    expect(work.formula).toMatch(/^SUBTOTAL\(9,/);
    expect(work.result).toBe(30);
    expect(rowOf("bob").getCell(sizeCol).value).toBe(10);
    // The footer is the grid footer's own value, static (not a formula over the mixed body).
    const sizeId = core.getColumnModel().getByColId("size")!.instanceID;
    const footer = ws.getRow(ws.rowCount).getCell(sizeCol).value;
    // The footer totals the tree's leaves, as the root parents do: 10 + 20 + 5, not Work's own 100.
    expect(footer).toBe(35);
    expect(footer).toBe(core.getRowModel().getAggregateValues().get(sizeId));
  });
});
