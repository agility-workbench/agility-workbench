/**
 * Tests for the body context menu's grouping-aware Excel export item:
 *  - Not grouped, or no group row in the selection → a single "Excel" item.
 *  - Grouped + a group row selected → an "Excel" submenu: "Export with row groups" / "Export leaf
 *    rows".
 *  - "Export with row groups" is disabled (with a tooltip) when a cell range's column span excludes
 *    the column that would host the group headings.
 */
import { describe, it, expect } from "vitest";
import { GridCore } from "../core/core";
import { BodyMenuService } from "./bodyMenuService";
import { BodyMenuContext } from "./bodyContext";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", title: "Manager", city: "NYC", salary: 100 },
  { id: "2", title: "Manager", city: "NYC", salary: 200 },
  { id: "3", title: "Analyst", city: "Boston", salary: 50 },
];

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", groupRowsSelectable: true, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "title", key: "title", label: "Title", type: ColumnType.STRING },
    { colId: "city", key: "city", label: "City", type: ColumnType.STRING },
    { colId: "salary", key: "salary", label: "Salary", type: ColumnType.NUMBER },
  ]);
  return core;
}

function makeService(core: GridCore) {
  const calls: any[] = [];
  const svc = new BodyMenuService({
    core: core as any,
    exporter: {
      exportCSV: (o) => calls.push({ fn: "csv", ...o }),
      exportExcel: (o) => calls.push({ fn: "excel", ...o }),
    },
    clipboard: {
      copySelection: () => {},
      cutSelection: () => {},
      pasteSelection: () => {},
      hasEditableCells: () => false,
    },
    pinning: { setRowPinned: () => {} },
  });
  return { svc, calls };
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

function groupRowViewIdx(core: GridCore, key: string): number {
  const rm = core.getRowModel();
  for (let i = 0; i < rm.getViewCount(); i++) {
    const n = rm.getRowNodeAtViewIndex(i);
    if (n?.isGroup && n.groupKey === key) return i;
  }
  throw new Error(`group row '${key}' not found`);
}

function ctxWith(sel: Partial<BodyMenuContext["selection"]>): BodyMenuContext {
  return {
    trigger: "bodyContextMenu",
    rowId: "x",
    colId: "salary",
    viewIdx: 0,
    selection: { rowIds: [], colIds: [], range: null, ...sel },
  };
}

describe("body menu Excel export item (grouping-aware)", () => {
  it("is a single 'Excel' item when the grid is not grouped", () => {
    const core = makeGrid();
    const { svc } = makeService(core);
    const items = svc.buildDefaultBodyMenu(ctxWith({}));
    const excel = findById(items, "exportExcel")!;
    expect(excel.subMenu).toBeUndefined();
    expect(excel.command).toBe("body.export.excel");
  });

  it("stays a single item when grouped but no group row is selected", () => {
    const core = makeGrid({ groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    const { svc } = makeService(core);
    // A leaf-only selection (row id of a data row).
    const items = svc.buildDefaultBodyMenu(ctxWith({ rowIds: ["3"] }));
    expect(findById(items, "exportExcel")!.subMenu).toBeUndefined();
  });

  it("becomes a submenu when a group row is selected", () => {
    const core = makeGrid({ groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    const { svc } = makeService(core);
    const items = svc.buildDefaultBodyMenu(ctxWith({ rowIds: ["g:Manager"] }));
    const excel = findById(items, "exportExcel")!;
    expect(excel.subMenu?.map(i => i.id)).toEqual(["exportExcelTree", "exportExcelLeaves"]);
    // Row selection includes the heading host → "with row groups" enabled.
    expect(findById(items, "exportExcelTree")!.disabled).toBeFalsy();
  });

  it("disables 'Export with row groups' (with tooltip) when a range excludes the group column", () => {
    // singleColumn → the synthesized Group column (global index 0, pinned left) is the heading host.
    const core = makeGrid({ groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    // A range that covers a group row but starts at column 1 (excludes the group column at index 0).
    const gIdx = groupRowViewIdx(core, "Manager");
    const items = svc0(core).buildDefaultBodyMenu(
      ctxWith({ range: { rowStart: gIdx, rowEnd: gIdx + 1, colStart: 1, colEnd: 3, pageStartIdx: 0 } }),
    );
    const tree = findById(items, "exportExcelTree")!;
    expect(tree.disabled).toBe(true);
    expect(tree.title).toMatch(/group heading column/i);
    // Leaf export stays available.
    expect(findById(items, "exportExcelLeaves")!.disabled).toBeFalsy();
  });

  it("keeps 'Export with row groups' enabled when the range includes the group column", () => {
    const core = makeGrid({ groupDisplayType: "singleColumn", groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    const gIdx = groupRowViewIdx(core, "Manager");
    const items = svc0(core).buildDefaultBodyMenu(
      ctxWith({ range: { rowStart: gIdx, rowEnd: gIdx + 1, colStart: 0, colEnd: 3, pageStartIdx: 0 } }),
    );
    expect(findById(items, "exportExcelTree")!.disabled).toBeFalsy();
  });

  it("routes submenu commands to exportExcel with the right groupMode", () => {
    const core = makeGrid({ groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    const { svc, calls } = makeService(core);
    const ctx = ctxWith({ rowIds: ["g:Manager"] });
    const items = svc.buildDefaultBodyMenu(ctx);
    svc.execute(findById(items, "exportExcelTree")!, ctx);
    svc.execute(findById(items, "exportExcelLeaves")!, ctx);
    expect(calls).toEqual([
      { fn: "excel", scope: "all", groupMode: "tree" },
      { fn: "excel", scope: "all", groupMode: "leaves" },
    ]);
  });
});

// Small helper that returns just the service (for cases that don't inspect calls).
function svc0(core: GridCore): BodyMenuService {
  return makeService(core).svc;
}
