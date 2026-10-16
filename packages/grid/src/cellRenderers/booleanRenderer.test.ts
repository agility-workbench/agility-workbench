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
import { BooleanCellRenderer } from "./booleanRenderer";
import { ChangeFlashCellRenderer } from "./changeFlashRenderer";

/**
 * BOOLEAN columns draw a checkbox by default: ticked / empty / indeterminate, read-only unless the
 * cell is editable, where a click on the box writes through the normal commit path without opening
 * the editor. The formatted text still drives export and the clipboard.
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

const ROWS = [
  { id: "a", name: "Alpha", active: true },
  { id: "b", name: "Beta", active: false },
  { id: "c", name: "Gamma", active: null },
];

function defs(active: Partial<ColDef> = {}): ColDef[] {
  return [
    { colId: "name", key: "name", label: "Name" },
    { colId: "active", key: "active", label: "Active", type: ColumnType.BOOLEAN, ...active },
  ];
}

async function mount(active: Partial<ColDef> = {}, options: Partial<GridOptions> = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(defs(active));
  api.setRowData(ROWS.map(r => ({ ...r })));
  await raf();
  return { container, core, api };
}

function activeCell(container: HTMLElement, viewIdx: number): HTMLElement {
  const row = container.querySelector(`.pte-row[data-view-idx="${viewIdx}"]`);
  return row!.querySelector<HTMLElement>('.pte-cell[data-col-idx="1"]')!;
}

function box(container: HTMLElement, viewIdx: number): HTMLElement | null {
  return activeCell(container, viewIdx).querySelector<HTMLElement>(".pte-cell-boolean-box");
}

function click(el: Element, init: MouseEventInit = {}) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, ...init }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, ...init }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ...init }));
}

describe("BooleanCellRenderer as the BOOLEAN default", () => {
  it("draws a ticked, empty and indeterminate box for true, false and null", async () => {
    const { container } = await mount();
    const states = [0, 1, 2].map(i => box(container, i)!);
    expect(states.every(b => b.getAttribute("role") === "checkbox")).toBe(true);
    expect(states.map(b => b.getAttribute("aria-checked"))).toEqual(["true", "false", "mixed"]);
    expect(states[0].classList.contains("pte-checkbox-checked")).toBe(true);
    expect(states[1].classList.contains("pte-checkbox-checked")).toBe(false);
    expect(states[2].classList.contains("pte-checkbox-indeterminate")).toBe(true);
    // The box is the cell's only content: no "true"/"false" text, and the cell keeps its role.
    expect(activeCell(container, 0).textContent).toBe("");
    expect(activeCell(container, 0).getAttribute("role")).toBe("gridcell");
  });

  it("is read-only on a non-editable column: a click writes nothing", async () => {
    const { container, core } = await mount();
    const changed = vi.fn();
    core.on("cellValueChanged", changed);
    const b = box(container, 1)!;
    expect(b.getAttribute("aria-readonly")).toBe("true");
    expect(b.classList.contains("pte-cell-boolean-readonly")).toBe(true);
    click(b);
    await raf();
    expect(changed).not.toHaveBeenCalled();
    expect(core.getRowModel().getRowNode("b")!.data.active).toBe(false);
  });

  it("toggles an editable cell through the commit path, without opening the editor", async () => {
    const { container, core, api } = await mount({ editable: true });
    const changed: any[] = [];
    core.on("cellValueChanged", (e) => changed.push(e));
    const b = box(container, 1)!;
    expect(b.hasAttribute("aria-readonly")).toBe(false);
    click(b);
    await raf();
    expect(core.getRowModel().getRowNode("b")!.data.active).toBe(true);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ cell: { rowId: "b", colId: "active" }, oldValue: false, value: true });
    expect(api.getEditingCell()).toBeNull();
    expect(box(container, 1)!.getAttribute("aria-checked")).toBe("true");
    // One undo step, like any edit.
    api.undo();
    await raf();
    expect(core.getRowModel().getRowNode("b")!.data.active).toBe(false);
    expect(box(container, 1)!.getAttribute("aria-checked")).toBe("false");
  });

  it("a double-click on an editable box is two toggles, not an editor", async () => {
    const { container, core, api } = await mount({ editable: true });
    const b = box(container, 1)!;
    click(b);
    click(b);
    b.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
    await raf();
    expect(core.getRowModel().getRowNode("b")!.data.active).toBe(false);
    expect(api.getEditingCell()).toBeNull();
  });

  it("leaves group rows as text and draws the box on their leaves", async () => {
    const { container, core } = await mount({}, { groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["name"] } as any);
    await raf();
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".pte-row[data-view-idx]"));
    const group = rows.find(r => r.classList.contains("pte-group-row"))!;
    const leaf = rows.find(r => !r.classList.contains("pte-group-row"))!;
    expect(group.querySelector(".pte-cell-boolean-box")).toBeNull();
    expect(leaf.querySelector(".pte-cell-boolean-box")).not.toBeNull();
  });

  it("with editTrigger singleClick, the box toggles and the rest of the cell opens the editor", async () => {
    const { container, core, api } = await mount({ editable: true }, { editTrigger: "singleClick" });
    const states: string[] = [];
    core.on("editingChanged", (e: any) => states.push(e.state));
    const b = box(container, 1)!;
    click(b);
    await raf();
    expect(core.getRowModel().getRowNode("b")!.data.active).toBe(true);
    // No editor ever opened over the box (a commit would also have closed it, so check the events).
    expect(states).not.toContain("started");
    expect(b.isConnected).toBe(true);
    click(activeCell(container, 0));
    await raf();
    expect(api.getEditingCell()).toMatchObject({ rowId: "a", colId: "active" });
    expect(core.getRowModel().getRowNode("a")!.data.active).toBe(true);
  });

  it("toggles a blank value to true", async () => {
    const { container, core } = await mount({ editable: true });
    click(box(container, 2)!);
    await raf();
    expect(core.getRowModel().getRowNode("c")!.data.active).toBe(true);
  });

  it("does not toggle on a modified click (those belong to selection)", async () => {
    const { container, core } = await mount({ editable: true });
    click(box(container, 0)!, { shiftKey: true });
    await raf();
    expect(core.getRowModel().getRowNode("a")!.data.active).toBe(true);
  });

  it("writes nothing when onBeforeCellCommit vetoes the toggle", async () => {
    const hook = vi.fn(() => REJECT);
    const { container, core } = await mount({ editable: true }, { onBeforeCellCommit: hook });
    const changed = vi.fn();
    core.on("cellValueChanged", changed);
    click(box(container, 0)!);
    await raf();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(core.getRowModel().getRowNode("a")!.data.active).toBe(true);
    expect(box(container, 0)!.getAttribute("aria-checked")).toBe("true");
  });

  it("stays read-only on an editable column when the grid never edits from the UI", async () => {
    const { container, core } = await mount({ editable: true }, { editTrigger: "none" });
    click(box(container, 1)!);
    await raf();
    expect(core.getRowModel().getRowNode("b")!.data.active).toBe(false);
  });

  it("names the box by the column label, or by the valueFormatter's words", async () => {
    const plain = await mount();
    expect(box(plain.container, 0)!.getAttribute("aria-label")).toBe("Active");
    const worded = await mount({ valueFormatter: ({ value }) => value == null ? "" : value ? "Yes" : "No" });
    expect(box(worded.container, 0)!.getAttribute("aria-label")).toBe("Yes");
    expect(box(worded.container, 1)!.getAttribute("aria-label")).toBe("No");
    // Blank formats to "", so the label falls back to the column.
    expect(box(worded.container, 2)!.getAttribute("aria-label")).toBe("Active");
  });

  it("keeps the formatted text for export and the clipboard", async () => {
    const { core, api } = await mount({ valueFormatter: ({ value }) => value == null ? "" : value ? "Yes" : "No" });
    const csv = api.getDataAsCsv().trim().split(/\r?\n/);
    expect(csv.slice(1)).toEqual(["Alpha,Yes", "Beta,No", "Gamma,"]);
    api.selectRange(0, 1);
    api.extendRangeTo(1, 1);
    const clip = new ClipboardRenderer({ core, writeText: async () => {}, readText: async () => "" });
    expect(clip.buildCopyText()).toBe("Yes\nNo");
  });
});

describe("opting out of the default checkbox", () => {
  it('shows the formatted text with cellRenderer: "text"', async () => {
    const { container, core } = await mount({ cellRenderer: "text" });
    expect(box(container, 0)).toBeNull();
    expect(activeCell(container, 0).textContent).toBe("true");
    expect(activeCell(container, 1).textContent).toBe("false");
    expect(core.getColumnModel().getByColId("active")!.usesDefaultCheckboxRenderer()).toBe(false);
  });

  it("runs the column's own renderer instead (no double default)", async () => {
    const { container } = await mount({ cellRenderer: ChangeFlashCellRenderer });
    expect(box(container, 0)).toBeNull();
    const flash = activeCell(container, 0).querySelector(".pte-cell-flash");
    expect(flash?.textContent).toBe("true");
  });

  it("only BOOLEAN columns default to the checkbox", async () => {
    const { core } = await mount();
    const cols = core.getColumnModel();
    expect(cols.getByColId("active")!.usesDefaultCheckboxRenderer()).toBe(true);
    expect(cols.getByColId("name")!.usesDefaultCheckboxRenderer()).toBe(false);
  });

  it("can be set explicitly on another column type", async () => {
    const { container } = await mount({ type: ColumnType.STRING, cellRenderer: BooleanCellRenderer });
    expect(box(container, 0)!.getAttribute("aria-checked")).toBe("true");
  });
});
