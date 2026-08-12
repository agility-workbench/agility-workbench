import { Component } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import type {
  GridEventCellClickedParams,
  GridEventFilterChangedParams,
  GridEventHistoryChangedParams,
  GridEventRowClickedParams,
  GridEventSelectionChangedParams,
  IGridAPI,
  SortChangedParams,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

type Row = { symbol: string; price: number };

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="symbol"
      [rowNumbers]="true"
      [rowSelection]="true"
      (gridReady)="api = $event"
      (cellClicked)="onCellClicked($event)"
      (rowClicked)="onRowClicked($event)"
      (selectionChanged)="onSelectionChanged($event)"
      (sortChanged)="onSortChanged($event)"
      (filterChanged)="onFilterChanged($event)"
      (historyChanged)="onHistoryChanged($event)"
    />
  `,
})
class EventsHost {
  api: IGridAPI | null = null;
  rows: Row[] = [
    { symbol: "AAA", price: 100 },
    { symbol: "BBB", price: 200 },
  ];
  cols: NgColDef[] = [
    { colId: "symbol", key: "symbol", label: "Symbol" },
    { colId: "price", key: "price", label: "Price", sortable: true },
  ];
  onCellClicked = vi.fn<(event: GridEventCellClickedParams) => void>();
  onRowClicked = vi.fn<(event: GridEventRowClickedParams) => void>();
  onSelectionChanged = vi.fn<(event: GridEventSelectionChangedParams) => void>();
  onSortChanged = vi.fn<(event: SortChangedParams) => void>();
  onFilterChanged = vi.fn<(event: GridEventFilterChangedParams) => void>();
  onHistoryChanged = vi.fn<(event: GridEventHistoryChangedParams) => void>();
}

describe("AwbGrid outputs and imperative API", () => {
  it("emits cellClicked and rowClicked with the correct cell identity", async () => {
    const { gridEl, host } = await mountGridHost(EventsHost);
    const priceCell = Array.from(gridEl.querySelectorAll<HTMLElement>(".pte-cell"))
      .find((cell) => cell.textContent === "100")!;
    expect(priceCell).toBeTruthy();
    priceCell.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

    expect(host.onRowClicked).toHaveBeenCalledTimes(1);
    expect(host.onRowClicked.mock.calls[0][0]).toMatchObject({
      rowId: "AAA",
      viewIdx: 0,
      isGroup: false,
    });
    expect(host.onCellClicked).toHaveBeenCalledTimes(1);
    expect(host.onCellClicked.mock.calls[0][0]).toMatchObject({ rowId: "AAA", value: 100 });
  });

  it("bridges selection and sort events through Angular outputs", async () => {
    const { gridEl, host } = await mountGridHost(EventsHost);

    host.api!.selectAllRows();
    expect(host.onSelectionChanged).toHaveBeenCalledTimes(1);
    expect(host.onSelectionChanged.mock.calls[0][0].snapshot.selectedRowIds).toHaveLength(2);

    const price = host.api!.getColumnModel().getByColId("price")!;
    host.api!.dispatch({ type: "headerAction", action: "toggleSort", colId: price.instanceID });
    expect(host.onSortChanged).toHaveBeenCalledTimes(1);
    // Payload colIds are the public ColDef colIds; instance ids ride on changedColInstanceIds.
    expect(host.onSortChanged.mock.calls[0][0].changedColIds).toContain("price");
  });

  it("bridges the canonical filterChanged event through the Angular output", async () => {
    const { host } = await mountGridHost(EventsHost);

    host.api!.setFilterModel([{ colId: "symbol", filters: [{ type: "contains" as any, values: ["AA"] }] }]);
    expect(host.onFilterChanged).toHaveBeenCalledTimes(1);
    expect(host.onFilterChanged.mock.calls[0][0]).toMatchObject({
      source: "filter",
      changedColIds: ["symbol"],
    });

    host.api!.setQuickFilter("AAA");
    expect(host.onFilterChanged).toHaveBeenCalledTimes(2);
    expect(host.onFilterChanged.mock.calls[1][0]).toMatchObject({ source: "quickFilter", changedColIds: [] });
  });

  it("bridges historyChanged through the Angular output", async () => {
    const { host } = await mountGridHost(EventsHost);
    const api = host.api!;
    const price = api.getColumnModel().getByColId("price")!;

    api.setCellValue({ rowId: "AAA", colId: price.instanceID }, 137);
    expect(host.onHistoryChanged).toHaveBeenCalledTimes(1);
    expect(host.onHistoryChanged.mock.calls[0][0]).toMatchObject({
      reason: "commit", canUndo: true, canRedo: false, undoDepth: 1,
    });

    api.undo();
    expect(host.onHistoryChanged).toHaveBeenCalledTimes(2);
    expect(host.onHistoryChanged.mock.calls[1][0]).toMatchObject({
      reason: "undo", canUndo: false, canRedo: true,
    });

    // A grouped bulk write announces itself once, not once per cell.
    api.withUndoGroup(() => {
      api.setCellValue({ rowId: "AAA", colId: price.instanceID }, 1);
      api.setCellValue({ rowId: "BBB", colId: price.instanceID }, 2);
    });
    expect(host.onHistoryChanged).toHaveBeenCalledTimes(3);
    expect(api.getHistoryState().undoDepth).toBe(1);
  });

  it("updates, adds, and removes rows through applyTransaction", async () => {
    const { gridEl, host } = await mountGridHost(EventsHost);
    const api = host.api!;
    const core = api.getCore();

    api.applyTransaction({ update: [{ rowId: "AAA", row: { symbol: "AAA", price: 137 } }] });
    expect(core.getCellValue("AAA", "price")).toBe(137);

    api.applyTransaction({ add: [{ symbol: "CCC", price: 300 }] });
    expect(core.getCellValue("CCC", "price")).toBe(300);
    expect(core.getViewIndexForRowId("CCC")).not.toBeNull();

    api.applyTransaction({ remove: ["BBB"] });
    expect(core.getCellValue("BBB", "price")).toBeNull();
    expect(core.getViewIndexForRowId("BBB")).toBeNull();
    expect(gridEl.textContent).toContain("137");
  });

  it("captures and restores column width and pinning state", async () => {
    const { host } = await mountGridHost(EventsHost);
    const api = host.api!;
    const model = api.getColumnModel();

    api.dispatch({ type: "columnResize", colId: model.getByColId("symbol")!.instanceID, widthPx: 250 });
    api.dispatch({ type: "columnPin", colIds: [model.getByColId("price")!.instanceID], pinned: "right" });
    const saved = api.getColumnState();
    api.dispatch({ type: "columnPin", colIds: [model.getByColId("price")!.instanceID], pinned: null });
    api.applyColumnState(saved);

    const state = new Map(api.getColumnState().map((column) => [column.colId, column]));
    expect(state.get("symbol")!.widthPx).toBe(250);
    expect(state.get("price")!.pinned).toBe("right");
  });
});
