// @vitest-environment happy-dom
// End-to-end: the body context menu's "Pin row" item (rowPinningMenu option) pins/unpins the
// clicked row through the real renderer, including the unpin override of an isRowPinned callback.
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { GridProps } from "./interface";
import type { IGridAPI } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string };

async function mountGrid(extra: Partial<GridProps> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const data: Row[] = [
    { id: 1, name: "AAA" },
    { id: 2, name: "BBB" },
    { id: 3, name: "CCC" },
  ];

  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={data}
        columnDefs={[
          { colId: "id", key: "id", label: "ID" },
          { colId: "name", key: "name", label: "Name" },
        ]}
        rowIdKey="id"
        {...extra}
      />,
    );
  });

  return { container, apiRef, root };
}

function bodyCell(container: HTMLElement, viewIdx: number): HTMLElement {
  const row = container.querySelector<HTMLElement>(`.pte-body .pte-row[data-view-idx='${viewIdx}']`)!;
  return row.querySelector<HTMLElement>(".pte-cell:not(.pte-row-number-cell)")!;
}

async function rightClick(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
  });
}

function menuItem(container: HTMLElement, label: string): HTMLElement | null {
  const items = container.ownerDocument.querySelectorAll<HTMLElement>(".pte-menu .pte-menu-item");
  return Array.from(items).find(
    (el) => el.querySelector(".pte-menu-item-text")?.textContent === label,
  ) ?? null;
}

async function clickMenuItem(container: HTMLElement, label: string) {
  const el = menuItem(container, label);
  expect(el, `menu item '${label}'`).toBeTruthy();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function pinnedRowIds(container: HTMLElement, band: "top" | "bottom"): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      `.pte-pinned-rows-${band} .pte-pinned-rows-center .pte-pinned-row`,
    ),
  ).map((el) => el.dataset.rowId ?? "");
}

describe("rowPinningMenu", () => {
  it("is absent from the default body menu when not enabled", async () => {
    const { container, root } = await mountGrid();
    await rightClick(bodyCell(container, 0));
    expect(menuItem(container, "Pin row")).toBeNull();
    await unmountTestRoot(root);
  });

  it("pins the clicked row to the top band and unpins it again", async () => {
    const { container, root } = await mountGrid({ rowPinningMenu: true });

    await rightClick(bodyCell(container, 1));
    await clickMenuItem(container, "Pin row");
    await clickMenuItem(container, "Pin to top");
    expect(pinnedRowIds(container, "top")).toEqual(["2"]);

    // The band row's own context menu offers the toggle back.
    const bandCell = container.querySelector<HTMLElement>(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-cell",
    )!;
    await rightClick(bandCell);
    await clickMenuItem(container, "Pin row");
    expect(menuItem(container, "Pin to top")!.hasAttribute("disabled")).toBe(true);
    await clickMenuItem(container, "Unpin row");
    expect(pinnedRowIds(container, "top")).toEqual([]);

    await unmountTestRoot(root);
  });

  it("pins to the bottom band, above the pinnedBottomRowData rows", async () => {
    const { container, root } = await mountGrid({
      rowPinningMenu: true,
      pinnedTopRowData: [{ id: 8, name: "TOP" }],
      pinnedBottomRowData: [{ id: 9, name: "TOTAL" }],
    });
    await rightClick(bodyCell(container, 0));
    await clickMenuItem(container, "Pin row");
    await clickMenuItem(container, "Pin to bottom");
    // Band sequence: app data rows stay on the outer edges; runtime-pinned model rows sit
    // adjacent to the body — top: data first, bottom: model first.
    expect(pinnedRowIds(container, "bottom")).toEqual(["1", "p:bottom:9"]);

    await rightClick(bodyCell(container, 1));
    await clickMenuItem(container, "Pin row");
    await clickMenuItem(container, "Pin to top");
    expect(pinnedRowIds(container, "top")).toEqual(["p:top:8", "2"]);
    await unmountTestRoot(root);
  });

  it("menu unpin overrides an isRowPinned callback", async () => {
    const { container, apiRef, root } = await mountGrid({
      rowPinningMenu: true,
      isRowPinned: ({ rowId }) => (rowId === "1" ? "top" : null),
    });
    expect(pinnedRowIds(container, "top")).toEqual(["1"]);

    const bandCell = container.querySelector<HTMLElement>(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-cell",
    )!;
    await rightClick(bandCell);
    await clickMenuItem(container, "Pin row");
    await clickMenuItem(container, "Unpin row");

    // The callback still returns "top" for row 1; the explicit menu unpin wins.
    expect(pinnedRowIds(container, "top")).toEqual([]);

    // Re-pinning replaces the override.
    await act(async () => apiRef.current!.setRowPinned("1", "top"));
    expect(pinnedRowIds(container, "top")).toEqual(["1"]);

    await unmountTestRoot(root);
  });
});
