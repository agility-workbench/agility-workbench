/**
 * api.getCellValue(cell) — the raw value a cell holds: a leaf's column value (valueGetter or data
 * field), a group row's group cell value (aggregate, else label on the label column, else the
 * column's groupValueGetter). Rows resolve like getRowNode, columns like the other column APIs;
 * anything the grid does not hold reads as undefined.
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { IRowNode } from "../interfaces/iRowNode";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

const ROWS = [
  { id: "1", region: "EMEA", country: "UK", headcount: 4 },
  { id: "2", region: "EMEA", country: "France", headcount: 3 },
  { id: "3", region: "APAC", country: "Japan", headcount: 2 },
  { id: "4", region: "APAC", country: "India", headcount: 6 },
];

function makeGrid(): { core: GridCore; api: IGridAPI } {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    // colId differs from key so a key-addressed read can be told apart from a colId one.
    { colId: "hc", key: "headcount", label: "Headcount", type: ColumnType.NUMBER },
    {
      colId: "double", key: "double", label: "Double", type: ColumnType.NUMBER,
      valueGetter: (row: IRowNode) => row.data.headcount * 2,
    },
    {
      colId: "target", key: "target", label: "Target", type: ColumnType.NUMBER,
      groupValueGetter: ({ node, aggregates }) => `${node.groupKey}:${aggregates.hc}`,
    },
  ]);
  return { core, api: new GridAPI(core) };
}

function grouped() {
  const grid = makeGrid();
  grid.core.setAggregateModel([
    { key: grid.core.getColumnModel().getByColId("hc")!.instanceID, type: AggregateType.SUM },
  ]);
  grid.api.setRowGroupColumns(["region"]);
  const emeaId = grid.api.getGroupNodes().find(n => n.groupKey === "EMEA")!.id;
  return { ...grid, emeaId };
}

describe("api.getCellValue", () => {
  it("reads a leaf's data field", () => {
    const { api } = makeGrid();
    expect(api.getCellValue({ rowId: "3", colId: "country" })).toBe("Japan");
  });

  it("reads a leaf through the column's valueGetter", () => {
    const { api } = makeGrid();
    expect(api.getCellValue({ rowId: "4", colId: "double" })).toBe(12);
  });

  it("reads a group row's aggregate, unformatted", () => {
    const { api, emeaId } = grouped();
    expect(api.getCellValue({ rowId: emeaId, colId: "hc" })).toBe(7);
  });

  it("reads the group label on the auto-group column", () => {
    const { core, api, emeaId } = grouped();
    const autoGroup = core.getColumnModel().getLeaves().find(c => c.isAutoGroupColumn())!;
    // Internal columns are registered by instance id only (resolveColumn's lookups), so that is
    // the handle an API caller has on the auto-group column.
    expect(api.getCellValue({ rowId: emeaId, colId: autoGroup.instanceID })).toBe("EMEA (2)");
  });

  it("reads a group row's groupValueGetter result", () => {
    const { api, emeaId } = grouped();
    expect(api.getCellValue({ rowId: emeaId, colId: "target" })).toBe("EMEA:7");
  });

  it("reads an application-pinned band row", () => {
    const { core, api } = makeGrid();
    const pinned = {
      id: "total", data: { id: "total", region: "All", headcount: 15 }, viewIndex: -1, selected: false,
      level: 0, rowPinned: "bottom",
    } as IRowNode;
    core.setDisplayedPinnedRows([], [pinned]);
    expect(api.getCellValue({ rowId: "total", colId: "hc" })).toBe(15);
  });

  it("returns undefined for an unknown row", () => {
    const { api } = makeGrid();
    expect(api.getCellValue({ rowId: "nope", colId: "country" })).toBeUndefined();
  });

  it("returns undefined for an unknown column", () => {
    const { api } = makeGrid();
    expect(api.getCellValue({ rowId: "1", colId: "nope" })).toBeUndefined();
  });

  it("resolves a column addressed by key or instance id", () => {
    const { core, api } = makeGrid();
    expect(api.getCellValue({ rowId: "1", colId: "headcount" })).toBe(4);
    const instanceID = core.getColumnModel().getByColId("hc")!.instanceID;
    expect(api.getCellValue({ rowId: "1", colId: instanceID })).toBe(4);
  });
});
