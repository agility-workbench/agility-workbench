/**
 * api.forEachNode / forEachLeafNode and the displayed-row reads (getDisplayedRowCount,
 * getDisplayedRowAtIndex) — page-relative view indexes, like selectRow and setFocusedCell.
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IRowNode } from "../interfaces/iRowNode";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

function makeGrid(): { core: GridCore; api: IGridAPI } {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", pageSize: 2, pageSizes: [2] });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
  ]);
  core.setRowData([
    { id: "1", region: "A", name: "a" },
    { id: "2", region: "B", name: "b" },
    { id: "3", region: "A", name: "c" },
  ]);
  return { core, api: new GridAPI(core) };
}

const ids = (visit: (cb: (node: IRowNode, idx: number) => void) => void) => {
  const out: Array<[string, number]> = [];
  visit((node, idx) => out.push([node.id, idx]));
  return out;
};

describe("api.forEachNode / forEachLeafNode", () => {
  it("ungrouped: both visit every data row, filtered-out rows included", () => {
    const { api } = makeGrid();
    api.setQuickFilter("c");
    expect(ids(cb => api.forEachNode(cb))).toEqual([["1", 0], ["2", 1], ["3", 2]]);
    expect(ids(cb => api.forEachLeafNode(cb))).toEqual([["1", 0], ["2", 1], ["3", 2]]);
  });

  it("grouped: forEachNode adds the group nodes after the data rows; forEachLeafNode does not", () => {
    const { api } = makeGrid();
    api.setRowGroupColumns(["region"]);
    const groups = api.getGroupNodes().map(node => node.id);
    expect(groups).toHaveLength(2);
    const all = ids(cb => api.forEachNode(cb));
    expect(all.map(([id]) => id)).toEqual(["1", "2", "3", ...groups]);
    expect(all.map(([, idx]) => idx)).toEqual([0, 1, 2, 3, 4]);
    expect(ids(cb => api.forEachLeafNode(cb)).map(([id]) => id)).toEqual(["1", "2", "3"]);
  });
});

describe("displayed rows", () => {
  it("count and index the displayed view, group rows included", () => {
    const { api } = makeGrid();
    api.setRowGroupColumns(["region"]);
    api.setAllGroupsExpanded(false);
    expect(api.getDisplayedRowCount()).toBe(2);
    expect(api.getDisplayedRowAtIndex(0)?.isGroup).toBe(true);
    api.setAllGroupsExpanded(true);
    expect(api.getDisplayedRowCount()).toBe(5);
    expect(api.getDisplayedRowAtIndex(5)).toBeUndefined();
    expect(api.getDisplayedRowAtIndex(-1)).toBeUndefined();
  });

  it("are page-relative under pagination", () => {
    const { api } = makeGrid();
    api.setPagination({ enabled: true, pageIndex: 1 });
    expect(api.getDisplayedRowCount()).toBe(1);
    expect(api.getDisplayedRowAtIndex(0)?.id).toBe("3");
  });

  it("report nothing rendered on a grid that was never rendered", () => {
    const { api } = makeGrid();
    expect(api.getFirstDisplayedRowIndex()).toBe(-1);
    expect(api.getLastDisplayedRowIndex()).toBe(-1);
    expect(api.getRenderedNodes()).toEqual([]);
    // The repaint calls are inert before render rather than throwing.
    api.refreshCells();
    api.redrawRows();
    api.flashCells();
    api.sizeColumnsToFit();
  });
});
