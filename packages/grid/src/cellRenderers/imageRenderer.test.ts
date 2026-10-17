// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import type { ColDef } from "../interfaces/column";
import type { GridOptions } from "../interfaces/gridOptions";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "../renderer/dom";
import { ClipboardRenderer } from "../renderer/clipboard/clipboardRenderer";
import { ImageCellRenderer } from "./imageRenderer";

/**
 * `cellRenderer: "image"` draws a lazy `<img>` of the value, fitted to the row. A blank value draws
 * nothing, a broken image shows its alt text, and the find skips the column (it shows no text).
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

// Inline data URIs: the tests never load anything over the network.
const RED = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='red'/%3E%3C/svg%3E";
const BLUE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='blue'/%3E%3C/svg%3E";

const ROWS = [
  { id: "a", name: "Alpha", avatar: RED },
  { id: "b", name: "Beta", avatar: BLUE },
  { id: "c", name: "Gamma", avatar: "" },
];

function defs(avatar: Partial<ColDef> = {}): ColDef[] {
  return [
    { colId: "name", key: "name", label: "Name" },
    { colId: "avatar", key: "avatar", label: "Avatar", cellRenderer: "image", ...avatar },
  ];
}

const mount = (avatar: Partial<ColDef> = {}, options: Partial<GridOptions> = {}) =>
  mountGrid(defs(avatar), ROWS, options);
const img = (container: HTMLElement, viewIdx: number) =>
  cellAt(container, viewIdx).querySelector<HTMLImageElement>("img.pte-cell-image-img");

describe("ImageCellRenderer", () => {
  it("resolves the alias and draws a lazy image of the value, named by the column", async () => {
    const { container, core } = await mount();
    expect(core.getColumnModel().getByColId("avatar")!.cellRenderer).toBe(ImageCellRenderer);
    const i = img(container, 0)!;
    expect(i.getAttribute("src")).toBe(RED);
    expect(i.getAttribute("loading")).toBe("lazy");
    // The formatted value is the URL itself, which says nothing: the column label names the image.
    expect(i.alt).toBe("Avatar");
    expect(cellAt(container, 0).textContent).toBe("");
  });

  it("takes src, alt, width and height from cellRendererParams", async () => {
    const { container } = await mount({
      cellRendererParams: {
        src: (p: any) => p.node.data.id === "c" ? BLUE : p.value,
        alt: (p: any) => `${p.node.data.name}'s avatar`,
        width: 24,
        height: "1.5em",
      },
    });
    const i = img(container, 2)!;
    expect(i.getAttribute("src")).toBe(BLUE);
    expect(i.alt).toBe("Gamma's avatar");
    expect(i.style.width).toBe("24px");
    expect(i.style.height).toBe("1.5em");
  });

  it("uses a valueFormatter's words as alt text", async () => {
    const { container } = await mount({ valueFormatter: ({ value }) => value === RED ? "Red square" : "" });
    expect(img(container, 0)!.alt).toBe("Red square");
    expect(img(container, 1)!.alt).toBe("Avatar");
  });

  it("renders nothing for a blank value", async () => {
    const { container } = await mount();
    expect(img(container, 2)).toBeNull();
    expect(cellAt(container, 2).textContent).toBe("");
  });

  it("shows the alt text when the image fails to load, and the image again for a new src", async () => {
    const { container, api } = await mount({ cellRendererParams: { alt: () => "Alpha avatar" } });
    const i = img(container, 0)!;
    i.dispatchEvent(new Event("error"));
    expect(img(container, 0)).toBeNull();
    expect(cellAt(container, 0).querySelector(".pte-cell-image-broken")!.textContent).toBe("Alpha avatar");
    // A repaint with the same src keeps the fallback.
    api.refreshCells();
    await raf();
    expect(img(container, 0)).toBeNull();
    api.setCellValue({ rowId: "a", colId: "avatar" }, BLUE);
    await raf();
    expect(img(container, 0)).toBe(i);
    expect(i.getAttribute("src")).toBe(BLUE);
  });

  it("refreshes in place on a data update", async () => {
    const { container, api } = await mount();
    const before = img(container, 0)!;
    api.setCellValue({ rowId: "a", colId: "avatar" }, BLUE);
    await raf();
    expect(img(container, 0)).toBe(before);
    expect(before.getAttribute("src")).toBe(BLUE);
    api.refreshCells();
    await raf();
    expect(img(container, 0)).toBe(before);
  });

  it("is skipped by the find, which would otherwise highlight a URL nobody sees", async () => {
    const { core, api } = await mount();
    expect(core.getColumnModel().getByColId("avatar")!.rendersNoText()).toBe(true);
    api.setQuickFilter("svg", { behavior: "find" });
    await raf();
    expect(api.getFindState().matchCount).toBe(0);
    // The same column drawn as text shows the URLs, so there the search finds them.
    const asText = await mount({ cellRenderer: "text" });
    asText.api.setQuickFilter("svg", { behavior: "find" });
    await raf();
    expect(asText.api.getFindState().matchCount).toBe(2);
  });

  it("keeps the value for export and the clipboard", async () => {
    const { core, api } = await mount({ valueFormatter: ({ value }) => value === RED ? "red" : value === BLUE ? "blue" : "" });
    const csv = api.getDataAsCsv().trim().split(/\r?\n/);
    expect(csv.slice(1)).toEqual(["Alpha,red", "Beta,blue", "Gamma,"]);
    api.selectRange(0, 1);
    api.extendRangeTo(1, 1);
    const clip = new ClipboardRenderer({ core, writeText: async () => {}, readText: async () => "" });
    expect(clip.buildCopyText()).toBe("red\nblue");
  });

  it("shows a group row's value as text", async () => {
    const { container, core } = await mount({}, { groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["name"] } as any);
    await raf();
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".pte-row[data-view-idx]"));
    expect(rows.filter(r => r.classList.contains("pte-group-row")).every(r => !r.querySelector("img"))).toBe(true);
    expect(rows.some(r => !r.classList.contains("pte-group-row") && r.querySelector("img"))).toBe(true);
  });
});
