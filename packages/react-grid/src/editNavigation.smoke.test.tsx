// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import type { ReactColDef } from "./cellRenderer";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string; city: string };
const COLS: ReactColDef[] = [
  { colId: "name", key: "name", label: "Name", editable: true },
  { colId: "city", key: "city", label: "City", editable: true },
];
const DATA: Row[] = [
  { id: 1, name: "AAA", city: "NY" },
  { id: 2, name: "BBB", city: "LA" },
  { id: 3, name: "CCC", city: "SF" },
];

async function mount(props: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid apiRef={apiRef} data={DATA} columnDefs={COLS} rowIdKey="id" {...props} />);
  });
  return { container, apiRef, root };
}

function nameCell(container: HTMLElement, viewIdx: number): HTMLElement {
  const row = container.querySelector<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}']`)!;
  return row.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-row-number-cell)")[0];
}
const md = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
function keyOn(el: Element, key: string, opts: KeyboardEventInit = {}) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
}
function gridKey(container: HTMLElement, key: string, opts: KeyboardEventInit = {}) {
  keyOn(container.querySelector("[data-pte-grid-id]")!, key, opts);
}
const editorInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>(".pte-cell-editor-input");
const active = (api: IGridAPI) => api.getCore().getActiveCell();

async function openEditor(container: HTMLElement, viewIdx: number) {
  await act(async () => { md(nameCell(container, viewIdx)); gridKey(container, "F2"); });
}

describe("moveAfterEdit", () => {
  it("Enter commits and moves the active cell down (default)", async () => {
    const { container, apiRef, root } = await mount();
    const api = apiRef.current!;
    await openEditor(container, 0);
    const input = editorInput(container)!;
    input.value = "Zed";
    await act(async () => { keyOn(input, "Enter"); });
    // Value committed on row 1...
    expect(api.getSelectedRows).toBeDefined();
    expect(api.getCore().getRowModel().getRowNode("1")!.data.name).toBe("Zed");
    // ...and the active cell moved down to view row 1.
    expect(active(api)).toMatchObject({ row: 1, colIdx: 0 });
    root.unmount();
  });

  it("Shift+Enter moves up", async () => {
    const { container, apiRef, root } = await mount();
    const api = apiRef.current!;
    await openEditor(container, 1);
    await act(async () => { keyOn(editorInput(container)!, "Enter", { shiftKey: true }); });
    expect(active(api)).toMatchObject({ row: 0, colIdx: 0 });
    root.unmount();
  });

  it("Tab moves right, Shift+Tab moves left", async () => {
    const { container, apiRef, root } = await mount();
    const api = apiRef.current!;
    await openEditor(container, 0);
    await act(async () => { keyOn(editorInput(container)!, "Tab"); });
    expect(active(api)).toMatchObject({ row: 0, colIdx: 1 }); // moved to city
    // Now editing city (Tab commits in place first? No — just moved). Open editor on city and Shift+Tab back.
    await act(async () => { gridKey(container, "F2"); });
    await act(async () => { keyOn(editorInput(container)!, "Tab", { shiftKey: true }); });
    expect(active(api)).toMatchObject({ row: 0, colIdx: 0 });
    root.unmount();
  });

  it("moveAfterEdit:false commits in place without moving", async () => {
    const { container, apiRef, root } = await mount({ moveAfterEdit: false });
    const api = apiRef.current!;
    await openEditor(container, 0);
    const input = editorInput(container)!;
    input.value = "Zed";
    await act(async () => { keyOn(input, "Enter"); });
    expect(api.getCore().getRowModel().getRowNode("1")!.data.name).toBe("Zed");
    expect(active(api)).toMatchObject({ row: 0, colIdx: 0 }); // stayed put
    root.unmount();
  });
});

describe("stopEditingWhenCellsLoseFocus", () => {
  it("commits on blur by default", async () => {
    const { container, apiRef, root } = await mount();
    const api = apiRef.current!;
    await openEditor(container, 0);
    const input = editorInput(container)!;
    input.value = "Blurred";
    await act(async () => { input.dispatchEvent(new FocusEvent("blur", { bubbles: true })); });
    expect(api.getCore().getEditingCell()).toBeNull(); // editor closed
    expect(api.getCore().getRowModel().getRowNode("1")!.data.name).toBe("Blurred");
    root.unmount();
  });

  it("keeps the editor open on blur when disabled", async () => {
    const { container, apiRef, root } = await mount({ stopEditingWhenCellsLoseFocus: false });
    const api = apiRef.current!;
    await openEditor(container, 0);
    const input = editorInput(container)!;
    await act(async () => { input.dispatchEvent(new FocusEvent("blur", { bubbles: true })); });
    expect(api.getCore().getEditingCell()).not.toBeNull(); // still editing
    root.unmount();
  });
});
