/**
 * Tests for the body context menu's "Pin row" item (rowPinningMenu option):
 *  - Hidden unless rowPinningMenu is set; hidden when no model row is targeted.
 *  - Targets: clicked row for a single cell, the selected rows when the clicked row is one of them,
 *    every row a cell range covers (including group header rows and model-backed band rows in the
 *    range's pinned segments; application-owned band rows are excluded).
 *  - "Pin to top"/"Pin to bottom" disable when every target is already in that band; "Unpin"
 *    appears once any target is pinned.
 *  - Execution dispatches setRowPinned per target with the chosen position (null for Unpin).
 */
import { describe, it, expect } from "vitest";
import { GridCore } from "../core/core";
import { BodyMenuService } from "./bodyMenuService";
import { BodyMenuContext } from "./bodyContext";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import { IRowNode } from "../interfaces/iRowNode";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", title: "Manager", city: "NYC", salary: 100 },
  { id: "2", title: "Manager", city: "NYC", salary: 200 },
  { id: "3", title: "Analyst", city: "Boston", salary: 50 },
];

function makeGrid(options: object = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    rowPinningMenu: true,
    groupRowsSelectable: true,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "title", key: "title", label: "Title", type: ColumnType.STRING },
    { colId: "city", key: "city", label: "City", type: ColumnType.STRING },
    { colId: "salary", key: "salary", label: "Salary", type: ColumnType.NUMBER },
  ]);
  return core;
}

function makeService(core: GridCore) {
  const calls: { rowId: string; position: "top" | "bottom" | null }[] = [];
  const svc = new BodyMenuService({
    core: core as any,
    exporter: { exportCSV: () => {}, exportExcel: () => {} },
    clipboard: {
      copySelection: () => {},
      cutSelection: () => {},
      pasteSelection: () => {},
      hasEditableCells: () => false,
    },
    pinning: { setRowPinned: (rowId, position) => calls.push({ rowId, position }) },
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

function ctxWith(
  sel: Partial<BodyMenuContext["selection"]>,
  ctx: Partial<BodyMenuContext> = {},
): BodyMenuContext {
  return {
    trigger: "bodyContextMenu",
    rowId: "1",
    colId: "salary",
    viewIdx: 0,
    selection: { rowIds: [], colIds: [], range: null, ...sel },
    ...ctx,
  };
}

function cellRange(rowStart: number, rowEnd: number): BodyMenuContext["selection"]["range"] {
  return { rowStart, rowEnd, colStart: 0, colEnd: 0, pageStartIdx: 0 };
}

/** Mark a model row as displayed in a pinned band (what the renderer does after resolving pins). */
function displayPinned(core: GridCore, rowIds: string[], position: "top" | "bottom") {
  const nodes = rowIds.map(id => ({ ...core.getRowModel().getRowNode(id)!, rowPinned: position }));
  core.setDisplayedPinnedRows(
    position === "top" ? nodes : [],
    position === "bottom" ? nodes : [],
    new Set(rowIds),
  );
}

describe("body menu Pin row item", () => {
  it("is absent when rowPinningMenu is not enabled", () => {
    const core = makeGrid({ rowPinningMenu: false });
    const { svc } = makeService(core);
    const items = svc.buildDefaultBodyMenu(ctxWith({ range: cellRange(0, 0) }));
    expect(findById(items, "pinRow")).toBeUndefined();
  });

  it("targets the clicked row for a single-cell selection and pins it", () => {
    const core = makeGrid();
    const { svc, calls } = makeService(core);
    const ctx = ctxWith({ range: cellRange(1, 1) }, { rowId: "2", viewIdx: 1 });
    const items = svc.buildDefaultBodyMenu(ctx);

    const pin = findById(items, "pinRow")!;
    expect(pin.label).toBe("Pin row");
    expect(findById(items, "unpin")).toBeUndefined();
    expect(findById(items, "pinTop")!.disabled).toBeFalsy();

    svc.execute(findById(items, "pinTop")!, ctx);
    expect(calls).toEqual([{ rowId: "2", position: "top" }]);
  });

  it("targets every row a cell range covers", () => {
    const core = makeGrid();
    const { svc, calls } = makeService(core);
    const ctx = ctxWith({ range: cellRange(0, 2) });
    const items = svc.buildDefaultBodyMenu(ctx);

    expect(findById(items, "pinRow")!.label).toBe("Pin rows");
    svc.execute(findById(items, "pinBottom")!, ctx);
    expect(calls.map(c => c.rowId).sort()).toEqual(["1", "2", "3"]);
    expect(calls.every(c => c.position === "bottom")).toBe(true);
  });

  it("targets the selected rows when the clicked row is one of them", () => {
    const core = makeGrid();
    const { svc, calls } = makeService(core);
    const ctx = ctxWith({ rowIds: ["1", "3"] }, { rowId: "3", viewIdx: 2 });
    const items = svc.buildDefaultBodyMenu(ctx);

    svc.execute(findById(items, "pinTop")!, ctx);
    expect(calls.map(c => c.rowId).sort()).toEqual(["1", "3"]);
  });

  it("falls back to the clicked row when the selection does not cover it", () => {
    const core = makeGrid();
    const { svc, calls } = makeService(core);
    // Column selection: no range, no row selection — clicked row only.
    const ctx = ctxWith({ colIds: ["salary"] }, { rowId: "2", viewIdx: 1 });
    svc.execute(findById(svc.buildDefaultBodyMenu(ctx), "pinTop")!, ctx);
    expect(calls).toEqual([{ rowId: "2", position: "top" }]);
  });

  it("includes group header rows covered by the range", () => {
    const core = makeGrid({ groupDefaultExpanded: -1 });
    core.dispatch({ type: "rowGroupSet", colIds: ["title"] });
    const { svc, calls } = makeService(core);

    const viewCount = core.getRowModel().getViewCount();
    const ctx = ctxWith({ range: cellRange(0, viewCount - 1) });
    svc.execute(findById(svc.buildDefaultBodyMenu(ctx), "pinTop")!, ctx);

    const groupIds = [];
    for (let i = 0; i < viewCount; i++) {
      const node = core.getRowModel().getRowNodeAtViewIndex(i);
      if (node?.isGroup) groupIds.push(node.id);
    }
    expect(groupIds.length).toBeGreaterThan(0);
    for (const id of groupIds) {
      expect(calls.map(c => c.rowId)).toContain(id);
    }
    expect(calls).toHaveLength(viewCount);
  });

  it("offers Unpin (and disables the current band) for pinned targets, unpinning with null", () => {
    const core = makeGrid();
    displayPinned(core, ["2"], "top");
    const { svc, calls } = makeService(core);

    const ctx = ctxWith(
      { range: { ...cellRange(0, -1)!, pinnedTop: { start: 0, end: 0 } } },
      { rowId: "2", viewIdx: 0, rowPinned: "top" },
    );
    const items = svc.buildDefaultBodyMenu(ctx);

    expect(findById(items, "pinTop")!.disabled).toBe(true);
    expect(findById(items, "pinBottom")!.disabled).toBeFalsy();
    const unpin = findById(items, "unpin")!;
    expect(unpin.label).toBe("Unpin row");

    svc.execute(unpin, ctx);
    expect(calls).toEqual([{ rowId: "2", position: null }]);
  });

  it("keeps Pin to top enabled for a mixed pinned/unpinned range and shows Unpin", () => {
    const core = makeGrid();
    displayPinned(core, ["1"], "top");
    const { svc } = makeService(core);

    const ctx = ctxWith({
      range: { ...cellRange(0, 2)!, pinnedTop: { start: 0, end: 0 } },
    });
    const items = svc.buildDefaultBodyMenu(ctx);
    expect(findById(items, "pinTop")!.disabled).toBeFalsy();
    expect(findById(items, "unpin")).toBeDefined();
  });

  it("ignores application-owned band rows (no model node) and hides the item when none remain", () => {
    const core = makeGrid();
    const appNode: IRowNode = {
      id: "pinned-top-0",
      data: { id: "app", title: "App", city: "-", salary: 0 },
      viewIndex: -1,
      selected: false,
      type: "leaf",
      level: 0,
      isGroup: false,
      isExpanded: false,
      rowPinned: "top",
    };
    core.setDisplayedPinnedRows([appNode], []);
    const { svc } = makeService(core);

    const ctx = ctxWith(
      { range: { ...cellRange(0, -1)!, pinnedTop: { start: 0, end: 0 } } },
      { rowId: "pinned-top-0", viewIdx: 0, rowPinned: "top" },
    );
    expect(findById(svc.buildDefaultBodyMenu(ctx), "pinRow")).toBeUndefined();
  });
});
