import { describe, it, expect } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnMenuContext } from "./context";
import { ColumnMenuService } from "./columnMenuService";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid() {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    groupDisplayType: "singleColumn",
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([{ id: "1", region: "EMEA", country: "UK", sales: 10 }]);
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    { colId: "sales", key: "sales", label: "Sales", type: ColumnType.NUMBER },
  ]);
  return core;
}

function colId(core: GridCore, key: string): string {
  return core.getColumnModel().getByColId(key)!.instanceID;
}

function findById(items: MenuItem[], id: string): MenuItem | undefined {
  for (const it of items) {
    if (it.id === id) return it;
    if (it.subMenu) {
      const found = findById(it.subMenu, id);
      if (found) return found;
    }
  }
  return undefined;
}

function groupItem(core: GridCore, ctx: ColumnMenuContext): MenuItem | undefined {
  return new ColumnMenuService(core as any).buildDefaultColumnMenu(ctx).find(item =>
    item.id === "groupColumns"
    || item.id === "groupColumnsMenu"
    || item.id === "ungroupColumns"
    || item.id === "ungroupAllColumns"
  );
}

describe("column menu row grouping items", () => {
  it("shows 'Ungroup' on the auto group column menu when a single column is grouped", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: [colId(core, "region")] });
    const autoGroupId = core.getColumnModel().getAutoGroupColumns()[0].instanceID;

    const item = groupItem(core, {
      trigger: "columnMenuButton",
      targetColId: autoGroupId,
      colIds: [autoGroupId],
    });

    // One grouped column → "Ungroup" (no "All"); still clears every grouping.
    expect(item?.label).toBe("Ungroup");
    expect(item?.payload).toEqual({ colIDs: [] });
  });

  it("shows 'Ungroup All' on the auto group column menu when more than one column is grouped", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: [colId(core, "region"), colId(core, "country")] });
    const autoGroupId = core.getColumnModel().getAutoGroupColumns()[0].instanceID;

    const item = groupItem(core, {
      trigger: "columnMenuButton",
      targetColId: autoGroupId,
      colIds: [autoGroupId],
    });

    expect(item?.label).toBe("Ungroup All");
    expect(item?.payload).toEqual({ colIDs: [] });
  });

  it("shows Ungroup for a grouped user column and removes only that column", () => {
    const core = makeGrid();
    const region = colId(core, "region");
    const country = colId(core, "country");
    core.dispatch({ type: "rowGroupSet", colIds: [region, country] });

    const svc = new ColumnMenuService(core as any);
    const ctx: ColumnMenuContext = { trigger: "columnMenuButton", targetColId: region, colIds: [region] };
    const item = findById(svc.buildDefaultColumnMenu(ctx), "ungroupColumns")!;

    expect(item.label).toBe("Ungroup");
    expect(item.payload).toEqual({ colIDs: [country] });

    svc.execute(item, ctx);
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([country]);
  });

  it("shows Ungroup All when every selected column is already grouped", () => {
    const core = makeGrid();
    const region = colId(core, "region");
    const country = colId(core, "country");
    core.dispatch({ type: "rowGroupSet", colIds: [region, country] });

    const item = groupItem(core, {
      trigger: "columnMenuButton",
      targetColId: region,
      colIds: [region, country],
    });

    expect(item?.label).toBe("Ungroup All");
    expect(item?.payload).toEqual({ colIDs: [] });
  });

  it("offers to replace or append grouping when another column is already grouped", () => {
    const core = makeGrid();
    const region = colId(core, "region");
    const country = colId(core, "country");
    core.dispatch({ type: "rowGroupSet", colIds: [region] });

    const svc = new ColumnMenuService(core as any);
    const ctx: ColumnMenuContext = {
      trigger: "columnMenuButton",
      targetColId: country,
      colIds: [country],
    };
    const items = svc.buildDefaultColumnMenu(ctx);
    const groupMenu = findById(items, "groupColumnsMenu")!;
    const replace = findById(items, "groupColumns")!;
    const add = findById(items, "addGroupColumns")!;

    expect(groupMenu.label).toBe("Group by Column");
    expect(groupMenu.subMenu).toEqual([replace, add]);
    expect(replace.label).toBe("Replace Existing Grouping");
    expect(replace.payload).toEqual({ colIDs: [country] });
    expect(add.label).toBe("Add to Existing Grouping");
    expect(add.payload).toEqual({ colIDs: [region, country] });

    svc.execute(replace, ctx);
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([country]);

    core.dispatch({ type: "rowGroupSet", colIds: [region] });
    svc.execute(add, ctx);
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([region, country]);
  });

  it("appends only ungrouped columns from a multi-column menu selection", () => {
    const core = makeGrid();
    const region = colId(core, "region");
    const country = colId(core, "country");
    const sales = colId(core, "sales");
    core.dispatch({ type: "rowGroupSet", colIds: [region] });

    const items = new ColumnMenuService(core as any).buildDefaultColumnMenu({
      trigger: "columnMenuButton",
      targetColId: country,
      colIds: [region, country, sales],
    });
    const add = findById(items, "addGroupColumns")!;

    expect(add.label).toBe("Add to Existing Grouping");
    expect(add.payload).toEqual({ colIDs: [region, country, sales] });
  });
});
