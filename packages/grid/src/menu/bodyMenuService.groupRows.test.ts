/**
 * The body menu's edit items (Cut / Paste / Fill) on group rows. A group row's cells hold a label
 * and aggregates, never a writable value, so a selection made only of group rows offers no edit
 * item even when its columns are editable; the gate is the real clipboard's hasEditableCells, the
 * same rule paste and clear apply to their write targets.
 */
import { describe, it, expect } from "vitest";
import { GridCore } from "../core/core";
import { BodyMenuService } from "./bodyMenuService";
import { BodyMenuContext } from "./bodyContext";
import { ClipboardRenderer } from "../renderer/clipboard/clipboardRenderer";
import { MenuItem } from "../interfaces/menuItem";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { GridOptions } from "../interfaces/gridOptions";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

// Leaf indices: total=0, region=1, name=2. Expanded view: AMER, r0, r1, EMEA, r2, r3.
function makeGrid(options: GridOptions = {}) {
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowModelType: "clientSide",
    groupDefaultExpanded: -1,
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(Array.from({ length: 4 }, (_, i) => ({
    id: `r${i}`,
    region: i < 2 ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  })));
  core.setColumnDefsFromProps([
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER, editable: true },
    { colId: "region", key: "region", label: "Region" },
    { colId: "name", key: "name", label: "Name", editable: true },
  ]);
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
  return core;
}

function makeService(core: GridCore) {
  const clip = new ClipboardRenderer({ core, writeText: async () => {}, readText: async () => "" });
  return new BodyMenuService({
    core: core as any,
    exporter: { exportCSV: () => {}, exportExcel: () => {} },
    clipboard: {
      copySelection: () => {},
      cutSelection: () => {},
      pasteSelection: () => {},
      hasEditableCells: () => clip.hasEditableCells(),
      // Always willing, so only the edit gate decides whether the fill items appear.
      canFillDown: () => true,
      canFillRight: () => true,
    },
    pinning: { setRowPinned: () => {} },
  });
}

function ctxAt(core: GridCore, viewIdx: number, colIdx: number): BodyMenuContext {
  const node = core.getRowModel().getRowNodeAtViewIndex(viewIdx)!;
  const range = core.getSelectionRange();
  return {
    trigger: "bodyContextMenu",
    rowId: node.id,
    colId: core.getColumnModel().getLeaves()[colIdx].instanceID,
    node,
    isGroup: !!node.isGroup,
    isFullWidth: core.isFullWidthNode(node),
    groupDisplayType: core.options.groupDisplayType,
    viewIdx,
    selection: {
      rowIds: Array.from(core.getSelectedRowIds()),
      colIds: Array.from(core.getSelectedColumnIds()),
      range: range ? { ...range } : null,
    },
  };
}

function select(core: GridCore, r0: number, c0: number, r1 = r0, c1 = c0) {
  core.dispatch({ type: "rangeSelectSet", viewIdx: r0, colIdx: c0, mode: "start" });
  if (r1 !== r0 || c1 !== c0) core.dispatch({ type: "rangeSelectSet", viewIdx: r1, colIdx: c1, mode: "extend" });
}

const ids = (items: MenuItem[]) => items.filter(i => !i.isSeparator).map(i => i.id!).filter(Boolean);
const EDIT_ITEMS = ["cut", "paste", "fillDown", "fillRight"];

describe("body menu edit items on group rows", () => {
  for (const [label, options] of [
    ["groupRows, group rows not selectable", { groupDisplayType: "groupRows" }],
    ["groupRows, groupRowsSelectable", { groupDisplayType: "groupRows", groupRowsSelectable: true }],
    ["singleColumn, groupRowsSelectable", { groupDisplayType: "singleColumn", groupRowsSelectable: true }],
  ] as const) {
    it(`offers no Cut / Paste / Fill on a group-only selection over editable columns (${label})`, () => {
      const core = makeGrid(options);
      const svc = makeService(core);
      const leaves = core.getColumnModel().getLeaves();
      const last = leaves.length - 1;
      expect(core.getRowModel().getRowNodeAtViewIndex(0)!.isGroup).toBe(true);
      expect(core.getRowModel().getRowNodeAtViewIndex(3)!.isGroup).toBe(true);

      select(core, 0, 0, 0, last);
      const items = ids(svc.buildDefaultBodyMenu(ctxAt(core, 0, 0)));
      expect(items).toEqual(expect.arrayContaining(["copy", "copyWithHeaders"]));
      for (const id of EDIT_ITEMS) expect(items).not.toContain(id);

      // The clicked group cell alone, as a right-click leaves it.
      select(core, 3, last);
      const single = ids(svc.buildDefaultBodyMenu(ctxAt(core, 3, last)));
      for (const id of EDIT_ITEMS) expect(single).not.toContain(id);
    });

    it(`still offers them on a leaf selection (${label})`, () => {
      const core = makeGrid(options);
      const svc = makeService(core);
      const nameIdx = core.getColumnModel().getLeaves().findIndex(c => c.colId === "name");
      select(core, 1, nameIdx, 2, nameIdx);
      const items = ids(svc.buildDefaultBodyMenu(ctxAt(core, 1, nameIdx)));
      for (const id of EDIT_ITEMS) expect(items).toContain(id);
    });
  }
});
