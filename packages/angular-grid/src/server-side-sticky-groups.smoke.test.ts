import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type {
  IGridAPI,
  IServerSideDataSource,
  IServerSideGetRowsParams,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

type Row = { id: string; region: string; country: string; sales: number };

const rows: Row[] = Array.from({ length: 60 }, (_, index) => ({
  id: `sticky-${index}`,
  region: "EMEA",
  country: index < 30 ? "First" : "Second",
  sales: index,
}));

const source: IServerSideDataSource = {
  getRows: ({ request, success }: IServerSideGetRowsParams) => {
    const subset = rows.filter((row) =>
      request.groupKeys.every((key) => row[key.key as keyof Row] === key.value));
    let resultRows: unknown[];
    if (request.groupKeys.length < request.groupBy.length) {
      const key = request.groupBy[request.groupKeys.length] as keyof Row;
      const values = Array.from(new Set(subset.map((row) => String(row[key]))));
      resultRows = values.map((value) => ({
        [key]: value,
        count: subset.filter((row) => String(row[key]) === value).length,
      }));
    } else {
      resultRows = subset;
    }
    const start = request.startRow ?? 0;
    const end = request.endRow ?? resultRows.length;
    success({ rows: resultRows.slice(start, end), totalRows: resultRows.length });
  },
};

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [columnDefs]="cols"
      rowIdKey="id"
      rowModelType="serverSide"
      [serverSideDataSource]="source"
      [serverSideBlockSize]="10"
      [groupRowsSticky]="true"
      [groupDefaultExpanded]="-1"
      [getGroupChildCount]="getGroupChildCount"
      (gridReady)="api = $event"
    />
  `,
})
class ServerSideStickyHost {
  readonly source = source;
  api: IGridAPI | null = null;
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region" },
    { colId: "country", key: "country", label: "Country" },
    { colId: "sales", key: "sales", label: "Sales" },
  ];
  getGroupChildCount = (row: { count?: number }) => row.count;
}

async function settleLoads(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("AwbGrid server-side sticky groups", () => {
  it("docks lazily loaded group ancestors before and after unloaded slots resolve", async () => {
    const { gridEl, host } = await mountGridHost(ServerSideStickyHost);
    const core = host.api!.getCore();
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    await settleLoads();

    const model = core.getRowModel();
    expect(model.getRowCount()).toBe(63);
    const overlay = gridEl.querySelector<HTMLElement>(".pte-body .pte-sticky-rows")!;
    const headerIds = () => Array.from(
      overlay.querySelectorAll<HTMLElement>(
        ".pte-pinned-rows-center .pte-pinned-row.pte-group-row",
      ),
      (element) => element.dataset.rowId,
    );
    const regionId = model.getRowNodeAtViewIndex(0)!.id;
    const firstId = model.getRowNodeAtViewIndex(1)!.id;
    expect(headerIds()).toEqual([regionId, firstId]);

    const secondId = model.getGroupNodes().find((node) => node.groupKey === "Second")!.id;
    expect(model.getRowNodeAtViewIndex(55)).toBeUndefined();
    const scroller = gridEl.querySelector<HTMLDivElement>(".pte-scroller")!;
    scroller.scrollTop = 55 * 43;
    scroller.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(headerIds()).toEqual([regionId, secondId]);

    await settleLoads();
    expect(headerIds()).toEqual([regionId, secondId]);
    expect(overlay.style.height).toBe("86px");
  });
});
