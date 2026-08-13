// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
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

type Row = { id: number; name: string; status: string; amount: number };

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

const DATA: Row[] = [
  { id: 1, name: "AAA", status: "ok", amount: 10 },
  { id: 2, name: "BBB", status: "error", amount: 20 },
  { id: 3, name: "CCC", status: "ok", amount: 30 },
];

const COLS: ReactColDef[] = [
  { colId: "name", key: "name", label: "Name" },
  { colId: "amount", key: "amount", label: "Amount" },
];

function rowEl(container: HTMLElement, viewIdx: number): HTMLElement {
  return container.querySelector<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}']`)!;
}
function cellIn(rowEl: HTMLElement, colIdx: number): HTMLElement {
  return rowEl.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-row-number-cell)")[colIdx];
}

describe("getRowClass / getRowStyle", () => {
  it("applies a class only to rows the predicate matches", async () => {
    const { container, root } = await mount(
      { getRowClass: (p: any) => (p.data.status === "error" ? "row-error" : undefined) },
      COLS, DATA,
    );
    expect(rowEl(container, 0).classList.contains("row-error")).toBe(false);
    expect(rowEl(container, 1).classList.contains("row-error")).toBe(true);
    expect(rowEl(container, 2).classList.contains("row-error")).toBe(false);
    await unmountTestRoot(root);
  });

  it("applies inline styles from getRowStyle", async () => {
    const { container, root } = await mount(
      { getRowStyle: (p: any) => (p.rowIndex === 0 ? { fontWeight: "700" } : undefined) },
      COLS, DATA,
    );
    expect(rowEl(container, 0).style.fontWeight).toBe("700");
    expect(rowEl(container, 1).style.fontWeight).toBe("");
    await unmountTestRoot(root);
  });

  it("clears a stale row class when the underlying data stops matching (recycle safety)", async () => {
    const { container, apiRef, root } = await mount(
      { getRowClass: (p: any) => (p.data.status === "error" ? "row-error" : undefined) },
      COLS, DATA,
    );
    expect(rowEl(container, 1).classList.contains("row-error")).toBe(true);
    // Flip row 2's status to "ok" and repaint via a transaction update.
    await act(async () => {
      apiRef.current!.applyTransaction({ update: [{ rowId: "2", row: { id: 2, name: "BBB", status: "ok", amount: 20 } }] });
    });
    expect(rowEl(container, 1).classList.contains("row-error")).toBe(false);
    await unmountTestRoot(root);
  });
});

describe("cellClass / cellStyle", () => {
  it("applies a static cellClass to every cell in the column", async () => {
    const cols: ReactColDef[] = [
      { colId: "name", key: "name", label: "Name" },
      { colId: "amount", key: "amount", label: "Amount", cellClass: "num-cell" },
    ];
    const { container, root } = await mount({}, cols, DATA);
    expect(cellIn(rowEl(container, 0), 1).classList.contains("num-cell")).toBe(true);
    expect(cellIn(rowEl(container, 0), 0).classList.contains("num-cell")).toBe(false);
    await unmountTestRoot(root);
  });

  it("applies a function cellClass / cellStyle from the cell value", async () => {
    const cols: ReactColDef[] = [
      { colId: "name", key: "name", label: "Name" },
      {
        colId: "amount", key: "amount", label: "Amount",
        cellClass: (p: any) => (p.value >= 30 ? "big" : undefined),
        cellStyle: (p: any) => (p.value >= 30 ? { color: "rgb(255, 0, 0)" } : undefined),
      },
    ];
    const { container, root } = await mount({}, cols, DATA);
    const amt0 = cellIn(rowEl(container, 0), 1); // amount 10
    const amt2 = cellIn(rowEl(container, 2), 1); // amount 30
    expect(amt0.classList.contains("big")).toBe(false);
    expect(amt2.classList.contains("big")).toBe(true);
    expect(amt2.style.color).toBe("rgb(255, 0, 0)");
    expect(amt0.style.color).toBe("");
    await unmountTestRoot(root);
  });
});

describe("getRowPresentation", () => {
  it("composes row cell defaults with column styling and refreshes external state safely", async () => {
    let pending = true;
    const cols: ReactColDef[] = [
      { colId: "name", key: "name", label: "Name" },
      {
        colId: "amount",
        key: "amount",
        label: "Amount",
        cellClass: "amount-cell",
        cellStyle: { color: "rgb(255, 0, 0)" },
      },
    ];
    const { container, apiRef, root } = await mount({
      getRowPresentation: ({ rowId }: any) => pending && rowId === "2" ? {
        rowClass: "pending-row",
        rowStyle: { fontWeight: "700" },
        cellClass: "pending-cell",
        cellStyle: { color: "rgb(0, 0, 255)", backgroundColor: "rgb(255, 255, 0)" },
        accessibility: { description: "Saving changes", busy: true },
        metadata: { status: "pending" },
      } : undefined,
    }, cols, DATA);

    const pendingRow = rowEl(container, 1);
    const amount = cellIn(pendingRow, 1);
    expect(pendingRow.classList.contains("pending-row")).toBe(true);
    expect(pendingRow.style.fontWeight).toBe("700");
    expect(amount.classList.contains("pending-cell")).toBe(true);
    expect(amount.classList.contains("amount-cell")).toBe(true);
    // Row style is the default; the column wins only the conflicting property.
    expect(amount.style.color).toBe("rgb(255, 0, 0)");
    expect(amount.style.backgroundColor).toBe("rgb(255, 255, 0)");
    expect(pendingRow.getAttribute("aria-busy")).toBe("true");
    const descriptionId = pendingRow.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)?.textContent).toBe("Saving changes");

    pending = false;
    await act(async () => apiRef.current!.refreshRowPresentation());
    expect(pendingRow.classList.contains("pending-row")).toBe(false);
    expect(amount.classList.contains("pending-cell")).toBe(false);
    expect(amount.classList.contains("amount-cell")).toBe(true);
    expect(amount.style.backgroundColor).toBe("");
    expect(pendingRow.hasAttribute("aria-busy")).toBe(false);
    expect(pendingRow.hasAttribute("aria-describedby")).toBe(false);
    await unmountTestRoot(root);
  });

  it("lets a column opt out of selected row defaults", async () => {
    const cols: ReactColDef[] = [
      { colId: "name", key: "name", label: "Name" },
      {
        colId: "amount",
        key: "amount",
        label: "Amount",
        inheritRowPresentation: { cellClass: false, cellStyle: false },
      },
    ];
    const { container, root } = await mount({
      getRowPresentation: () => ({
        cellClass: "row-default-cell",
        cellStyle: { opacity: "0.5" },
      }),
    }, cols, DATA);
    expect(cellIn(rowEl(container, 0), 0).classList.contains("row-default-cell")).toBe(true);
    expect(cellIn(rowEl(container, 0), 0).style.opacity).toBe("0.5");
    expect(cellIn(rowEl(container, 0), 1).classList.contains("row-default-cell")).toBe(false);
    expect(cellIn(rowEl(container, 0), 1).style.opacity).toBe("");
    await unmountTestRoot(root);
  });
});
