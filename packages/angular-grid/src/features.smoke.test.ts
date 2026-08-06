import { Component, input } from "@angular/core";
import { describe, expect, it } from "vitest";
import type {
  CellRendererParams,
  GridOptions,
  IGridAPI,
  TooltipComponentParams,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

type Row = { id: string; name: string; amount: number; spacer?: boolean };

@Component({
  standalone: true,
  template: `<strong class="full-width-content">Section: {{ params()?.data?.name }}</strong>`,
})
class FullWidthRenderer {
  readonly params = input<CellRendererParams>();
}

@Component({
  standalone: true,
  template: `<span class="custom-tooltip">Tip: {{ params()?.value }} / {{ params()?.suffix }}</span>`,
})
class CustomTooltip {
  readonly params = input<TooltipComponentParams & { suffix?: string }>();
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
      [isFullWidthRow]="isFullWidthRow"
      [fullWidthCellRenderer]="FullWidthRenderer"
      [pinnedTopRowData]="pinnedTop"
      [pinnedBottomRowData]="pinnedBottom"
      [toolbar]="toolbar"
      [columnPanel]="columnPanel"
      [tooltip]="tooltip"
      (gridReady)="api = $event"
    />
  `,
})
class FeaturesHost {
  readonly FullWidthRenderer = FullWidthRenderer;
  api: IGridAPI | null = null;
  toolbar: GridOptions["toolbar"] = undefined;
  columnPanel: GridOptions["columnPanel"] = false;
  tooltip: GridOptions["tooltip"] = { showDelay: 0, hideDelay: 0 };
  pinnedTop: Row[] = [{ id: "top", name: "Target", amount: 200 }];
  pinnedBottom: Row[] = [{ id: "bottom", name: "Total", amount: 150 }];
  rows: Row[] = [
    { id: "1", name: "AAA", amount: 10 },
    { id: "2", name: "spacer", amount: 0, spacer: true },
    { id: "3", name: "CCC", amount: 30 },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    {
      colId: "amount",
      key: "amount",
      label: "Amount",
      tooltipComponent: CustomTooltip,
      tooltipComponentParams: { suffix: "custom" },
    },
  ];
  isFullWidthRow = (node: { data?: unknown }) => !!(node.data as Row | undefined)?.spacer;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AwbGrid feature integration", () => {
  it("renders Angular full-width content only for matching rows", async () => {
    const { gridEl } = await mountGridHost(FeaturesHost);
    const fullWidthRows = gridEl.querySelectorAll<HTMLElement>(".pte-row.pte-full-width-row");

    expect(fullWidthRows).toHaveLength(1);
    expect(fullWidthRows[0].textContent).toContain("Section: spacer");
    expect(fullWidthRows[0].querySelector<HTMLElement>(".pte-full-width-cell")!.style.display).not.toBe(
      "none",
    );
  });

  it("renders and reconciles application-owned top and bottom rows", async () => {
    const { fixture, gridEl, host } = await mountGridHost(FeaturesHost);
    const top = gridEl.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    const bottom = gridEl.querySelector<HTMLElement>(".pte-pinned-rows-bottom")!;
    expect(top.textContent).toContain("Target");
    expect(bottom.textContent).toContain("Total");
    expect(host.api!.getCore().getRowModel().getViewCount()).toBe(host.rows.length);

    host.pinnedTop = [{ id: "forecast", name: "Forecast", amount: 300 }];
    host.pinnedBottom = [];
    await syncGridInputs(fixture);
    expect(top.textContent).toContain("Forecast");
    expect(top.textContent).not.toContain("Target");
    expect(bottom.style.display).toBe("none");
  });

  it("also reconciles pinned rows through the imperative API", async () => {
    const { gridEl, host } = await mountGridHost(FeaturesHost);
    host.api!.setPinnedTopRowData([{ id: "api", name: "From API", amount: 400 }]);
    host.api!.setPinnedBottomRowData([]);

    expect(gridEl.querySelector(".pte-pinned-rows-top")?.textContent).toContain("From API");
    expect(gridEl.querySelector<HTMLElement>(".pte-pinned-rows-bottom")!.style.display).toBe("none");
  });

  it("renders an Angular tooltip component with merged custom params", async () => {
    const { gridEl, host } = await mountGridHost(FeaturesHost);
    const amount = host.api!.getColumnModel().getByColId("amount")!;
    host.api!.showTooltip({ rowId: "1", colId: amount.instanceID });
    await tick();

    const tooltip = gridEl.querySelector(".custom-tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip?.textContent).toContain("Tip: 10 / custom");
  });

  it("updates toolbar sections without remounting or losing grouping state", async () => {
    const { fixture, gridEl, host } = await mountGridHost(FeaturesHost);
    const api = host.api!;
    expect(gridEl.querySelector(".pte-grid-toolbar")).toBeNull();

    host.toolbar = { grouping: true };
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-grid-toolbar-group-section")).toBeTruthy();
    const amount = api.getColumnModel().getByColId("amount")!;
    api.getCore().dispatch({ type: "rowGroupSet", colIds: [amount.instanceID] });
    expect(gridEl.querySelector(".pte-grid-toolbar-group-chip-label")?.textContent).toBe("Amount");

    host.toolbar = { sorting: true, export: true };
    await syncGridInputs(fixture);
    expect(host.api).toBe(api);
    expect(gridEl.querySelector(".pte-grid-toolbar-group-section")).toBeNull();
    expect(gridEl.querySelector(".pte-grid-toolbar-sort-section")).toBeTruthy();
    expect(gridEl.querySelector(".pte-grid-toolbar-export-button")).toBeTruthy();
    expect(api.getCore().getRowGroupColumns().map((column) => column.instanceID)).toEqual([
      amount.instanceID,
    ]);
  });

  it("shows and removes the toolbar column-panel trigger live", async () => {
    const { fixture, gridEl, host } = await mountGridHost(FeaturesHost);
    const api = host.api!;

    host.columnPanel = { trigger: "toolbar" };
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-grid-toolbar")).toBeTruthy();
    expect(gridEl.querySelector(".pte-column-panel-trigger-toolbar-button")).toBeTruthy();

    host.columnPanel = false;
    await syncGridInputs(fixture);
    expect(host.api).toBe(api);
    expect(gridEl.querySelector(".pte-column-panel-trigger-toolbar-button")).toBeNull();
  });
});
