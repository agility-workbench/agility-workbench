/**
 * api.setGroupExpanded(groupIds, expanded) — the typed form of `groupSetExpanded` with ids: one
 * rebuild for the whole list, unknown ids ignored, nothing emitted when every named node is
 * already in the requested state.
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
  const api = new GridAPI(core);
  api.setRowGroupColumns(["region"]);
  return { core, api };
}

const groupByKey = (api: IGridAPI, key: string): IRowNode =>
  api.getGroupNodes().find(n => n.groupKey === key)!;

describe("api.setGroupExpanded", () => {
  it("expands one group by id and leaves the others alone", () => {
    const { api } = makeGrid();
    api.setAllGroupsExpanded(false);
    expect(api.getGroupNodes().every(n => !n.isExpanded)).toBe(true);

    api.setGroupExpanded(groupByKey(api, "EMEA").id, true);

    expect(groupByKey(api, "EMEA").isExpanded).toBe(true);
    expect(groupByKey(api, "APAC").isExpanded).toBe(false);
    expect(api.getDisplayedRowCount()).toBe(4); // 2 groups + EMEA's 2 leaves
  });

  it("collapses a list of groups in one rebuild, like the all-groups batch", () => {
    const countRowsChanged = (run: (api: IGridAPI) => void): number => {
      const { api } = makeGrid();
      api.setAllGroupsExpanded(true);
      let rowsChanged = 0;
      api.on("rowsChanged", () => { rowsChanged++; });
      run(api);
      expect(api.getGroupNodes().every(n => !n.isExpanded)).toBe(true);
      expect(api.getDisplayedRowCount()).toBe(2);
      return rowsChanged;
    };
    const batch = countRowsChanged(api => api.setAllGroupsExpanded(false));
    const byId = countRowsChanged(api =>
      api.setGroupExpanded([groupByKey(api, "EMEA").id, groupByKey(api, "APAC").id], false));
    expect(byId).toBe(batch);
  });

  it("ignores ids that name no group and an empty list", () => {
    const { api } = makeGrid();
    api.setAllGroupsExpanded(false);
    let rowsChanged = 0;
    api.on("rowsChanged", () => { rowsChanged++; });

    api.setGroupExpanded("no-such-group", true);
    api.setGroupExpanded([], true);

    expect(api.getGroupNodes().every(n => !n.isExpanded)).toBe(true);
    expect(rowsChanged).toBe(0);
  });

  it("does nothing when the named groups are already in the requested state", () => {
    const { api } = makeGrid();
    api.setAllGroupsExpanded(true);
    let rowsChanged = 0;
    api.on("rowsChanged", () => { rowsChanged++; });

    api.setGroupExpanded(groupByKey(api, "EMEA").id, true);

    expect(rowsChanged).toBe(0);
    expect(groupByKey(api, "EMEA").isExpanded).toBe(true);
  });
});
