/**
 * Row-number insertion menu: opt-in, client-side/data-row only, conditionally exposes above/below,
 * and inserts application-created rows at the clicked row's underlying source-order boundary.
 */
import { describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { RowInsertionMenuOptions } from "../interfaces/gridOptions";
import { MenuItem } from "../interfaces/menuItem";
import { BodyMenuContext } from "./bodyContext";
import { BodyMenuService } from "./bodyMenuService";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(rowInsertionMenu?: RowInsertionMenuOptions) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowNumbers: true,
    rowInsertionMenu,
  });
  core.dispatch({
    type: "themeFontSet",
    headerFont: "12px sans",
    cellFont: "12px sans",
    reason: "test",
  });
  core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name" }]);
  core.setRowData([
    { id: "1", name: "One" },
    { id: "2", name: "Two" },
    { id: "3", name: "Three" },
  ]);
  return core;
}

function service(core: GridCore) {
  return new BodyMenuService({
    core,
    exporter: { exportCSV: () => {}, exportExcel: () => {} },
    clipboard: {
      copySelection: () => {},
      cutSelection: () => {},
      pasteSelection: () => {},
      hasEditableCells: () => false,
    },
    pinning: { setRowPinned: () => {} },
  });
}

function context(core: GridCore, overrides: Partial<BodyMenuContext> = {}): BodyMenuContext {
  const rowNumber = core.getColumnModel().getLeaves().find(col => col.isRowNumberColumn())!;
  return {
    trigger: "bodyContextMenu",
    rowId: "2",
    colId: rowNumber.instanceID,
    viewIdx: 1,
    selection: { rowIds: ["2"], colIds: [], range: null },
    ...overrides,
  };
}

function find(items: MenuItem[], id: string): MenuItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const nested = item.subMenu ? find(item.subMenu, id) : undefined;
    if (nested) return nested;
  }
  return undefined;
}

function rowIds(core: GridCore): string[] {
  const ids: string[] = [];
  core.getRowModel().forEachNode(node => ids.push(node.id));
  return ids;
}

describe("body menu row insertion", () => {
  it("is absent by default and never appears on an ordinary data cell", () => {
    const disabled = makeGrid();
    expect(find(service(disabled).buildDefaultBodyMenu(context(disabled)), "insertRow")).toBeUndefined();

    const enabled = makeGrid({ createRow: () => ({ id: "new", name: "New" }) });
    const dataCol = enabled.getColumnModel().getLeaves().find(col => !col.isInternal())!;
    const dataCellContext = context(enabled, { colId: dataCol.instanceID });
    expect(find(service(enabled).buildDefaultBodyMenu(dataCellContext), "insertRow")).toBeUndefined();
  });

  it("offers exactly the requested above/below submenu labels", () => {
    const core = makeGrid({ createRow: () => ({ id: "new", name: "New" }) });
    const insert = find(service(core).buildDefaultBodyMenu(context(core)), "insertRow")!;
    expect(insert.label).toBe("Insert");
    expect(insert.subMenu?.map(item => item.label)).toEqual(["1 row above", "1 row below"]);
  });

  it("uses canInsert to omit individual directions or the whole menu", () => {
    const belowOnly = makeGrid({
      createRow: () => ({ id: "new", name: "New" }),
      canInsert: params => params.position === "below",
    });
    const insert = find(service(belowOnly).buildDefaultBodyMenu(context(belowOnly)), "insertRow")!;
    expect(insert.subMenu?.map(item => item.id)).toEqual(["insertRowBelow"]);

    const neither = makeGrid({
      createRow: () => ({ id: "new", name: "New" }),
      canInsert: () => false,
    });
    expect(find(service(neither).buildDefaultBodyMenu(context(neither)), "insertRow")).toBeUndefined();
  });

  it("inserts the factory row at the source index above or below the clicked row", () => {
    for (const position of ["above", "below"] as const) {
      const seen: any[] = [];
      const core = makeGrid({
        createRow: params => {
          seen.push(params);
          return { id: `new-${position}`, name: "New" };
        },
      });
      const svc = service(core);
      const ctx = context(core);
      const items = svc.buildDefaultBodyMenu(ctx);
      svc.execute(find(items, position === "above" ? "insertRowAbove" : "insertRowBelow")!, ctx);

      expect(rowIds(core)).toEqual(position === "above"
        ? ["1", "new-above", "2", "3"]
        : ["1", "2", "new-below", "3"]);
      expect(seen[0]).toMatchObject({
        position,
        rowId: "2",
        viewIndex: 1,
        sourceIndex: 1,
        addIndex: position === "above" ? 1 : 2,
        data: { id: "2", name: "Two" },
      });
    }
  });

  it("cancels safely when createRow returns no row", () => {
    const core = makeGrid({ createRow: () => undefined });
    const svc = service(core);
    const ctx = context(core);
    svc.execute(find(svc.buildDefaultBodyMenu(ctx), "insertRowAbove")!, ctx);
    expect(rowIds(core)).toEqual(["1", "2", "3"]);
  });
});
