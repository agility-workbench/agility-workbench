import { describe, expect, it } from "vitest";
import { ApplicationRef, Component, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { CellRendererParams, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";

type Row = { id: number; name: string };

@Component({
  standalone: true,
  template: `<b class="ng-cell">{{ params()?.value }}</b>`,
})
class NameCell {
  readonly params = input<CellRendererParams>();
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [rowNumbers]="true"
      [rowSelection]="true"
      [selectAllRowsOnHeaderClick]="true"
      (gridReady)="api = $event"
    />
  `,
})
class Host {
  api: IGridAPI | null = null;
  rows: Row[] = [
    { id: 1, name: "AAA" },
    { id: 2, name: "BBB" },
    { id: 3, name: "CCC" },
  ];
  cols: NgColDef[] = [
    { colId: "id", key: "id", label: "ID" },
    { colId: "name", key: "name", label: "Name", cellRenderer: NameCell },
  ];
}

async function mountGrid() {
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();

  const gridEl = fixture.nativeElement.querySelector("awb-grid") as HTMLElement;
  // happy-dom has no layout; the virtualizer needs a viewport height to render rows.
  Object.defineProperty(gridEl, "clientHeight", { value: 600, configurable: true });

  // The grid is created in afterNextRender, which flushes on an ApplicationRef.tick — a plain
  // fixture.detectChanges() only checks the fixture's view.
  TestBed.inject(ApplicationRef).tick();
  await fixture.whenStable();

  return { fixture, gridEl, host: fixture.componentInstance };
}

describe("AwbGrid smoke", () => {
  it("creates the grid, renders rows, and exposes the API via gridReady", async () => {
    const { gridEl, host } = await mountGrid();

    expect(host.api).not.toBeNull();
    // Core-rendered DOM lives inside the Angular host element. Row elements are pooled by the
    // virtualizer (happy-dom has no layout), so assert on rendered data, not row-element counts.
    expect(gridEl.querySelectorAll(".pte-row").length).toBeGreaterThan(0);
    for (const name of ["AAA", "BBB", "CCC"]) {
      expect(gridEl.textContent).toContain(name);
    }
  });

  it("mounts Angular cell-renderer components through the adapter (params input style)", async () => {
    const { gridEl } = await mountGrid();

    const cells = Array.from(gridEl.querySelectorAll(".ng-cell")).map((el) => el.textContent);
    expect(cells).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("toggles all rows when the row-number header is clicked (selectAllRowsOnHeaderClick)", async () => {
    const { gridEl, host } = await mountGrid();
    const api = host.api!;

    const header = gridEl.querySelector<HTMLElement>(".pte-hcell-row-number")!;
    header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(api.getSelectedRows()).toHaveLength(3);
    expect(api.areAllRowsSelected()).toBe(true);

    header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(api.getSelectedRows()).toHaveLength(0);
    expect(api.areAllRowsSelected()).toBe(false);
  });

  it("forwards rowData changes into the core without recreating the grid", async () => {
    const { fixture, host } = await mountGrid();
    const api = host.api!;

    host.rows = [...host.rows, { id: 4, name: "DDD" }];
    fixture.detectChanges();
    // Input sync happens in an effect, which flushes with application ticks.
    TestBed.inject(ApplicationRef).tick();
    await fixture.whenStable();

    expect(host.api).toBe(api);
    expect(api.getSelectedRows()).toHaveLength(0);
    // The new row rendered through the Angular cell-renderer adapter.
    const cells = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(".ng-cell"),
      (el) => el.textContent,
    );
    expect(cells).toEqual(["AAA", "BBB", "CCC", "DDD"]);
  });
});
