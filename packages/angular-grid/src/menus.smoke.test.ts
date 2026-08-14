import { Component, TemplateRef, viewChild } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import {
  AggregateType,
  ColumnType,
  type BodyMenuContext,
  type ColumnMenuContext,
  type GridOptions,
  type IGridAPI,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import type { NgMenuItem } from "./menu";
import { mountGridHost } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <ng-template #menuIcon><span class="angular-menu-icon">NG</span></ng-template>
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [rowNumbers]="rowNumbers"
      [cellSelection]="cellSelection"
      [rowInsertionMenu]="rowInsertionMenu"
      [bodyContextMenu]="bodyMenu"
      [getColumnMenuItems]="columnItems"
      [tooltip]="{ showDelay: 0, hideDelay: 0 }"
      (gridReady)="api = $event"
    />
  `,
})
class MenusHost {
  readonly menuIcon = viewChild.required<TemplateRef<unknown>>("menuIcon");
  api: IGridAPI | null = null;
  rows = [{ id: "1", name: "AAA", sales: 10 }, { id: "2", name: "BBB", sales: 30 }];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
  ];
  bodyMenu: boolean | ((p: { ctx: BodyMenuContext; items: NgMenuItem[] }) => NgMenuItem[]) = true;
  rowNumbers = false;
  cellSelection = true;
  rowInsertionMenu: GridOptions["rowInsertionMenu"] = undefined;
  columnItems: ((p: { ctx: ColumnMenuContext; items: NgMenuItem[] }) => NgMenuItem[]) | undefined;
}

function firstCell(gridEl: HTMLElement): HTMLElement {
  return gridEl.querySelector<HTMLElement>(".pte-row[data-view-idx='0'] .pte-cell")!;
}

function rightClick(element: HTMLElement): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  element.dispatchEvent(event);
  return event;
}

function labels(gridEl: HTMLElement): string[] {
  return Array.from(gridEl.querySelectorAll(".pte-menu .pte-menu-item-text"), (element) =>
    element.textContent ?? "");
}

function header(gridEl: HTMLElement, api: IGridAPI, colId: string): HTMLElement {
  const id = api.getColumnModel().getByColId(colId)!.instanceID;
  return gridEl.querySelector<HTMLElement>(`.pte-hcell#${id}`)!;
}

describe("AwbGrid menu integration", () => {
  it("shows the default body menu and suppresses the browser menu", async () => {
    const { gridEl } = await mountGridHost(MenusHost);
    const event = rightClick(firstCell(gridEl));

    expect(event.defaultPrevented).toBe(true);
    expect(labels(gridEl)).toContain("Copy");
  });

  it("lets the native body menu through when bodyContextMenu is false", async () => {
    const { gridEl } = await mountGridHost(MenusHost, 600, (host) => {
      host.bodyMenu = false;
    });
    const event = rightClick(firstCell(gridEl));

    expect(event.defaultPrevented).toBe(false);
    expect(gridEl.querySelector(".pte-menu")).toBeNull();
  });

  it("uses the items returned by a custom body-menu callback", async () => {
    const action = vi.fn();
    const { gridEl } = await mountGridHost(MenusHost, 600, (host) => {
      host.bodyMenu = ({ items }) => [
        ...items,
        { id: "angular-action", label: "Angular action", onClick: action },
      ];
    });
    rightClick(firstCell(gridEl));
    expect(labels(gridEl)).toContain("Angular action");

    gridEl.querySelector<HTMLButtonElement>('[data-item-id="angular-action"]')!.click();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("forwards the opt-in row-number insertion menu and inserts the factory row", async () => {
    const { gridEl, host } = await mountGridHost(MenusHost, 600, (instance) => {
      instance.rowNumbers = true;
      instance.cellSelection = false;
      instance.rowInsertionMenu = {
        createRow: ({ position }) => ({ id: "new", name: position, sales: 0 }),
      };
    });
    const rowNumber = Array.from(gridEl.querySelectorAll<HTMLElement>(
      '.pte-row[data-view-idx="0"] .pte-row-number-cell',
    ))[0];
    rightClick(rowNumber);
    expect(labels(gridEl)).toContain("Insert");
    gridEl.querySelector<HTMLButtonElement>('[data-item-id="insertRow"]')!.click();
    gridEl.querySelector<HTMLButtonElement>('[data-item-id="insertRowBelow"]')!.click();

    const ids: string[] = [];
    host.api!.forEachNodeAfterFilter(node => ids.push(node.id));
    expect(ids).toEqual(["1", "new", "2"]);
  });

  it("suppresses the native menu without opening a grid menu when the callback returns no items", async () => {
    const { gridEl } = await mountGridHost(MenusHost, 600, (host) => {
      host.bodyMenu = () => [];
    });
    const event = rightClick(firstCell(gridEl));
    expect(event.defaultPrevented).toBe(true);
    expect(gridEl.querySelector(".pte-menu")).toBeNull();
  });

  it("honors per-column menu button and context-menu flags", async () => {
    const { gridEl, host } = await mountGridHost(MenusHost, 600, (instance) => {
      instance.cols = [
        { colId: "name", key: "name", label: "Name", showColumnMenu: false },
        { colId: "sales", key: "sales", label: "Sales", columnContextMenu: false },
      ];
    });

    expect(header(gridEl, host.api!, "name").querySelector(".pte-hcell-menu-menuBtn")).toBeNull();
    expect(header(gridEl, host.api!, "sales").querySelector(".pte-hcell-menu-menuBtn")).toBeTruthy();
    const event = rightClick(header(gridEl, host.api!, "sales"));
    expect(event.defaultPrevented).toBe(false);
    expect(gridEl.querySelector(".pte-menu")).toBeNull();
  });

  it("renders Angular TemplateRef slots returned by getColumnMenuItems", async () => {
    const { gridEl, host } = await mountGridHost(MenusHost, 600, (instance) => {
      instance.columnItems = ({ items }) => [
        ...items,
        {
          id: "templated",
          label: "Templated item",
          left: instance.menuIcon(),
          onClick: () => undefined,
        },
      ];
    });
    const nameHeader = header(gridEl, host.api!, "name");
    nameHeader.querySelector<HTMLButtonElement>(".pte-hcell-menu-menuBtn")!.click();

    expect(labels(gridEl)).toContain("Templated item");
    expect(gridEl.querySelector(".angular-menu-icon")?.textContent).toBe("NG");
  });

  it("changes and clears aggregate functions through the aggregate-row menu", async () => {
    const { gridEl, host } = await mountGridHost(MenusHost);
    const core = host.api!.getCore();
    const salesId = core.getColumnModel().getByColId("sales")!.instanceID;
    core.dispatch({
      type: "aggregateModelSet",
      aggregateModels: [{ key: salesId, type: AggregateType.AVG }],
    });

    const aggregateCell = gridEl.querySelector<HTMLElement>(
      `.pte-aggregate-cell[data-col-id="${salesId}"]`,
    )!;
    expect(aggregateCell.querySelector(".icon-avg")).toBeTruthy();
    aggregateCell.querySelector<HTMLButtonElement>(".pte-aggregate-menu-button")!.click();
    gridEl.querySelector<HTMLButtonElement>('[data-item-id="aggSum"]')!.click();
    expect(core.getAggregateModel()).toEqual([{ key: salesId, type: AggregateType.SUM }]);

    aggregateCell.querySelector<HTMLButtonElement>(".pte-aggregate-menu-button")!.click();
    gridEl.querySelector<HTMLButtonElement>('[data-item-id="aggClear"]')!.click();
    expect(core.getAggregateModel()).toEqual([]);
    expect(gridEl.querySelector<HTMLElement>(".pte-aggregate-row")!.style.display).toBe("none");
  });
});
