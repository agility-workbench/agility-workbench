import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnMenuContext } from "./context";
import { ColumnMenuService } from "./columnMenuService";

const measurer = { measure: (text: string) => text.length * 7 };

function findById(items: MenuItem[], id: string): MenuItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const nested = item.subMenu ? findById(item.subMenu, id) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

function makeGrid() {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    allowExportAsCSV: true,
    allowExportAsExcel: true,
    treeData: {
      mode: "parent",
      getParentId: (row: any) => row.parentId,
      getLabel: (row: any) => row.name,
      columnDef: { label: "Organization" },
    },
  });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans",
    cellFont: "12px sans",
    reason: "test",
  });
  core.setRowData([
    { id: "root", parentId: null, name: "Root" },
    { id: "child", parentId: "root", name: "Child" },
  ]);
  core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name" }]);
  return core;
}

describe("tree-data hierarchy column menu", () => {
  it("has regular column actions and working pin/unpin commands", () => {
    const core = makeGrid();
    const service = new ColumnMenuService(core as any);
    const hierarchy = core.getColumnModel().getHierarchyColumn()!;
    const ctx: ColumnMenuContext = {
      trigger: "columnMenuButton",
      targetColId: hierarchy.instanceID,
      colIds: [hierarchy.instanceID],
    };

    let items = service.buildDefaultColumnMenu(ctx);
    expect(findById(items, "sortAsc")).toBeTruthy();
    expect(findById(items, "sortDesc")).toBeTruthy();
    expect(findById(items, "hideColumns")).toBeTruthy();
    expect(findById(items, "pinLeft")).toBeTruthy();
    expect(findById(items, "pinRight")).toBeTruthy();
    expect(findById(items, "exportCSV")).toBeTruthy();
    expect(findById(items, "exportExcel")).toBeTruthy();

    service.execute(findById(items, "pinRight")!, ctx);
    expect(core.getColumnModel().getHierarchyColumn()?.pinned).toBe("right");

    const pinned = core.getColumnModel().getHierarchyColumn()!;
    const pinnedCtx = { ...ctx, targetColId: pinned.instanceID, colIds: [pinned.instanceID] };
    items = service.buildDefaultColumnMenu(pinnedCtx);
    service.execute(findById(items, "unpinColumns")!, pinnedCtx);
    expect(core.getColumnModel().getHierarchyColumn()?.pinned).toBeNull();
  });
});
