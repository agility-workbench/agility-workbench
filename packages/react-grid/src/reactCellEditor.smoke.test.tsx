// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { ReactCellEditorHandle } from "./cellEditor";
import type { ReactColDef } from "./cellRenderer";
import type { ICellEditorParams, IGridAPI } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

let focusCalls = 0;
let unmounts = 0;

const TextEditor = React.forwardRef<ReactCellEditorHandle, ICellEditorParams>(
  function TextEditor(props, ref) {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    React.useImperativeHandle(ref, () => ({
      getValue: () => inputRef.current?.value,
      isParsed: () => true,
      focus: () => { focusCalls++; inputRef.current?.focus(); },
    }), []);
    React.useEffect(() => () => { unmounts++; }, []);
    return <input ref={inputRef} className="react-cell-editor" defaultValue={String(props.value ?? "")} />;
  },
);

const COLS: ReactColDef[] = [
  { colId: "id", key: "id", label: "ID" },
  { colId: "name", key: "name", label: "Name", editable: true, cellEditor: TextEditor },
];
const DATA = [{ id: 1, name: "AAA" }, { id: 2, name: "BBB" }];

async function mount(props: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid apiRef={apiRef} rowData={DATA} columnDefs={COLS} rowIdKey="id" {...props} />);
  });
  return { container, apiRef, root };
}

function nameCell(container: HTMLElement, viewIdx: number): HTMLElement {
  const row = container.querySelector<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}']`)!;
  return row.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-row-number-cell)")[1];
}
const md = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
const dbl = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("React cell editors in a live grid", () => {
  beforeEach(() => {
    focusCalls = 0;
    unmounts = 0;
  });

  it("mounts a React editor on double click and bridges focus", async () => {
    const { container, apiRef, root } = await mount();
    const cell = nameCell(container, 0);

    await act(async () => { md(cell); });
    expect(apiRef.current!.getCore().getEditingCell()).toBeNull();
    await act(async () => { dbl(cell); });

    expect(apiRef.current!.getCore().getEditingCell()).not.toBeNull();
    expect(cell.querySelector<HTMLInputElement>(".react-cell-editor")?.value).toBe("AAA");
    expect(focusCalls).toBe(1);
    await unmountTestRoot(root);
  });

  it("commits the React editor value, emits onCellValueChanged, and unmounts the editor", async () => {
    const onCellValueChanged = vi.fn();
    const { container, apiRef, root } = await mount({ onCellValueChanged });
    const cell = nameCell(container, 0);
    await act(async () => { md(cell); dbl(cell); });

    const editor = cell.querySelector<HTMLInputElement>(".react-cell-editor")!;
    editor.value = "Updated";
    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await tick(); // editor teardown is deferred to a microtask by the adapter
    });

    expect(apiRef.current!.getCore().getCellValue("1", "name")).toBe("Updated");
    expect(onCellValueChanged).toHaveBeenCalledTimes(1);
    expect(onCellValueChanged.mock.calls[0][0]).toMatchObject({ rowId: "1", value: "Updated" });
    expect(unmounts).toBe(1);
    await unmountTestRoot(root);
  });
});

describe("selection and sort event callbacks", () => {
  it("fires onSelectionChanged and onSortChanged through the stable bridges", async () => {
    const onSelectionChanged = vi.fn();
    const onSortChanged = vi.fn();
    const { apiRef, root } = await mount({
      rowSelection: true,
      onSelectionChanged,
      onSortChanged,
    });
    const api = apiRef.current!;

    await act(async () => { api.selectAllRows(); });
    expect(onSelectionChanged).toHaveBeenCalledTimes(1);
    expect(onSelectionChanged.mock.calls[0][0].snapshot.selectedRowIds).toHaveLength(2);

    const name = api.getColumnModel().getByColId("name")!;
    await act(async () => {
      api.dispatch({ type: "headerAction", action: "toggleSort", colId: name.instanceID });
    });
    expect(onSortChanged).toHaveBeenCalledTimes(1);
    expect(onSortChanged.mock.calls[0][0].changedColIds).toContain(name.instanceID);
    await unmountTestRoot(root);
  });
});
