// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import type { ColDef } from "../../interfaces/column";
import type { GridEventColumnWidthsChangedParams } from "../../events/events";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";
import { findHeaderCell } from "../header/headerCellLookup";
import { DOUBLE_TAP_MS, LONG_PRESS_MS, resetTouchModalityForTests, TOUCH_SLOP_PX } from "./touchGestures";

/**
 * Touch and pen gestures end to end on a mounted grid: tap, double tap, long press, pan, column
 * resize and move on the header, the fill handle — and that the compatibility mouse events a
 * browser fires after a tap are not handled a second time, while plain mouse input is untouched.
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
  { colId: "note", key: "note", label: "Note", editable: true },
];

let destroy: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  resetTouchModalityForTests();
});

afterEach(() => {
  destroy?.();
  destroy = null;
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function mountGrid(options: Partial<GridOptions> = {}, defs: ColDef[] = columnDefs) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(defs);
  api.setRowData(Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`, name: String.fromCharCode(65 + i), qty: (i + 1) * 10, note: `n${i}`,
  })));
  destroy = () => api.destroy();
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  const hcell = (colId: string) =>
    findHeaderCell(root, core.getColumnModel().getLeaves().find(c => c.colId === colId)!.instanceID)!;
  const data = (id: string) => core.getRowModel().getRowNode(id)!.data as Record<string, unknown>;
  return { core, api, root, hcell, data };
}

function cell(root: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  const rowEls = root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`);
  for (let i = 0; i < rowEls.length; i++) {
    const found = rowEls[i].querySelector<HTMLElement>(`.pte-cell[data-col-idx="${colIdx}"]`);
    if (found) return found;
  }
  throw new Error(`no cell at ${viewIdx}/${colIdx}`);
}

function checkboxCell(root: HTMLElement, viewIdx: number): HTMLElement {
  const row = Array.from(root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`))
    .find(r => r.querySelector(".pte-checkbox-cell"))!;
  return row.querySelector<HTMLElement>(".pte-checkbox-cell")!;
}

type Pt = { x?: number; y?: number; type?: string; id?: number };

function pointer(el: EventTarget, kind: string, { x = 20, y = 20, type = "touch", id = 1 }: Pt = {}) {
  const event = new PointerEvent(kind, {
    pointerType: type, pointerId: id, clientX: x, clientY: y, button: 0,
    bubbles: true, cancelable: true, composed: true,
  });
  el.dispatchEvent(event);
  return event;
}

function mouse(el: EventTarget, kind: string, { x = 20, y = 20 }: Pt = {}, init: MouseEventInit = {}) {
  const event = new MouseEvent(kind, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

/** A tap as a browser delivers it: pointer events, then the compatibility mouse events and click. */
function tap(el: HTMLElement, at: Pt = {}) {
  pointer(el, "pointerdown", at);
  pointer(el, "pointerup", at);
  mouse(el, "mousemove", at);
  mouse(el, "mousedown", at);
  mouse(el, "mouseup", at);
  mouse(el, "click", at);
}

const range = (core: GridCore) => {
  const r = core.getSelectionRange();
  return r ? [r.rowStart, r.rowEnd, r.colStart, r.colEnd] : null;
};

describe("tap", () => {
  it("selects the cell once, ignoring the compatibility mouse events that follow", () => {
    const { core, root } = mountGrid();
    const spy = vi.spyOn(core, "dispatch");
    tap(cell(root, 2, 1));
    expect(range(core)).toEqual([2, 2, 1, 1]);
    expect(spy.mock.calls.filter(([a]) => a.type === "rangeSelectSet")).toHaveLength(1);
    expect(document.activeElement).toBe(root);
  });

  it("ticks a selection checkbox exactly once (a second handling would untick it)", () => {
    const { core, root } = mountGrid({ rowSelection: { checkboxes: true } as any });
    tap(checkboxCell(root, 1));
    expect(core.isRowSelected("r1")).toBe(true);
    tap(checkboxCell(root, 3), { x: 200, y: 200 });
    expect(core.isRowSelected("r1")).toBe(true);
    expect(core.isRowSelected("r3")).toBe(true);
  });

  it("emits rowClicked / cellClicked once, carrying the click", () => {
    const { api, root } = mountGrid();
    const rows: unknown[] = [];
    const cells: unknown[] = [];
    api.on("rowClicked", ev => rows.push(ev.event));
    api.on("cellClicked", ev => cells.push(ev.event));
    tap(cell(root, 0, 0));
    expect(rows).toHaveLength(1);
    expect(cells).toHaveLength(1);
    expect((rows[0] as MouseEvent).type).toBe("click");
  });

  it("prevents the compat mousedown the tap's mouse path claimed (an editor must keep focus)", () => {
    const { root } = mountGrid();
    const target = cell(root, 0, 0);
    pointer(target, "pointerdown");
    pointer(target, "pointerup");
    expect(mouse(target, "mousedown").defaultPrevented).toBe(true);
  });

  it("opens the editor on tap with editTrigger singleClick", () => {
    const { core, root } = mountGrid({ editTrigger: "singleClick" });
    tap(cell(root, 1, 0));
    expect(core.getEditingCell()).toMatchObject({ rowId: "r1", colId: "name" });
  });

  it("a pen is handled like a finger", () => {
    const { core, root } = mountGrid({ rowSelection: { checkboxes: true } as any });
    const box = checkboxCell(root, 2);
    pointer(box, "pointerdown", { type: "pen" });
    // A pen's compatibility mouse events arrive while it is still down.
    mouse(box, "mousedown");
    pointer(box, "pointerup", { type: "pen" });
    mouse(box, "mouseup");
    mouse(box, "click");
    expect(core.isRowSelected("r2")).toBe(true);
  });
});

describe("pan", () => {
  it("does not select when the finger leaves the slop, whether the browser cancels or not", () => {
    const { core, root } = mountGrid();
    const target = cell(root, 1, 1);
    pointer(target, "pointerdown", { y: 20 });
    pointer(target, "pointermove", { y: 20 + TOUCH_SLOP_PX + 5 });
    pointer(target, "pointercancel", { y: 40 });
    expect(range(core)).toBeNull();

    pointer(target, "pointerdown", { y: 20 });
    pointer(target, "pointermove", { y: 60 });
    pointer(target, "pointerup", { y: 60 });
    expect(range(core)).toBeNull();
  });

  it("a small wobble under the slop is still a tap", () => {
    const { core, root } = mountGrid();
    const target = cell(root, 3, 0);
    pointer(target, "pointerdown", { x: 20, y: 20 });
    pointer(target, "pointermove", { x: 24, y: 26 });
    pointer(target, "pointerup", { x: 24, y: 26 });
    expect(range(core)).toEqual([3, 3, 0, 0]);
  });
});

describe("double tap", () => {
  it("starts editing like a double click, after the second tap's click", () => {
    const { core, root, api } = mountGrid();
    const dbl: unknown[] = [];
    api.on("cellDoubleClicked", ev => dbl.push(ev.event));
    const target = cell(root, 2, 2);
    tap(target);
    vi.advanceTimersByTime(100);
    tap(target);
    expect(core.getEditingCell()).toMatchObject({ rowId: "r2", colId: "note" });
    // The browser's own dblclick for the same double tap is swallowed.
    mouse(target, "dblclick");
    expect(dbl).toHaveLength(0); // editing consumed the gesture, as on the mouse path
  });

  it("emits cellDoubleClicked once on a read-only cell even when the browser fires dblclick too", () => {
    const { api, root } = mountGrid({}, columnDefs.map(d => ({ ...d, editable: false })));
    const dbl: unknown[] = [];
    api.on("cellDoubleClicked", ev => dbl.push(ev));
    const target = cell(root, 0, 0);
    tap(target);
    tap(target);
    mouse(target, "dblclick");
    expect(dbl).toHaveLength(1);
  });

  it("two taps further apart in time are two taps", () => {
    const { core, root } = mountGrid();
    const target = cell(root, 2, 2);
    tap(target);
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 100);
    tap(target);
    vi.advanceTimersByTime(1000);
    expect(core.getEditingCell()).toBeNull();
  });
});

describe("long press", () => {
  it("opens the body menu once on the pressed cell and swallows the click on release", () => {
    const getter = vi.fn(({ items }) => items);
    const { core, api, root } = mountGrid({ bodyContextMenu: getter });
    const clicks: unknown[] = [];
    api.on("rowClicked", ev => clicks.push(ev));
    const target = cell(root, 3, 1);
    pointer(target, "pointerdown", { x: 50, y: 60 });
    vi.advanceTimersByTime(LONG_PRESS_MS - 10);
    expect(getter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(getter.mock.calls[0][0]).toMatchObject({ ctx: { rowId: "r3" } });
    expect(core.getActiveCell()).toMatchObject({ row: 3, colIdx: 1 });
    // Chrome on Android fires its own contextmenu for the same press: not a second menu.
    const native = mouse(target, "contextmenu", { x: 50, y: 60 });
    expect(native.defaultPrevented).toBe(true);
    pointer(target, "pointerup", { x: 50, y: 60 });
    mouse(target, "click", { x: 50, y: 60 });
    expect(getter).toHaveBeenCalledTimes(1);
    expect(clicks).toHaveLength(0);
    expect(document.querySelectorAll(".pte-menu").length).toBeGreaterThan(0);
  });

  it("lets the browser's long-press contextmenu open it when that comes first, without the timer opening another", () => {
    const getter = vi.fn(({ items }) => items);
    const { core, root } = mountGrid({ bodyContextMenu: getter });
    const target = cell(root, 1, 0);
    pointer(target, "pointerdown");
    vi.advanceTimersByTime(400);
    mouse(target, "contextmenu");
    expect(getter).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    pointer(target, "pointerup");
    expect(getter).toHaveBeenCalledTimes(1);
    // Releasing a long press is not a tap.
    expect(core.getSelectionRange()).toMatchObject({ rowStart: 1, colStart: 0 });
  });

  it("is cancelled by a pan", () => {
    const getter = vi.fn(({ items }) => items);
    const { root } = mountGrid({ bodyContextMenu: getter });
    const target = cell(root, 1, 0);
    pointer(target, "pointerdown");
    pointer(target, "pointermove", { y: 60 });
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(getter).not.toHaveBeenCalled();
  });

  it("opens the column menu once on a header cell", () => {
    const columnMenu = vi.fn(({ items }) => items);
    const { hcell } = mountGrid({ defaultColDef: { columnMenu } as any });
    const header = hcell("qty");
    const content = header.querySelector<HTMLElement>(".pte-hcell-content") ?? header;
    pointer(content, "pointerdown", { x: 150, y: 10 });
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(columnMenu).toHaveBeenCalledTimes(1);
    mouse(content, "contextmenu", { x: 150, y: 10 });
    pointer(content, "pointerup", { x: 150, y: 10 });
    mouse(content, "click", { x: 150, y: 10 });
    expect(columnMenu).toHaveBeenCalledTimes(1);
  });
});

describe("column resize by touch", () => {
  it("emits intermediate widths and one final, like the mouse drag", () => {
    const { core, hcell, api } = mountGrid();
    const events: GridEventColumnWidthsChangedParams[] = [];
    api.on("columnWidthsChanged", ev => events.push(ev));
    const header = hcell("name");
    header.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 30, height: 30 } as DOMRect);
    const handle = header.querySelector<HTMLElement>(".pte-hcell-resize-handle")!;
    pointer(handle, "pointerdown", { x: 100, y: 10 });
    pointer(handle, "pointermove", { x: 130, y: 10 });
    pointer(handle, "pointermove", { x: 160, y: 10 });
    pointer(handle, "pointerup", { x: 160, y: 10 });
    expect(events.map(e => e.final)).toEqual([false, false, true]);
    expect(events[2].changedColIds).toEqual(["name"]);
    expect(core.getColumnModel().getByColId("name")!.resizedWidth).toBe(160);
    // The click the release leaves behind does not sort the column.
    mouse(handle, "click", { x: 160, y: 10 });
    expect(api.getSortModel()).toEqual([]);
  });

  it("settles at the current width when the browser cancels", () => {
    const { hcell, api } = mountGrid();
    const events: GridEventColumnWidthsChangedParams[] = [];
    api.on("columnWidthsChanged", ev => events.push(ev));
    const header = hcell("name");
    header.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 30, height: 30 } as DOMRect);
    const handle = header.querySelector<HTMLElement>(".pte-hcell-resize-handle")!;
    pointer(handle, "pointerdown", { x: 100 });
    pointer(handle, "pointermove", { x: 140 });
    pointer(handle, "pointercancel", { x: 140 });
    expect(events.map(e => e.final)).toEqual([false, true]);
    pointer(handle, "pointermove", { x: 200 });
    expect(events).toHaveLength(2);
  });

  it("double tap on the handle autosizes", () => {
    const { core, hcell } = mountGrid();
    const spy = vi.spyOn(core, "dispatch");
    const handle = hcell("name").querySelector<HTMLElement>(".pte-hcell-resize-handle")!;
    tap(handle, { x: 100, y: 10 });
    tap(handle, { x: 100, y: 10 });
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 10);
    expect(spy.mock.calls.filter(([a]) => a.type === "columnAutosize")).toHaveLength(1);
  });
});

describe("column move by touch", () => {
  function layoutHeaders(hcell: (id: string) => HTMLElement) {
    ["name", "qty", "note"].forEach((id, i) => {
      hcell(id).getBoundingClientRect = () =>
        ({ left: i * 100, right: (i + 1) * 100, width: 100, top: 0, bottom: 30, height: 30, x: i * 100, y: 0 } as DOMRect);
    });
  }
  const order = (core: GridCore) => core.getColumnModel().getLeaves().map(c => c.colId);

  it("a horizontal drag on a header cell reorders the column with the drag ghost", () => {
    const { core, hcell } = mountGrid();
    layoutHeaders(hcell);
    const header = hcell("name");
    pointer(header, "pointerdown", { x: 50, y: 10 });
    pointer(header, "pointermove", { x: 50 + TOUCH_SLOP_PX + 5, y: 12 });
    expect(document.querySelector(".pte-column-drag-ghost")).not.toBeNull();
    pointer(header, "pointermove", { x: 250, y: 12 });
    pointer(header, "pointerup", { x: 250, y: 12 });
    expect(order(core)).toEqual(["qty", "note", "name"]);
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".pte-column-drag-ghost")).toBeNull();
  });

  it("does not move a column that is not movable", () => {
    const { core, hcell } = mountGrid({}, columnDefs.map(d => d.colId === "name" ? { ...d, movable: false } : d));
    layoutHeaders(hcell);
    const header = hcell("name");
    pointer(header, "pointerdown", { x: 50, y: 10 });
    pointer(header, "pointermove", { x: 150, y: 10 });
    pointer(header, "pointermove", { x: 250, y: 10 });
    pointer(header, "pointerup", { x: 250, y: 10 });
    expect(order(core)).toEqual(["name", "qty", "note"]);
  });

  it("a vertical swipe is a pan, not a drag", () => {
    const { core, hcell } = mountGrid();
    layoutHeaders(hcell);
    const header = hcell("name");
    pointer(header, "pointerdown", { x: 50, y: 10 });
    pointer(header, "pointermove", { x: 52, y: 60 });
    pointer(header, "pointermove", { x: 250, y: 80 });
    pointer(header, "pointerup", { x: 250, y: 80 });
    expect(order(core)).toEqual(["name", "qty", "note"]);
    expect(document.querySelector(".pte-column-drag-ghost")).toBeNull();
  });

  it("pointercancel aborts the drag without a drop, a ghost or listeners left behind", () => {
    const { core, hcell, root } = mountGrid();
    layoutHeaders(hcell);
    const added: string[] = [];
    const removed: string[] = [];
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const header = hcell("name");
    pointer(header, "pointerdown", { x: 50, y: 10 });
    pointer(header, "pointermove", { x: 150, y: 10 });
    pointer(header, "pointermove", { x: 250, y: 10 });
    pointer(header, "pointercancel", { x: 250, y: 10 });
    for (const [type] of add.mock.calls) if (String(type).startsWith("pointer")) added.push(String(type));
    for (const [type] of remove.mock.calls) if (String(type).startsWith("pointer")) removed.push(String(type));
    expect(added.length).toBeGreaterThan(0);
    expect(removed.sort()).toEqual(added.sort());
    vi.advanceTimersByTime(300);
    expect(order(core)).toEqual(["name", "qty", "note"]);
    expect(document.querySelector(".pte-column-drag-ghost")).toBeNull();
    expect(root.querySelector(".pte-column-drop-indicator")).toBeNull();
    expect(root.classList.contains("pte-column-dragging")).toBe(false);
  });
});

describe("fill handle by touch", () => {
  function select(core: GridCore, r: number, c: number) {
    core.dispatch({ type: "rangeSelectSet", viewIdx: r, colIdx: c, mode: "start" });
  }

  it("dragging the handle fills the cells under the finger", () => {
    const { core, root, data } = mountGrid();
    select(core, 0, 0);
    const grip = root.querySelector<HTMLElement>(".pte-fill-handle")!;
    const over = cell(root, 3, 0);
    const original = (document as any).elementFromPoint;
    (document as any).elementFromPoint = () => over;
    try {
      pointer(grip, "pointerdown", { x: 90, y: 30 });
      pointer(grip, "pointermove", { x: 90, y: 120 });
      pointer(grip, "pointerup", { x: 90, y: 120 });
    } finally {
      (document as any).elementFromPoint = original;
    }
    expect([0, 1, 2, 3, 4].map(i => data(`r${i}`).name)).toEqual(["A", "A", "A", "A", "E"]);
  });

  it("pointercancel abandons the fill without writing", () => {
    const { core, root, data } = mountGrid();
    select(core, 0, 0);
    const grip = root.querySelector<HTMLElement>(".pte-fill-handle")!;
    const over = cell(root, 3, 0);
    const original = (document as any).elementFromPoint;
    (document as any).elementFromPoint = () => over;
    try {
      pointer(grip, "pointerdown", { x: 90, y: 30 });
      pointer(grip, "pointermove", { x: 90, y: 120 });
      pointer(grip, "pointercancel", { x: 90, y: 120 });
    } finally {
      (document as any).elementFromPoint = original;
    }
    expect(data("r1").name).toBe("B");
    expect(root.classList.contains("pte-fill-dragging")).toBe(false);
  });

  it("double tap on the handle fills to the end of the adjacent block", () => {
    const { core, root, data } = mountGrid();
    // The guide column (qty, right of name) holds data all the way down.
    select(core, 0, 0);
    const grip = () => root.querySelector<HTMLElement>(".pte-fill-handle")!;
    tap(grip(), { x: 90, y: 30 });
    tap(grip(), { x: 90, y: 30 });
    expect([0, 1, 2, 3, 4, 5].map(i => data(`r${i}`).name)).toEqual(["A", "A", "A", "A", "A", "A"]);
  });
});

describe("mouse input is unchanged", () => {
  it("a mousedown with no touch before it selects, and a mouse after a touch is not filtered", () => {
    const { core, root } = mountGrid();
    mouse(cell(root, 1, 1), "mousedown");
    expect(range(core)).toEqual([1, 1, 1, 1]);
    tap(cell(root, 2, 2));
    expect(range(core)).toEqual([2, 2, 2, 2]);
    // A real mouse announces itself with a mouse pointerdown before its mousedown.
    pointer(cell(root, 4, 0), "pointerdown", { type: "mouse" });
    mouse(cell(root, 4, 0), "mousedown");
    expect(range(core)).toEqual([4, 4, 0, 0]);
  });

  it("mouse pointer events alone do nothing", () => {
    const { core, root } = mountGrid();
    pointer(cell(root, 1, 1), "pointerdown", { type: "mouse" });
    pointer(cell(root, 1, 1), "pointerup", { type: "mouse" });
    expect(range(core)).toBeNull();
  });

  it("compat events are only filtered near the touch point and inside the window", () => {
    const { core, root } = mountGrid();
    tap(cell(root, 2, 2));
    mouse(cell(root, 0, 0), "mousedown", { x: 400, y: 400 });
    expect(range(core)).toEqual([0, 0, 0, 0]);
    tap(cell(root, 2, 2));
    vi.advanceTimersByTime(1000);
    mouse(cell(root, 1, 0), "mousedown");
    expect(range(core)).toEqual([1, 1, 0, 0]);
  });
});

describe("hover after a tap", () => {
  it("the mouseover a tap leaves behind does not highlight the row or column", () => {
    const { root } = mountGrid({ rowHover: true, columnHover: true });
    const target = cell(root, 1, 1);
    pointer(target, "pointerdown");
    pointer(target, "pointerup");
    mouse(target, "mouseover");
    expect(root.querySelector(".pte-row-hover")).toBeNull();
    expect(root.querySelector(".pte-col-hover")).toBeNull();
    // A mouse hover still highlights.
    vi.advanceTimersByTime(1000);
    mouse(target, "mouseover");
    expect(root.querySelector(".pte-row-hover")).not.toBeNull();
    expect(root.querySelector(".pte-col-hover")).not.toBeNull();
  });
});

describe("renderer controls", () => {
  const defs: ColDef[] = [
    ...columnDefs,
    { colId: "done", key: "done", label: "Done", type: ColumnType.BOOLEAN, editable: true },
  ];

  it("a tap toggles the boolean box once; a double tap toggles twice and opens no editor; holding it opens no menu", () => {
    const getter = vi.fn(({ items }) => items);
    const { core, root, data } = mountGrid({ bodyContextMenu: getter }, defs);
    const box = () => cell(root, 1, 3).querySelector<HTMLElement>(".pte-cell-boolean-box")!;
    expect(data("r1").done).toBeUndefined();
    tap(box());
    expect(data("r1").done).toBe(true);
    tap(box());
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 10);
    expect(data("r1").done).toBe(false);
    expect(core.getEditingCell()).toBeNull();
    pointer(box(), "pointerdown");
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    pointer(box(), "pointerup");
    expect(getter).not.toHaveBeenCalled();
  });
});
