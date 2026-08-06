import { Component } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
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
      [savedViews]="savedViews"
      [tooltip]="{ showDelay: 0, hideDelay: 0 }"
      (gridReady)="api = $event"
    />
  `,
})
class AdvancedToolbarHost {
  api: IGridAPI | null = null;
  columnPanel: GridOptions["columnPanel"] = false;
  toolbar: GridOptions["toolbar"] = undefined;
  savedViews: GridOptions["savedViews"] = undefined;
  rows = [{ id: "1", name: "Acme", region: "West", revenue: 42 }];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    { colId: "region", key: "region", label: "Region" },
    { colId: "revenue", key: "revenue", label: "Revenue" },
  ];
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

function header(gridEl: HTMLElement, api: IGridAPI, colId: string): HTMLElement {
  const id = api.getColumnModel().getByColId(colId)!.instanceID;
  return gridEl.querySelector<HTMLElement>(`.pte-hcell#${id}`)!;
}

function stubRect(element: HTMLElement, rect: Record<string, number>): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
}

describe("AwbGrid toolbar (advanced)", () => {
  it("groups a column dropped from the header onto the toolbar grouping section", async () => {
    const { gridEl, host } = await mountGridHost(AdvancedToolbarHost, 600, (instance) => {
      instance.columnPanel = { trigger: "toolbar" };
      instance.toolbar = { grouping: true };
    });
    const api = host.api!;
    const model = api.getColumnModel();
    const region = model.getByColId("region")!;
    const revenue = model.getByColId("revenue")!;

    gridEl.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-add")!.click();
    gridEl.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarGroupAdd-${region.instanceID}"]`,
    )!.click();
    gridEl.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-add")!.click();
    gridEl.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarGroupAdd-${revenue.instanceID}"]`,
    )!.click();

    const nameHeader = header(gridEl, api, "name");
    const dropZone = gridEl.querySelector<HTMLElement>(".pte-grid-toolbar-group-dropzone")!;
    const chips = Array.from(
      dropZone.querySelectorAll<HTMLElement>(".pte-grid-toolbar-group-chip"),
    );
    chips.forEach((chip, index) => {
      stubRect(chip, {
        left: index * 100,
        right: (index + 1) * 100,
        top: 0,
        bottom: 26,
        width: 100,
        height: 26,
      });
    });
    stubRect(nameHeader, { left: 0, right: 120, top: 50, bottom: 90, width: 120, height: 40 });
    stubRect(dropZone, { left: 0, right: 300, top: 0, bottom: 42, width: 300, height: 42 });

    nameHeader.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: 60,
    }));
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 120,
      clientY: 20,
    }));
    expect(chips[1].classList.contains("drop-before")).toBe(true);
    expect(
      dropZone.querySelector<HTMLElement>(".pte-grid-toolbar-group-drop-indicator")?.style.left,
    ).toBe("100px");
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(api.getColumnModel().getAutoGroupColumns()).toHaveLength(1);
    expect(Array.from(
      gridEl.querySelectorAll(".pte-grid-toolbar-group-chip-label"),
      (chip) => chip.textContent,
    )).toEqual(["Region", "Name", "Revenue"]);
    expect(dropZone.querySelector(".pte-grid-toolbar-group-drop-indicator")).toBeNull();
  });

  it("keeps toolbar sort priority synchronized with header indicators", async () => {
    const { gridEl, host } = await mountGridHost(AdvancedToolbarHost, 600, (instance) => {
      instance.columnPanel = { trigger: "toolbar" };
      instance.toolbar = { sorting: true };
    });
    const api = host.api!;
    const core = api.getCore();
    const model = api.getColumnModel();
    const region = model.getByColId("region")!;
    const revenue = model.getByColId("revenue")!;

    gridEl.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!.click();
    gridEl.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarSortAdd-${region.instanceID}"]`,
    )!.click();
    gridEl.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!.click();
    gridEl.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarSortAdd-${revenue.instanceID}"]`,
    )!.click();

    expect(core.getSortModel().items.map((item) => item.col.instanceID))
      .toEqual([region.instanceID, revenue.instanceID]);
    expect(
      header(gridEl, api, "region").querySelector(".pte-hcell-sort-priority")?.textContent,
    ).toBe("1");
    expect(
      header(gridEl, api, "revenue").querySelector(".pte-hcell-sort-priority")?.textContent,
    ).toBe("2");

    const name = model.getByColId("name")!;
    const nameHeader = header(gridEl, api, "name");
    const sortZone = gridEl.querySelector<HTMLElement>(".pte-grid-toolbar-sort-dropzone")!;
    const sortChips = Array.from(
      sortZone.querySelectorAll<HTMLElement>(".pte-grid-toolbar-sort-chip"),
    );
    sortChips.forEach((chip, index) => {
      stubRect(chip, {
        left: 300 + index * 100,
        right: 400 + index * 100,
        top: 0,
        bottom: 26,
        width: 100,
        height: 26,
      });
    });
    stubRect(nameHeader, { left: 0, right: 120, top: 50, bottom: 90, width: 120, height: 40 });
    stubRect(sortZone, { left: 300, right: 600, top: 0, bottom: 42, width: 300, height: 42 });

    nameHeader.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: 60,
    }));
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 420,
      clientY: 20,
    }));
    expect(sortChips[1].classList.contains("drop-before")).toBe(true);
    expect(
      sortZone.querySelector<HTMLElement>(".pte-grid-toolbar-sort-drop-indicator")?.style.left,
    ).toBe("100px");
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(core.getSortModel().items.map((item) => item.col.instanceID))
      .toEqual([region.instanceID, name.instanceID, revenue.instanceID]);
    expect(Array.from(
      gridEl.querySelectorAll(".pte-grid-toolbar-sort-chip-label"),
      (chip) => chip.textContent,
    )).toEqual(["Region", "Name", "Revenue"]);
    expect(sortZone.querySelector(".pte-grid-toolbar-sort-drop-indicator")).toBeNull();

    gridEl.querySelector<HTMLButtonElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${name.instanceID}"] .pte-grid-toolbar-sort-remove`,
    )!.click();

    gridEl.querySelector<HTMLElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${revenue.instanceID}"]`,
    )!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(core.getSortModel().items.map((item) => item.col.instanceID))
      .toEqual([revenue.instanceID, region.instanceID]);
    expect(
      header(gridEl, api, "revenue").querySelector(".pte-hcell-sort-priority")?.textContent,
    ).toBe("1");
    expect(
      header(gridEl, api, "region").querySelector(".pte-hcell-sort-priority")?.textContent,
    ).toBe("2");

    core.dispatch({ type: "headerAction", action: "toggleSort", colId: name.instanceID });
    expect(core.getSortModel().items.map((item) => item.col.instanceID)).toEqual([name.instanceID]);
    expect(Array.from(
      gridEl.querySelectorAll(".pte-grid-toolbar-sort-chip-label"),
      (chip) => chip.textContent,
    )).toEqual(["Name"]);

    gridEl.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-clear")!.click();
    expect(core.getSortModel().items).toEqual([]);
    expect(gridEl.querySelector(".pte-grid-toolbar-sort-chip")).toBeNull();
  });

  it("identifies clipped grouping and sort chips with grid tooltips", async () => {
    const { gridEl, host } = await mountGridHost(AdvancedToolbarHost, 600, (instance) => {
      instance.columnPanel = { trigger: "toolbar" };
      instance.toolbar = { grouping: true, sorting: true };
    });
    const api = host.api!;
    const model = api.getColumnModel();
    const region = model.getByColId("region")!;
    const revenue = model.getByColId("revenue")!;

    gridEl.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-add")!.click();
    gridEl.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarGroupAdd-${region.instanceID}"]`,
    )!.click();
    gridEl.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!.click();
    gridEl.querySelector<HTMLButtonElement>(
      `.pte-menu-item[data-item-id="toolbarSortAdd-${revenue.instanceID}"]`,
    )!.click();

    const groupChip = gridEl.querySelector<HTMLElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${region.instanceID}"]`,
    )!;
    const groupLabel = groupChip.querySelector<HTMLElement>(".pte-grid-toolbar-group-chip-label")!;
    expect(groupChip.hasAttribute("title")).toBe(false);
    Object.defineProperties(groupLabel, {
      scrollWidth: { configurable: true, value: 60 },
      clientWidth: { configurable: true, value: 100 },
    });
    groupChip.querySelector<HTMLElement>(".pte-grid-toolbar-group-drag")!.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, clientX: 20, clientY: 20 }),
    );
    await tick();
    expect(gridEl.querySelector(".pte-tooltip")).toBeNull();

    Object.defineProperty(groupLabel, "clientWidth", { configurable: true, value: 0 });
    groupChip.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    groupChip.querySelector<HTMLElement>(".pte-grid-toolbar-group-drag")!.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, clientX: 20, clientY: 20 }),
    );
    await tick();
    expect(gridEl.querySelector(".pte-tooltip")?.textContent).toBe("Region");

    const sortChip = gridEl.querySelector<HTMLElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${revenue.instanceID}"]`,
    )!;
    const sortLabel = sortChip.querySelector<HTMLElement>(".pte-grid-toolbar-sort-chip-label")!;
    expect(sortChip.hasAttribute("title")).toBe(false);
    Object.defineProperties(sortLabel, {
      scrollWidth: { configurable: true, value: 80 },
      clientWidth: { configurable: true, value: 0 },
    });
    groupChip.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    sortChip.querySelector<HTMLElement>(".pte-grid-toolbar-sort-drag")!.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, clientX: 400, clientY: 20 }),
    );
    await tick();
    expect(gridEl.querySelector(".pte-tooltip")?.textContent).toBe("Revenue");
  });

  it("updates application-owned saved views live without remounting", async () => {
    const { fixture, gridEl, host } = await mountGridHost(AdvancedToolbarHost);
    const api = host.api!;
    const core = api.getCore();
    const onActiveViewChange = vi.fn();
    const state = api.captureViewState();
    state.quickFilterText = "acme";

    host.toolbar = { views: true };
    host.savedViews = {
      views: [{ id: "sales", name: "Sales view", state }],
      activeViewId: null,
      onActiveViewChange,
    };
    await syncGridInputs(fixture);

    const viewsButton = gridEl.querySelector<HTMLButtonElement>(".pte-grid-toolbar-views-button")!;
    expect(viewsButton.textContent).toContain("Views");

    viewsButton.click();
    gridEl.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarViewApply:sales"]',
    )!.click();
    expect(core.getQuickFilterText()).toBe("acme");
    expect(onActiveViewChange).toHaveBeenCalledWith("sales");
    expect(host.api).toBe(api);

    host.savedViews = {
      views: [{ id: "sales", name: "Renamed externally", state }],
      activeViewId: "sales",
      onActiveViewChange,
    };
    await syncGridInputs(fixture);
    expect(viewsButton.textContent).toContain("Renamed externally");
    expect(host.api!.getCore()).toBe(core);
  });
});
