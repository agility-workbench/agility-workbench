// @vitest-environment happy-dom
/**
 * B6 through the React binding. The wrapper compares `rowData` by reference, so an immutable update
 * — a new array of new row objects — hands the core a replacement on every change. With a stable
 * row id the core diffs that instead of re-ingesting, which is observable here as surviving undo
 * history; `rowDataMode="reset"` opts back into the wholesale replacement. (Page retention and the
 * diff's add/update/remove classification are covered in core.rowDataMode.test.ts.)
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
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

afterEach(() => {
  document.body.innerHTML = "";
});

const COLS: ReactColDef[] = [{ colId: "name", key: "name", label: "Name", editable: true }];

const rows = () => [
  { id: "1", name: "alice" },
  { id: "2", name: "bob" },
];

async function mount(props: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  const render = async (next: Record<string, unknown>) => {
    await act(async () => {
      root.render(<Grid apiRef={apiRef} columnDefs={COLS} rowIdKey="id" {...props} {...next} />);
    });
  };
  await render({ rowData: rows() });
  return { apiRef, container, root, render };
}

describe("rowDataMode through the React binding", () => {
  it("keeps undo history when the rowData prop gets a new reference", async () => {
    const { apiRef, container, root, render } = await mount();
    const api = apiRef.current!;
    api.setCellValue({ rowId: "1", colId: "name" }, "ALICE");
    expect(api.canUndo()).toBe(true);

    // The immutable-update pattern: brand new array, brand new row objects.
    await render({ rowData: [{ id: "1", name: "ALICE" }, { id: "2", name: "robert" }] });

    expect(api.canUndo()).toBe(true);
    expect(container.textContent).toContain("robert"); // the update still landed
    await unmountTestRoot(root);
  });

  it('discards undo history when rowDataMode="reset"', async () => {
    const { apiRef, root, render } = await mount({ rowDataMode: "reset" });
    const api = apiRef.current!;
    api.setCellValue({ rowId: "1", colId: "name" }, "ALICE");
    expect(api.canUndo()).toBe(true);

    await render({ rowData: rows() });

    expect(api.canUndo()).toBe(false);
    await unmountTestRoot(root);
  });
});
