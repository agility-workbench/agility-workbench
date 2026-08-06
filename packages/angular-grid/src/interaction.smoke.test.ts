import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { IGridAPI } from "@agility-workbench/grid";
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
      [cellSelection]="cellSelection"
      [rangeSelection]="rangeSelection"
      [columnSelection]="columnSelection"
      [bodyContextMenu]="bodyContextMenu"
      (gridReady)="api = $event"
    />
  `,
})
class InteractionHost {
  api: IGridAPI | null = null;
  cellSelection: boolean | "text" = true;
  rangeSelection = true;
  columnSelection = true;
  bodyContextMenu = true;
  rows = [{ id: "1", name: "AAA", city: "NY" }, { id: "2", name: "BBB", city: "LA" }];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    { colId: "city", key: "city", label: "City" },
  ];
}

function cells(gridEl: HTMLElement): HTMLElement[] {
  return Array.from(gridEl.querySelectorAll<HTMLElement>(
    ".pte-row[data-view-idx='0'] .pte-cell:not(.pte-row-number-cell)",
  ));
}

function mouseDown(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
}

describe("AwbGrid interaction options", () => {
  it("selects cells and extends ranges by default", async () => {
    const { gridEl, host } = await mountGridHost(InteractionHost);
    const row = cells(gridEl);
    mouseDown(row[0]);
    expect(host.api!.getSelection().kind).toBe("cell");

    row[1].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(host.api!.getSelection().kind).toBe("range");
  });

  it("keeps a single-cell selection when rangeSelection is disabled", async () => {
    const { gridEl, host } = await mountGridHost(InteractionHost, 600, (instance) => {
      instance.rangeSelection = false;
    });
    const row = cells(gridEl);
    mouseDown(row[0]);
    row[1].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(host.api!.getSelection().kind).toBe("cell");
  });

  it("leaves grid selection inert when cellSelection is false", async () => {
    const { gridEl, host } = await mountGridHost(InteractionHost, 600, (instance) => {
      instance.cellSelection = false;
    });
    mouseDown(cells(gridEl)[0]);
    expect(host.api!.getSelection().kind).toBe("none");
    expect(host.api!.getSelection().active).toBeNull();
  });

  it("enables native text selection mode without opening the body menu", async () => {
    const { gridEl, host } = await mountGridHost(InteractionHost, 600, (instance) => {
      instance.cellSelection = "text";
    });
    const cell = cells(gridEl)[0];
    mouseDown(cell);
    const context = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    cell.dispatchEvent(context);

    expect(host.api!.getSelection().kind).toBe("none");
    expect(gridEl.querySelector(".pte-root")?.classList).toContain("pte-text-selection");
    expect(context.defaultPrevented).toBe(false);
    expect(gridEl.querySelector(".pte-menu")).toBeNull();
  });

  it("selects columns from header clicks by default", async () => {
    const { gridEl, host } = await mountGridHost(InteractionHost);
    const name = host.api!.getColumnModel().getByColId("name")!;
    const nameHeader = gridEl.querySelector<HTMLElement>(`.pte-hcell#${name.instanceID}`)!;
    (nameHeader.querySelector<HTMLElement>(".pte-hcell-content") ?? nameHeader).click();
    expect(host.api!.getSelection().kind).toBe("column");
  });

  it("does not select columns when columnSelection is disabled", async () => {
    const { gridEl, host } = await mountGridHost(InteractionHost, 600, (instance) => {
      instance.columnSelection = false;
    });
    const name = host.api!.getColumnModel().getByColId("name")!;
    const nameHeader = gridEl.querySelector<HTMLElement>(
      `.pte-hcell#${name.instanceID}`,
    )!;
    (nameHeader.querySelector<HTMLElement>(".pte-hcell-content") ?? nameHeader).click();
    expect(host.api!.getSelection().kind).not.toBe("column");
  });

  it("lets the native context menu through when bodyContextMenu is false", async () => {
    const { gridEl, host } = await mountGridHost(InteractionHost, 600, (instance) => {
      instance.bodyContextMenu = false;
    });
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    cells(gridEl)[0].dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(gridEl.querySelector(".pte-menu")).toBeNull();
    expect(host.api!.getSelection().kind).toBe("none");
  });
});
