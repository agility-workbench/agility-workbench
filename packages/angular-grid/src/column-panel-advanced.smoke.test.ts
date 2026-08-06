import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { GridOptions, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost } from "./test-utils";

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
      [tooltip]="{ showDelay: 0, hideDelay: 0 }"
      (gridReady)="api = $event"
    />
  `,
})
class AdvancedPanelHost {
  api: IGridAPI | null = null;
  columnPanel: GridOptions["columnPanel"] = true;
  rows = [{ id: "1", name: "Acme", region: "West", revenue: 42, status: "Open" }];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    { colId: "region", key: "region", label: "Region" },
    { colId: "revenue", key: "revenue", label: "Revenue" },
  ];
}

function panelRow(gridEl: HTMLElement, colId: string): HTMLElement | null {
  return gridEl.querySelector<HTMLElement>(`.pte-column-panel-row[data-col-id="${colId}"]`);
}

function dragTo(source: HTMLElement, target: HTMLElement): void {
  source.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
  target.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
  target.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

async function hover(element: Element): Promise<void> {
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }));
  await tick();
}

describe("AwbGrid column panel (advanced)", () => {
  it("reorders columns by drag and drop within a pin section", async () => {
    const { gridEl, host } = await mountGridHost(AdvancedPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: true };
    });
    const api = host.api!;

    dragTo(panelRow(gridEl, "name")!, panelRow(gridEl, "revenue")!);

    expect(api.getColumnState().map((state) => state.colId)).toEqual(["region", "revenue", "name"]);
    expect(gridEl.querySelector(".pte-column-panel-announcer")?.textContent)
      .toBe("Name moved to position 3 of 3");
  });

  it("moves a nested leaf with its full hierarchy when dropped at the section end", async () => {
    const { gridEl, host } = await mountGridHost(AdvancedPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: true };
      instance.cols = [
        {
          colId: "identity",
          label: "Identity",
          children: [
            {
              colId: "contact",
              label: "Contact",
              children: [
                { colId: "name", key: "name", label: "Name" },
                { colId: "region", key: "region", label: "Region" },
              ],
            },
          ],
        },
        {
          colId: "metrics",
          label: "Metrics",
          children: [{ colId: "revenue", key: "revenue", label: "Revenue" }],
        },
      ];
    });
    const api = host.api!;
    const rootDropZone = gridEl.querySelector<HTMLElement>(
      '.pte-column-panel-section[data-section="center"] .pte-column-panel-root-dropzone',
    )!;

    dragTo(panelRow(gridEl, "name")!, rootDropZone);

    expect(api.getColumnState().map((state) => state.colId)).toEqual(["region", "revenue", "name"]);
    const model = api.getColumnModel();
    const nameAncestors = model.getAncestors(model.getByColId("name")!.instanceID);
    const regionAncestors = model.getAncestors(model.getByColId("region")!.instanceID);
    expect(nameAncestors.map((col) => col.colId)).toEqual(["identity", "contact", "name"]);
    expect(regionAncestors.map((col) => col.colId)).toEqual(["identity", "contact", "region"]);
    expect(nameAncestors[0].instanceID).not.toBe(regionAncestors[0].instanceID);
    expect(gridEl.querySelectorAll(
      '.pte-column-panel-tree-group[data-group-col-id="identity"]',
    )).toHaveLength(2);
    expect(gridEl.querySelector(".pte-column-panel-list")
      ?.classList.contains("pte-column-panel-dragging-group-column")).toBe(false);
    expect(gridEl.querySelector(".pte-column-panel-announcer")?.textContent)
      .toBe("Name moved to position 3 of 3");
  });

  it("duplicates only the immediate parent when a leaf moves within its top-level group", async () => {
    const { gridEl, host } = await mountGridHost(AdvancedPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: true };
      instance.cols = [
        {
          colId: "identity",
          label: "Identity",
          children: [
            {
              colId: "contact",
              label: "Contact",
              children: [
                { colId: "name", key: "name", label: "Name" },
                { colId: "region", key: "region", label: "Region" },
              ],
            },
            { colId: "status", key: "status", label: "Status" },
          ],
        },
        { colId: "revenue", key: "revenue", label: "Revenue" },
      ];
    });
    const api = host.api!;

    dragTo(panelRow(gridEl, "name")!, panelRow(gridEl, "status")!);

    expect(api.getColumnState().map((state) => state.colId))
      .toEqual(["region", "status", "name", "revenue"]);
    const model = api.getColumnModel();
    const nameAncestors = model.getAncestors(model.getByColId("name")!.instanceID);
    const regionAncestors = model.getAncestors(model.getByColId("region")!.instanceID);
    expect(nameAncestors.map((col) => col.colId)).toEqual(["identity", "contact", "name"]);
    expect(regionAncestors.map((col) => col.colId)).toEqual(["identity", "contact", "region"]);
    expect(nameAncestors[0].instanceID).toBe(regionAncestors[0].instanceID);
    expect(nameAncestors[1].instanceID).not.toBe(regionAncestors[1].instanceID);
    expect(gridEl.querySelectorAll(
      '.pte-column-panel-tree-group[data-group-col-id="identity"]',
    )).toHaveLength(1);
    expect(gridEl.querySelectorAll(
      '.pte-column-panel-tree-group[data-group-col-id="contact"]',
    )).toHaveLength(2);
  });

  it("announces pin and keyboard reorder changes and flags the modified layout", async () => {
    const { gridEl, host } = await mountGridHost(AdvancedPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: true };
    });
    const api = host.api!;
    const announcer = gridEl.querySelector<HTMLElement>(".pte-column-panel-announcer")!;
    const modified = gridEl.querySelector<HTMLElement>(".pte-column-panel-modified")!;
    const reset = gridEl.querySelector<HTMLButtonElement>(".pte-column-panel-reset")!;
    expect(modified.hidden).toBe(true);

    panelRow(gridEl, "region")!
      .querySelector<HTMLInputElement>(".pte-column-panel-checkbox")!
      .click();
    expect(api.getColumnModel().getByColId("region")!.hidden).toBe(true);
    expect(gridEl.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!.indeterminate)
      .toBe(true);
    expect(modified.hidden).toBe(false);
    expect(announcer.textContent).toBe("Region hidden");

    const revenuePin = panelRow(gridEl, "revenue")!
      .querySelector<HTMLSelectElement>(".pte-column-panel-pin")!;
    revenuePin.value = "left";
    revenuePin.dispatchEvent(new Event("change", { bubbles: true }));
    expect(api.getColumnModel().getByColId("revenue")!.pinned).toBe("left");
    expect(gridEl.querySelector(
      '.pte-column-panel-section[data-section="left"] [data-col-id="revenue"]',
    )).toBeTruthy();
    expect(announcer.textContent).toBe("Revenue pinned left");

    panelRow(gridEl, "region")!
      .querySelector<HTMLButtonElement>('[aria-label="Move Region up"]')!
      .click();
    expect(api.getColumnState()
      .filter((state) => state.pinned == null)
      .sort((a, b) => a.order! - b.order!)
      .map((state) => state.colId)).toEqual(["region", "name"]);
    expect(announcer.textContent).toBe("Region moved to position 1 of 2");

    reset.click();
    expect(modified.hidden).toBe(true);
  });

  it("lists only columns made visible by column-group expansion", async () => {
    // The always-visible "id" child keeps the group's children mixed even while "name" is
    // user-hidden — a group whose non-hidden children all share one columnGroupShow value stops
    // being expansion-controlled entirely (uniform-toggle rule) and would derail this test.
    const { gridEl, host } = await mountGridHost(AdvancedPanelHost, 600, (instance) => {
      instance.columnPanel = { defaultOpen: true };
      instance.cols = [
        {
          colId: "responsive",
          label: "Responsive",
          children: [
            { colId: "id", key: "id", label: "Id" },
            { colId: "name", key: "name", label: "Name", columnGroupShow: "closed" },
            { colId: "region", key: "region", label: "Region", columnGroupShow: "open" },
          ],
        },
      ];
    });
    const api = host.api!;
    const bulk = gridEl.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!;

    expect(panelRow(gridEl, "name")).toBeTruthy();
    expect(panelRow(gridEl, "region")).toBeNull();
    expect(api.getColumnModel().getCenterLeaves().map((col) => col.colId)).toEqual(["id", "name"]);
    expect(gridEl.querySelectorAll(".pte-column-panel-row")).toHaveLength(2);
    expect(bulk.checked).toBe(true);

    const nameCheckbox = panelRow(gridEl, "name")!
      .querySelector<HTMLInputElement>(".pte-column-panel-checkbox")!;
    nameCheckbox.click();
    expect(panelRow(gridEl, "name")).toBeTruthy();
    expect(nameCheckbox.checked).toBe(false);
    expect(api.getColumnModel().getCenterLeaves().map((col) => col.colId)).toEqual(["id"]);

    const groupId = api.getColumnModel().getByColId("responsive")!.instanceID;
    api.getCore().dispatch({ type: "headerAction", colId: groupId, action: "toggleGroupExpand" });

    expect(panelRow(gridEl, "name")).toBeNull();
    expect(panelRow(gridEl, "region")).toBeTruthy();
    expect(api.getColumnModel().getCenterLeaves().map((col) => col.colId)).toEqual(["id", "region"]);
    expect(gridEl.querySelectorAll(".pte-column-panel-row")).toHaveLength(2);
    expect(bulk.checked).toBe(true);

    api.getCore().dispatch({ type: "headerAction", colId: groupId, action: "toggleGroupExpand" });
    const restoredNameCheckbox = panelRow(gridEl, "name")!
      .querySelector<HTMLInputElement>(".pte-column-panel-checkbox")!;
    expect(panelRow(gridEl, "region")).toBeNull();
    expect(restoredNameCheckbox.checked).toBe(false);
    expect(api.getColumnModel().getCenterLeaves().map((col) => col.colId)).toEqual(["id"]);
  });

  it("offers Manage columns in both the column button menu and header context menu", async () => {
    const { gridEl, host } = await mountGridHost(AdvancedPanelHost, 600, (instance) => {
      instance.columnPanel = { trigger: "menu" };
    });
    const nameInstanceId = host.api!.getColumnModel().getByColId("name")!.instanceID;
    const header = gridEl.querySelector<HTMLElement>(`.pte-hcell#${nameInstanceId}`)!;

    header.querySelector<HTMLButtonElement>(".pte-hcell-menu-menuBtn")!.click();
    const manageFromButton = gridEl.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="manageColumns"]',
    )!;
    expect(manageFromButton.textContent).toContain("Manage columns");
    manageFromButton.click();
    expect(gridEl.querySelector(".pte-root")!.classList.contains("pte-column-panel-open")).toBe(true);

    gridEl.querySelector<HTMLButtonElement>(".pte-column-panel-close")!.click();
    header.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 20,
      clientY: 20,
    }));
    expect(gridEl.querySelector('.pte-menu-item[data-item-id="manageColumns"]')).toBeTruthy();
  });

  it("uses grid tooltips instead of native titles for panel controls", async () => {
    const { gridEl } = await mountGridHost(AdvancedPanelHost, 600, (instance) => {
      instance.columnPanel = { trigger: "header" };
    });
    const trigger = gridEl.querySelector<HTMLElement>(".pte-column-panel-trigger-header-button")!;
    expect(trigger.hasAttribute("title")).toBe(false);

    await hover(trigger);
    const triggerTooltip = gridEl.querySelector<HTMLElement>(".pte-tooltip");
    expect(triggerTooltip?.textContent).toContain("Columns");
    expect(triggerTooltip?.dataset.placement).toBe("left");

    trigger.click();
    const label = gridEl.querySelector<HTMLElement>(".pte-column-panel-label")!;
    expect(label.hasAttribute("title")).toBe(false);
    await hover(label);
    expect(gridEl.querySelector(".pte-tooltip")?.textContent).toContain(label.textContent);
  });
});
