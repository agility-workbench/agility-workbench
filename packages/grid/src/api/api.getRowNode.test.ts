/**
 * api.getRowNode(rowId) — the row model's node for a data row, a client-side group node at any
 * level, or an application-pinned band row; undefined for an id the grid does not hold. Group ids
 * are minted per grouping, so a regroup retires the old ones.
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "./api";
import { GridCore } from "../core/core";
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
    { colId: "headcount", key: "headcount", label: "Headcount", type: ColumnType.NUMBER },
  ]);
  return { core, api: new GridAPI(core) };
}

const groupByKey = (api: IGridAPI, key: string): IRowNode =>
  api.getGroupNodes().find(n => n.groupKey === key)!;

describe("api.getRowNode", () => {
  it("returns a data row's node by its id", () => {
    const { api } = makeGrid();
    const node = api.getRowNode("3");
    expect(node?.isGroup).toBeFalsy();
    expect(node?.data.country).toBe("Japan");
  });

  it("returns group nodes at two levels with their key, value, level, parent and children", () => {
    const { api } = makeGrid();
    api.setRowGroupColumns(["region", "country"]);

    const emeaId = groupByKey(api, "EMEA").id;
    const emea = api.getRowNode(emeaId)!;
    expect(emea.isGroup).toBe(true);
    expect(emea.groupKey).toBe("EMEA");
    expect(emea.groupValue).toBe("EMEA");
    expect(emea.level).toBe(0);
    expect(emea.parentId).toBeUndefined();
    expect(emea.children?.map(c => c.groupKey).sort()).toEqual(["France", "UK"]);

    const uk = api.getRowNode(emea.children!.find(c => c.groupKey === "UK")!.id)!;
    expect(uk.isGroup).toBe(true);
    expect(uk.level).toBe(1);
    expect(uk.parentId).toBe(emeaId);
    expect(uk.children?.map(c => c.id)).toEqual(["1"]);
    // A leaf under a group still resolves, with the group as its parent.
    expect(api.getRowNode("1")?.parentId).toBe(uk.id);
  });

  it("returns undefined for an unknown id", () => {
    const { api } = makeGrid();
    api.setRowGroupColumns(["region"]);
    expect(api.getRowNode("nope")).toBeUndefined();
    expect(api.getRowNode("g:Nowhere")).toBeUndefined();
  });

  it("forgets a group id once a regroup mints new group nodes", () => {
    const { api } = makeGrid();
    api.setRowGroupColumns(["region"]);
    const emeaId = groupByKey(api, "EMEA").id;
    expect(api.getRowNode(emeaId)).toBeDefined();

    api.setRowGroupColumns(["country"]);
    expect(api.getRowNode(emeaId)).toBeUndefined();
    expect(api.getRowNode(groupByKey(api, "UK").id)?.groupKey).toBe("UK");

    api.setRowGroupColumns([]);
    expect(api.getRowNode(emeaId)).toBeUndefined();
    expect(api.getRowNode("1")?.data.country).toBe("UK");
  });

  it("returns an application-pinned band row", () => {
    const { core, api } = makeGrid();
    const pinned: IRowNode = {
      id: "total", data: { id: "total", region: "All", headcount: 15 }, viewIndex: -1, selected: false,
      level: 0, rowPinned: "bottom",
    } as IRowNode;
    core.setDisplayedPinnedRows([], [pinned]);
    expect(api.getRowNode("total")).toBe(pinned);
  });
});
