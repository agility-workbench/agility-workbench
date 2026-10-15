// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { ClipboardRenderer } from "./clipboardRenderer";
import { ColumnType } from "../../interfaces/column";
import { ITextMeasurer } from "../../interfaces/iTextMeasure";
import type { GridOptions } from "../../interfaces/gridOptions";

/**
 * The `paste`-event path (A2.1): browsers that refuse `navigator.clipboard.readText` still deliver
 * Ctrl/Cmd+V as a `paste` event carrying the text, and the grid applies it through the same
 * pipeline as `api.paste()`.
 */

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeCore(options: GridOptions = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([
    { id: "1", name: "alice", qty: 3, locked: "L1" },
    { id: "2", name: "bob", qty: 7, locked: "L2" },
    { id: "3", name: "carol", qty: 9, locked: "L3" },
  ]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
    { colId: "locked", key: "locked", label: "Locked" },
  ]);
  return core;
}

function rows(core: GridCore) {
  return ["1", "2", "3"].map(id => {
    const { name, qty, locked } = core.getRowModel().getRowNode(id)!.data;
    return { name, qty, locked };
  });
}

/** A `paste` event carrying `text` as text/plain, dispatched at `target`. */
function pasteEvent(text: string): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text/plain" ? text : "") },
  });
  return event;
}

function selectBlock(core: GridCore) {
  // name..qty on rows 1..2: a 2×2 range.
  core.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
  core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 1, mode: "extend" });
}

let root: HTMLElement;
let cell: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  cell = document.createElement("div");
  root.appendChild(cell);
  document.body.appendChild(root);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("paste event on the grid root", () => {
  it("pastes into the selected range exactly as api.paste() does", async () => {
    const text = "x\t1\ny\t2";

    const viaApi = makeCore();
    selectBlock(viaApi);
    await new ClipboardRenderer({ core: viaApi, readText: async () => text }).paste();

    const viaEvent = makeCore();
    selectBlock(viaEvent);
    const clip = new ClipboardRenderer({ core: viaEvent, root });
    const event = pasteEvent(text);
    cell.dispatchEvent(event);

    expect(rows(viaEvent)).toEqual(rows(viaApi));
    expect(rows(viaEvent)[0]).toEqual({ name: "x", qty: 1, locked: "L1" });
    expect(viaEvent.getSelectionRange()).toEqual(viaApi.getSelectionRange());
    // Consumed: the grid claims the event.
    expect(event.defaultPrevented).toBe(true);
    clip.destroy();
  });

  it("is ignored while a cell editor is open, and leaves the event to it", () => {
    const core = makeCore();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    new ClipboardRenderer({ core, root });
    core.dispatch({ type: "editStart", cell: { rowId: "1", colId: core.getColumnModel().getLeaves()[0].instanceID }, source: "keyboard" });
    expect(core.getEditingCell()).not.toBeNull();

    const event = pasteEvent("hijacked");
    cell.dispatchEvent(event);
    expect(rows(core)[0].name).toBe("alice");
    expect(event.defaultPrevented).toBe(false);
  });

  it("is ignored when the target is a form control inside the grid (the editor input)", () => {
    const core = makeCore();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    new ClipboardRenderer({ core, root });
    const input = document.createElement("input");
    root.appendChild(input);

    const event = pasteEvent("hijacked");
    input.dispatchEvent(event);
    expect(rows(core)[0].name).toBe("alice");
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores a paste whose target is outside the grid", () => {
    const core = makeCore();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    const clip = new ClipboardRenderer({ core, root });
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const event = pasteEvent("hijacked");
    outside.dispatchEvent(event);
    expect(clip.handlePasteEvent(event as ClipboardEvent)).toBe(false);
    expect(rows(core)[0].name).toBe("alice");
  });

  it("does not claim the event when nothing is written (no cursor, or a read-only target)", () => {
    const core = makeCore();
    new ClipboardRenderer({ core, root });
    const noCursor = pasteEvent("x");
    cell.dispatchEvent(noCursor);
    expect(noCursor.defaultPrevented).toBe(false);

    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 2 }); // locked
    const readOnly = pasteEvent("x");
    cell.dispatchEvent(readOnly);
    expect(readOnly.defaultPrevented).toBe(false);
    expect(rows(core)[0].locked).toBe("L1");
  });

  it("is ignored while cell selection is off (the keyboard cursor is dark)", () => {
    const core = makeCore({ cellSelection: false });
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    new ClipboardRenderer({ core, root });
    cell.dispatchEvent(pasteEvent("x"));
    expect(rows(core)[0].name).toBe("alice");
  });

  it("stops listening after destroy()", () => {
    const core = makeCore();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    new ClipboardRenderer({ core, root }).destroy();
    cell.dispatchEvent(pasteEvent("x"));
    expect(rows(core)[0].name).toBe("alice");
  });
});

describe("Ctrl/Cmd+V shortcut", () => {
  it("uses the paste event when one arrives, without reading the async clipboard", async () => {
    vi.useFakeTimers();
    const core = makeCore();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    const readText = vi.fn(async () => "from-readText");
    const clip = new ClipboardRenderer({ core, root, readText });
    clip.pasteFromShortcut();
    cell.dispatchEvent(pasteEvent("from-event"));
    await vi.runAllTimersAsync();
    expect(readText).not.toHaveBeenCalled();
    expect(rows(core)[0].name).toBe("from-event");
  });

  it("falls back to readText when the browser fires no paste event", async () => {
    vi.useFakeTimers();
    const core = makeCore();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    const readText = vi.fn(async () => "from-readText");
    const clip = new ClipboardRenderer({ core, root, readText });
    clip.pasteFromShortcut();
    await vi.runAllTimersAsync();
    expect(readText).toHaveBeenCalledTimes(1);
    expect(rows(core)[0].name).toBe("from-readText");
  });
});

describe("api.paste() when the async clipboard is refused", () => {
  it("warns once, pointing at Ctrl+V / Cmd+V, and writes nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const core = makeCore();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    const clip = new ClipboardRenderer({
      core,
      readText: () => Promise.reject(new DOMException("Read permission denied.", "NotAllowedError")),
    });
    await clip.paste();
    await clip.paste();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/Ctrl\+V \/ Cmd\+V/);
    expect(String(warn.mock.calls[0][0])).toMatch(/Read permission denied/);
    expect(error).not.toHaveBeenCalled();
    expect(rows(core)[0].name).toBe("alice");
  });

  it("warns the same way when navigator.clipboard.readText does not exist", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const core = makeCore();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    const clipboard = (navigator as any).clipboard;
    const original = clipboard ? Object.getOwnPropertyDescriptor(clipboard, "readText") : undefined;
    if (clipboard) Object.defineProperty(clipboard, "readText", { value: undefined, configurable: true });
    try {
      await new ClipboardRenderer({ core }).paste();
    } finally {
      if (clipboard) {
        if (original) Object.defineProperty(clipboard, "readText", original);
        else delete clipboard.readText;
      }
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/Ctrl\+V \/ Cmd\+V/);
  });
});

describe("a mounted grid", () => {
  it("wires the root's paste listener: a paste event at the focused root writes the cells", async () => {
    const { createGrid } = await import("../../createGrid");
    (HTMLCanvasElement.prototype as any).getContext = () => ({
      font: "",
      measureText: (t: string) => ({ width: t.length * 7 }),
    });
    const host = document.createElement("div");
    Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(host);
    const api = createGrid(host, {
      rowIdKey: "id",
      columnDefs: [{ colId: "name", key: "name", label: "Name", editable: true }],
      rowData: [{ id: "1", name: "alice" }, { id: "2", name: "bob" }],
    });
    const gridRoot = host.querySelector<HTMLElement>(".pte-root")!;
    api.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 0, reason: "mouse" });
    const event = pasteEvent("pasted");
    gridRoot.dispatchEvent(event);
    expect(api.getRowNode("2")?.data.name).toBe("pasted");
    expect(event.defaultPrevented).toBe(true);
    api.destroy();
  });
});
