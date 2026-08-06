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
      [groupDisplayType]="groupDisplayType"
      [groupRowsSelectable]="groupRowsSelectable"
      [groupRowsSticky]="groupRowsSticky"
      [treeData]="treeData"
      (gridReady)="api = $event"
    />
  `,
})
class GroupingHost {
  api: IGridAPI | null = null;
  rows: Record<string, unknown>[] = [
    { id: "1", region: "EMEA", sales: 10 },
    { id: "2", region: "EMEA", sales: 20 },
    { id: "3", region: "APAC", sales: 30 },
  ];
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region" },
    { colId: "sales", key: "sales", label: "Sales" },
  ];
  groupDisplayType: GridOptions["groupDisplayType"] = "singleColumn";
  groupRowsSelectable = false;
  groupRowsSticky = false;
  treeData: GridOptions["treeData"] = undefined;
}

describe("AwbGrid grouping and tree data", () => {
  it("renders collapsed group rows with counts and expands them", async () => {
    const { gridEl, host } = await mountGridHost(GroupingHost);
    const core = host.api!.getCore();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });

    expect(core.getRowModel().getViewCount()).toBe(2);
    expect(gridEl.querySelector(".pte-group-toggle .icon-group-collapsed")).toBeTruthy();
    expect(Array.from(gridEl.querySelectorAll(".pte-group-label"), (el) => el.textContent))
      .toContainEqual(expect.stringContaining("(2)"));

    const emea = core.getRowModel().getGroupNodes().find((node) => node.groupKey === "EMEA")!;
    core.dispatch({ type: "groupToggleExpand", groupId: emea.id });
    expect(core.getRowModel().getViewCount()).toBe(4);
    expect(gridEl.querySelector(".pte-group-toggle .icon-group-expanded")).toBeTruthy();
  });

  it("renders group labels under the grouped column in multipleColumns mode", async () => {
    const { gridEl, host } = await mountGridHost(GroupingHost, 600, (instance) => {
      instance.groupDisplayType = "multipleColumns";
    });
    const core = host.api!.getCore();
    const leavesBefore = core.getColumnModel().getLeaves().filter((column) => !column.isInternal()).length;
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });

    expect(core.getColumnModel().getAutoGroupColumns()).toHaveLength(0);
    expect(core.getColumnModel().getLeaves().filter((column) => !column.isInternal())).toHaveLength(
      leavesBefore,
    );
    expect(gridEl.querySelector(".pte-group-label")?.textContent).toBeTruthy();
  });

  it("changes grouping display modes without recreating the API", async () => {
    const { fixture, gridEl, host } = await mountGridHost(GroupingHost);
    const api = host.api!;
    api.getCore().dispatch({ type: "rowGroupSet", colIds: ["region"] });
    expect(api.getColumnModel().getAutoGroupColumns()).toHaveLength(1);

    host.groupDisplayType = "multipleColumns";
    await syncGridInputs(fixture);
    expect(host.api).toBe(api);
    expect(api.getColumnModel().getAutoGroupColumns()).toHaveLength(0);

    host.groupDisplayType = "groupRows";
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-group-row.pte-full-width-row")).toBeTruthy();
  });

  it("updates group-row selectability live", async () => {
    const { fixture, gridEl, host } = await mountGridHost(GroupingHost, 600, (instance) => {
      instance.groupDisplayType = "groupRows";
    });
    const core = host.api!.getCore();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    let cell = gridEl.querySelector<HTMLElement>(".pte-full-width-row .pte-full-width-cell")!;
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(core.getSelectionRange()).toBeNull();

    host.groupRowsSelectable = true;
    await syncGridInputs(fixture);
    cell = gridEl.querySelector<HTMLElement>(".pte-full-width-row .pte-full-width-cell")!;
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(core.getSelectionRange()).not.toBeNull();
  });

  it("renders and expands parent-mode tree data through the generated hierarchy column", async () => {
    const { gridEl, host } = await mountGridHost(GroupingHost, 600, (instance) => {
      instance.rows = [
        { id: "root", parentId: null, name: "Root", value: 1 },
        { id: "child", parentId: "root", name: "Child", value: 2 },
      ];
      instance.cols = [
        { colId: "name", key: "name", label: "Name" },
        { colId: "value", key: "value", label: "Value" },
      ];
      instance.treeData = {
        mode: "parent",
        getParentId: (row: any) => row.parentId,
        getLabel: (row: any) => row.name,
        columnDef: { label: "Organization" },
        keyboardNavigationMode: "grid",
        enableKeyboardNavigationModeSwitch: true,
      };
    });
    const core = host.api!.getCore();
    expect(core.getColumnModel().getHierarchyColumn()?.label).toBe("Organization");
    expect(core.getRowModel().getViewCount()).toBe(1);
    expect(gridEl.querySelector(".pte-group-label")?.textContent).toBe("Root");

    gridEl.querySelector<HTMLElement>(".pte-group-toggle")!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    expect(core.getRowModel().getViewCount()).toBe(2);
    expect(Array.from(gridEl.querySelectorAll(".pte-group-label"), (el) => el.textContent)).toContain(
      "Child",
    );

    gridEl.querySelector<HTMLElement>(".pte-root")!.dispatchEvent(new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(core.getKeyboardNavigationMode()).toBe("hierarchy");
    expect(gridEl.querySelector(".pte-root")?.getAttribute("data-keyboard-navigation-mode")).toBe(
      "hierarchy",
    );
  });
});
