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

type Row = { id: number; name: string };
const COLS: ReactColDef[] = [
  { colId: "id", key: "id", label: "ID" },
  { colId: "name", key: "name", label: "Name", editable: true },
];
const DATA: Row[] = [{ id: 1, name: "AAA" }, { id: 2, name: "BBB" }];

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
  return row.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-row-number-cell)")[1]; // "name" col
}
const md = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
const dbl = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
function key(container: HTMLElement, k: string) {
  container.querySelector<HTMLElement>("[data-pte-grid-id]")!
    .dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
}
const editing = (api: IGridAPI) => api.getCore().getEditingCell() != null;

describe("editTrigger", () => {
  it("doubleClick (default): double-click edits, single click does not", async () => {
    const { container, apiRef, root } = await mount();
    const api = apiRef.current!;
    await act(async () => { md(nameCell(container, 0)); });
    expect(editing(api)).toBe(false);
    await act(async () => { dbl(nameCell(container, 0)); });
    expect(editing(api)).toBe(true);
    root.unmount();
  });

  it("singleClick: a single click selects and edits together", async () => {
    const { container, apiRef, root } = await mount({ editTrigger: "singleClick" });
    const api = apiRef.current!;
    await act(async () => { md(nameCell(container, 0)); });
    expect(editing(api)).toBe(true);
    expect(api.getSelection().kind).toBe("cell"); // also selected
    root.unmount();
  });

  it("none: no mouse gesture edits (double-click / single click), but keyboard still works", async () => {
    const { container, apiRef, root } = await mount({ editTrigger: "none" });
    const api = apiRef.current!;
    await act(async () => { dbl(nameCell(container, 0)); });
    expect(editing(api)).toBe(false);
    // editTrigger only governs the mouse; F2 still edits (keyboard is governed separately).
    await act(async () => { md(nameCell(container, 0)); key(container, "F2"); });
    expect(editing(api)).toBe(true);
    root.unmount();
  });

  it("none + suppressKeyboardEdit: fully API-only editing", async () => {
    const { container, apiRef, root } = await mount({ editTrigger: "none", suppressKeyboardEdit: true });
    const api = apiRef.current!;
    await act(async () => { dbl(nameCell(container, 0)); });
    expect(editing(api)).toBe(false);
    await act(async () => { md(nameCell(container, 0)); key(container, "F2"); });
    expect(editing(api)).toBe(false);
    // API can still start editing.
    await act(async () => { api.startEditingCell({ rowId: "1", colId: api.getColumnModel().getByColId("name")!.instanceID }); });
    expect(editing(api)).toBe(true);
    root.unmount();
  });
});

describe("suppressKeyboardEdit", () => {
  it("disables F2/Enter and type-to-edit but leaves double-click working", async () => {
    const { container, apiRef, root } = await mount({ suppressKeyboardEdit: true });
    const api = apiRef.current!;
    await act(async () => { md(nameCell(container, 0)); key(container, "F2"); });
    expect(editing(api)).toBe(false);
    await act(async () => { key(container, "a"); });
    expect(editing(api)).toBe(false);
    // Double-click still edits (default editTrigger).
    await act(async () => { dbl(nameCell(container, 0)); });
    expect(editing(api)).toBe(true);
    root.unmount();
  });
});

describe("suppressTypeToEdit", () => {
  it("disables type-to-edit but keeps F2/Enter working", async () => {
    const { container, apiRef, root } = await mount({ suppressTypeToEdit: true });
    const api = apiRef.current!;
    // Typing a printable char does NOT open the editor.
    await act(async () => { md(nameCell(container, 0)); key(container, "a"); });
    expect(editing(api)).toBe(false);
    // F2 still edits.
    await act(async () => { key(container, "F2"); });
    expect(editing(api)).toBe(true);
    root.unmount();
  });
});
