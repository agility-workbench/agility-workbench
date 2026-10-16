import { Component } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import type {
  GridEventColumnsChangedParams,
  GridEventErrorParams,
  GridEventPaginationChangedParams,
  IGridAPI,
  IServerSideDataSource,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

type Row = { symbol: string; price: number };

const COLS: NgColDef[] = [
  { colId: "symbol", key: "symbol", label: "Symbol" },
  { colId: "price", key: "price", label: "Price", sortable: true },
];

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="symbol"
      [pagination]="true"
      [pageSize]="10"
      [pageSizes]="[10, 20]"
      (gridReady)="api = $event"
      (columnsChanged)="onColumnsChanged($event)"
      (paginationChanged)="onPaginationChanged($event)"
    />
  `,
})
class ColumnsHost {
  api: IGridAPI | null = null;
  rows: Row[] = Array.from({ length: 25 }, (_, i) => ({ symbol: `S${i}`, price: i }));
  cols = COLS;
  onColumnsChanged = vi.fn<(event: GridEventColumnsChangedParams) => void>();
  onPaginationChanged = vi.fn<(event: GridEventPaginationChangedParams) => void>();
}

const failure = new Error("backend down");
const failingSource: IServerSideDataSource = {
  getRows: ({ error }) => { setTimeout(() => error(failure), 0); },
};

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [columnDefs]="cols"
      rowIdKey="symbol"
      rowModelType="serverSide"
      [serverSideDataSource]="source"
      (gridError)="onGridError($event)"
    />
  `,
})
class ErrorHost {
  cols = COLS;
  source = failingSource;
  onGridError = vi.fn<(event: GridEventErrorParams) => void>();
}

describe("AwbGrid columnsChanged / paginationChanged / gridError outputs", () => {
  it("emits columnsChanged with the change's source", async () => {
    const { host } = await mountGridHost(ColumnsHost);
    host.onColumnsChanged.mockClear();
    host.api!.applyColumnState([{ colId: "price", pinned: "left" }]);
    expect(host.onColumnsChanged).toHaveBeenCalled();
    expect(host.onColumnsChanged.mock.calls.at(-1)![0]).toMatchObject({
      reason: "state", changedColIds: ["price"], source: "api",
    });
  });

  it("emits paginationChanged with getPaginationInfo()", async () => {
    const { host } = await mountGridHost(ColumnsHost);
    const api = host.api!;
    host.onPaginationChanged.mockClear();
    api.setPagination({ pageIndex: 1 });
    expect(host.onPaginationChanged).toHaveBeenCalled();
    const last = host.onPaginationChanged.mock.calls.at(-1)![0];
    expect(last).toMatchObject({ pageIndex: 1, pageSize: 10, totalRowCount: 25, totalPageCount: 3 });
    expect(last).toEqual(api.getPaginationInfo());
  });

  it("emits gridError for a failed server-side request, and ignores native error events", async () => {
    const { host, gridEl } = await mountGridHost(ErrorHost);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(host.onGridError).toHaveBeenCalledTimes(1);
    expect(host.onGridError.mock.calls[0][0]).toMatchObject({
      code: "row_model_error", message: "backend down", details: failure,
    });
    // The reason for the name: a DOM `error` event on the host is not a grid error.
    gridEl.dispatchEvent(new Event("error"));
    expect(host.onGridError).toHaveBeenCalledTimes(1);
  });
});
