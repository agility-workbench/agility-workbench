import { Component, OnDestroy, input } from "@angular/core";
import { describe, expect, it } from "vitest";
import { AggregateType } from "@agility-workbench/grid";
import type { CellRendererParams, HeaderComponentParams, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { IHeaderNgComp, NgColDef, NgDefaultColDef, NgPartialColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

let liveHeaders = 0;

/** awbInit-style header: drives sort through the params callback and refreshes via awbRefresh. */
@Component({
  standalone: true,
  template: `<button type="button" class="ng-header" [class]="'ng-header ng-header-l' + level" (click)="sort()">{{ label }}</button>`,
})
class SortHeader implements IHeaderNgComp, OnDestroy {
  label = "";
  level = 0;
  private params: HeaderComponentParams | null = null;

  constructor() { liveHeaders++; }

  awbInit(params: HeaderComponentParams): void { this.apply(params); }

  awbRefresh(params: HeaderComponentParams): boolean {
    this.apply(params);
    return true;
  }

  sort(): void { this.params?.progressSort(); }

  ngOnDestroy(): void { liveHeaders--; }

  private apply(params: HeaderComponentParams): void {
    this.params = params;
    this.level = params.level;
    this.label = `${params.displayName}:${params.sort.direction ?? "none"}`;
  }
}

/** Signal-input-style header. */
@Component({
  standalone: true,
  template: `<span class="ng-input-header">{{ params()?.displayName }}</span>`,
})
class InputHeader {
  readonly params = input<HeaderComponentParams>();
}

@Component({
  standalone: true,
  template: `<i class="ng-badge">{{ params()?.value }}</i>`,
})
class BadgeCell {
  readonly params = input<CellRendererParams>();
}

const ROWS = [
  { id: "1", region: "EMEA", quarter: "Q1", revenue: 20 },
  { id: "2", region: "EMEA", quarter: "Q2", revenue: 10 },
  { id: "3", region: "APAC", quarter: "Q1", revenue: 5 },
];

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      [defaultColDef]="defaultColDef"
      rowIdKey="id"
      (gridReady)="api = $event"
    />
  `,
})
class HeaderHost {
  api: IGridAPI | null = null;
  rows = ROWS;
  defaultColDef: NgDefaultColDef | undefined = undefined;
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", headerComponent: SortHeader },
    { colId: "revenue", key: "revenue", label: "Revenue", headerCellComponent: SortHeader },
    { colId: "quarter", key: "quarter", label: "Quarter", headerComponent: InputHeader },
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
      [groupDefaultExpanded]="-1"
      [groupColumnDef]="groupColumnDef"
      (gridReady)="onReady($event)"
    />
  `,
})
class GroupColumnHost {
  rows = ROWS;
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region" },
    { colId: "revenue", key: "revenue", label: "Revenue" },
  ];
  groupColumnDef: NgPartialColDef = { label: "Group", headerComponent: SortHeader, cellRenderer: BadgeCell };

  onReady(api: IGridAPI): void {
    api.setRowGroupColumns(["region"]);
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
      [pivotMode]="true"
      [pivotColumns]="['quarter']"
      [pivotResultColumnDef]="pivotResultColumnDef"
      (gridReady)="onReady($event)"
    />
  `,
})
class PivotResultHost {
  rows = ROWS;
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region" },
    { colId: "quarter", key: "quarter", label: "Quarter" },
    { colId: "revenue", key: "revenue", label: "Revenue" },
  ];
  pivotResultColumnDef: NgPartialColDef = { width: 140, headerComponent: SortHeader, cellRenderer: BadgeCell };

  onReady(api: IGridAPI): void {
    api.setRowGroupColumns(["region"]);
    api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
  }
}

const texts = (root: HTMLElement, selector: string) =>
  Array.from(root.querySelectorAll(selector)).map((el) => el.textContent?.trim());

describe("AwbGrid Angular header components", () => {
  it("mounts an Angular headerComponent (content only) and keeps the grid's menu row", async () => {
    const { gridEl, fixture } = await mountGridHost(HeaderHost);

    const button = gridEl.querySelector<HTMLButtonElement>(".ng-header-l1")!;
    expect(button.textContent?.trim()).toBe("Region:none");
    const hcell = button.closest(".pte-hcell")!;
    expect(hcell.querySelector(".pte-hcell-custom-content")).toBeTruthy();
    expect(hcell.querySelector(".pte-hcell-menu")).toBeTruthy();

    // Refresh path: sorting through the params callback re-delivers params via awbRefresh.
    button.click();
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".ng-header-l1")?.textContent?.trim()).toBe("Region:asc");

    // A signal-input header receives params too.
    expect(texts(gridEl, ".ng-input-header")).toEqual(["Quarter"]);
  });

  it("mounts an Angular headerCellComponent (whole cell) without the grid's menu row", async () => {
    const { gridEl } = await mountGridHost(HeaderHost);

    const button = gridEl.querySelector<HTMLButtonElement>(".ng-header-l2")!;
    expect(button.textContent?.trim()).toBe("Revenue:none");
    const hcell = button.closest(".pte-hcell")!;
    expect(hcell.querySelector(".pte-hcell-custom-cell")).toBeTruthy();
    expect(hcell.querySelector(".pte-hcell-menu")).toBeNull();
  });

  it("accepts Angular header components in defaultColDef", async () => {
    const { gridEl } = await mountGridHost(HeaderHost, 600, (host) => {
      host.cols = [
        { colId: "region", key: "region", label: "Region" },
        { colId: "revenue", key: "revenue", label: "Revenue" },
      ];
      host.defaultColDef = { headerComponent: SortHeader };
    });
    expect(texts(gridEl, ".ng-header")).toEqual(["Region:none", "Revenue:none"]);
  });

  it("destroys Angular header components with the grid and on header rebuilds", async () => {
    liveHeaders = 0;
    const { fixture, host } = await mountGridHost(HeaderHost);
    expect(liveHeaders).toBe(2);

    host.cols = [{ colId: "region", key: "region", label: "Region" }];
    await syncGridInputs(fixture);
    expect(liveHeaders).toBe(0);

    host.cols = [{ colId: "region", key: "region", label: "Region", headerComponent: SortHeader }];
    await syncGridInputs(fixture);
    expect(liveHeaders).toBe(1);

    fixture.destroy();
    expect(liveHeaders).toBe(0);
  });
});

describe("AwbGrid Angular components in groupColumnDef and pivotResultColumnDef", () => {
  it("adapts Angular components placed in groupColumnDef", async () => {
    const { gridEl } = await mountGridHost(GroupColumnHost);
    expect(texts(gridEl, ".ng-header")).toEqual(["Group:none"]);
    // The auto-group column runs its renderer on leaf rows (group rows keep the grid's label).
    expect(gridEl.querySelectorAll(".ng-badge").length).toBeGreaterThan(0);
  });

  it("adapts Angular components placed in pivotResultColumnDef", async () => {
    const { gridEl } = await mountGridHost(PivotResultHost);
    expect(texts(gridEl, ".ng-header")).toEqual(["Revenue:none", "Revenue:none"]);
    expect(texts(gridEl, ".ng-badge")).toEqual(expect.arrayContaining(["20", "10", "5"]));
  });
});
