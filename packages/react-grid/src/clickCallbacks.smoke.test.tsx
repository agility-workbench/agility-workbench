// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
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
  { colId: "name", key: "name", label: "Name" },
];
const DATA: Row[] = [{ id: 1, name: "AAA" }, { id: 2, name: "BBB" }];

async function mount(props: Record<string, unknown>) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid data={DATA} columnDefs={COLS} rowIdKey="id" {...props} />);
  });
  return { container, root };
}

function dataCell(container: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  const row = container.querySelector<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}']`)!;
  return row.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-row-number-cell)")[colIdx];
}

function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
}

describe("onCellClicked / onRowClicked (DOM click path)", () => {
  it("fires both with the right row/cell identity", async () => {
    const onCellClicked = vi.fn();
    const onRowClicked = vi.fn();
    const { container, root } = await mount({ onCellClicked, onRowClicked });

    await act(async () => { click(dataCell(container, 1, 1)); }); // row id 2, "name" cell

    expect(onRowClicked).toHaveBeenCalledTimes(1);
    expect(onRowClicked.mock.calls[0][0]).toMatchObject({ rowId: "2", viewIdx: 1, isGroup: false });

    expect(onCellClicked).toHaveBeenCalledTimes(1);
    expect(onCellClicked.mock.calls[0][0]).toMatchObject({ rowId: "2", value: "BBB" });
    await unmountTestRoot(root);
  });

  it("fires row click callbacks even when cellSelection is 'text' (read-only mode)", async () => {
    const onRowClicked = vi.fn();
    const { container, root } = await mount({ onRowClicked, cellSelection: "text" });
    await act(async () => { click(dataCell(container, 0, 0)); });
    expect(onRowClicked).toHaveBeenCalledTimes(1);
    await unmountTestRoot(root);
  });
});
