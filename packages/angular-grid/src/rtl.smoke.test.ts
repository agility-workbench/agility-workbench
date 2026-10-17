import { Component } from "@angular/core";
import { afterEach, describe, expect, it } from "vitest";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

/**
 * `enableRtl` through the Angular binding: the input reaches the core as a creation option and the
 * grid root carries the resolved direction — forced either way, or inherited from an RTL ancestor
 * when the input is left unset.
 */

const ROWS = [{ id: "1", name: "أحمد", city: "חיפה" }, { id: "2", name: "فاطمة", city: "אילת" }];
const COLS: NgColDef[] = [
  { colId: "name", key: "name", label: "الاسم", pinned: "left" },
  { colId: "city", key: "city", label: "עיר" },
];

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `<awb-grid style="height: 400px" [rowData]="rows" [columnDefs]="cols" rowIdKey="id" [enableRtl]="enableRtl" />`,
})
class RtlHost {
  rows = ROWS;
  cols = COLS;
  enableRtl: boolean | undefined = true;
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `<div dir="rtl"><awb-grid style="height: 400px" [rowData]="rows" [columnDefs]="cols" rowIdKey="id" /></div>`,
})
class InheritedRtlHost {
  rows = ROWS;
  cols = COLS;
}

afterEach(() => {
  document.body.innerHTML = "";
});

const gridRoot = (gridEl: HTMLElement) => gridEl.querySelector<HTMLElement>(".pte-root")!;

describe("<awb-grid [enableRtl]>", () => {
  it("writes dir=rtl on the grid root when the input is true", async () => {
    const { gridEl } = await mountGridHost(RtlHost);
    expect(gridRoot(gridEl).dir).toBe("rtl");
  });

  it("writes dir=ltr when the input is false", async () => {
    const { gridEl } = await mountGridHost(RtlHost, 600, host => { host.enableRtl = false; });
    expect(gridRoot(gridEl).dir).toBe("ltr");
  });

  it("follows an RTL ancestor when the input is unset", async () => {
    const { fixture, gridEl } = await mountGridHost(InheritedRtlHost);
    // The fixture's element must be in the document for the direction to be inherited at attach.
    expect(fixture.nativeElement.isConnected).toBe(true);
    expect(gridRoot(gridEl).dir).toBe("rtl");
  });
});
