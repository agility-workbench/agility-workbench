// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import { getGridOptions } from "./factory";
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

const COLS: ReactColDef[] = [{ colId: "name", key: "name", label: "Name" }];

async function mount(props: Record<string, unknown>) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  const render = async (next: Record<string, unknown>) => {
    await act(async () => {
      root.render(<Grid apiRef={apiRef} columnDefs={COLS} rowIdKey="id" {...next} />);
    });
  };
  await render(props);
  return { container, apiRef, root, render };
}

describe("getGridOptions option forwarding", () => {
  it("forwards explicit false values instead of dropping them", () => {
    const options = getGridOptions({
      allowExportAsCSV: false,
      allowExportAsExcel: false,
      pagination: false,
      rowNumbers: false,
    });
    expect(options).toMatchObject({
      allowExportAsCSV: false,
      allowExportAsExcel: false,
      pagination: false,
      rowNumbers: false,
    });
  });

  it("forwards explicit 0 values instead of dropping them", () => {
    const options = getGridOptions({
      headerHeight: 0,
      leafHeaderHeight: 0,
      parentHeaderHeight: 0,
      rowHeight: 0,
      overscanRowCount: 0,
      pageSize: 0,
      serverSideBlockSize: 0,
    });
    expect(options).toMatchObject({
      headerHeight: 0,
      leafHeaderHeight: 0,
      parentHeaderHeight: 0,
      rowHeight: 0,
      overscanRowCount: 0,
      pageSize: 0,
      serverSideBlockSize: 0,
    });
  });

  it("forwards autosizeColumnsOnDataChange and clearSelectionOnBodyClick", () => {
    const options = getGridOptions({
      autosizeColumnsOnDataChange: true,
      clearSelectionOnBodyClick: false,
    });
    expect(options.autosizeColumnsOnDataChange).toBe(true);
    expect(options.clearSelectionOnBodyClick).toBe(false);
  });

  it("omits keys that were not provided so core defaults apply", () => {
    expect(Object.keys(getGridOptions({}))).toEqual([]);
  });
});

describe("core option forwarding (live grid)", () => {
  it("re-autosizes columns after data changes when autosizeColumnsOnDataChange is enabled", async () => {
    const { apiRef, root, render } = await mount({
      rowData: [{ id: "1", name: "A" }],
      autosizeColumnsOnDataChange: true,
    });
    const column = apiRef.current!.getColumnModel().getByColId("name")!;
    const initialWidth = column.computedWidth;

    await render({
      rowData: [{ id: "1", name: "A much longer value that requires a wider column" }],
      autosizeColumnsOnDataChange: true,
    });

    expect(column.computedWidth).toBeGreaterThan(initialWidth);
    await act(async () => { root.unmount(); });
  });

  it("preserves computed widths after data changes when autosizeColumnsOnDataChange is disabled", async () => {
    const { apiRef, root, render } = await mount({ rowData: [{ id: "1", name: "A" }] });
    const column = apiRef.current!.getColumnModel().getByColId("name")!;
    const initialWidth = column.computedWidth;

    await render({
      rowData: [{ id: "1", name: "A much longer value that would normally resize the column" }],
    });

    expect(column.computedWidth).toBe(initialWidth);
    await act(async () => { root.unmount(); });
  });

  it("clears the current selection on an empty-body click by default", async () => {
    const { container, apiRef, root } = await mount({ rowData: [{ id: "1", name: "A" }] });
    await act(async () => { apiRef.current!.selectRange(0, 0); });
    expect(apiRef.current!.getSelection().kind).toBe("cell");

    await act(async () => {
      container.querySelector<HTMLElement>(".pte-body")!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
    });
    expect(apiRef.current!.getSelection().kind).toBe("none");
    await act(async () => { root.unmount(); });
  });

  it("preserves selection on an empty-body click when clearSelectionOnBodyClick is false", async () => {
    const { container, apiRef, root } = await mount({
      rowData: [{ id: "1", name: "A" }],
      clearSelectionOnBodyClick: false,
    });
    await act(async () => { apiRef.current!.selectRange(0, 0); });

    await act(async () => {
      container.querySelector<HTMLElement>(".pte-body")!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
    });
    expect(apiRef.current!.getSelection().kind).toBe("cell");
    await act(async () => { root.unmount(); });
  });
});
