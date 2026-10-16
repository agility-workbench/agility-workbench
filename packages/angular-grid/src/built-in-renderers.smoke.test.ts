import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { dataCell, mountGridHost } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `<awb-grid style="height: 600px" [rowData]="rows" [columnDefs]="cols" rowIdKey="id" />`,
})
class BuiltInRendererHost {
  rows = [{ id: "1", name: "A", done: 40 }];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    { colId: "done", key: "done", label: "Done", cellRenderer: "progress", cellRendererParams: { max: 100 } },
  ];
}

describe("AwbGrid built-in renderer aliases", () => {
  it('cellRenderer: "progress" renders a progressbar', async () => {
    const { gridEl } = await mountGridHost(BuiltInRendererHost);
    const bar = dataCell(gridEl, 0, 1).querySelector<HTMLElement>('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute("aria-valuenow")).toBe("40");
    expect(bar!.getAttribute("aria-valuemax")).toBe("100");
    expect(bar!.getAttribute("aria-label")).toBe("Done");
  });
});
