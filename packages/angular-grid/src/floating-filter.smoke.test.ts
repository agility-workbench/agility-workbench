import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

// The floating filter row through the Angular binding: `[floatingFilter]` is a runtime input, so
// changing it shows and hides the row on the same grid, and the row writes the shared filter model.

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 400px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [filterDebounceMs]="0"
      [floatingFilter]="floatingFilter"
      (gridReady)="api = $event; readyCount = readyCount + 1"
    />
  `,
})
class FloatingFilterHost {
  api: IGridAPI | null = null;
  readyCount = 0;
  floatingFilter: boolean | undefined = undefined;
  rows = [{ id: "1", name: "Alpha", region: "North" }, { id: "2", name: "Beta", region: "South" }];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name", filter: "text" },
    { colId: "region", key: "region", label: "Region", filter: "set" },
  ];
}

describe("AwbGrid floatingFilter input", () => {
  it("shows and hides the floating filter row live and filters through it", async () => {
    const { fixture, gridEl, host } = await mountGridHost(FloatingFilterHost);
    const visible = () => gridEl.querySelector(".pte-floating-filter-row")!
      .classList.contains("pte-floating-filter-row-visible");
    expect(visible()).toBe(false);

    host.floatingFilter = true;
    await syncGridInputs(fixture);
    expect(visible()).toBe(true);
    expect(gridEl.querySelectorAll(".pte-floating-filter-cell")).toHaveLength(2);
    expect(gridEl.querySelector(".pte-viewport .pte-row[data-view-idx='0']")!.getAttribute("aria-rowindex")).toBe("3");

    const input = gridEl.querySelector<HTMLInputElement>(".pte-floating-filter-cell input")!;
    input.value = "bet";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(host.api!.getFilterModel()).toEqual([
      { colId: "name", join: "and", filters: [{ type: "contains", values: ["bet"] }] },
    ]);

    host.floatingFilter = false;
    await syncGridInputs(fixture);
    expect(visible()).toBe(false);
    expect(host.readyCount).toBe(1);
  });
});
