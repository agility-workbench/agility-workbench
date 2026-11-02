// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { ReactCellEditorHandle } from "./cellEditor";
import type { ReactColDef } from "./cellRenderer";
import { reject } from "@agility-workbench/grid";
import type { ICellEditorParams, IGridAPI } from "@agility-workbench/grid";

// The editing contract through the React wrapper: a valueSetter column, an editable function, a
// nested (dot-path) key, and a refused edit that keeps a React editor open and invalid.

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

type Row = { id: number; first: string; last: string; locked: boolean; address: { city: string } };

let editorMessage: string | null = null;

const CodeEditor = React.forwardRef<ReactCellEditorHandle, ICellEditorParams>(
  function CodeEditor(props, ref) {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    React.useImperativeHandle(ref, () => ({
      getValue: () => inputRef.current?.value,
      focus: () => inputRef.current?.focus(),
      getValidationMessage: () => editorMessage,
    }), []);
    return <input ref={inputRef} className="react-code-editor" defaultValue={String(props.value ?? "")} />;
  },
);

const COLS: ReactColDef<Row>[] = [
  { colId: "id", key: "id", label: "ID" },
  {
    colId: "full",
    label: "Full name",
    valueGetter: (row) => `${row.data.first} ${row.data.last}`,
    valueSetter: ({ data, newValue }) => {
      const [first, ...rest] = String(newValue ?? "").trim().split(/\s+/);
      if (!first) return false;
      data.first = first;
      data.last = rest.join(" ");
      return true;
    },
    editable: true,
  },
  { colId: "city", key: "address.city", label: "City", editable: ({ data }) => !data.locked },
  {
    colId: "code",
    key: "first",
    label: "Code",
    editable: true,
    cellEditor: CodeEditor,
    valueParser: ({ value }) => (/^[A-Z]/.test(String(value)) ? String(value) : reject("Must start with a capital")),
  },
];

function rows(): Row[] {
  return [
    { id: 1, first: "Ada", last: "Lovelace", locked: false, address: { city: "London" } },
    { id: 2, first: "Alan", last: "Turing", locked: true, address: { city: "Wilmslow" } },
  ];
}

async function mount(data: Row[]) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid apiRef={apiRef} rowData={data} columnDefs={COLS} rowIdKey="id" />);
  });
  return { container, api: apiRef.current!, root };
}

describe("editing contract through the React wrapper", () => {
  it("a valueSetter column writes through the setter on setCellValue and undo", async () => {
    const data = rows();
    const { api, root } = await mount(data);
    await act(async () => { api.setCellValue({ rowId: "1", colId: "full" }, "Grace Brewster Hopper"); });
    expect(data[0]).toMatchObject({ first: "Grace", last: "Brewster Hopper" });
    expect(api.getCellValue({ rowId: "1", colId: "full" })).toBe("Grace Brewster Hopper");
    await act(async () => { api.undo(); });
    expect(data[0]).toMatchObject({ first: "Ada", last: "Lovelace" });
    // A setter returning false writes nothing and records no undo step.
    await act(async () => { api.setCellValue({ rowId: "1", colId: "full" }, "   "); });
    expect(data[0]).toMatchObject({ first: "Ada", last: "Lovelace" });
    await act(async () => { root.unmount(); });
  });

  it("an editable function gates editing per row, and a nested key is written in place", async () => {
    const data = rows();
    const { api, root } = await mount(data);
    await act(async () => { api.startEditingCell({ rowId: "2", colId: "city" }); });
    expect(api.getEditingCell()).toBeNull();
    await act(async () => { api.startEditingCell({ rowId: "1", colId: "city" }); });
    expect(api.getEditingCell()).toMatchObject({ rowId: "1", colId: "city" });
    await act(async () => { api.stopEditing("Paris"); });
    expect(data[0].address.city).toBe("Paris");
    expect((data[0] as any)["address.city"]).toBeUndefined();
    await act(async () => { root.unmount(); });
  });

  it("a refused commit keeps the React editor open and invalid; a retry commits", async () => {
    const data = rows();
    const { container, api, root } = await mount(data);
    await act(async () => { api.startEditingCell({ rowId: "1", colId: "code" }); });
    const input = container.querySelector<HTMLInputElement>(".react-code-editor")!;
    expect(input).not.toBeNull();

    // The column's parser refuses: the editor stays with the typed text, the cell is invalid.
    input.value = "lowercase";
    await act(async () => { api.stopEditing(); });
    expect(api.getEditingCell()).toMatchObject({ rowId: "1", colId: "code" });
    expect(container.querySelector(".react-code-editor")).toBe(input);
    expect(input.value).toBe("lowercase");
    const cell = container.querySelector<HTMLElement>(".pte-cell-invalid")!;
    expect(cell).not.toBeNull();
    expect(cell.getAttribute("aria-invalid")).toBe("true");
    expect(cell.querySelector("[title]")?.getAttribute("title")).toBe("Must start with a capital");

    // The editor's own validation refuses before the parser.
    editorMessage = "Not now";
    input.value = "Valid";
    await act(async () => { api.stopEditing(); });
    expect(api.getEditingCell()).not.toBeNull();
    expect(container.querySelector(".pte-cell-invalid [title]")?.getAttribute("title")).toBe("Not now");
    editorMessage = null;

    await act(async () => { api.stopEditing(); });
    expect(api.getEditingCell()).toBeNull();
    expect(container.querySelector(".pte-cell-invalid")).toBeNull();
    expect(data[0].first).toBe("Valid");
    await act(async () => { root.unmount(); });
  });
});
