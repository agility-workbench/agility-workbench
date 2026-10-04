// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import type { ColDef } from "../../interfaces/column";
import type { FillOperationParams, FillOperationResult, GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

/**
 * The fill handle end to end: where the grip appears, what a drag previews and writes, how the
 * modifier flips copy and series, and the keyboard forms (Ctrl/Cmd+D, Ctrl/Cmd+R).
 *
 * Leaf indices (no row numbers): name=0, qty=1, when=2, note=3, locked=4.
 */

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

const columnDefs: ColDef[] = [
  { colId: "name", key: "name", label: "Name", editable: true },
  { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  { colId: "when", key: "when", label: "When", type: ColumnType.DATE, editable: true },
  { colId: "note", key: "note", label: "Note", editable: true },
  { colId: "locked", key: "locked", label: "Locked" },
];

function rows() {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`,
    name: String.fromCharCode(65 + i),
    qty: (i + 1) * 10,
    when: new Date(2026, 0, i + 1),
    // Letters, not digits: `n1` would be a text counter and count up instead of repeating.
    note: `n${"abcdef"[i]}`,
    locked: `L${i}`,
  }));
}

function mountGrid(options: Partial<GridOptions> = {}, defs: ColDef[] = columnDefs) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(defs);
  api.setRowData(rows());
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  const data = (id: string) => core.getRowModel().getRowNode(id)!.data as Record<string, unknown>;
  const column = (key: string) => data("r0") && Array.from({ length: 6 }, (_, i) => data(`r${i}`)[key]);
  return { core, api, root, data, column };
}

function cell(root: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  // A row slot renders one element per column section; the cell lives in exactly one of them.
  const rowEls = root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`);
  for (let i = 0; i < rowEls.length; i++) {
    const found = rowEls[i].querySelector<HTMLElement>(`.pte-cell[data-col-idx="${colIdx}"]`);
    if (found) return found;
  }
  throw new Error(`no cell at ${viewIdx}/${colIdx}`);
}

function select(core: GridCore, r0: number, c0: number, r1 = r0, c1 = c0) {
  core.dispatch({ type: "rangeSelectSet", viewIdx: r0, colIdx: c0, mode: "start" });
  if (r1 !== r0 || c1 !== c0) core.dispatch({ type: "rangeSelectSet", viewIdx: r1, colIdx: c1, mode: "extend" });
}

const handle = (root: HTMLElement) => root.querySelector<HTMLElement>(".pte-fill-handle");

function pressHandle(root: HTMLElement) {
  const grip = handle(root);
  if (!grip) throw new Error("no fill handle to press");
  grip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
}

function moveOver(root: HTMLElement, viewIdx: number, colIdx: number) {
  cell(root, viewIdx, colIdx).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
}

function release(mods: Partial<MouseEventInit> = {}) {
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, ...mods }));
}

function drag(root: HTMLElement, viewIdx: number, colIdx: number, mods: Partial<MouseEventInit> = {}) {
  pressHandle(root);
  moveOver(root, viewIdx, colIdx);
  release(mods);
}

function press(root: HTMLElement, key: string, mods: Partial<KeyboardEventInit> = {}): boolean {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
  root.dispatchEvent(event);
  return event.defaultPrevented;
}

const range = (core: GridCore) => {
  const r = core.getSelectionRange()!;
  return [r.rowStart, r.rowEnd, r.colStart, r.colEnd];
};

describe("where the fill handle appears", () => {
  it("sits in the bottom-right cell of the range, and follows the selection", () => {
    const { core, root } = mountGrid();
    select(core, 1, 0, 3, 1);
    const grip = handle(root)!;
    expect(grip).not.toBeNull();
    expect(grip.parentElement).toBe(cell(root, 3, 1));
    expect(cell(root, 3, 1).classList.contains("pte-fill-corner")).toBe(true);

    select(core, 0, 2);
    expect(handle(root)!.parentElement).toBe(cell(root, 0, 2));
    expect(cell(root, 3, 1).classList.contains("pte-fill-corner")).toBe(false);
    expect(root.querySelectorAll(".pte-fill-handle")).toHaveLength(1);
  });

  it("is absent on a selection with no editable column", () => {
    const { core, root } = mountGrid();
    select(core, 0, 4, 2, 4); // the locked column only
    expect(handle(root)).toBeNull();
    select(core, 0, 3, 2, 4); // reaches an editable column
    expect(handle(root)).not.toBeNull();
  });

  it("is absent on a read-only grid, when disabled, and without range selection", () => {
    const readOnly = mountGrid({}, columnDefs.map(def => ({ ...def, editable: false })));
    select(readOnly.core, 0, 0, 2, 2);
    expect(handle(readOnly.root)).toBeNull();

    const off = mountGrid({ fillHandle: false });
    select(off.core, 0, 0, 2, 2);
    expect(handle(off.root)).toBeNull();

    const noRange = mountGrid({ rangeSelection: false });
    select(noRange.core, 0, 0);
    expect(handle(noRange.root)).toBeNull();
  });

  it("is absent when the range reaches into a pinned band", () => {
    const { core, root } = mountGrid({ pinnedTopRowData: [{ id: "p0", name: "P", qty: 1, when: new Date(2026, 0, 1), note: "", locked: "" }] });
    select(core, 0, 0, 1, 0);
    expect(handle(root)).not.toBeNull();
    core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, rowPinned: "top", mode: "extend" });
    expect(core.getSelectionRange()!.pinnedTop).toBeTruthy();
    expect(handle(root)).toBeNull();
  });

  it("comes and goes with the runtime option", () => {
    const { core, api, root } = mountGrid();
    select(core, 0, 0, 1, 1);
    expect(handle(root)).not.toBeNull();
    api.updateGridOptions({ fillHandle: false });
    expect(handle(root)).toBeNull();
    api.updateGridOptions({ fillHandle: true });
    expect(handle(root)!.parentElement).toBe(cell(root, 1, 1));
  });

  it("survives a repaint of its host cell", () => {
    const { core, api, root } = mountGrid();
    select(core, 2, 0);
    api.setCellValue({ rowId: "r2", colId: "name" }, "Z");
    expect(cell(root, 2, 0).textContent).toContain("Z");
    expect(handle(root)!.parentElement).toBe(cell(root, 2, 0));
  });
});

describe("dragging the handle", () => {
  it("copies a text cell down, selects the result, and records one undo step", () => {
    const { core, api, root, column } = mountGrid();
    const sources: string[] = [];
    api.on("cellValueChanged", ev => sources.push(ev.source));
    select(core, 0, 0);
    drag(root, 3, 0);
    expect(column("name")).toEqual(["A", "A", "A", "A", "E", "F"]);
    expect(range(core)).toEqual([0, 3, 0, 0]);
    expect(core.getActiveCell()).toMatchObject({ row: 0, colIdx: 0 });
    expect(api.getHistoryState().undoDepth).toBe(1);
    expect(sources).toEqual(["fill", "fill", "fill"]);
    api.undo();
    expect(column("name")).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("extends a numeric series by default and copies it with the modifier", () => {
    const { core, root, column } = mountGrid();
    select(core, 0, 1, 1, 1); // 10, 20
    drag(root, 4, 1);
    expect(column("qty")).toEqual([10, 20, 30, 40, 50, 60]);

    core.setRowData(rows());
    select(core, 0, 1, 1, 1);
    drag(root, 3, 1, { ctrlKey: true });
    expect(column("qty")).toEqual([10, 20, 10, 20, 50, 60]);
  });

  it("copies a lone number by default and counts it up with the modifier", () => {
    const { core, root, column } = mountGrid();
    select(core, 2, 1); // 30
    drag(root, 4, 1);
    expect(column("qty")).toEqual([10, 20, 30, 30, 30, 60]);
    select(core, 2, 1);
    drag(root, 5, 1, { metaKey: true });
    expect(column("qty")).toEqual([10, 20, 30, 31, 32, 33]);
  });

  it("steps a lone date by a day and continues a dated series", () => {
    const { core, root, column } = mountGrid();
    select(core, 0, 2); // Jan 1
    drag(root, 2, 2);
    expect(column("when")).toEqual([
      new Date(2026, 0, 1), new Date(2026, 0, 2), new Date(2026, 0, 3),
      new Date(2026, 0, 4), new Date(2026, 0, 5), new Date(2026, 0, 6),
    ]);
    core.setRowData(rows().map(r => ({ ...r, when: new Date(2026, 0, 1) })));
    select(core, 0, 2, 1, 2); // Jan 1, Jan 1 → a flat series
    drag(root, 3, 2);
    expect(column("when").slice(0, 4)).toEqual(Array(4).fill(new Date(2026, 0, 1)));
  });

  it("counts text patterns up and cycles weekday names, copying them with the modifier", () => {
    const { core, api, root, column } = mountGrid();
    api.setRowData(rows().map((r, i) => ({ ...r, name: i === 0 ? "Item 1" : r.name, note: ["Mon", "Wed"][i] ?? r.note })));
    select(core, 0, 0); // "Item 1"
    drag(root, 3, 0);
    expect(column("name")).toEqual(["Item 1", "Item 2", "Item 3", "Item 4", "E", "F"]);

    select(core, 0, 3, 1, 3); // Mon, Wed
    drag(root, 4, 3);
    expect(column("note")).toEqual(["Mon", "Wed", "Fri", "Sun", "Tue", "nf"]);

    select(core, 0, 0);
    drag(root, 2, 0, { ctrlKey: true });
    expect(column("name")).toEqual(["Item 1", "Item 1", "Item 1", "Item 4", "E", "F"]);
  });

  it("fills upward by continuing the pattern backward", () => {
    const { core, root, column } = mountGrid();
    select(core, 3, 0, 4, 0); // D, E
    drag(root, 0, 0);
    expect(column("name")).toEqual(["E", "D", "E", "D", "E", "F"]);
    expect(range(core)).toEqual([0, 4, 0, 0]);
    expect(core.getActiveCell()).toMatchObject({ row: 4, colIdx: 0 });
  });

  it("fills across columns through the target's parser, refusing text its type cannot hold", () => {
    const { core, api, root, data } = mountGrid();
    select(core, 0, 1); // qty 10 (number)
    drag(root, 0, 3); // → when (date), note (string)
    // "10" is not a date, so the date column keeps its value; the string column takes the text.
    expect(data("r0").when).toEqual(new Date(2026, 0, 1));
    expect(data("r0").note).toBe("10");
    expect(range(core)).toEqual([0, 0, 1, 3]);
    expect(api.getHistoryState().undoDepth).toBe(1);

    core.setRowData(rows());
    select(core, 1, 3); // note nb
    drag(root, 1, 0); // ← when, qty, name
    expect(data("r1").name).toBe("nb");
    expect(data("r1").qty).toBe(20);
    expect(data("r1").when).toEqual(new Date(2026, 0, 2));
    expect(range(core)).toEqual([1, 1, 0, 3]);
    expect(core.getActiveCell()).toMatchObject({ row: 1, colIdx: 3 });

    // A date reaches a string column as its displayed text, and a string that IS a date reaches a
    // date column as a Date — the cell's stored shape. (Ctrl/Cmd: a lone date, or lone date text,
    // would otherwise step a day, sideways as much as downward.)
    core.setRowData(rows().map(r => ({ ...r, note: "2026-05-06" })));
    select(core, 2, 2); // when Jan 3
    drag(root, 2, 3, { ctrlKey: true });
    expect(data("r2").note).toBe("2026-01-03");
    select(core, 3, 3); // note "2026-05-06"
    drag(root, 3, 2, { ctrlKey: true });
    expect(data("r3").when).toEqual(new Date(2026, 4, 6));
    select(core, 4, 3); // the same text, stepping: leftward is the day before
    drag(root, 4, 2);
    expect(data("r4").when).toEqual(new Date(2026, 4, 5));
  });

  it("writes nothing, and records nothing, when every target refuses the text", () => {
    const { core, api, root, column } = mountGrid();
    select(core, 0, 0, 2, 0); // names A, B, C
    drag(root, 2, 1); // → qty
    expect(column("qty")).toEqual([10, 20, 30, 40, 50, 60]);
    expect(api.getHistoryState().undoDepth).toBe(0);
    expect(range(core)).toEqual([0, 2, 0, 1]);
  });

  it("skips non-editable cells and locked rows while keeping the pattern aligned", () => {
    const { core, root, column } = mountGrid({
      getRowPresentation: (params) => params.rowId === "r2" ? { editable: false } : undefined,
    });
    select(core, 0, 0, 1, 0); // A, B
    drag(root, 4, 0);
    // r2 keeps "C"; r3 and r4 still get the values their positions call for (B, A).
    expect(column("name")).toEqual(["A", "B", "C", "B", "A", "F"]);

    select(core, 0, 3, 0, 4); // note + locked (a non-editable column)
    drag(root, 2, 4);
    // r2 is still the locked row; the locked column is never written at all.
    expect(column("note")).toEqual(["na", "na", "nc", "nd", "ne", "nf"]);
    expect(column("locked")).toEqual(["L0", "L1", "L2", "L3", "L4", "L5"]);
  });

  it("previews the target with a dashed outline and clears it on release", () => {
    const { core, root } = mountGrid();
    select(core, 0, 0, 0, 1);
    pressHandle(root);
    expect(root.classList.contains("pte-fill-dragging")).toBe(true);
    moveOver(root, 2, 0);
    const top = cell(root, 1, 0);
    const bottomRight = cell(root, 2, 1);
    expect(top.classList.contains("pte-fill-preview")).toBe(true);
    expect(top.classList.contains("pte-fill-preview-top")).toBe(true);
    expect(top.classList.contains("pte-fill-preview-left")).toBe(true);
    expect(top.classList.contains("pte-fill-preview-bottom")).toBe(false);
    expect(bottomRight.classList.contains("pte-fill-preview-bottom")).toBe(true);
    expect(bottomRight.classList.contains("pte-fill-preview-right")).toBe(true);
    expect(cell(root, 0, 0).classList.contains("pte-fill-preview")).toBe(false);
    release();
    expect(root.classList.contains("pte-fill-dragging")).toBe(false);
    expect(root.querySelector(".pte-fill-preview")).toBeNull();
  });

  it("targets nothing from inside the source, and Escape abandons a drag", () => {
    const { core, root, column } = mountGrid();
    select(core, 0, 0, 1, 0);
    pressHandle(root);
    moveOver(root, 1, 0);
    expect(root.querySelector(".pte-fill-preview")).toBeNull();
    release();
    expect(column("name")).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(range(core)).toEqual([0, 1, 0, 0]);

    pressHandle(root);
    moveOver(root, 4, 0);
    expect(root.querySelector(".pte-fill-preview")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(root.querySelector(".pte-fill-preview")).toBeNull();
    release();
    expect(column("name")).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("honours a single-axis direction", () => {
    const { core, root, column } = mountGrid({ fillHandle: { direction: "x" } });
    select(core, 0, 0);
    drag(root, 3, 0);
    expect(column("name")).toEqual(["A", "B", "C", "D", "E", "F"]);
    drag(root, 0, 3);
    expect(column("note")[0]).toBe("A");
  });

  it("copy mode never produces a series, modifier or not", () => {
    const { core, root, column } = mountGrid({ fillHandle: { mode: "copy" } });
    select(core, 0, 1, 1, 1);
    drag(root, 3, 1, { ctrlKey: true });
    expect(column("qty")).toEqual([10, 20, 10, 20, 50, 60]);
    select(core, 0, 1, 1, 1);
    drag(root, 3, 1);
    expect(column("qty")).toEqual([10, 20, 10, 20, 50, 60]);
  });

});

describe("double-click on the handle", () => {
  const dblclick = (root: HTMLElement, mods: Partial<MouseEventInit> = {}) =>
    handle(root)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0, ...mods }));
  // The live region coalesces announcements for 150 ms before writing.
  const announced = async (root: HTMLElement) => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return root.querySelector<HTMLElement>(".pte-grid-sr-announcer")!.textContent;
  };
  // Gaps: `qty` is blank in r4 (its run below r0 is r1..r3), `when` is blank from r1 down.
  const sparse = () => rows().map((r, i) => ({
    ...r,
    qty: i === 4 ? "" : r.qty,
    when: i >= 1 ? null : r.when,
  }));

  it("fills down to the end of the data in the column to its left, selects the result, and never edits", async () => {
    const { core, api, root, column } = mountGrid();
    api.setRowData(sparse());
    select(core, 0, 1); // qty 10; the guide is `name`, filled to the bottom
    // The real gesture: two presses with no movement, then the double-click. Only the last writes.
    pressHandle(root);
    release();
    pressHandle(root);
    release();
    dblclick(root);
    expect(column("qty")).toEqual([10, 10, 10, 10, 10, 10]);
    expect(range(core)).toEqual([0, 5, 1, 1]);
    expect(core.getActiveCell()).toMatchObject({ row: 0, colIdx: 1 });
    expect(api.getHistoryState().undoDepth).toBe(1);
    expect(core.getEditingCell()).toBeNull();
    expect(await announced(root)).toContain("Filled 5 cells");
  });

  it("stops where the guide column goes blank, series and modifier as a drag would", () => {
    const { core, api, root, column } = mountGrid();
    api.setRowData(sparse());
    select(core, 0, 2); // Jan 1; the guide is `qty`, running r1..r3
    dblclick(root);
    expect(column("when")).toEqual([
      new Date(2026, 0, 1), new Date(2026, 0, 2), new Date(2026, 0, 3), new Date(2026, 0, 4), null, null,
    ]);

    api.setRowData(sparse());
    select(core, 0, 2);
    dblclick(root, { ctrlKey: true });
    expect(column("when")).toEqual([
      new Date(2026, 0, 1), new Date(2026, 0, 1), new Date(2026, 0, 1), new Date(2026, 0, 1), null, null,
    ]);
  });

  it("uses the column to its right when the left one is blank below the selection", () => {
    const { core, api, root, column } = mountGrid();
    api.setRowData(sparse());
    select(core, 0, 3); // note; `when` is blank in r1, so `locked` (filled, read-only) guides
    dblclick(root);
    expect(column("note")).toEqual(["na", "na", "na", "na", "na", "na"]);
  });

  it("does nothing with no data beside the selection, or from the last row", async () => {
    const { core, api, root, column } = mountGrid({}, columnDefs.slice(1, 2)); // qty alone
    select(core, 0, 0);
    dblclick(root);
    expect(column("qty")).toEqual([10, 20, 30, 40, 50, 60]);
    expect(api.getHistoryState().undoDepth).toBe(0);
    expect(await announced(root)).toContain("no data beside the selection");

    const bottom = mountGrid();
    select(bottom.core, 5, 1);
    dblclick(bottom.root);
    expect(bottom.column("qty")).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("a group row ends the run, so the fill stays inside its group", async () => {
    const defs = [...columnDefs, { colId: "dept", key: "dept", label: "Dept" }];
    const { core, api, root, column } = mountGrid({ groupDisplayType: "groupRows" }, defs);
    api.setRowData(rows().map((r, i) => ({ ...r, dept: i < 3 ? "a" : "b" })));
    core.dispatch({ type: "rowGroupSet", colIds: ["dept"] } as any);
    api.setAllGroupsExpanded(true);
    await new Promise(resolve => requestAnimationFrame(resolve));
    // View: group a, r0, r1, r2, group b, r3, r4, r5.
    select(core, 1, 1); // qty of r0
    dblclick(root);
    expect(column("qty")).toEqual([10, 10, 10, 40, 50, 60]);
  });

  it("is off with a columns-only direction", () => {
    const { core, api, root, column } = mountGrid({ fillHandle: { direction: "x" } });
    select(core, 0, 0);
    dblclick(root);
    expect(column("name")).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(api.getHistoryState().undoDepth).toBe(0);
  });
});

describe("redoing a fill the other way from the body menu", () => {
  function openMenu(root: HTMLElement, viewIdx: number, colIdx: number): string[] {
    cell(root, viewIdx, colIdx).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    return [...document.querySelectorAll<HTMLElement>(".pte-menu-item .pte-menu-item-text")].map(el => el.textContent ?? "");
  }
  function chooseItem(label: string) {
    const item = [...document.querySelectorAll<HTMLElement>(".pte-menu-item")]
      .find(el => el.querySelector(".pte-menu-item-text")?.textContent === label);
    if (!item) throw new Error(`no menu item "${label}"`);
    item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }
  const fillItems = (labels: string[]) => labels.filter(l => l === "Copy cells instead" || l === "Fill series instead");

  it("offers copies after a series, then the series again, each as its own undo step", () => {
    const { core, api, root, column } = mountGrid();
    // Zeros below the source: the fixture's own 30..60 IS the series, and a fill that changes
    // nothing records nothing.
    api.setRowData(rows().map((r, i) => ({ ...r, qty: i < 2 ? r.qty : 0 })));
    select(core, 0, 1, 1, 1); // 10, 20
    drag(root, 5, 1);
    expect(column("qty")).toEqual([10, 20, 30, 40, 50, 60]);
    expect(api.getHistoryState().undoDepth).toBe(1);

    expect(fillItems(openMenu(root, 4, 1))).toEqual(["Copy cells instead"]);
    chooseItem("Copy cells instead");
    expect(column("qty")).toEqual([10, 20, 10, 20, 10, 20]);
    expect(range(core)).toEqual([0, 5, 1, 1]);
    expect(api.getHistoryState().undoDepth).toBe(2);

    expect(fillItems(openMenu(root, 0, 1))).toEqual(["Fill series instead"]);
    chooseItem("Fill series instead");
    expect(column("qty")).toEqual([10, 20, 30, 40, 50, 60]);
    expect(api.getHistoryState().undoDepth).toBe(3);
  });

  it("offers a series after a lone number was copied, and nothing after plain text", () => {
    const { core, root, column } = mountGrid();
    select(core, 2, 1); // 30
    drag(root, 4, 1);
    expect(column("qty")).toEqual([10, 20, 30, 30, 30, 60]);
    expect(fillItems(openMenu(root, 3, 1))).toEqual(["Fill series instead"]);
    chooseItem("Fill series instead");
    expect(column("qty")).toEqual([10, 20, 30, 31, 32, 60]);

    select(core, 0, 0); // "A"
    drag(root, 2, 0);
    expect(fillItems(openMenu(root, 1, 0))).toEqual([]);
  });

  it("is offered only on the cells the fill covered, and never under copy mode", () => {
    const { core, root } = mountGrid();
    select(core, 0, 1, 1, 1);
    drag(root, 3, 1);
    expect(fillItems(openMenu(root, 2, 0))).toEqual([]); // beside the fill
    expect(fillItems(openMenu(root, 5, 1))).toEqual([]); // below it
    expect(fillItems(openMenu(root, 2, 1))).toEqual(["Copy cells instead"]);

    const copyOnly = mountGrid({ fillHandle: { mode: "copy" } });
    select(copyOnly.core, 0, 1, 1, 1);
    drag(copyOnly.root, 3, 1);
    expect(copyOnly.column("qty")).toEqual([10, 20, 10, 20, 50, 60]);
    expect(fillItems(openMenu(copyOnly.root, 2, 1))).toEqual([]);
  });

  it("is retired by any other write and by a change of row order", () => {
    const { core, api, root } = mountGrid();
    select(core, 0, 1, 1, 1);
    drag(root, 3, 1);
    api.setCellValue({ rowId: "r5", colId: core.getColumnModel().getByColId("name")!.instanceID }, "Z");
    expect(fillItems(openMenu(root, 2, 1))).toEqual([]);

    select(core, 0, 1, 1, 1);
    drag(root, 3, 1, { ctrlKey: true }); // copies; a series could be offered
    expect(fillItems(openMenu(root, 2, 1))).toEqual(["Fill series instead"]);
    core.dispatch({ type: "sortModelSet", sortItems: [{ key: "name", dir: "desc" }] });
    expect(fillItems(openMenu(root, 2, 1))).toEqual([]);
  });
});

describe("fillOperation", () => {
  it("sees the line, the grid's value, and the target cell, and its value is stored as given", () => {
    const seen: FillOperationParams[] = [];
    const { core, root, column } = mountGrid({
      fillOperation: params => {
        seen.push(params);
        return { value: (params.defaultValue as number) * 10 };
      },
    });
    select(core, 0, 1, 1, 1); // 10, 20
    drag(root, 3, 1);
    expect(column("qty")).toEqual([10, 20, 300, 400, 50, 60]);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({
      values: [10, 20], index: 2, direction: "down", lineMode: "series", defaultValue: 30, oldValue: 30,
      rowId: "r2", colId: "qty", trigger: "drag",
    });
    expect(seen[0].colInstanceId).toBe(core.getColumnModel().getByColId("qty")!.instanceID);
    expect(seen[0].node.id).toBe("r2");
    expect(seen[1]).toMatchObject({ index: 3, defaultValue: 40, rowId: "r3" });
  });

  it("skips a cell, keeping the pattern aligned and the count honest; skipCell beats value", async () => {
    const { core, root, column } = mountGrid({
      fillOperation: ({ rowId }) => (rowId === "r3" ? { skipCell: true, value: "never" } as any : undefined),
    });
    select(core, 0, 0); // "A"
    drag(root, 4, 0);
    expect(column("name")).toEqual(["A", "A", "A", "D", "A", "F"]);
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(root.querySelector(".pte-grid-sr-announcer")!.textContent).toContain("Filled 3 cells");
  });

  it("keeps the grid's own value when it returns nothing, crossing column types as a plain fill would", () => {
    let calls = 0;
    const { core, root, column, data } = mountGrid({
      // `{}` is what a JavaScript caller may hand back; the TypeScript type is deliberately stricter.
      fillOperation: () => { calls++; return calls % 3 === 0 ? ({} as FillOperationResult) : calls % 3 === 1 ? null : undefined; },
    });
    select(core, 0, 1, 1, 1);
    drag(root, 3, 1);
    expect(column("qty")).toEqual([10, 20, 30, 40, 50, 60]);
    select(core, 2, 2); // when: Jan 3 → note (string) as its text, through the usual crossing
    drag(root, 2, 3, { ctrlKey: true });
    expect(data("r2").note).toBe("2026-01-03");
    expect(calls).toBeGreaterThan(0);
  });

  it("runs for the keyboard and double-click forms, naming the trigger", () => {
    const triggers: string[] = [];
    const modes: string[] = [];
    const { core, root, column } = mountGrid({
      fillOperation: ({ trigger, lineMode }) => { triggers.push(trigger); modes.push(lineMode); return undefined; },
    });
    select(core, 0, 1, 2, 1); // 10, 20, 30
    press(root, "d", { ctrlKey: true });
    expect(column("qty")).toEqual([10, 10, 10, 40, 50, 60]);
    expect(triggers).toEqual(["command", "command"]);
    expect(modes).toEqual(["copy", "copy"]);

    select(core, 0, 0);
    handle(root)!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, button: 0 }));
    expect(column("name")).toEqual(["A", "A", "A", "A", "A", "A"]);
    expect(triggers.slice(2)).toEqual(Array(5).fill("doubleClick"));
  });
});

describe("Ctrl/Cmd+D and Ctrl/Cmd+R", () => {
  it("fills the selection down from its first row and keeps the selection", () => {
    const { core, root, column } = mountGrid();
    select(core, 1, 0, 3, 1);
    expect(press(root, "d", { ctrlKey: true })).toBe(true);
    expect(column("name")).toEqual(["A", "B", "B", "B", "E", "F"]);
    expect(column("qty")).toEqual([10, 20, 20, 20, 50, 60]);
    expect(range(core)).toEqual([1, 3, 0, 1]);
  });

  it("a single cell takes the value above, and the top row has nothing to take", () => {
    const { core, root, column } = mountGrid();
    select(core, 2, 0);
    press(root, "d", { metaKey: true });
    expect(column("name")).toEqual(["A", "B", "B", "D", "E", "F"]);
    select(core, 0, 0);
    expect(press(root, "d", { ctrlKey: true })).toBe(true);
    expect(column("name")).toEqual(["A", "B", "B", "D", "E", "F"]);
  });

  it("fills right from the first column; a single cell takes the column to its left", () => {
    const { core, root, data } = mountGrid();
    select(core, 0, 2, 0, 3); // when, note
    expect(press(root, "r", { ctrlKey: true })).toBe(true);
    expect(data("r0").note).toBe("2026-01-01");
    expect(range(core)).toEqual([0, 0, 2, 3]);

    // A name is not a number: the number column refuses it and keeps its value.
    select(core, 0, 0, 0, 1); // name, qty
    expect(press(root, "r", { ctrlKey: true })).toBe(true);
    expect(data("r0").qty).toBe(10);

    select(core, 1, 3); // note
    press(root, "r", { ctrlKey: true });
    // The column to the left is the date column: its Date reaches the string column as the text
    // the date column displays, exactly what a paste would carry.
    expect(data("r1").note).toBe("2026-01-02");
  });

  it("is a copy even where a drag would make a series", () => {
    const { core, root, column } = mountGrid();
    select(core, 0, 1, 3, 1);
    press(root, "d", { ctrlKey: true });
    expect(column("qty")).toEqual([10, 10, 10, 10, 50, 60]);
  });

  it("declines when the handle is off or the axis is not allowed, leaving the key to the page", () => {
    const off = mountGrid({ fillHandle: false });
    select(off.core, 0, 0, 2, 0);
    expect(press(off.root, "d", { ctrlKey: true })).toBe(false);
    expect(off.column("name")).toEqual(["A", "B", "C", "D", "E", "F"]);

    const rowsOnly = mountGrid({ fillHandle: { direction: "y" } });
    select(rowsOnly.core, 0, 0, 0, 1);
    expect(press(rowsOnly.root, "r", { ctrlKey: true })).toBe(false);
    expect(press(rowsOnly.root, "d", { ctrlKey: true })).toBe(true);
  });

  it("reports the chords in the shortcut table beside their menu commands", () => {
    const { api } = mountGrid();
    const rows = api.getKeyboardShortcuts();
    expect(rows.find(row => row.id === "fillDown")).toMatchObject({ scope: "bodyCursor", command: "body.fillDown" });
    expect(rows.find(row => row.id === "fillRight")).toMatchObject({ scope: "bodyCursor", command: "body.fillRight" });
  });
});
