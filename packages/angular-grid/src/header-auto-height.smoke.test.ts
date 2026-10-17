import { Component } from "@angular/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

const cols = (autoHeaderHeight: boolean): NgColDef[] => [
  { colId: "long", key: "long", label: "A long header label that wraps onto several lines", width: 90, wrapHeaderText: true, autoHeaderHeight },
  { colId: "id", key: "id", label: "ID", lockPosition: "right" },
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
class AutoHeaderHost {
  api: IGridAPI | null = null;
  rows = [{ id: 1, long: "x" }];
  cols = cols(true);
}

// happy-dom has no layout: a wrapping header label reports four 20px lines.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("pte-hcell-label") && this.closest(".pte-hcell-wrap-text") ? 80 : 0;
    },
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as any).scrollHeight;
});

describe("wrapHeaderText + autoHeaderHeight (Angular)", () => {
  it("grows the header to the wrapped label and back when the input turns it off", async () => {
    const { fixture, gridEl, host } = await mountGridHost(AutoHeaderHost);
    const wrapper = () => gridEl.querySelector<HTMLElement>(".pte-header-wrapper")!;
    const leafCell = () => gridEl.querySelector<HTMLElement>(".pte-hcell")!;

    const grown = Number.parseFloat(wrapper().style.height);
    expect(grown).toBeGreaterThan(80);
    expect(leafCell().style.height).toBe(`${grown}px`);
    expect(gridEl.querySelector(".pte-hcell-wrap-text")).not.toBeNull();

    host.cols = cols(false);
    await syncGridInputs(fixture);
    expect(wrapper().style.height).toBe("43px");
  });
});
