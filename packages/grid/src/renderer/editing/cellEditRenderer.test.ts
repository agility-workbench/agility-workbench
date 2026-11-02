// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGrid, type CreateGridOptions } from "../../createGrid";
import { ColDef, ColumnType } from "../../interfaces/column";
import { REJECT, reject } from "../../interfaces/gridOptions";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { GridEventEditingChangedParams } from "../../events/events";
import { ICellEditor, ICellEditorParams } from "./cellEditor";

// #48 invalid edits keep the editor open; #52 stopEditing() commits the editor's own value; plus
// the DOM-facing ends of #42 (export) and #43 (fill) that need a rendered grid.

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;
let api: IGridAPI;
let root: HTMLElement;
let editing: GridEventEditingChangedParams[];

afterEach(() => api?.destroy());

const rows = () => Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: `Row ${i}`, qty: i + 1 }));

// qty refuses negative numbers (with a message) and "bad" text (bare REJECT).
const qtyCol: ColDef = {
  colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true,
  valueParser: ({ value }) => {
    if (value === "bad") return REJECT;
    const n = Number(value);
    return n < 0 ? reject("Must not be negative") : n;
  },
};

function mount(options: CreateGridOptions = {}, columnDefs: ColDef[] = [
  { colId: "name", key: "name", label: "Name", editable: true },
  qtyCol,
]) {
  document.body.innerHTML = "";
  host = document.createElement("div");
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  editing = [];
  api = createGrid(host, {
    rowIdKey: "id", columnDefs, rowData: rows(), ...options,
    onEditingChanged: (e) => editing.push(e),
  });
  root = host.querySelector<HTMLElement>(".pte-root")!;
}

const cellRef = (rowId: string, colId: string) => ({ rowId, colId });
const input = () => host.querySelector<HTMLInputElement>(".pte-cell-editor-input");
const editingCellEl = () => host.querySelector<HTMLElement>(".pte-cell-editing");
const qty = (rowId: string) => api.getRowNode(rowId)!.data.qty;

function editorPress(key: string, mods: Partial<KeyboardEventInit> = {}) {
  input()!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }));
}

// Open the editor the way a user does: cursor on the cell, then Enter at the grid root.
function openQty(rowId = "1") {
  api.dispatch({ type: "focusSet", viewIdx: Number(rowId), colIdx: 1, reason: "mouse" });
  root.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  expect(input()).not.toBeNull();
  expect(api.getEditingCell()).toMatchObject({ rowId, colId: "qty" });
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("invalid edits keep the editor open (#48)", () => {
  it("a parser REJECT keeps the editor with the typed text and marks the cell invalid", async () => {
    mount();
    openQty();
    input()!.value = "bad";
    editorPress("Enter");

    expect(api.getEditingCell()).toMatchObject({ rowId: "1", colId: "qty" });
    expect(input()!.value).toBe("bad");
    const cell = editingCellEl()!;
    expect(cell.classList.contains("pte-cell-invalid")).toBe(true);
    expect(cell.getAttribute("aria-invalid")).toBe("true");
    expect(input()!.getAttribute("aria-invalid")).toBe("true");
    expect(input()!.title).toBe("Invalid value");
    expect(qty("1")).toBe(2);
    expect(editing.at(-1)).toMatchObject({ state: "rejected", value: "bad" });
    // moveAfterEdit does not move off a refused cell.
    expect(api.getFocusedCell()).toMatchObject({ rowId: "1", colId: "qty" });
    await wait(200);
    expect(host.querySelector(".pte-grid-sr-announcer")!.textContent).toBe("Invalid value");
  });

  it("reject(message) surfaces the message; a retry with valid text commits and clears the state", () => {
    mount();
    openQty();
    input()!.value = "-5";
    editorPress("Enter");
    expect(input()!.title).toBe("Must not be negative");
    expect(editing.at(-1)).toMatchObject({ state: "rejected", message: "Must not be negative" });

    input()!.value = "9";
    editorPress("Enter");
    expect(api.getEditingCell()).toBeNull();
    expect(input()).toBeNull();
    expect(qty("1")).toBe(9);
    expect(host.querySelector(".pte-cell-invalid")).toBeNull();
    expect(host.querySelector("[aria-invalid]")).toBeNull();
  });

  it("onBeforeCellCommit returning reject(message) or REJECT keeps the editor too", () => {
    mount({ onBeforeCellCommit: (p) => (p.value === 7 ? reject("Seven is reserved") : p.value === 8 ? REJECT : undefined) });
    openQty();
    input()!.value = "7";
    editorPress("Tab");
    expect(input()!.title).toBe("Seven is reserved");
    input()!.value = "8";
    editorPress("Enter");
    expect(input()!.title).toBe("Invalid value");
    expect(api.getEditingCell()).not.toBeNull();
  });

  it("Escape cancels an invalid editor and the cell keeps its value", () => {
    mount();
    openQty();
    input()!.value = "bad";
    editorPress("Enter");
    editorPress("Escape");
    expect(api.getEditingCell()).toBeNull();
    expect(input()).toBeNull();
    expect(host.querySelector(".pte-cell-invalid")).toBeNull();
    expect(qty("1")).toBe(2);
  });

  it("commitOnBlur: a refused blur keeps the editor and takes focus back from elsewhere in the grid", async () => {
    mount();
    // Let the freshly mounted grid finish its deferred first render before editing.
    await wait(20);
    openQty();
    input()!.value = "bad";
    input()!.dispatchEvent(new FocusEvent("blur", { relatedTarget: root }));
    expect(api.getEditingCell()).not.toBeNull();
    expect(editingCellEl()!.classList.contains("pte-cell-invalid")).toBe(true);
    root.focus();
    await wait(10);
    expect(document.activeElement).toBe(input());
  });

  it("commitOnBlur: focus that left the grid is left where it went", async () => {
    mount();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    openQty();
    input()!.value = "bad";
    outside.focus();
    input()!.dispatchEvent(new FocusEvent("blur", { relatedTarget: outside }));
    await wait(10);
    expect(api.getEditingCell()).not.toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("api.setCellValue on the editing cell still closes the editor when refused", () => {
    mount();
    openQty();
    api.setCellValue(cellRef("1", "qty"), "bad");
    expect(api.getEditingCell()).toBeNull();
    expect(input()).toBeNull();
  });

  it("isCancelAfterEnd turns the commit into a cancel; getValidationMessage refuses before the parser", () => {
    class RequiredEditor implements ICellEditor {
      private el = document.createElement("input");
      init(p: ICellEditorParams) { this.el.className = "pte-cell-editor-input"; this.el.value = String(p.value ?? ""); }
      getGui() { return this.el; }
      getValue() { return this.el.value; }
      isCancelAfterEnd() { return this.el.value === ""; }
      getValidationMessage() { return this.el.value.length > 5 ? "Five characters at most" : null; }
    }
    mount({}, [{ colId: "name", key: "name", label: "Name", editable: true, cellEditor: RequiredEditor }]);
    api.startEditingCell(cellRef("1", "name"));
    input()!.value = "";
    editorPress("Enter");
    expect(api.getEditingCell()).toBeNull();
    expect(editing.at(-1)).toMatchObject({ state: "cancelled" });
    expect(api.getRowNode("1")!.data.name).toBe("Row 1");

    api.startEditingCell(cellRef("1", "name"));
    input()!.value = "too long";
    editorPress("Enter");
    expect(api.getEditingCell()).not.toBeNull();
    expect(input()!.title).toBe("Five characters at most");
    expect(editing.at(-1)).toMatchObject({ state: "started" });
    input()!.value = "ok";
    editorPress("Enter");
    expect(api.getRowNode("1")!.data.name).toBe("ok");
  });

  it("a custom editor made by a factory function gets the same hooks", () => {
    const factory = (): ICellEditor => {
      const el = document.createElement("input");
      el.className = "pte-cell-editor-input";
      return {
        init: () => undefined,
        getGui: () => el,
        getValue: () => el.value,
        isCancelAfterEnd: () => el.value === "",
      };
    };
    mount({}, [{ colId: "name", key: "name", label: "Name", editable: true, cellEditor: factory }]);
    api.startEditingCell(cellRef("2", "name"));
    editorPress("Enter");
    expect(editing.at(-1)).toMatchObject({ state: "cancelled" });
  });
});

describe("api.stopEditing (#52)", () => {
  it("without a value commits what the editor holds, through the parser", () => {
    mount();
    openQty("0");
    input()!.value = "42";
    api.stopEditing();
    expect(api.getEditingCell()).toBeNull();
    expect(qty("0")).toBe(42);
  });

  it("without a value, a refused commit keeps the editor open and invalid", () => {
    mount();
    openQty("0");
    input()!.value = "-1";
    api.stopEditing();
    expect(api.getEditingCell()).not.toBeNull();
    expect(input()!.title).toBe("Must not be negative");
  });

  it("with a value commits that value instead of the editor's", () => {
    mount();
    openQty("0");
    input()!.value = "42";
    api.stopEditing("7");
    expect(api.getEditingCell()).toBeNull();
    expect(qty("0")).toBe(7);
  });

  it("is a no-op when nothing is being edited", () => {
    mount();
    api.stopEditing();
    expect(qty("0")).toBe(1);
  });
});

describe("rendered paths for dot-path keys and editable functions", () => {
  it("CSV export reads a nested key", () => {
    mount({ rowData: [{ id: "1", address: { city: "Oslo" } }] }, [
      { colId: "city", key: "address.city", label: "City", editable: true },
    ]);
    expect(api.getDataAsCsv()).toContain("Oslo");
  });

  it("an editor on a nested key seeds from and commits to the nested value", () => {
    mount({ rowData: [{ id: "1", address: { city: "Oslo" } }] }, [
      { colId: "city", key: "address.city", label: "City", editable: true },
    ]);
    api.startEditingCell(cellRef("1", "city"));
    expect(input()!.value).toBe("Oslo");
    input()!.value = "Bergen";
    editorPress("Enter");
    expect(api.getRowNode("1")!.data).toEqual({ id: "1", address: { city: "Bergen" } });
  });

  it("fill skips the rows a function editable refuses", () => {
    mount({}, [
      { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: ({ data }) => data.id !== "2" },
    ]);
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    api.dispatch({ type: "rangeSelectSet", viewIdx: 3, colIdx: 0, mode: "extend" });
    api.fillDown();
    expect([0, 1, 2, 3].map(i => qty(String(i)))).toEqual([1, 1, 3, 1]);
  });
});
