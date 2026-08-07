import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 500px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [suppressStyleInjection]="suppress"
      [styleNonce]="nonce"
    />
  `,
})
class StyleHost {
  suppress = false;
  nonce = "ng-test-nonce";
  rows = [{ id: "1", name: "A" }];
  cols: NgColDef[] = [{ colId: "name", key: "name", label: "Name" }];
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid style="height: 200px" [rowData]="rows" [columnDefs]="cols" />
    <awb-grid style="height: 200px" [rowData]="rows" [columnDefs]="cols" />
  `,
})
class TwoGridsHost {
  rows = [{ id: "1", name: "A" }];
  cols: NgColDef[] = [{ colId: "name", key: "name", label: "Name" }];
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `<awb-grid style="height: 200px" [suppressStyleInjection]="true" />`,
})
class SuppressedStyleHost {}

describe("AwbGrid automatic stylesheet delivery", () => {
  it("injects the grid stylesheet when the component attaches", async () => {
    await mountGridHost(StyleHost);
    const styles = document.querySelectorAll("#pte-grid-styles");
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain(".pte-root");
    // Carried from the input through getGridOptions into core options, which is where the
    // renderer reads it. Without it a CSP-restricted app gets an unstyled grid.
    expect(styles[0].getAttribute("nonce")).toBe("ng-test-nonce");
  });

  it("deduplicates stylesheet injection across multiple grid instances", async () => {
    await mountGridHost(TwoGridsHost);
    expect(document.querySelectorAll("#pte-grid-styles")).toHaveLength(1);
  });

  it("does not inject another stylesheet when the application opts out", async () => {
    const before = document.querySelectorAll("#pte-grid-styles").length;
    await mountGridHost(SuppressedStyleHost);
    expect(document.querySelectorAll("#pte-grid-styles")).toHaveLength(before);
  });
});
