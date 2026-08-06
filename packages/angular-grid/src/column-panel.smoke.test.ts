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
      [columnPanel]="columnPanel"
      [toolbar]="toolbar"
      [tooltip]="{ showDelay: 0, hideDelay: 0 }"
      (gridReady)="api = $event"
    />
  `,
})
class ColumnPanelHost {
  api: IGridAPI | null = null;
  columnPanel: GridOptions["columnPanel"] = true;
  toolbar: GridOptions["toolbar"] = undefined;
  rows = [{ id: "1", name: "Acme", region: "West", revenue: 42 }];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    { colId: "region", key: "region", label: "Region" },
    { colId: "revenue", key: "revenue", label: "Revenue" },
  ];
}

function panelRow(gridEl: HTMLElement, colId: string): HTMLElement | null {
  return gridEl.querySelector<HTMLElement>(`.pte-column-panel-row[data-col-id="${colId}"]`);
}

function setPanelSearch(gridEl: HTMLElement, value: string): void {
  const search = gridEl.querySelector<HTMLInputElement>(".pte-column-panel-search")!;
  search.value = value;
  search.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AwbGrid column panel", () => {
  it("is opt-in", async () => {
    const { gridEl } = await mountGridHost(ColumnPanelHost, 600, (instance) => {
      instance.columnPanel = false;
    });
    expect(gridEl.querySelector(".pte-column-panel")).toBeNull();
    expect(gridEl.querySelector(".pte-root")?.classList).not.toContain("pte-column-panel-enabled");
  });

  it("opens a sized panel from its collapsed rail", async () => {
    const { gridEl } = await mountGridHost(ColumnPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: false, width: 330 };
    });
    const root = gridEl.querySelector<HTMLElement>(".pte-root")!;
    const rail = gridEl.querySelector<HTMLButtonElement>(".pte-column-panel-rail")!;
    expect(root.style.getPropertyValue("--pte-column-panel-width")).toBe("330px");
    expect(rail.getAttribute("aria-expanded")).toBe("false");

    rail.click();
    expect(root.classList).toContain("pte-column-panel-open");
    expect(rail.getAttribute("aria-expanded")).toBe("true");
  });

  it("searches, hides, pins, reorders, and resets columns live", async () => {
    const { gridEl, host } = await mountGridHost(ColumnPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: true };
    });
    const api = host.api!;
    const reset = gridEl.querySelector<HTMLButtonElement>(".pte-column-panel-reset")!;
    const announcer = gridEl.querySelector<HTMLElement>(".pte-column-panel-announcer")!;
    expect(announcer.getAttribute("aria-live")).toBe("polite");
    expect(reset.disabled).toBe(true);

    setPanelSearch(gridEl, "rev");
    expect(gridEl.querySelectorAll(".pte-column-panel-row")).toHaveLength(1);
    expect(panelRow(gridEl, "revenue")).toBeTruthy();
    setPanelSearch(gridEl, "");

    panelRow(gridEl, "region")!
      .querySelector<HTMLInputElement>(".pte-column-panel-checkbox")!
      .click();
    expect(api.getColumnModel().getByColId("region")!.hidden).toBe(true);
    expect(reset.disabled).toBe(false);
    expect(announcer.textContent).toBe("Region hidden");

    const revenuePin = panelRow(gridEl, "revenue")!
      .querySelector<HTMLSelectElement>(".pte-column-panel-pin")!;
    revenuePin.value = "left";
    revenuePin.dispatchEvent(new Event("change", { bubbles: true }));
    expect(api.getColumnModel().getByColId("revenue")!.pinned).toBe("left");

    panelRow(gridEl, "region")!
      .querySelector<HTMLButtonElement>('[aria-label="Move Region up"]')!
      .click();
    expect(api.getColumnState()
      .filter((state) => state.pinned == null)
      .sort((a, b) => a.order! - b.order!)
      .map((state) => state.colId)).toEqual(["region", "name"]);

    reset.click();
    expect(api.getColumnState().map((state) => state.colId)).toEqual(["name", "region", "revenue"]);
    expect(api.getColumnModel().getByColId("region")!.hidden).toBe(false);
    expect(api.getColumnModel().getByColId("revenue")!.pinned).toBeNull();
    expect(reset.disabled).toBe(true);
    expect(announcer.textContent).toBe("Column layout reset");
  });

  it("bulk-toggles only eligible columns in the active search", async () => {
    const { gridEl, host } = await mountGridHost(ColumnPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: true };
      instance.cols = [
        { colId: "name", key: "name", label: "Name", hideable: false },
        { colId: "region", key: "region", label: "Region" },
        { colId: "revenue", key: "revenue", label: "Revenue" },
      ];
    });
    setPanelSearch(gridEl, "rev");
    const bulk = gridEl.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!;
    expect(gridEl.querySelector(".pte-column-panel-bulk-label")?.textContent).toBe(
      "All matching columns",
    );
    bulk.click();

    expect(host.api!.getColumnModel().getByColId("revenue")!.hidden).toBe(true);
    expect(host.api!.getColumnModel().getByColId("name")!.hidden).toBe(false);
    expect(host.api!.getColumnModel().getByColId("region")!.hidden).toBe(false);

    setPanelSearch(gridEl, "name");
    expect(bulk.disabled).toBe(true);
  });

  it("omits suppressed columns without removing them from the grid", async () => {
    const { gridEl, host } = await mountGridHost(ColumnPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: true };
      instance.cols = [
        { colId: "name", key: "name", label: "Name", suppressColumnPanel: true },
        { colId: "region", key: "region", label: "Region" },
      ];
    });
    expect(panelRow(gridEl, "name")).toBeNull();
    expect(panelRow(gridEl, "region")).toBeTruthy();
    expect(host.api!.getColumnModel().getByColId("name")).toBeTruthy();

    gridEl.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!.click();
    expect(host.api!.getColumnModel().getByColId("name")!.hidden).toBe(false);
    expect(host.api!.getColumnModel().getByColId("region")!.hidden).toBe(true);
  });

  it("renders collapsible column-group hierarchy and searches group paths", async () => {
    const { gridEl, host } = await mountGridHost(ColumnPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: true };
      instance.cols = [
        {
          colId: "identity",
          label: "Identity",
          children: [
            { colId: "name", key: "name", label: "Name" },
            { colId: "region", key: "region", label: "Region" },
          ],
        },
        { colId: "revenue", key: "revenue", label: "Revenue" },
      ];
    });
    const group = gridEl.querySelector<HTMLButtonElement>(
      '.pte-column-panel-tree-group[data-group-col-id="identity"] > .pte-column-panel-tree-group-header',
    )!;
    group.click();
    expect(panelRow(gridEl, "name")).toBeNull();
    expect(panelRow(gridEl, "revenue")).toBeTruthy();

    setPanelSearch(gridEl, "identity");
    expect(panelRow(gridEl, "name")).toBeTruthy();
    expect(panelRow(gridEl, "region")).toBeTruthy();
    expect(panelRow(gridEl, "revenue")).toBeNull();

    panelRow(gridEl, "region")!
      .querySelector<HTMLButtonElement>('[aria-label="Move Region up"]')!
      .click();
    expect(host.api!.getColumnState().map((state) => state.colId)).toEqual([
      "region",
      "name",
      "revenue",
    ]);
  });

  it.each([
    ["header", ".pte-column-panel-trigger-header-button"],
    ["footer", ".pte-column-panel-trigger-footer-button"],
    ["toolbar", ".pte-column-panel-trigger-toolbar-button"],
  ] as const)("mounts and opens the shared drawer from the %s trigger", async (trigger, selector) => {
    const { gridEl } = await mountGridHost(ColumnPanelHost, 600, (instance) => {
      instance.columnPanel = { trigger };
    });
    const button = gridEl.querySelector<HTMLButtonElement>(selector)!;
    expect(button).toBeTruthy();
    button.click();
    expect(gridEl.querySelector(".pte-root")?.classList).toContain("pte-column-panel-open");
    expect(gridEl.querySelector(".pte-column-panel-content")).toBeTruthy();
  });

  it("moves its trigger live without remounting the grid", async () => {
    const { fixture, gridEl, host } = await mountGridHost(ColumnPanelHost, 600, (instance) => {
      instance.columnPanel = { trigger: "header" };
    });
    const api = host.api!;
    expect(gridEl.querySelector(".pte-column-panel-trigger-header-button")).toBeTruthy();

    host.columnPanel = { trigger: "toolbar" };
    await syncGridInputs(fixture);
    expect(host.api).toBe(api);
    expect(gridEl.querySelector(".pte-column-panel-trigger-header-button")).toBeNull();
    expect(gridEl.querySelector(".pte-column-panel-trigger-toolbar-button")).toBeTruthy();
  });
});
