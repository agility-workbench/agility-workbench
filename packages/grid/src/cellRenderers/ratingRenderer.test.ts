// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { ColDef } from "../interfaces/column";
import { REJECT } from "../interfaces/gridOptions";
import type { GridOptions } from "../interfaces/gridOptions";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "../renderer/dom";
import { ClipboardRenderer } from "../renderer/clipboard/clipboardRenderer";
import { RatingCellRenderer } from "./ratingRenderer";

/**
 * `cellRenderer: "rating"` draws `max` stars filled to the value (half stars for fractions). It is
 * read-only unless the cell is editable; then clicking star N writes N through the commit path,
 * without opening the number editor.
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
  { id: "a", name: "Alpha", stars: 3 },
  { id: "b", name: "Beta", stars: 4.5 },
  { id: "c", name: "Gamma", stars: null },
  { id: "d", name: "Delta", stars: 9 },
];

function defs(stars: Partial<ColDef> = {}): ColDef[] {
  return [
    { colId: "name", key: "name", label: "Name" },
    { colId: "stars", key: "stars", label: "Stars", type: ColumnType.NUMBER, cellRenderer: "rating", ...stars },
  ];
}

const mount = (stars: Partial<ColDef> = {}, options: Partial<GridOptions> = {}) => mountGrid(defs(stars), ROWS, options);
const rating = (container: HTMLElement, viewIdx: number) =>
  cellAt(container, viewIdx).querySelector<HTMLElement>(".pte-cell-rating");
const stars = (container: HTMLElement, viewIdx: number) =>
  Array.from(cellAt(container, viewIdx).querySelectorAll<HTMLElement>(".pte-cell-rating-star"));
const fills = (container: HTMLElement, viewIdx: number) => stars(container, viewIdx).map(s =>
  s.classList.contains("pte-cell-rating-star-full") ? "F" : s.classList.contains("pte-cell-rating-star-half") ? "H" : "-").join("");
const value = (core: GridCore, id: string) => core.getRowModel().getRowNode(id)!.data.stars;

describe("RatingCellRenderer", () => {
  it("resolves the alias and fills five stars to the value, with half stars and clamping", async () => {
    const { container, core } = await mount();
    expect(core.getColumnModel().getByColId("stars")!.cellRenderer).toBe(RatingCellRenderer);
    expect(fills(container, 0)).toBe("FFF--");
    expect(fills(container, 1)).toBe("FFFFH");
    expect(fills(container, 2)).toBe("-----");
    expect(fills(container, 3)).toBe("FFFFF");
  });

  it("is one image named 'N of max'", async () => {
    const { container } = await mount();
    const r = rating(container, 0)!;
    expect(r.getAttribute("role")).toBe("img");
    expect(r.getAttribute("aria-label")).toBe("3 of 5");
    expect(rating(container, 1)!.getAttribute("aria-label")).toBe("4.5 of 5");
    expect(rating(container, 2)!.getAttribute("aria-label")).toBe("0 of 5");
    expect(cellAt(container, 0).textContent).toBe("");
  });

  it("draws params.max stars", async () => {
    const { container } = await mount({ cellRendererParams: { max: 10 } });
    expect(stars(container, 3)).toHaveLength(10);
    expect(fills(container, 3)).toBe("FFFFFFFFF-");
    expect(rating(container, 3)!.getAttribute("aria-label")).toBe("9 of 10");
  });

  it("is read-only on a non-editable column: a click writes nothing", async () => {
    const { container, core } = await mount();
    const changed = vi.fn();
    core.on("cellValueChanged", changed);
    expect(rating(container, 0)!.classList.contains("pte-cell-rating-editable")).toBe(false);
    click(stars(container, 0)[4]);
    await raf();
    expect(changed).not.toHaveBeenCalled();
    expect(value(core, "a")).toBe(3);
  });

  it("writes the clicked star through the commit path on an editable cell, without an editor", async () => {
    const { container, core, api } = await mount({ editable: true });
    const changed: any[] = [];
    core.on("cellValueChanged", (e) => changed.push(e));
    const before = rating(container, 0)!;
    expect(before.classList.contains("pte-cell-rating-editable")).toBe(true);
    click(stars(container, 0)[4]);
    await raf();
    expect(value(core, "a")).toBe(5);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ cell: { rowId: "a", colId: "stars" }, oldValue: 3, value: 5 });
    expect(api.getEditingCell()).toBeNull();
    // Refreshed in place.
    expect(rating(container, 0)).toBe(before);
    expect(fills(container, 0)).toBe("FFFFF");
    api.undo();
    await raf();
    expect(value(core, "a")).toBe(3);
    expect(fills(container, 0)).toBe("FFF--");
  });

  it("clicking the current star clears to 0 only with allowClear", async () => {
    const plain = await mount({ editable: true });
    const changed = vi.fn();
    plain.core.on("cellValueChanged", changed);
    click(stars(plain.container, 0)[2]);
    await raf();
    expect(value(plain.core, "a")).toBe(3);
    expect(changed).not.toHaveBeenCalled();

    const clearable = await mount({ editable: true, cellRendererParams: { allowClear: true } });
    click(stars(clearable.container, 0)[2]);
    await raf();
    expect(value(clearable.core, "a")).toBe(0);
  });

  it("rates a blank value", async () => {
    const { container, core } = await mount({ editable: true });
    click(stars(container, 2)[1]);
    await raf();
    expect(value(core, "c")).toBe(2);
  });

  it("does not write on a modified click (those belong to selection)", async () => {
    const { container, core } = await mount({ editable: true });
    click(stars(container, 0)[0], { shiftKey: true });
    await raf();
    expect(value(core, "a")).toBe(3);
  });

  it("writes nothing when onBeforeCellCommit vetoes the rating", async () => {
    const hook = vi.fn(() => REJECT);
    const { container, core } = await mount({ editable: true }, { onBeforeCellCommit: hook });
    click(stars(container, 0)[0]);
    await raf();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(value(core, "a")).toBe(3);
    expect(fills(container, 0)).toBe("FFF--");
  });

  it("stays read-only on an editable column when the grid never edits from the UI", async () => {
    const { container, core } = await mount({ editable: true }, { editTrigger: "none" });
    expect(rating(container, 0)!.classList.contains("pte-cell-rating-editable")).toBe(false);
    click(stars(container, 0)[0]);
    await raf();
    expect(value(core, "a")).toBe(3);
  });

  it("with editTrigger singleClick, a star rates and the rest of the row opens the editor", async () => {
    const { container, core, api } = await mount({ editable: true }, { editTrigger: "singleClick" });
    const states: string[] = [];
    core.on("editingChanged", (e: any) => states.push(e.state));
    click(stars(container, 1)[0]);
    await raf();
    expect(value(core, "b")).toBe(1);
    expect(states).not.toContain("started");
    // The cell's padding (outside the stars) keeps the trigger: the number editor opens.
    click(cellAt(container, 0));
    await raf();
    expect(api.getEditingCell()).toMatchObject({ rowId: "a", colId: "stars" });
  });

  it("a double-click on editable stars does not open the editor", async () => {
    const { container, api } = await mount({ editable: true });
    stars(container, 0)[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
    await raf();
    expect(api.getEditingCell()).toBeNull();
  });

  it("keeps the value for export and the clipboard, and is skipped by the find", async () => {
    const { core, api } = await mount();
    const csv = api.getDataAsCsv().trim().split(/\r?\n/);
    expect(csv.slice(1)).toEqual(["Alpha,3", "Beta,4.5", "Gamma,", "Delta,9"]);
    api.selectRange(0, 1);
    api.extendRangeTo(1, 1);
    const clip = new ClipboardRenderer({ core, writeText: async () => {}, readText: async () => "" });
    expect(clip.buildCopyText()).toBe("3\n4.5");
    expect(core.getColumnModel().getByColId("stars")!.rendersNoText()).toBe(true);
  });

  it("shows a group row's value as text", async () => {
    const { container, core } = await mount({ editable: true }, { groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["name"] } as any);
    await raf();
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".pte-row[data-view-idx]"));
    expect(rows.filter(r => r.classList.contains("pte-group-row")).every(r => !r.querySelector(".pte-cell-rating-star"))).toBe(true);
    expect(rows.some(r => !r.classList.contains("pte-group-row") && r.querySelector(".pte-cell-rating-star"))).toBe(true);
  });
});
