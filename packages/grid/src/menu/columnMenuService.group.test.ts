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
    item.id === "groupColumns" || item.id === "ungroupColumns" || item.id === "ungroupAllColumns"
  );
}

describe("column menu row grouping items", () => {
  it("shows Ungroup All on the auto group column menu", () => {
    const core = makeGrid();
    core.dispatch({ type: "rowGroupSet", colIds: [colId(core, "region")] });
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
});
