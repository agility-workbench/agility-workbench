/**
 * ColDef.filter as a custom matcher function: (val, node, filterValues, filterType) => boolean.
 * The matcher runs once per row for each active menu filter on that column and decides keep/drop,
 * bypassing the built-in operator switch. It only runs for filters the user has applied.
 */
import { describe, it, expect } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import { FilterType } from "../interfaces/filter";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

const ROWS = [
  { id: "1", name: "alice", tags: "red,green" },
  { id: "2", name: "bob", tags: "blue" },
  { id: "3", name: "carol", tags: "green,blue" },
];

function viewIds(core: GridCore): string[] {
  const out: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) out.push(core.getRowIdAtViewIndex(i)!);
  return out;
}

describe("custom filter matcher", () => {
  it("filters rows via the matcher, receiving the raw menu values + type", () => {
    const seen: Array<{ val: any; values: any[]; type: FilterType }> = [];
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(ROWS.map(r => ({ ...r })));
    core.setColumnDefsFromProps([
      { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
      {
        colId: "tags", key: "tags", label: "Tags", type: ColumnType.STRING,
        // Keep rows whose comma-separated tag set INCLUDES the searched tag.
        filter: (val: string, _node, values, type) => {
          seen.push({ val, values, type });
          const needle = String(values[0] ?? "");
          return String(val).split(",").includes(needle);
        },
      },
    ]);

    // No filter yet → all rows present, matcher not called.
    expect(viewIds(core)).toEqual(["1", "2", "3"]);
    expect(seen.length).toBe(0);

    // Apply a "tags contains green" style filter via the menu model.
    core.addFilterModel({
      col: core.getColumnModel().getByColId("tags")!,
      key: "tags",
      filters: [{ type: FilterType.CONTAINS, values: ["green"] }],
    });

    // Only rows whose tag set includes "green": alice(1) and carol(3).
    expect(viewIds(core)).toEqual(["1", "3"]);
    // Matcher received the cell value, the raw values array, and the operator.
    expect(seen.some(s => s.val === "red,green" && s.values[0] === "green" && s.type === FilterType.CONTAINS)).toBe(true);
  });

  it("no longer treats a function filter as a sort comparator", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(ROWS.map(r => ({ ...r })));
    core.setColumnDefsFromProps([
      { colId: "name", key: "name", label: "Name", type: ColumnType.STRING, filter: (v: string, _n, vals) => v === vals[0] },
    ]);
    const col = core.getColumnModel().getByColId("name")!;
    // The function is a matcher now, not the column's sort comparator.
    expect(col.comparator).not.toBe(col.filter);
    // Sorting still works via the type-derived comparator (alphabetical).
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: col.instanceID });
    expect(viewIds(core)).toEqual(["1", "2", "3"]); // alice, bob, carol already alphabetical
  });
});
