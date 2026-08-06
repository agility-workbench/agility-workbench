import { Component, viewChild } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import type { IGridAPI, IServerSideDataSource } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

const ROWS = [
  { id: "1", name: "Widget", price: 9.99 },
  { id: "2", name: "Gadget", price: 14.5 },
];
const COLS: NgColDef[] = [
  { colId: "name", key: "name", label: "Name" },
  { colId: "price", key: "price", label: "Price" },
];

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <span class="status">{{ ready ? "ready" : "waiting" }}</span>
    @if (show) {
      <awb-grid
        style="height: 600px"
        [rowData]="rows"
        [columnDefs]="cols"
        rowIdKey="id"
        [rowNumbers]="true"
        [rowSelection]="true"
        (gridReady)="onReady($event)"
      />
    }
  `,
})
class LifecycleHost {
  readonly grid = viewChild(AwbGrid);
  rows = ROWS;
  cols = COLS;
  ready = false;
  api: IGridAPI | null = null;
  readyCalls = 0;
  show = true;

  onReady(api: IGridAPI): void {
    this.ready = true;
    this.api = api;
    this.readyCalls++;
  }
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      rowModelType="serverSide"
      [serverSideDataSource]="source"
      [columnDefs]="cols"
      rowIdKey="id"
      (gridReady)="api = $event"
    />
  `,
})
class ServerHost {
  api: IGridAPI | null = null;
  cols = COLS;
  getRows = vi.fn();
  source: IServerSideDataSource = { getRows: this.getRows };
}

describe("AwbGrid lifecycle", () => {
  it("renders real cells and exposes the same live API on the component and gridReady", async () => {
    const { fixture, gridEl, host } = await mountGridHost(LifecycleHost);

    expect(gridEl.querySelector(".pte-root")).toBeTruthy();
    expect(gridEl.querySelectorAll(".pte-cell").length).toBeGreaterThan(0);
    expect(gridEl.textContent).toContain("Widget");
    expect(gridEl.textContent).toContain("Gadget");
    expect(host.grid()!.api).toBe(host.api);
    expect(host.readyCalls).toBe(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector(".status")?.textContent).toBe("ready");
  });

  it("destroys renderer DOM and can remount without accumulating subscriptions", async () => {
    const { fixture, gridEl, host } = await mountGridHost(LifecycleHost);
    const firstApi = host.api!;

    host.show = false;
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-root")).toBeNull();
    expect(host.grid()).toBeUndefined();

    host.show = true;
    await syncGridInputs(fixture);
    const remounted = fixture.nativeElement.querySelector("awb-grid") as HTMLElement;
    Object.defineProperty(remounted, "clientHeight", { value: 600, configurable: true });
    await syncGridInputs(fixture);

    expect(remounted.querySelector(".pte-root")).toBeTruthy();
    expect(host.api).not.toBe(firstApi);
    expect(host.readyCalls).toBe(2);

    let selectionEvents = 0;
    const off = host.api!.on("selectionChanged", () => selectionEvents++);
    host.api!.selectAllRows();
    expect(selectionEvents).toBe(1);
    off();
  });

  it("does not configure server-side machinery for the default client-side model", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await mountGridHost(LifecycleHost);

    expect(warn.mock.calls.some((call) => String(call[0]).includes("server-side"))).toBe(false);
    warn.mockRestore();
  });

  it("wires a provided server-side data source", async () => {
    const { host } = await mountGridHost(ServerHost);
    const model = host.api!.getCore().getRowModel();

    expect(model.getType()).toBe("serverSide");
    expect(model.isValid()).toBe(true);
  });
});
