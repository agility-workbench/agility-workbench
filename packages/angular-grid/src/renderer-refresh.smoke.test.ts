import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { CellRendererParams, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { ICellRendererNgComp, NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

const refreshReasons: Array<string | undefined> = [];

@Component({
  standalone: true,
  template: `<span class="recording-renderer">{{ value }}</span>`,
})
class RecordingRenderer implements ICellRendererNgComp {
  value: unknown;

  awbInit(params: CellRendererParams): void {
    this.value = params.value;
  }

  awbRefresh(params: CellRendererParams): boolean {
    this.value = params.value;
    refreshReasons.push(params.refreshReason);
    return true;
  }
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
class RendererRefreshHost {
  api: IGridAPI | null = null;
  rows = [
    { id: "1", region: "EMEA", sales: 10 },
    { id: "2", region: "APAC", sales: 20 },
  ];
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region" },
    {
      colId: "sales",
      key: "sales",
      label: "Sales",
      cellRenderer: RecordingRenderer,
      resizable: true,
    },
  ];
}

describe("AwbGrid renderer refresh", () => {
  it("delivers refreshReason='resize' to Angular renderers after a column resize", async () => {
    const { host } = await mountGridHost(RendererRefreshHost);
    const core = host.api!.getCore();
    const sales = core.getColumnModel().getByColId("sales")!;
    refreshReasons.length = 0;

    core.dispatch({
      type: "columnResize",
      colId: sales.instanceID,
      widthPx: sales.computedWidth + 60,
    });

    expect(refreshReasons.length).toBeGreaterThan(0);
    expect(refreshReasons.every((reason) => reason === "resize")).toBe(true);
  });
});
