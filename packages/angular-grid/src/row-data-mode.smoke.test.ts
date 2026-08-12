/**
 * B6 through the Angular binding. Angular's immutable-update idiom reassigns the bound array on
 * every change, and the component compares it by reference — so with a stable row id the core
 * diffs the replacement rather than re-ingesting it, which is observable here as surviving undo
 * history. `rowDataMode="reset"` opts back into the wholesale replacement. (The diff's
 * classification, ordering and page retention are covered in core.rowDataMode.test.ts.)
 */
import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { GridOptions, IGridAPI } from "@agility-workbench/grid";
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
      [rowDataMode]="rowDataMode"
      (gridReady)="api = $event"
    />
  `,
})
class RowDataModeHost {
  api: IGridAPI | null = null;
  rowDataMode: GridOptions["rowDataMode"];
  rows: { id: string; name: string }[] = [
    { id: "1", name: "alice" },
    { id: "2", name: "bob" },
  ];
  cols: NgColDef[] = [{ colId: "name", key: "name", label: "Name", editable: true }];
}

describe("AwbGrid rowDataMode", () => {
  it("keeps undo history when the rowData input gets a new reference", async () => {
    const { fixture, host } = await mountGridHost(RowDataModeHost, 600);
    host.api!.setCellValue({ rowId: "1", colId: "name" }, "ALICE");
    expect(host.api!.canUndo()).toBe(true);

    host.rows = [{ id: "1", name: "ALICE" }, { id: "2", name: "robert" }];
    await syncGridInputs(fixture);

    expect(host.api!.canUndo()).toBe(true);
  });

  it('discards undo history when rowDataMode is "reset"', async () => {
    const { fixture, host } = await mountGridHost(RowDataModeHost, 600, (instance) => {
      instance.rowDataMode = "reset";
    });
    host.api!.setCellValue({ rowId: "1", colId: "name" }, "ALICE");
    expect(host.api!.canUndo()).toBe(true);

    host.rows = [{ id: "1", name: "alice" }, { id: "2", name: "bob" }];
    await syncGridInputs(fixture);

    expect(host.api!.canUndo()).toBe(false);
  });
});
