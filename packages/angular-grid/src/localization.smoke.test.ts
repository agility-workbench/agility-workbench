import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { GridOptions, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

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
      [localeText]="localeText"
      [getLocaleText]="getLocaleText"
      (gridReady)="api = $event"
    />
  `,
})
class LocalizedHost {
  api: IGridAPI | null = null;
  rows = [{ id: 1, name: "Acme" }, { id: 2, name: "Globex" }];
  cols: NgColDef[] = [{ colId: "name", key: "name", label: "Name" }];
  localeText: GridOptions["localeText"] = { rowsPerPage: "Zeilen pro Seite", nextPage: "Nächste Seite" };
  getLocaleText: GridOptions["getLocaleText"] = ({ key, defaultValue }) =>
    key === "page" ? "Seite" : defaultValue;
}

describe("AwbGrid localization inputs", () => {
  it("passes localeText and getLocaleText to the grid", async () => {
    const { gridEl, host } = await mountGridHost(LocalizedHost);
    expect(gridEl.textContent).toContain("Zeilen pro Seite");
    expect(gridEl.textContent).toContain("Seite");
    expect(gridEl.querySelector(".pte-pagination-btn-next")?.getAttribute("aria-label")).toBe("Nächste Seite");
    expect(host.api?.getLocaleText("page")).toBe("Seite");
    expect(host.api?.getLocaleText("rowsPerPage")).toBe("Zeilen pro Seite");
  });
});
