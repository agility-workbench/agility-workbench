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
      [autosizeColumnsOnDataChange]="autosize"
      [clearSelectionOnBodyClick]="clearOnBodyClick"
      [resetPageOn]="resetPageOn"
      (gridReady)="api = $event"
    />
  `,
})
class CoreOptionsHost {
  api: IGridAPI | null = null;
  autosize = false;
  clearOnBodyClick = true;
  resetPageOn: GridOptions["resetPageOn"];
  rows = [{ id: "1", name: "A" }];
  cols: NgColDef[] = [{ colId: "name", key: "name", label: "Name" }];
}

describe("AwbGrid core option forwarding", () => {
  it("re-autosizes columns after data changes when autosizeColumnsOnDataChange is enabled", async () => {
    const { fixture, host } = await mountGridHost(CoreOptionsHost, 600, (instance) => {
      instance.autosize = true;
    });
    const column = host.api!.getColumnModel().getByColId("name")!;
    const initialWidth = column.computedWidth;

    host.rows = [{ id: "1", name: "A much longer value that requires a wider column" }];
    await syncGridInputs(fixture);

    expect(column.computedWidth).toBeGreaterThan(initialWidth);
  });

  it("preserves computed widths after data changes when autosizeColumnsOnDataChange is disabled", async () => {
    const { fixture, host } = await mountGridHost(CoreOptionsHost);
    const column = host.api!.getColumnModel().getByColId("name")!;
    const initialWidth = column.computedWidth;

    host.rows = [{ id: "1", name: "A much longer value that would normally resize the column" }];
    await syncGridInputs(fixture);

    expect(column.computedWidth).toBe(initialWidth);
  });

  it("clears the current selection on an empty-body click by default", async () => {
    const { gridEl, host } = await mountGridHost(CoreOptionsHost);
    host.api!.selectRange(0, 0);
    expect(host.api!.getSelection().kind).toBe("cell");

    gridEl.querySelector<HTMLElement>(".pte-body")!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    expect(host.api!.getSelection().kind).toBe("none");
  });

  it("preserves selection on an empty-body click when clearSelectionOnBodyClick is false", async () => {
    const { gridEl, host } = await mountGridHost(CoreOptionsHost, 600, (instance) => {
      instance.clearOnBodyClick = false;
    });
    host.api!.selectRange(0, 0);

    gridEl.querySelector<HTMLElement>(".pte-body")!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    expect(host.api!.getSelection().kind).toBe("cell");
  });

  it("resolves resetPageOn to the [] default when the input is omitted", async () => {
    const { host } = await mountGridHost(CoreOptionsHost);
    expect(host.api!.getCore().getOptions().resetPageOn).toEqual([]);
  });

  it("forwards an explicit resetPageOn input to core", async () => {
    const { host } = await mountGridHost(CoreOptionsHost, 600, (instance) => {
      instance.resetPageOn = ["filter", "sort"];
    });
    expect(host.api!.getCore().getOptions().resetPageOn).toEqual(["filter", "sort"]);
  });
});
