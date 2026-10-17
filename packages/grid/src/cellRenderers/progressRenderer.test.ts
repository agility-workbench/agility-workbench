// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { ColDef } from "../interfaces/column";
import type { GridOptions } from "../interfaces/gridOptions";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "../renderer/dom";
import { ClipboardRenderer } from "../renderer/clipboard/clipboardRenderer";
import { ProgressCellRenderer } from "./progressRenderer";

/**
 * `cellRenderer: "progress"` draws a track and a bar filled to the value (a fraction, or
 * `value / max`), clamped, with progressbar ARIA. The formatted value still drives export, the
 * clipboard and the find (when `showValue` prints it).
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

async function mountGrid(defs: ColDef[], rows: any[], options: Partial<GridOptions> = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(defs);
  api.setRowData(rows.map(r => ({ ...r })));
  await raf();
  return { container, core, api };
}

function cellAt(container: HTMLElement, viewIdx: number, colIdx = 1): HTMLElement {
  const row = container.querySelector(`.pte-row[data-view-idx="${viewIdx}"]`);
  return row!.querySelector<HTMLElement>(`.pte-cell[data-col-idx="${colIdx}"]`)!;
}

function click(el: Element, init: MouseEventInit = {}) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, ...init }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, ...init }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
}

const ROWS = [
  { id: "a", name: "Alpha", done: 0.42 },
  { id: "b", name: "Beta", done: 1.7 },
  { id: "c", name: "Gamma", done: null },
  { id: "d", name: "Delta", done: -0.2 },
];

function defs(done: Partial<ColDef> = {}): ColDef[] {
  return [
    { colId: "name", key: "name", label: "Name" },
    { colId: "done", key: "done", label: "Done", type: ColumnType.NUMBER, cellRenderer: "progress", ...done },
  ];
}

const mount = (done: Partial<ColDef> = {}, options: Partial<GridOptions> = {}) => mountGrid(defs(done), ROWS, options);
const bar = (container: HTMLElement, viewIdx: number) =>
  cellAt(container, viewIdx).querySelector<HTMLElement>(".pte-cell-progress-bar");
const track = (container: HTMLElement, viewIdx: number) =>
  cellAt(container, viewIdx).querySelector<HTMLElement>('[role="progressbar"]');

describe("ProgressCellRenderer", () => {
  it("resolves the alias and fills the bar to a fraction, clamping out-of-range values", async () => {
    const { container, core } = await mount();
    expect(core.getColumnModel().getByColId("done")!.cellRenderer).toBe(ProgressCellRenderer);
    expect([0, 1, 3].map(i => bar(container, i)!.style.width)).toEqual(["42%", "100%", "0%"]);
    expect(cellAt(container, 0).textContent).toBe("");
  });

  it("reads value / max when max is given", async () => {
    const { container } = await mount({ cellRendererParams: { max: 200 } });
    expect(bar(container, 1)!.style.width).toBe(`${(1.7 / 200) * 100}%`);
    expect(track(container, 1)!.getAttribute("aria-valuemax")).toBe("200");
  });

  it("carries progressbar ARIA named by the column", async () => {
    const { container } = await mount({ valueFormatter: ({ value }) => value == null ? "" : `${Math.round(value * 100)}%` });
    const t = track(container, 0)!;
    expect(t.getAttribute("aria-valuemin")).toBe("0");
    expect(t.getAttribute("aria-valuemax")).toBe("1");
    expect(t.getAttribute("aria-valuenow")).toBe("0.42");
    expect(t.getAttribute("aria-valuetext")).toBe("42%");
    expect(t.getAttribute("aria-label")).toBe("Done");
    // Clamped values report the clamped number.
    expect(track(container, 1)!.getAttribute("aria-valuenow")).toBe("1");
  });

  it("draws an empty track with no aria-valuenow for a blank value", async () => {
    const { container } = await mount();
    expect(bar(container, 2)!.style.width).toBe("0%");
    expect(track(container, 2)!.hasAttribute("aria-valuenow")).toBe(false);
    expect(cellAt(container, 2).querySelector(".pte-cell-progress-blank")).not.toBeNull();
  });

  it("prints the formatted value beside the bar with showValue", async () => {
    const { container, core } = await mount({
      cellRendererParams: { showValue: true },
      valueFormatter: ({ value }) => value == null ? "" : `${Math.round(value * 100)}%`,
    });
    expect(cellAt(container, 0).querySelector(".pte-cell-progress-value")!.textContent).toBe("42%");
    expect(core.getColumnModel().getByColId("done")!.rendersNoText()).toBe(false);
  });

  it("colours bars through the color and className hooks", async () => {
    const { container } = await mount({
      cellRendererParams: {
        color: ({ fraction }: any) => fraction != null && fraction >= 1 ? "rgb(0, 128, 0)" : undefined,
        className: ({ fraction }: any) => fraction != null && fraction < 0.5 ? "is-low" : null,
      },
    });
    expect(bar(container, 1)!.style.backgroundColor).toBe("rgb(0, 128, 0)");
    expect(bar(container, 0)!.style.backgroundColor).toBe("");
    expect(cellAt(container, 0).querySelector(".pte-cell-progress")!.classList.contains("is-low")).toBe(true);
    expect(cellAt(container, 1).querySelector(".pte-cell-progress")!.classList.contains("is-low")).toBe(false);
  });

  it("refreshes in place, dropping a threshold class the new value no longer earns", async () => {
    const { container, api } = await mount({
      cellRendererParams: { className: ({ fraction }: any) => fraction != null && fraction < 0.5 ? "is-low" : null },
    });
    const before = bar(container, 0)!;
    api.setCellValue({ rowId: "a", colId: "done" }, 0.9);
    await raf();
    expect(bar(container, 0)).toBe(before);
    expect(before.style.width).toBe("90%");
    expect(cellAt(container, 0).querySelector(".pte-cell-progress")!.classList.contains("is-low")).toBe(false);
    api.refreshCells();
    await raf();
    expect(bar(container, 0)).toBe(before);
  });

  it("keeps the formatted value for export, the clipboard and (with showValue) the find", async () => {
    const valueFormatter = ({ value }: any) => value == null ? "" : `${Math.round(value * 100)}%`;
    const { core, api } = await mount({ valueFormatter });
    const csv = api.getDataAsCsv().trim().split(/\r?\n/);
    expect(csv.slice(1)).toEqual(["Alpha,42%", "Beta,170%", "Gamma,", "Delta,-20%"]);
    api.selectRange(0, 1);
    api.extendRangeTo(1, 1);
    const clip = new ClipboardRenderer({ core, writeText: async () => {}, readText: async () => "" });
    expect(clip.buildCopyText()).toBe("42%\n170%");
    // A bare bar shows no text, so the find skips it; showValue prints the text, so it is found.
    api.setQuickFilter("42", { behavior: "find" });
    await raf();
    expect(api.getFindState().matchCount).toBe(0);
    const shown = await mount({ valueFormatter, cellRendererParams: { showValue: true } });
    shown.api.setQuickFilter("42", { behavior: "find" });
    await raf();
    expect(shown.api.getFindState().matchCount).toBe(1);
  });

  it("shows a group row's aggregate as text", async () => {
    const { container, core } = await mount({ aggFunc: "avg" }, { groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["name"] } as any);
    await raf();
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".pte-row[data-view-idx]"));
    expect(rows.filter(r => r.classList.contains("pte-group-row")).every(r => !r.querySelector('[role="progressbar"]'))).toBe(true);
    expect(rows.some(r => !r.classList.contains("pte-group-row") && r.querySelector('[role="progressbar"]'))).toBe(true);
  });
});
