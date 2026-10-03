import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import { ColumnType } from "@agility-workbench/grid";
import type { FillHandleOptions, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

/**
 * The fill handle through the Angular binding: the `fillHandle` input reaches the grid at creation
 * and reconciles live, and a drag writes the host's row objects.
 */

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [fillHandle]="fillHandle"
      (gridReady)="api = $event"
    />
  `,
})
class FillHandleHost {
  api: IGridAPI | null = null;
  fillHandle: boolean | FillHandleOptions = true;
  rows = [
    { id: "1", name: "AAA", qty: 1 },
    { id: "2", name: "BBB", qty: 2 },
    { id: "3", name: "CCC", qty: 3 },
    { id: "4", name: "DDD", qty: 4 },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name", editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  ];
}

function cell(gridEl: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  return gridEl.querySelector<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}'] .pte-cell[data-col-idx='${colIdx}']`)!;
}

function dragHandle(gridEl: HTMLElement, toViewIdx: number, toColIdx: number): void {
  const handle = gridEl.querySelector<HTMLElement>(".pte-fill-handle")!;
  expect(handle).not.toBeNull();
  handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  cell(gridEl, toViewIdx, toColIdx).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

describe("AwbGrid fill handle", () => {
  it("shows the handle on an editable selection and a drag extends the series", async () => {
    const { gridEl, host } = await mountGridHost(FillHandleHost);
    const api = host.api!;
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 1, mode: "start" });
    api.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 1, mode: "extend" });
    expect(gridEl.querySelector(".pte-fill-handle")!.parentElement).toBe(cell(gridEl, 1, 1));

    dragHandle(gridEl, 3, 1);
    expect(host.rows.map(r => r.qty)).toEqual([1, 2, 3, 4].map((_, i) => i + 1));
    // 1, 2 continued as 3, 4 — the same numbers the rows held, so prove the write happened on names.
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    dragHandle(gridEl, 2, 0);
    expect(host.rows.map(r => r.name)).toEqual(["AAA", "AAA", "AAA", "DDD"]);
    expect(api.getSelection().range).toMatchObject({ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 });
  });

  it("reconciles the input live: off removes the handle, an options object restores it", async () => {
    const { gridEl, host, fixture } = await mountGridHost(FillHandleHost, 600, (instance) => {
      instance.fillHandle = false;
    });
    const api = host.api!;
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    expect(gridEl.querySelector(".pte-fill-handle")).toBeNull();

    host.fillHandle = { direction: "y" };
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-fill-handle")!.parentElement).toBe(cell(gridEl, 0, 0));

    host.fillHandle = false;
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-fill-handle")).toBeNull();
  });
});
