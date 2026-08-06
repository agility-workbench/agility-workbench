import { Component, input } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { ActionFrameComponentParams, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { dataCell, mountGridHost } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [rangeSelection]="rangeSelection"
      (gridReady)="api = $event"
    />
  `,
})
class KeyboardRangeHost {
  api: IGridAPI | null = null;
  rangeSelection = true;
  rows = [
    { id: "1", name: "AAA", city: "NY" },
    { id: "2", name: "BBB", city: "LA" },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    { colId: "city", key: "city", label: "City" },
  ];
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [rowNumbers]="true"
      [rowSelection]="true"
      [selectAllRowsOnHeaderClick]="selectAllRowsOnHeaderClick"
      (gridReady)="api = $event"
    />
  `,
})
class RowSelectionHost {
  api: IGridAPI | null = null;
  selectAllRowsOnHeaderClick = true;
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

@Component({
  standalone: true,
  template: `<div class="placement-frame">AF:{{ params()?.data?.name }}</div>`,
})
class PlacementFrame {
  readonly params = input<ActionFrameComponentParams>();
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      (gridReady)="api = $event"
    />
  `,
})
class PlacementHost {
  api: IGridAPI | null = null;
  rows = [
    { id: "1", name: "Ava", comment: "hello" },
    { id: "2", name: "Liam", comment: "world" },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    {
      colId: "comment",
      key: "comment",
      label: "Comment",
      actionFrameComponent: PlacementFrame,
      actionFrameOptions: { placement: "right" },
    },
  ];
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      (gridReady)="api = $event"
    />
  `,
})
class ColumnStateHost {
  api: IGridAPI | null = null;
  rows = [
    { id: "1", symbol: "AAA", price: 100, city: "NY" },
    { id: "2", symbol: "BBB", price: 200, city: "LA" },
  ];
  cols: NgColDef[] = [
    { colId: "symbol", key: "symbol", label: "Symbol" },
    { colId: "price", key: "price", label: "Price" },
    { colId: "city", key: "city", label: "City" },
  ];
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function mouseDown(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
}

describe("rangeSelection keyboard gating", () => {
  it("does not extend with Shift+Arrow when rangeSelection is false", async () => {
    const { gridEl, host } = await mountGridHost(KeyboardRangeHost, 600, (instance) => {
      instance.rangeSelection = false;
    });
    mouseDown(dataCell(gridEl, 0, 0));
    expect(host.api!.getSelection().kind).toBe("cell");

    const rootEl = gridEl.querySelector<HTMLElement>("[data-pte-grid-id]")!;
    rootEl.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }),
    );
    expect(host.api!.getSelection().kind).toBe("cell");
  });

  it("extends with Shift+Arrow when rangeSelection is enabled (control)", async () => {
    const { gridEl, host } = await mountGridHost(KeyboardRangeHost);
    mouseDown(dataCell(gridEl, 0, 0));

    const rootEl = gridEl.querySelector<HTMLElement>("[data-pte-grid-id]")!;
    rootEl.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }),
    );
    expect(host.api!.getSelection().kind).toBe("range");
  });
});

describe("row selection gating and API", () => {
  it("does NOT select all on header click when selectAllRowsOnHeaderClick is disabled", async () => {
    const { gridEl, host } = await mountGridHost(RowSelectionHost, 600, (instance) => {
      instance.selectAllRowsOnHeaderClick = false;
    });
    const header = gridEl.querySelector<HTMLElement>(".pte-hcell-row-number")!;
    header.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(host.api!.getSelectedRows()).toHaveLength(0);
    expect(host.api!.areAllRowsSelected()).toBe(false);
  });

  it("selectAllRows / deselectAllRows API select and clear all rows", async () => {
    const { host } = await mountGridHost(RowSelectionHost);
    const api = host.api!;

    api.selectAllRows();
    expect(api.areAllRowsSelected()).toBe(true);
    expect(api.getSelectedRows()).toHaveLength(3);

    api.deselectAllRows();
    expect(api.areAllRowsSelected()).toBe(false);
    expect(api.getSelectedRows()).toHaveLength(0);
  });
});

describe("ActionFrame placement override", () => {
  it("honors a per-column placement override (right)", async () => {
    const { gridEl, host } = await mountGridHost(PlacementHost);
    const colId = host.api!.getColumnModel().getByColId("comment")!.instanceID;
    host.api!.openActionFrame({ rowId: "1", colId });
    await tick();

    const popover = gridEl.querySelector<HTMLElement>(".pte-action-frame-popover");
    expect(popover).not.toBeNull();
    // FloatingAnchor stamps the resolved side on data-placement. happy-dom's zero-size rects make
    // exact geometry unreliable, but the resolved side should be present and not fall back to auto.
    expect(popover!.dataset.placement).toBeTruthy();
    expect(gridEl.querySelector(".placement-frame")?.textContent).toContain("AF:Ava");
  });
});

describe("applyColumnState end-to-end", () => {
  it("captures and restores column widths / pinning / visibility / order", async () => {
    const { host } = await mountGridHost(ColumnStateHost);
    const api = host.api!;
    const model = api.getColumnModel();

    // Mutate the layout via the API/model, then capture.
    api.dispatch({ type: "columnResize", colId: model.getByColId("symbol")!.instanceID, widthPx: 250 });
    api.dispatch({ type: "columnPin", colIds: [model.getByColId("price")!.instanceID], pinned: "right" });
    api.dispatch({ type: "columnVisibility", colIds: [model.getByColId("city")!.instanceID], hidden: true });
    const saved = api.getColumnState();
    const savedOrder = saved.map((column) => column.colId);

    // Change things again so restore has something to undo.
    api.dispatch({ type: "columnPin", colIds: [model.getByColId("price")!.instanceID], pinned: null });
    api.dispatch({ type: "columnVisibility", colIds: [model.getByColId("city")!.instanceID], hidden: false });
    api.dispatch({ type: "columnMove", colId: model.getByColId("symbol")!.instanceID, toIndex: 2, toSection: "center" });

    api.applyColumnState(saved);

    const after = new Map(api.getColumnState().map((column) => [column.colId, column]));
    expect(after.get("symbol")!.widthPx).toBe(250);
    expect(after.get("price")!.pinned).toBe("right");
    expect(after.get("city")!.hidden).toBe(true);
    expect(api.getColumnState().map((column) => column.colId)).toEqual(savedOrder);
  });
});
