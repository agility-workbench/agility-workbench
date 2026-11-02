// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { ClipboardRenderer } from "./clipboardRenderer";
import { ColumnType } from "../../interfaces/column";
import type { ColDef } from "../../interfaces/column";
import type { GridOptions } from "../../interfaces/gridOptions";
import type {
  ProcessCellForClipboardParams, ProcessCellFromClipboardParams, ProcessHeaderForClipboardParams,
} from "../../interfaces/clipboard";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

/**
 * `GridOptions.clipboard` (#91) and the paste paths (#90): the delimiter both ways, `copyHeaders`,
 * the three process hooks and their order, `api.copySelection({ includeHeaders })`,
 * `api.pasteText`, the paste event on a mounted grid (one write per Ctrl/Cmd+V, editors keep
 * theirs), and the body menu's Paste surfacing a refused read as an `error` event.
 *
 * Leaf indices (no row numbers): name=0, qty=1, locked=2.
 */

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const columnDefs: ColDef[] = [
  { colId: "name", key: "name", label: "Name", editable: true },
  {
    colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true,
    valueFormatter: ({ value }) => `${value} pcs`,
  },
  { colId: "locked", key: "locked", label: "Locked" },
];

const rowData = () => [
  { id: "1", name: "alice", qty: 3, locked: "L1" },
  { id: "2", name: "bob", qty: 7, locked: "L2" },
  { id: "3", name: "carol", qty: 9, locked: "L3" },
];

function makeCore(options: GridOptions = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(rowData());
  core.setColumnDefsFromProps(columnDefs);
  const writes: string[] = [];
  const clip = new ClipboardRenderer({ core, writeText: async (t) => { writes.push(t); } });
  return { core, clip, writes };
}

const data = (core: GridCore, id: string) => core.getRowModel().getRowNode(id)!.data;

function select(core: GridCore, r0: number, c0: number, r1 = r0, c1 = c0) {
  core.dispatch({ type: "rangeSelectSet", viewIdx: r0, colIdx: c0, mode: "start" });
  if (r1 !== r0 || c1 !== c0) core.dispatch({ type: "rangeSelectSet", viewIdx: r1, colIdx: c1, mode: "extend" });
}

describe("clipboard.delimiter", () => {
  it("joins copied fields with the delimiter and quotes a field that contains it", () => {
    const { core, clip, writes } = makeCore({ clipboard: { delimiter: ";" } });
    core.getRowModel().getRowNode("1")!.data.name = "a;b";
    select(core, 0, 0, 1, 1);
    clip.copy();
    expect(writes).toEqual(['"a;b";3 pcs\nbob;7 pcs']);
  });

  it("splits pasted text on the delimiter (multi-character too), rows on \\r?\\n, trailing newline ignored", () => {
    const { core, clip } = makeCore({ clipboard: { delimiter: " | " } });
    select(core, 0, 0);
    expect(clip.pasteText("x | 11\r\ny | 12\n")).toBe(true);
    expect([data(core, "1").name, data(core, "1").qty, data(core, "2").name, data(core, "2").qty])
      .toEqual(["x", 11, "y", 12]);
    expect(data(core, "3").name).toBe("carol");
  });

  it("keeps a tab inside a field when the delimiter is not a tab", () => {
    const { core, clip } = makeCore({ clipboard: { delimiter: "," } });
    select(core, 0, 0);
    clip.pasteText("a\tb,5");
    expect(data(core, "1").name).toBe("a\tb");
    expect(data(core, "1").qty).toBe(5);
  });
});

describe("clipboard.copyHeaders and copy({ withHeaders })", () => {
  it("plain copy and cut include the header row when copyHeaders is on; an explicit false wins", () => {
    const { core, clip, writes } = makeCore({ clipboard: { copyHeaders: true } });
    select(core, 0, 0, 0, 1);
    clip.copy();
    clip.copy({ withHeaders: false });
    clip.cut();
    expect(writes).toEqual(["Name\tQty\nalice\t3 pcs", "alice\t3 pcs", "Name\tQty\nalice\t3 pcs"]);
  });

  it("is off by default", () => {
    const { core, clip, writes } = makeCore();
    select(core, 0, 0);
    clip.copy();
    clip.copy({ withHeaders: true });
    expect(writes).toEqual(["alice", "Name\nalice"]);
  });
});

describe("process hooks", () => {
  it("processCellForClipboard sees the formatted text and its result is quoted; processHeaderForClipboard shapes labels", () => {
    const cellHook = vi.fn(({ value, colId }: ProcessCellForClipboardParams) => (colId === "qty" ? `<${value}>` : value.toUpperCase()));
    const headerHook = vi.fn(({ value }: ProcessHeaderForClipboardParams) => `${value}!`);
    const { core, clip, writes } = makeCore({
      clipboard: { processCellForClipboard: cellHook, processHeaderForClipboard: headerHook, delimiter: "," },
    });
    core.getRowModel().getRowNode("1")!.data.name = "x,y";
    select(core, 0, 0, 0, 1);
    clip.copy({ withHeaders: true });
    expect(writes).toEqual(['Name!,Qty!\n"X,Y",<3 pcs>']);
    expect(cellHook.mock.calls.map(c => c[0].value)).toEqual(["x,y", "3 pcs"]);
    expect(cellHook.mock.calls[0][0].node.id).toBe("1");
    expect(cellHook.mock.calls[0][0].colDef.colId).toBe("name");
    expect(headerHook.mock.calls.map(c => [c[0].value, c[0].colId])).toEqual([["Name", "name"], ["Qty", "qty"]]);
  });

  it("processCellFromClipboard runs before the valueParser; a non-string result skips the parser", () => {
    const parser = vi.fn(({ value }: { value: string }) => Number(value) * 10);
    const fromHook = vi.fn(({ value, colId }: ProcessCellFromClipboardParams) =>
      colId === "name" ? value.trim().toUpperCase() : value === "raw" ? 42 : value.replace("#", ""));
    const core = new GridCore(measurer, {
      rowIdKey: "id", rowModelType: "clientSide", clipboard: { processCellFromClipboard: fromHook },
    });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(rowData());
    core.setColumnDefsFromProps([
      columnDefs[0],
      { ...columnDefs[1], valueParser: parser },
      columnDefs[2],
    ]);
    const clip = new ClipboardRenderer({ core });
    select(core, 0, 0);
    clip.pasteText(" ann \t#4\tnope\nbo\traw\tnope");
    expect(data(core, "1")).toMatchObject({ name: "ANN", qty: 40, locked: "L1" });
    expect(data(core, "2")).toMatchObject({ name: "BO", qty: 42 });
    // Parser saw the hook's output, and not the typed 42.
    expect(parser.mock.calls.map(c => c[0].value)).toEqual(["4"]);
    // Read-only targets never reach the hook.
    expect(fromHook.mock.calls.map(c => c[0].colId)).toEqual(["name", "qty", "name", "qty"]);
    expect(fromHook.mock.calls[0][0].node.id).toBe("1");
  });
});

describe("pasteText", () => {
  it("tiles into the selection, selects the pasted block and records one undo step", () => {
    const { core, clip } = makeCore();
    expect(core.canUndo()).toBe(false);
    select(core, 0, 0, 2, 0);
    expect(clip.pasteText("z")).toBe(true);
    expect(["1", "2", "3"].map(id => data(core, id).name)).toEqual(["z", "z", "z"]);
    core.dispatch({ type: "undo" });
    expect(["1", "2", "3"].map(id => data(core, id).name)).toEqual(["alice", "bob", "carol"]);
    expect(core.canUndo()).toBe(false);
  });

  it("returns false with nothing to paste into or nothing to paste", () => {
    const { core, clip } = makeCore();
    expect(clip.pasteText("x")).toBe(false); // no selection, no active cell
    select(core, 0, 2);
    expect(clip.pasteText("x")).toBe(false); // read-only target
    select(core, 0, 0);
    expect(clip.pasteText("")).toBe(false);
    expect(data(core, "1").name).toBe("alice");
  });
});

// ---------------- Mounted grid: API, keyboard + paste event, body menu ----------------

const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};

function mountGrid(options: Partial<GridOptions> = {}) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(columnDefs);
  api.setRowData(rowData());
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { core, api, root, renderer };
}

function cellEl(root: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  for (const row of root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`)) {
    const found = row.querySelector<HTMLElement>(`.pte-cell[data-col-idx="${colIdx}"]`);
    if (found) return found;
  }
  throw new Error(`no cell at ${viewIdx}/${colIdx}`);
}

/** A `paste` event carrying `plain` (and optionally `html`); happy-dom has no DataTransfer. */
function pasteEvent(plain: string, html = ""): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text/plain" ? plain : type === "text/html" ? html : "") },
  });
  return event;
}

function mockNavigatorClipboard(impl: Partial<Clipboard> | undefined) {
  return vi.spyOn(navigator, "clipboard", "get").mockReturnValue(impl as Clipboard);
}

describe("api", () => {
  it("copySelection({ includeHeaders }) writes through navigator.clipboard with the options applied", async () => {
    const writeText = vi.fn(async (_: string) => {});
    mockNavigatorClipboard({ writeText });
    const { api, core } = mountGrid({ clipboard: { delimiter: "|", processHeaderForClipboard: ({ value }) => value.toLowerCase() } });
    select(core, 0, 0, 1, 1);
    api.copySelection();
    api.copySelection({ includeHeaders: true });
    await Promise.resolve();
    expect(writeText.mock.calls.map(c => c[0])).toEqual(["alice|3 pcs\nbob|7 pcs", "name|qty\nalice|3 pcs\nbob|7 pcs"]);
    api.destroy();
  });

  it("pasteText writes into the current selection", () => {
    const { api, core } = mountGrid();
    select(core, 1, 0);
    expect(api.pasteText("p1\t5\np2\t6")).toBe(true);
    expect(api.getRowNode("2")?.data).toMatchObject({ name: "p1", qty: 5 });
    expect(api.getRowNode("3")?.data).toMatchObject({ name: "p2", qty: 6 });
    api.destroy();
  });
});

describe("Ctrl/Cmd+V on a mounted grid", () => {
  it("pastes once from the paste event: the shortcut does not also read the clipboard", async () => {
    vi.useFakeTimers();
    const readText = vi.fn(async () => "from-readText");
    mockNavigatorClipboard({ readText });
    const { api, core, root } = mountGrid();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0, reason: "mouse" } as any);
    const target = cellEl(root, 0, 0);
    const key = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, bubbles: true, cancelable: true });
    target.dispatchEvent(key);
    // The binding leaves the key to the browser, which fires `paste` at the focused element.
    expect(key.defaultPrevented).toBe(false);
    const paste = pasteEvent("from-event");
    target.dispatchEvent(paste);
    await vi.runAllTimersAsync();
    expect(paste.defaultPrevented).toBe(true);
    expect(readText).not.toHaveBeenCalled();
    expect(api.getRowNode("1")?.data.name).toBe("from-event");
    expect(core.canUndo()).toBe(true);
    core.dispatch({ type: "undo" });
    expect(api.getRowNode("1")?.data.name).toBe("alice");
    api.destroy();
  });

  it("leaves the paste to an open editor's input", () => {
    const { api, core, root } = mountGrid();
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0, reason: "mouse" } as any);
    core.dispatch({ type: "editStart", cell: { rowId: "1", colId: core.getColumnModel().getLeaves()[0].instanceID }, source: "keyboard" });
    const input = root.querySelector<HTMLElement>("input, textarea") ?? root;
    const paste = pasteEvent("hijacked");
    input.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(false);
    expect(api.getRowNode("1")?.data.name).toBe("alice");
    api.destroy();
  });

  it("reads an HTML table when the clipboard carries no plain text, honouring the delimiter", () => {
    const { api, core, root } = mountGrid({ clipboard: { delimiter: ";" } });
    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0, reason: "mouse" } as any);
    const paste = pasteEvent("", "<table><tr><td>h1;x</td><td>8</td></tr><tr><td>h2</td><td>9</td></tr></table>");
    cellEl(root, 0, 0).dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(api.getRowNode("1")?.data).toMatchObject({ name: "h1;x", qty: 8 });
    expect(api.getRowNode("2")?.data).toMatchObject({ name: "h2", qty: 9 });
    api.destroy();
  });
});

describe("body menu Paste", () => {
  function clickMenuItem(root: HTMLElement, label: string) {
    cellEl(root, 0, 0).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const item = [...document.querySelectorAll<HTMLElement>(".pte-menu-item")]
      .find(el => el.querySelector(".pte-menu-item-text")?.textContent === label);
    if (!item) throw new Error(`no menu item ${label}`);
    item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  it("reads navigator.clipboard and pastes through the same pipeline", async () => {
    mockNavigatorClipboard({ readText: async () => "menu-text" });
    const { api, core, root } = mountGrid({ clipboard: { processCellFromClipboard: ({ value }) => `${value}!` } });
    select(core, 0, 0);
    clickMenuItem(root, "Paste");
    await vi.waitFor(() => expect(api.getRowNode("1")?.data.name).toBe("menu-text!"));
    api.destroy();
  });

  it("emits an error event when readText is refused", async () => {
    mockNavigatorClipboard({ readText: () => Promise.reject(new Error("denied")) });
    const onError = vi.fn();
    const { api, core, root } = mountGrid({ onError });
    select(core, 0, 0);
    clickMenuItem(root, "Paste");
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0]).toMatchObject({ code: "clipboard_read_failed" });
    expect(onError.mock.calls[0][0].message).toMatch(/denied/);
    expect(api.getRowNode("1")?.data.name).toBe("alice");
    api.destroy();
  });

  it("emits an error event, without throwing, when navigator.clipboard is undefined", async () => {
    mockNavigatorClipboard(undefined);
    const onError = vi.fn();
    const { api, core, root } = mountGrid({ onError });
    select(core, 0, 0);
    clickMenuItem(root, "Paste");
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0].message).toMatch(/not available/);
    api.destroy();
  });
});
