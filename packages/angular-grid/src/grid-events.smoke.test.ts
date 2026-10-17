import { Component, NgZone } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import type {
  GridEventBodyScrollParams,
  GridEventColumnGroupOpenedParams,
  GridEventFirstDataRenderedParams,
  GridEventRowDataUpdatedParams,
  GridEventRowGroupOpenedParams,
  GridEventRowsChangedParams,
  IGridAPI,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

type Row = { symbol: string; region: string; price: number };

const COLS: NgColDef[] = [
  { colId: "symbol", key: "symbol", label: "Symbol" },
  {
    colId: "market", label: "Market", children: [
      { colId: "region", key: "region", label: "Region" },
      { colId: "price", key: "price", label: "Price", columnGroupShow: "open" },
    ],
  },
];
const ROWS: Row[] = Array.from({ length: 25 }, (_, i) => ({
  symbol: `S${i}`, region: i % 2 ? "EMEA" : "AMER", price: i,
}));

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="symbol"
      (gridReady)="api = $event"
      (firstDataRendered)="onFirstDataRendered($event)"
      (rowDataUpdated)="onRowDataUpdated($event)"
      (rowsChanged)="onRowsChanged($event)"
      (rowGroupOpened)="onRowGroupOpened($event)"
      (columnGroupOpened)="onColumnGroupOpened($event)"
      (bodyScroll)="onBodyScroll($event)"
    />
  `,
})
class EventsHost {
  api: IGridAPI | null = null;
  rows = ROWS;
  cols = COLS;
  onFirstDataRendered = vi.fn<(event: GridEventFirstDataRenderedParams) => void>();
  onRowDataUpdated = vi.fn<(event: GridEventRowDataUpdatedParams) => void>();
  onRowsChanged = vi.fn<(event: GridEventRowsChangedParams) => void>();
  onRowGroupOpened = vi.fn<(event: GridEventRowGroupOpenedParams) => void>();
  onColumnGroupOpened = vi.fn<(event: GridEventColumnGroupOpenedParams) => void>();
  onBodyScroll = vi.fn<(event: GridEventBodyScrollParams) => void>();
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `<awb-grid style="height: 600px" [rowData]="rows" [columnDefs]="cols" rowIdKey="symbol" />`,
})
class UnboundHost {
  rows = ROWS;
  cols = COLS;
}

describe("AwbGrid event outputs", () => {
  it("emits the new outputs with the core payloads", async () => {
    const { host, gridEl } = await mountGridHost(EventsHost);
    const api = host.api!;
    expect(host.onFirstDataRendered).toHaveBeenCalledTimes(1);
    expect(host.onFirstDataRendered).toHaveBeenCalledWith({ rowCount: 25 });
    expect(host.onRowsChanged).toHaveBeenCalled();

    api.applyTransaction({ remove: ["S0"] });
    expect(host.onRowDataUpdated.mock.calls.at(-1)![0]).toEqual({ reason: "transaction", rowCount: 24 });

    api.setRowGroupColumns(["region"]);
    api.setAllGroupsExpanded(true);
    expect(host.onRowGroupOpened.mock.calls.at(-1)![0]).toMatchObject({ expanded: true, source: "api" });

    api.setColumnGroupState([{ colId: "market", open: true }]);
    expect(host.onColumnGroupOpened).toHaveBeenCalledWith({ groupIds: ["market"], expanded: true, source: "api" });

    const body = gridEl.querySelector<HTMLElement>(".pte-body")!;
    body.scrollTop = 80;
    body.dispatchEvent(new Event("scroll"));
    expect(host.onBodyScroll).toHaveBeenCalledWith({ scrollTopPx: 80, scrollLeftPx: 0, direction: "vertical" });
    expect(host.onFirstDataRendered).toHaveBeenCalledTimes(1);
  });

  it("does not enter the zone for an output nothing is bound to", async () => {
    const { gridEl } = await mountGridHost(UnboundHost);
    const run = vi.spyOn(TestBed.inject(NgZone), "run");
    const body = gridEl.querySelector<HTMLElement>(".pte-body")!;
    body.scrollTop = 80;
    body.dispatchEvent(new Event("scroll"));
    expect(run).not.toHaveBeenCalled();
  });
});
