import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { IGridAPI, SortIconVisibility } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef, NgDefaultColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      [defaultColDef]="defaults"
      rowIdKey="id"
      [pagination]="pagination"
      [pageSize]="pageSize"
      [loading]="loading"
      (gridReady)="api = $event"
    />
  `,
})
class LayoutHost {
  api: IGridAPI | null = null;
  rows: Record<string, unknown>[] = [
    { id: "1", a: "span", b: "b1", c: "c1" },
    { id: "2", a: "normal", b: "b2", c: "c2" },
  ];
  cols: NgColDef[] = [
    { colId: "a", key: "a", label: "A" },
    { colId: "b", key: "b", label: "B" },
    { colId: "c", key: "c", label: "C" },
  ];
  defaults: NgDefaultColDef | undefined;
  pagination = false;
  pageSize = 25;
  loading = false;
}

function rowCells(gridEl: HTMLElement, index: number): HTMLElement[] {
  const row = gridEl.querySelector<HTMLElement>(`.pte-row[data-view-idx="${index}"]`)!;
  return Array.from(row.querySelectorAll<HTMLElement>(
    ".pte-cell:not(.pte-row-number-cell):not(.pte-full-width-cell)",
  ));
}

function sortIcon(gridEl: HTMLElement, api: IGridAPI, colId: string): HTMLElement | null {
  const id = api.getColumnModel().getByColId(colId)!.instanceID;
  return gridEl.querySelector<HTMLElement>(`.pte-hcell#${id} .pte-hcell-sort`);
}

describe("AwbGrid layout features", () => {
  it("renders colSpan widths and hides covered cells only on matching rows", async () => {
    const { gridEl } = await mountGridHost(LayoutHost, 600, (host) => {
      host.cols = [
        { colId: "a", key: "a", label: "A", width: 100, colSpan: (p) => p.value === "span" ? 2 : 1 },
        { colId: "b", key: "b", label: "B", width: 100 },
        { colId: "c", key: "c", label: "C", width: 100 },
      ];
    });
    const normal = rowCells(gridEl, 1);
    const spanning = rowCells(gridEl, 0);
    const expectedWidth = parseFloat(normal[0].style.width) + parseFloat(normal[1].style.width);

    expect(spanning[0].dataset.colSpan).toBe("2");
    expect(parseFloat(spanning[0].style.width)).toBeCloseTo(expectedWidth, 1);
    expect(spanning[1].style.display).toBe("none");
    expect(spanning[2].style.display).not.toBe("none");
    expect(normal[1].style.display).not.toBe("none");
  });

  it("clamps colSpan at the end of a column section", async () => {
    const { gridEl } = await mountGridHost(LayoutHost, 600, (host) => {
      host.cols = [
        { colId: "a", key: "a", label: "A", width: 100 },
        { colId: "b", key: "b", label: "B", width: 100 },
        { colId: "c", key: "c", label: "C", width: 100, colSpan: () => 5 },
      ];
    });
    const cells = rowCells(gridEl, 0);
    expect(cells[2].dataset.colSpan).toBeUndefined();
    expect(cells.every((cell) => cell.style.display !== "none")).toBe(true);
  });

  it("supports inherited and column-level sort-icon visibility", async () => {
    const { gridEl, host } = await mountGridHost(LayoutHost, 600, (instance) => {
      instance.defaults = { sortIconVisibility: "always" };
      instance.cols = [
        { colId: "a", key: "a", label: "A" },
        { colId: "b", key: "b", label: "B", sortIconVisibility: "never" },
      ];
    });

    expect(sortIcon(gridEl, host.api!, "a")?.classList).toContain("pte-sort-persist");
    expect(sortIcon(gridEl, host.api!, "b")).toBeNull();
  });

  it("keeps a never-icon column sortable through the API", async () => {
    const { gridEl, host } = await mountGridHost(LayoutHost, 600, (instance) => {
      instance.defaults = { sortIconVisibility: "never" as SortIconVisibility };
    });
    const column = host.api!.getColumnModel().getByColId("a")!;
    expect(sortIcon(gridEl, host.api!, "a")).toBeNull();
    host.api!.dispatch({ type: "headerAction", action: "toggleSort", colId: column.instanceID });
    expect(host.api!.getCore().getSortModel().items.map((item) => item.key)).toEqual(["a"]);
  });

  it("shows configured pagination controls and page size", async () => {
    const { gridEl } = await mountGridHost(LayoutHost, 600, (host) => {
      host.pagination = true;
      host.pageSize = 25;
    });
    expect(gridEl.querySelector(".pte-pagination-wrapper")?.classList).toContain("visible");
    expect(gridEl.querySelector<HTMLSelectElement>(
      ".pte-pagination-select:not(.pte-aggregate-scope):not(.pte-pagination-page-select)",
    )?.value).toBe("25");
    expect(gridEl.querySelector(".pte-pagination-nav")).toBeTruthy();
  });

  it("removes aggregate controls when every column becomes non-aggregatable", async () => {
    const { fixture, gridEl, host } = await mountGridHost(LayoutHost, 600, (instance) => {
      instance.pagination = true;
    });
    expect(gridEl.querySelector(".pte-aggregate-controls")).toBeTruthy();

    host.cols = host.cols.map((column) => ({ ...column, aggregatable: false }));
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-aggregate-controls")).toBeNull();
    expect(gridEl.querySelector(".pte-pagination-nav")).toBeTruthy();
  });

  it("uses default loading and no-rows messages when custom text is omitted", async () => {
    const { fixture, gridEl, host } = await mountGridHost(LayoutHost, 600, (instance) => {
      instance.rows = [];
      instance.loading = true;
    });
    expect(gridEl.querySelector(".pte-loading-label")?.textContent).toBe("Loading data...");

    host.loading = false;
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-norows-label")?.textContent).toBe("No rows to show");
  });
});
