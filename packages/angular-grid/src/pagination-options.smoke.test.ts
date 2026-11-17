import { Component } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [pagination]="true"
      [pageSize]="pageSize"
      [pageSizes]="pageSizes"
      [paginationAutoPageSize]="autoPageSize"
      [paginationControls]="{ controls: ['rowSummary', 'pageSize', 'pageSelector', 'pageInput'] }"
      (gridReady)="api = $event"
    />
  `,
})
class PaginationOptionsHost {
  api: IGridAPI | null = null;
  rows = Array.from({ length: 120 }, (_, i) => ({ id: String(i), name: `Row ${i}` }));
  cols: NgColDef[] = [{ colId: "name", key: "name", label: "Name" }];
  pageSize = 25;
  pageSizes: number[] = [25, 50];
  autoPageSize = false;
}

afterEach(() => vi.restoreAllMocks());

describe("AwbGrid live page sizes", () => {
  it("reconciles pageSize, pageSizes and paginationAutoPageSize without a creation-only warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { fixture, gridEl, host } = await mountGridHost(PaginationOptionsHost);
    const api = host.api!;
    api.goToPage(2);

    // Same contents, fresh array: nothing to apply, the page stays.
    host.pageSizes = [25, 50];
    await syncGridInputs(fixture);
    expect(api.getPaginationInfo()).toMatchObject({ pageIndex: 2, pageSize: 25 });

    host.pageSize = 50;
    await syncGridInputs(fixture);
    expect(api.getPaginationInfo()).toMatchObject({ pageIndex: 0, pageSize: 50 });
    expect(gridEl.querySelector(".pte-pagination-row-summary")?.textContent).toBe("1–50 of 120");

    host.pageSizes = [10, 50, 200];
    await syncGridInputs(fixture);
    const options = [...gridEl.querySelectorAll<HTMLOptionElement>(".pte-pagination-size-control option")];
    expect(options.map((o) => o.value)).toEqual(["10", "50", "200"]);

    host.autoPageSize = true;
    await syncGridInputs(fixture);
    expect(api.getGridOption("paginationAutoPageSize")).toBe(true);
    expect(gridEl.querySelector(".pte-pagination-size-control")).toBeNull();
    expect(gridEl.querySelector(".pte-pagination-page-input")).toBeTruthy();

    expect(warn.mock.calls.filter(([message]) => String(message).includes("changed after the grid was created"))).toEqual([]);
  });
});
