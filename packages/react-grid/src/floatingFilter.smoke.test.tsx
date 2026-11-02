// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";
import type { IGridAPI } from "@agility-workbench/grid";

// The floating filter row through the React wrapper: the `floatingFilter` prop is a runtime option,
// so flipping it shows and hides the row on the mounted grid (no remount), and the row's inputs
// write the same filter model the API reads.

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

const ROWS = [
  { id: 1, name: "Alpha", region: "North" },
  { id: 2, name: "Beta", region: "South" },
];
const COLS: ReactColDef[] = [
  { colId: "name", key: "name", label: "Name", filter: "text" },
  { colId: "region", key: "region", label: "Region", filter: "set" },
];

describe("floatingFilter (React)", () => {
  it("toggles the row live from the prop and filters through it", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const root = createRoot(container);
    let api: IGridAPI | null = null;
    let readyCount = 0;
    const render = async (floatingFilter: boolean | undefined) => {
      await act(async () => {
        root.render(
          <Grid
            data={ROWS}
            columnDefs={COLS}
            rowIdKey="id"
            filterDebounceMs={0}
            floatingFilter={floatingFilter}
            onGridReady={(a) => { api = a; readyCount++; }}
          />,
        );
      });
    };
    const row = () => container.querySelector<HTMLElement>(".pte-floating-filter-row")!;
    const visible = () => row().classList.contains("pte-floating-filter-row-visible");

    await render(undefined);
    expect(visible()).toBe(false);

    await render(true);
    expect(visible()).toBe(true);
    expect(container.querySelectorAll(".pte-floating-filter-cell")).toHaveLength(2);
    const firstBodyRow = container.querySelector(".pte-viewport .pte-row[data-view-idx='0']")!;
    expect(firstBodyRow.getAttribute("aria-rowindex")).toBe("3");

    const input = container.querySelector<HTMLInputElement>(".pte-floating-filter-cell input")!;
    await act(async () => {
      input.value = "bet";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(api!.getFilterModel()).toEqual([
      { colId: "name", join: "and", filters: [{ type: "contains", values: ["bet"] }] },
    ]);

    await render(false);
    expect(visible()).toBe(false);
    expect(container.querySelectorAll(".pte-floating-filter-cell")).toHaveLength(0);
    // A runtime option: the same grid throughout.
    expect(readyCount).toBe(1);

    await unmountTestRoot(root);
  });
});
