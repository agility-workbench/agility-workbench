import { Component } from "@angular/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

// No layout in the test DOM: the centre section measures 600px, everything else 0.
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) { return this.classList.contains("pte-spacer") ? 600 : 0; },
  });
});
afterAll(() => {
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
});

const cols = (bFlex: number): NgColDef[] => [
  { colId: "a", key: "a", label: "A", width: 100 },
  { colId: "b", key: "b", label: "B", flex: bFlex },
  { colId: "c", key: "c", label: "C", flex: 1 },
];

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      (gridReady)="api = $event"
    />
  `,
})
class FlexHost {
  api: IGridAPI | null = null;
  rows = [{ id: "1", a: "a", b: "b", c: "c" }];
  cols: NgColDef[] = cols(1);
}

describe("AwbGrid flex columns", () => {
  it("passes ColDef.flex through, live on a columnDefs change", async () => {
    const { fixture, host } = await mountGridHost(FlexHost);
    const width = (colId: string) => host.api!.getColumnModel().getByColId(colId)!.computedWidth;
    expect(width("b")).toBe(250);
    expect(width("c")).toBe(250);
    expect(host.api!.getColumnState().find(s => s.colId === "b")!.flex).toBe(1);

    host.cols = cols(4);
    await syncGridInputs(fixture);
    expect(width("b")).toBe(400);
    expect(width("c")).toBe(100);
  });
});
