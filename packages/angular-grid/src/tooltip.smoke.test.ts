import { Component, input } from "@angular/core";
import { describe, expect, it } from "vitest";
import {
  SparklineRenderer,
  type GridOptions,
  type IGridAPI,
  type TooltipComponentParams,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

@Component({
  standalone: true,
  template: `<span class="angular-header-tooltip">Header: {{ params()?.colDef?.label }}</span>`,
})
class AngularHeaderTooltip {
  readonly params = input<TooltipComponentParams>();
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
      [tooltip]="tooltip"
      (gridReady)="api = $event"
    />
  `,
})
class TooltipHost {
  api: IGridAPI | null = null;
  tooltip: GridOptions["tooltip"] = { showDelay: 0, hideDelay: 0 };
  rows = [
    { id: "1", name: "Ava", email: "ava@example.com", notes: "short" },
    { id: "2", name: "Liam", email: "liam@example.com", notes: "short" },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    { colId: "email", key: "email", label: "Email" },
  ];
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

function bodyCell(gridEl: HTMLElement, colIdx: number): HTMLElement {
  return gridEl.querySelector<HTMLElement>(
    `.pte-row[data-view-idx="0"] .pte-cell[data-col-idx="${colIdx}"]`,
  )!;
}

async function hover(element: Element): Promise<void> {
  element.dispatchEvent(new MouseEvent("mouseover", {
    bubbles: true,
    clientX: 10,
    clientY: 10,
  }));
  await tick();
}

describe("AwbGrid tooltips", () => {
  it("uses tooltipField values on hover", async () => {
    const { gridEl } = await mountGridHost(TooltipHost, 600, (instance) => {
      instance.cols = [
        { colId: "name", key: "name", label: "Name", tooltipField: "email" },
        { colId: "email", key: "email", label: "Email" },
      ];
    });
    await hover(bodyCell(gridEl, 0));
    expect(gridEl.querySelector(".pte-tooltip")?.textContent).toContain("ava@example.com");
  });

  it("shows a programmatic tooltip for a center column beside a pinned column", async () => {
    const { gridEl, host } = await mountGridHost(TooltipHost, 600, (instance) => {
      instance.cols = [
        { colId: "name", key: "name", label: "Name", pinned: "left" },
        { colId: "email", key: "email", label: "Email", tooltipField: "notes" },
      ];
    });
    const email = host.api!.getColumnModel().getByColId("email")!;
    host.api!.showTooltip({ rowId: "1", colId: email.instanceID });
    await tick();
    expect(gridEl.querySelector(".pte-tooltip")?.textContent).toContain("short");
  });

  it("mounts an Angular component for a header tooltip", async () => {
    const { gridEl, host } = await mountGridHost(TooltipHost, 600, (instance) => {
      instance.cols = [
        {
          colId: "name",
          key: "name",
          label: "Name",
          headerTooltip: AngularHeaderTooltip,
        },
      ];
    });
    const id = host.api!.getColumnModel().getByColId("name")!.instanceID;
    await hover(gridEl.querySelector<HTMLElement>(`.pte-hcell#${id}`)!);
    expect(gridEl.querySelector(".angular-header-tooltip")?.textContent).toContain("Header: Name");
  });

  it("does not show explicit tooltips when tooltip is false", async () => {
    const { gridEl, host } = await mountGridHost(TooltipHost, 600, (instance) => {
      instance.tooltip = false;
      instance.cols = [
        { colId: "name", key: "name", label: "Name", tooltipField: "email" },
      ];
    });
    const name = host.api!.getColumnModel().getByColId("name")!;
    host.api!.showTooltip({ rowId: "1", colId: name.instanceID });
    await tick();
    expect(gridEl.querySelector(".pte-tooltip")).toBeNull();
  });

  it("honors suppressAutoTooltip for truncated cells", async () => {
    const { gridEl } = await mountGridHost(TooltipHost, 600, (instance) => {
      instance.cols = [
        { colId: "name", key: "name", label: "Name", suppressAutoTooltip: true },
      ];
    });
    const cell = bodyCell(gridEl, 0);
    Object.defineProperties(cell, {
      scrollWidth: { configurable: true, value: 500 },
      clientWidth: { configurable: true, value: 50 },
    });
    await hover(cell);
    expect(gridEl.querySelector(".pte-tooltip")).toBeNull();
  });

  it("applies column-level mode and interactive overrides", async () => {
    const { gridEl } = await mountGridHost(TooltipHost, 600, (instance) => {
      instance.tooltip = { showDelay: 0, hideDelay: 0, mode: "follow" };
      instance.cols = [
        {
          colId: "name",
          key: "name",
          label: "Name",
          tooltipField: "email",
          tooltipOptions: { interactive: true },
        },
      ];
    });
    await hover(bodyCell(gridEl, 0));
    const tooltip = gridEl.querySelector<HTMLElement>(".pte-tooltip")!;
    expect(tooltip.classList).toContain("pte-tooltip-interactive");
    expect(tooltip.dataset.placement).toBeTruthy();
  });

  it("switches tooltip mode and disables tooltips live without remounting", async () => {
    const { fixture, gridEl, host } = await mountGridHost(TooltipHost, 600, (instance) => {
      instance.tooltip = { showDelay: 0, hideDelay: 0, mode: "anchored" };
      instance.cols = [
        { colId: "name", key: "name", label: "Name", tooltipField: "email" },
      ];
    });
    const api = host.api!;
    await hover(bodyCell(gridEl, 0));
    expect(gridEl.querySelector<HTMLElement>(".pte-tooltip")?.dataset.placement).toBeTruthy();

    host.tooltip = { showDelay: 0, hideDelay: 0, mode: "follow" };
    await syncGridInputs(fixture);
    await hover(bodyCell(gridEl, 0));
    expect(host.api).toBe(api);
    expect(gridEl.querySelector<HTMLElement>(".pte-tooltip")?.dataset.placement).toBeUndefined();

    host.tooltip = false;
    await syncGridInputs(fixture);
    await hover(bodyCell(gridEl, 0));
    expect(gridEl.querySelector(".pte-tooltip")).toBeNull();
  });

  it("renders the core sparkline renderer and its point targets", async () => {
    const { gridEl } = await mountGridHost(TooltipHost, 600, (instance) => {
      instance.cols = [
        {
          colId: "trend",
          label: "Trend",
          valueGetter: () => [10, Number.NaN, 30],
          cellRenderer: SparklineRenderer,
          cellRendererParams: {
            type: "line",
            showPoints: true,
            tooltipValueFormatter: ({ value, index }: { value: number; index: number }) =>
              `Point ${index}: $${value}`,
          },
        },
      ];
    });
    const targets = gridEl.querySelectorAll<SVGElement>(
      '.pte-row[data-view-idx="0"] .pte-sparkline-tooltip-target',
    );
    expect(targets).toHaveLength(2);
    expect(gridEl.querySelectorAll('.pte-row[data-view-idx="0"] .pte-sparkline-point')).toHaveLength(2);
    expect(targets[0].dataset.sparklinePointIndex).toBe("0");
    expect(targets[1].dataset.sparklinePointIndex).toBe("2");
  });
});
