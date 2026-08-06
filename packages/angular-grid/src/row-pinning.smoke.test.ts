import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { GridOptions, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [rowPinningMenu]="rowPinningMenu"
      [pinnedTopRowData]="pinnedTop"
      [pinnedBottomRowData]="pinnedBottom"
      [isRowPinned]="isRowPinned"
      (gridReady)="api = $event"
    />
  `,
})
class RowPinningHost {
  api: IGridAPI | null = null;
  rowPinningMenu = false;
  pinnedTop: unknown[] = [];
  pinnedBottom: unknown[] = [];
  isRowPinned: GridOptions["isRowPinned"] = undefined;
  rows = [
    { id: "1", name: "AAA" },
    { id: "2", name: "BBB" },
    { id: "3", name: "CCC" },
  ];
  cols: NgColDef[] = [
    { colId: "id", key: "id", label: "ID" },
    { colId: "name", key: "name", label: "Name" },
  ];
}

function bodyCell(gridEl: HTMLElement, row: number): HTMLElement {
  return gridEl.querySelector<HTMLElement>(
    `.pte-body .pte-row[data-view-idx="${row}"] .pte-cell:not(.pte-row-number-cell)`,
  )!;
}

function rightClick(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
  }));
}

function menuItem(gridEl: HTMLElement, label: string): HTMLElement | null {
  return Array.from(gridEl.querySelectorAll<HTMLElement>(".pte-menu .pte-menu-item"))
    .find((element) => element.querySelector(".pte-menu-item-text")?.textContent === label) ?? null;
}

function clickItem(gridEl: HTMLElement, label: string): void {
  const item = menuItem(gridEl, label);
  expect(item, `menu item '${label}'`).toBeTruthy();
  item!.click();
}

function pinnedIds(gridEl: HTMLElement, band: "top" | "bottom"): string[] {
  return Array.from(gridEl.querySelectorAll<HTMLElement>(
    `.pte-pinned-rows-${band} .pte-pinned-rows-center .pte-pinned-row`,
  ), (row) => row.dataset.rowId ?? "");
}

describe("AwbGrid row pinning", () => {
  it("omits row-pinning actions unless rowPinningMenu is enabled", async () => {
    const { gridEl } = await mountGridHost(RowPinningHost);
    rightClick(bodyCell(gridEl, 0));
    expect(menuItem(gridEl, "Pin row")).toBeNull();
  });

  it("pins a body row through the menu and unpins it from the band", async () => {
    const { gridEl } = await mountGridHost(RowPinningHost, 600, (host) => {
      host.rowPinningMenu = true;
    });
    rightClick(bodyCell(gridEl, 1));
    clickItem(gridEl, "Pin row");
    clickItem(gridEl, "Pin to top");
    expect(pinnedIds(gridEl, "top")).toEqual(["2"]);

    const bandCell = gridEl.querySelector<HTMLElement>(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-cell",
    )!;
    rightClick(bandCell);
    clickItem(gridEl, "Pin row");
    clickItem(gridEl, "Unpin row");
    expect(pinnedIds(gridEl, "top")).toEqual([]);
  });

  it("places runtime-pinned rows adjacent to application-owned band rows", async () => {
    const { gridEl } = await mountGridHost(RowPinningHost, 600, (host) => {
      host.rowPinningMenu = true;
      host.pinnedTop = [{ id: "top", name: "TOP" }];
      host.pinnedBottom = [{ id: "total", name: "TOTAL" }];
    });
    rightClick(bodyCell(gridEl, 0));
    clickItem(gridEl, "Pin row");
    clickItem(gridEl, "Pin to bottom");
    expect(pinnedIds(gridEl, "bottom")).toEqual(["1", "p:bottom:total"]);

    rightClick(bodyCell(gridEl, 1));
    clickItem(gridEl, "Pin row");
    clickItem(gridEl, "Pin to top");
    expect(pinnedIds(gridEl, "top")).toEqual(["p:top:top", "2"]);
  });

  it("navigates between top, body, and bottom row sections", async () => {
    const { gridEl, host } = await mountGridHost(RowPinningHost, 600, (instance) => {
      instance.pinnedTop = [{ id: "top", name: "TOP" }];
      instance.pinnedBottom = [{ id: "bottom", name: "BOTTOM" }];
    });
    const core = host.api!.getCore();
    const pinnedCell = gridEl.querySelector<HTMLElement>(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-cell",
    )!;
    pinnedCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 0, rowPinned: "top" });

    const root = gridEl.querySelector<HTMLElement>(".pte-root")!;
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 0 });
    for (let index = 0; index < 3; index++) {
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    }
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 0, rowPinned: "bottom" });
  });
});
