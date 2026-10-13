/**
 * api.getCellValue on internal columns: the auto-group column resolves by the colId its refs carry
 * (internal columns are kept out of the public colId index), and an emitted ref's instance id wins
 * over its colId, so a click payload's cell ref reads back whole.
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
import { AggregateType } from "../interfaces/aggregate";
import { ColumnType } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: text => text.length * 7 };

const ROWS = [
  { id: "1", region: "EMEA", country: "UK", headcount: 4 },
  { id: "2", region: "EMEA", country: "France", headcount: 3 },
  { id: "3", region: "APAC", country: "Japan", headcount: 2 },
  { id: "4", region: "APAC", country: "India", headcount: 6 },
];

const AUTO_GROUP_COL_ID = "__pte_group__";

function grouped(): { core: GridCore; api: IGridAPI; emeaId: string } {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", groupDisplayType: "singleColumn" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(ROWS.map(r => ({ ...r })));
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", type: ColumnType.STRING },
    { colId: "country", key: "country", label: "Country", type: ColumnType.STRING },
    { colId: "hc", key: "headcount", label: "Headcount", type: ColumnType.NUMBER },
  ]);
  const api = new GridAPI(core);
  core.setAggregateModel([
    { key: core.getColumnModel().getByColId("hc")!.instanceID, type: AggregateType.SUM },
  ]);
  api.setRowGroupColumns(["region"]);
  const emeaId = api.getGroupNodes().find(n => n.groupKey === "EMEA")!.id;
  return { core, api, emeaId };
}

function autoGroupColumn(core: GridCore) {
  const col = core.getColumnModel().getLeaves().find(c => c.isAutoGroupColumn());
  if (!col) throw new Error("no auto-group column");
  return col;
}

describe("api.getCellValue on internal columns", () => {
  it("reads a group row's label through the auto-group column's colId", () => {
    const { core, api, emeaId } = grouped();
    expect(autoGroupColumn(core).colId).toBe(AUTO_GROUP_COL_ID);
    const node = api.getRowNode(emeaId)!;
    const value = api.getCellValue({ rowId: emeaId, colId: AUTO_GROUP_COL_ID });
    expect(value).toBe(core.getGroupRowLabel(node));
    expect(value).toContain("EMEA");
  });

  it("resolves by the ref's instance id even when its colId is unknown", () => {
    const { core, api, emeaId } = grouped();
    const col = autoGroupColumn(core);
    const node = api.getRowNode(emeaId)!;
    expect(api.getCellValue({ rowId: emeaId, colId: "no-such-column", colInstanceId: col.instanceID }))
      .toBe(core.getGroupRowLabel(node));
  });

  it("an instance id wins over a colId naming another column", () => {
    const { core, api } = grouped();
    const country = core.getColumnModel().getByColId("country")!;
    expect(api.getCellValue({ rowId: "3", colId: "hc", colInstanceId: country.instanceID })).toBe("Japan");
  });

  it("on a leaf, the auto-group column reads what the column's getValue gives", () => {
    const { core, api } = grouped();
    const col = autoGroupColumn(core);
    const leaf = api.getRowNode("1")!;
    expect(() => api.getCellValue({ rowId: "1", colId: AUTO_GROUP_COL_ID })).not.toThrow();
    expect(api.getCellValue({ rowId: "1", colId: AUTO_GROUP_COL_ID })).toEqual(col.getValue(leaf));
  });

  it("an unknown colId without an instance id still reads as undefined", () => {
    const { api, emeaId } = grouped();
    expect(api.getCellValue({ rowId: emeaId, colId: "no-such-column" })).toBeUndefined();
    expect(api.getCellValue({ rowId: "1", colId: "no-such-column" })).toBeUndefined();
  });
});
