/**
 * The column header menu's "Export as CSV / Export as Excel" items must actually run — previously
 * their commands ("export.csv" / "export.excel") had no case in execute() and silently no-op'd.
 * These tests verify the items are built and route to the injected export target with the right
 * column ids.
 */
import { describe, it, expect } from "vitest";
import { GridCore } from "../core/core";
import { ColumnMenuService } from "./columnMenuService";
import { ColumnMenuContext } from "./context";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData([{ id: "1", name: "A", qty: 10 }]);
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER },
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

function makeService(core: GridCore) {
  const calls: any[] = [];
  const svc = new ColumnMenuService(core as any);
  svc.setExportTarget({
    exportColumnCSV: (ids) => calls.push({ fn: "csv", ids }),
    exportColumnXLSX: (ids) => calls.push({ fn: "xlsx", ids }),
  });
  return { svc, calls };
}

describe("column menu export items", () => {
  it("builds Export as CSV / Excel items for a column", () => {
    const core = makeGrid();
    const { svc } = makeService(core);
    const ctx: ColumnMenuContext = { trigger: "columnMenuButton", targetColId: colId(core, "qty"), colIds: [colId(core, "qty")] };
    const items = svc.buildDefaultColumnMenu(ctx);
    expect(findById(items, "exportCSV")?.command).toBe("export.csv");
    expect(findById(items, "exportExcel")?.command).toBe("export.excel");
  });

  it("routes export.csv / export.excel to the exporter with the column ids", () => {
    const core = makeGrid();
    const { svc, calls } = makeService(core);
    const ids = [colId(core, "name"), colId(core, "qty")];
    const ctx: ColumnMenuContext = { trigger: "columnMenuButton", targetColId: ids[0], colIds: ids };
    const items = svc.buildDefaultColumnMenu(ctx);

    svc.execute(findById(items, "exportCSV")!, ctx);
    svc.execute(findById(items, "exportExcel")!, ctx);

    expect(calls).toEqual([
      { fn: "csv", ids },
      { fn: "xlsx", ids },
    ]);
  });

  it("omits export items when both export options are disabled", () => {
    const core = makeGrid({ allowExportAsCSV: false, allowExportAsExcel: false });
    const { svc } = makeService(core);
    const ctx: ColumnMenuContext = { trigger: "columnMenuButton", targetColId: colId(core, "qty"), colIds: [colId(core, "qty")] };
    const items = svc.buildDefaultColumnMenu(ctx);
    expect(findById(items, "exportCSV")).toBeUndefined();
    expect(findById(items, "exportExcel")).toBeUndefined();
    // No dangling separator at the tail.
    expect(items[items.length - 1]?.isSeparator).toBeFalsy();
  });

  it("no-ops safely when no export target is wired", () => {
    const core = makeGrid();
    const svc = new ColumnMenuService(core as any); // no setExportTarget
    const ctx: ColumnMenuContext = { trigger: "columnMenuButton", targetColId: colId(core, "qty"), colIds: [colId(core, "qty")] };
    const items = svc.buildDefaultColumnMenu(ctx);
    // Should not throw.
    expect(() => svc.execute(findById(items, "exportCSV")!, ctx)).not.toThrow();
  });
});
