// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../core/core";
import type { ColDef } from "../interfaces/column";
import type { GridOptions } from "../interfaces/gridOptions";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "../renderer/dom";
import { ClipboardRenderer } from "../renderer/clipboard/clipboardRenderer";
import { LinkCellRenderer } from "./linkRenderer";
import { isInteractiveCellTarget } from "./interactiveTarget";

/**
 * `cellRenderer: "link"` draws an anchor to the value (or `params.href`), opening in a new tab by
 * default. Its click navigates: the cell is still selected, but no editor opens over the link.
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

// happy-dom performs a link's navigation (and fetches the page) after an un-prevented click. Record
// whether the grid prevented it, then stop the navigation so the tests never touch the network.
let lastClickPrevented: boolean | null = null;
const stopNavigation = (e: Event) => {
  lastClickPrevented = e.defaultPrevented;
  e.preventDefault();
};
beforeAll(() => window.addEventListener("click", stopNavigation));
afterAll(() => window.removeEventListener("click", stopNavigation));

afterEach(() => {
  vi.restoreAllMocks();
  lastClickPrevented = null;
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
  { id: "a", name: "Alpha", url: "https://example.com/a" },
  { id: "b", name: "Beta", url: "https://example.com/b" },
  { id: "c", name: "Gamma", url: null },
];

function defs(url: Partial<ColDef> = {}): ColDef[] {
  return [
    { colId: "name", key: "name", label: "Name" },
    { colId: "url", key: "url", label: "Site", cellRenderer: "link", ...url },
  ];
}

const mount = (url: Partial<ColDef> = {}, options: Partial<GridOptions> = {}) => mountGrid(defs(url), ROWS, options);
const anchor = (container: HTMLElement, viewIdx: number) =>
  cellAt(container, viewIdx).querySelector<HTMLAnchorElement>("a.pte-cell-link-anchor");

describe("LinkCellRenderer", () => {
  it("resolves the alias and draws a blank-target link to the value", async () => {
    const { container, core } = await mount();
    expect(core.getColumnModel().getByColId("url")!.cellRenderer).toBe(LinkCellRenderer);
    const a = anchor(container, 0)!;
    expect(a.getAttribute("href")).toBe("https://example.com/a");
    expect(a.textContent).toBe("https://example.com/a");
    expect(a.target).toBe("_blank");
    expect(a.rel).toBe("noopener noreferrer");
    expect(a.hasAttribute("download")).toBe(false);
    expect(a.tabIndex).toBe(-1);
  });

  it("takes href, text, target, rel and download from cellRendererParams", async () => {
    const { container } = await mount({
      cellRendererParams: {
        href: (p: any) => `/sites/${p.node.data.id}`,
        text: (p: any) => `Open ${p.node.data.name}`,
        target: "_self",
        rel: "external",
        download: "site.html",
      },
    });
    const a = anchor(container, 1)!;
    expect(a.getAttribute("href")).toBe("/sites/b");
    expect(a.textContent).toBe("Open Beta");
    expect(a.target).toBe("_self");
    expect(a.rel).toBe("external");
    expect(a.getAttribute("download")).toBe("site.html");
  });

  it("adds the blank-target rel tokens to an app rel", async () => {
    const { container } = await mount({ cellRendererParams: { rel: "external" } });
    expect(anchor(container, 0)!.rel.split(" ").sort()).toEqual(["external", "noopener", "noreferrer"]);
  });

  it("uses the formatted value as text", async () => {
    const { container } = await mount({ valueFormatter: ({ value }) => value ? String(value).replace("https://", "") : "" });
    expect(anchor(container, 0)!.textContent).toBe("example.com/a");
  });

  it("renders nothing for a blank value", async () => {
    const { container } = await mount();
    expect(anchor(container, 2)).toBeNull();
    expect(cellAt(container, 2).textContent).toBe("");
  });

  it("never links a script URL, and shows the text instead", async () => {
    const { container } = await mount({ cellRendererParams: { href: () => " javascript:alert(1)" } });
    expect(anchor(container, 0)).toBeNull();
    expect(cellAt(container, 0).textContent).toBe("https://example.com/a");
  });

  it("refreshes in place on a data update", async () => {
    const { container, api } = await mount();
    const before = anchor(container, 0)!;
    api.setCellValue({ rowId: "a", colId: "url" }, "https://example.org/");
    await raf();
    const after = anchor(container, 0)!;
    expect(after).toBe(before);
    expect(after.getAttribute("href")).toBe("https://example.org/");
    api.refreshCells();
    await raf();
    expect(anchor(container, 0)).toBe(before);
  });

  it("selects the cell on click but never opens the singleClick editor over the link", async () => {
    const { container, core, api } = await mount({ editable: true }, { editTrigger: "singleClick" });
    const states: string[] = [];
    core.on("editingChanged", (e: any) => states.push(e.state));
    const a = anchor(container, 1)!;
    expect(isInteractiveCellTarget(a)).toBe(true);
    click(a);
    await raf();
    // Nothing in the grid swallowed the click (the browser navigates on an un-prevented click).
    expect(lastClickPrevented).toBe(false);
    expect(states).not.toContain("started");
    expect(api.getEditingCell()).toBeNull();
    expect(core.getActiveCell()).toMatchObject({ row: 1, colIdx: 1 });
    expect(a.isConnected).toBe(true);
    // The rest of the cell keeps the edit trigger.
    click(cellAt(container, 0));
    await raf();
    expect(api.getEditingCell()).toMatchObject({ rowId: "a", colId: "url" });
  });

  it("a double-click on the link does not open the editor", async () => {
    const { container, api } = await mount({ editable: true });
    anchor(container, 0)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
    await raf();
    expect(api.getEditingCell()).toBeNull();
  });

  it("keeps the value for export and the clipboard, and stays findable", async () => {
    const { core, api } = await mount();
    const csv = api.getDataAsCsv().trim().split(/\r?\n/);
    expect(csv.slice(1)).toEqual(["Alpha,https://example.com/a", "Beta,https://example.com/b", "Gamma,"]);
    api.selectRange(0, 1);
    api.extendRangeTo(1, 1);
    const clip = new ClipboardRenderer({ core, writeText: async () => {}, readText: async () => "" });
    expect(clip.buildCopyText()).toBe("https://example.com/a\nhttps://example.com/b");
    expect(core.getColumnModel().getByColId("url")!.rendersNoText()).toBe(false);
  });

  it("shows a group row's value as text", async () => {
    const { container, core } = await mount({}, { groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["name"] } as any);
    await raf();
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".pte-row[data-view-idx]"));
    const group = rows.find(r => r.classList.contains("pte-group-row"))!;
    const leaf = rows.find(r => !r.classList.contains("pte-group-row") && r.querySelector("a"))!;
    expect(group.querySelector("a")).toBeNull();
    expect(leaf.querySelector("a.pte-cell-link-anchor")).not.toBeNull();
  });
});
