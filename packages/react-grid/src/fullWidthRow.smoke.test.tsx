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

type Row = { id: number; name: string; amount: number; spacer?: boolean };

async function mount(props: Record<string, unknown>, columnDefs: ReactColDef[], data: Row[]) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid apiRef={apiRef} data={data} columnDefs={columnDefs} rowIdKey="id" {...props} />);
  });
  return { container, apiRef, root };
}

const COLS: ReactColDef[] = [
  { colId: "name", key: "name", label: "Name" },
  { colId: "amount", key: "amount", label: "Amount" },
];

function rowEl(container: HTMLElement, viewIdx: number): HTMLElement {
  return container.querySelector<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}']`)!;
}

describe("isFullWidthRow", () => {
  const DATA: Row[] = [
    { id: 1, name: "AAA", amount: 10 },
    { id: 2, name: "spacer", amount: 0, spacer: true },
    { id: 3, name: "CCC", amount: 30 },
  ];

  it("marks matching rows full-width and leaves others as normal per-column rows", async () => {
    const { container, root } = await mount(
      { isFullWidthRow: (n: any) => !!n.data?.spacer },
      COLS, DATA,
    );
    const spacer = rowEl(container, 1);
    expect(spacer.classList.contains("pte-full-width-row")).toBe(true);
    // Its full-width host cell is visible; normal data cells are hidden.
    const host = spacer.querySelector<HTMLElement>(".pte-full-width-cell")!;
    expect(host).toBeTruthy();
    expect(host.style.display).not.toBe("none");
    for (const cell of spacer.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-full-width-cell)")) {
      expect(cell.style.display).toBe("none");
    }

    // A non-matching row keeps its data cells visible and no full-width class.
    const normal = rowEl(container, 0);
    expect(normal.classList.contains("pte-full-width-row")).toBe(false);
    const normalHost = normal.querySelector<HTMLElement>(".pte-full-width-cell")!;
    expect(normalHost.style.display).toBe("none");
    root.unmount();
  });

  it("renders full-width content via fullWidthCellRenderer", async () => {
    const { container, root } = await mount(
      {
        isFullWidthRow: (n: any) => !!n.data?.spacer,
        fullWidthCellRenderer: (p: any) => `Section: ${p.data?.name}`,
      },
      COLS, DATA,
    );
    const host = rowEl(container, 1).querySelector<HTMLElement>(".pte-full-width-cell")!;
    expect(host.textContent).toContain("Section: spacer");
    root.unmount();
  });
});

describe("groupDisplayType='groupRows' renders true full-width group rows", () => {
  const DATA: Row[] = [
    { id: 1, name: "EMEA", amount: 10 },
    { id: 2, name: "EMEA", amount: 20 },
    { id: 3, name: "APAC", amount: 30 },
  ];
  const GROUP_COLS: ReactColDef[] = [
    { colId: "name", key: "name", label: "Region" },
    { colId: "amount", key: "amount", label: "Amount" },
  ];

  it("group rows are full-width and the chevron toggles them", async () => {
    const { container, apiRef, root } = await mount(
      { groupDisplayType: "groupRows" }, GROUP_COLS, DATA,
    );
    const core = apiRef.current!.getCore();
    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: ["name"] });
    });

    const groupRows = Array.from(container.querySelectorAll<HTMLElement>(".pte-row.pte-group-row"));
    expect(groupRows.length).toBeGreaterThanOrEqual(1);
    // Every group row is a full-width row with a visible host holding the chevron.
    for (const gr of groupRows) {
      expect(gr.classList.contains("pte-full-width-row")).toBe(true);
      const host = gr.querySelector<HTMLElement>(".pte-full-width-cell")!;
      expect(host.style.display).not.toBe("none");
      expect(host.querySelector(".pte-group-toggle")).toBeTruthy();
    }

    const before = core.getRowModel().getViewCount();
    const toggle = container.querySelector<HTMLElement>(".pte-group-toggle")!;
    await act(async () => {
      toggle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    expect(core.getRowModel().getViewCount()).toBeGreaterThan(before);
    root.unmount();
  });

  it("does not cell-select a group full-width row when groupRowsSelectable is false", async () => {
    const { container, apiRef, root } = await mount(
      { groupDisplayType: "groupRows", groupRowsSelectable: false }, GROUP_COLS, DATA,
    );
    const core = apiRef.current!.getCore();
    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: ["name"] });
    });
    const host = container.querySelector<HTMLElement>(".pte-full-width-row .pte-full-width-cell")!;
    // getCellLocation gates group rows on groupRowsSelectable, so a click resolves to no location.
    await act(async () => {
      host.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      host.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    expect(core.getSelectionRange()).toBeNull();
    root.unmount();
  });

  it("cell-selects a group full-width row when groupRowsSelectable is true", async () => {
    const { container, apiRef, root } = await mount(
      { groupDisplayType: "groupRows", groupRowsSelectable: true }, GROUP_COLS, DATA,
    );
    const core = apiRef.current!.getCore();
    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: ["name"] });
    });
    const groupRow = container.querySelector<HTMLElement>(".pte-full-width-row")!;
    const host = groupRow.querySelector<HTMLElement>(".pte-full-width-cell")!;
    // Host is now selectable and carries a resolvable colIdx.
    expect(host.dataset.colIdx).toBeDefined();
    const viewIdx = Number(groupRow.getAttribute("data-view-idx"));
    await act(async () => {
      host.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      host.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    });
    const range = core.getSelectionRange();
    expect(range).not.toBeNull();
    expect(range!.rowStart).toBe(viewIdx);
    expect(range!.rowEnd).toBe(viewIdx);
    // The host paints as selected.
    expect(host.classList.contains("selected")).toBe(true);
    root.unmount();
  });
});
