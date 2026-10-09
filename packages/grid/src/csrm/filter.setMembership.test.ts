/**
 * Set-filter (in/notIn) membership uses ONE identity rule, shared with the menu's universe: a
 * `Date` matches by instant, an object by content, a persisted "5" finds the numeric 5, blanks are
 * one bucket, and text folds case unless `caseSensitive`. Before this, the row side compared raw
 * cells by reference, so unchecking a Date hid only the rows holding that exact instance.
 */
import { describe, expect, it } from "vitest";
import { GridAPI } from "../api/api";
import { GridCore } from "../core/core";
import { ColDef, ColumnType } from "../interfaces/column";
import { FilterType } from "../interfaces/filter";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

function createCore(rows: any[], column: ColDef): GridCore {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(rows);
  core.setColumnDefsFromProps([column]);
  return core;
}

function applyFilter(core: GridCore, type: FilterType, values: any[]): void {
  const col = core.getColumnModel().getLeaves()[0];
  core.addFilterModel({ col, key: col.key, filters: [{ type, values }] });
}

function viewIds(core: GridCore): string[] {
  const ids: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) ids.push(core.getRowIdAtViewIndex(i)!);
  return ids;
}

const JAN_15 = Date.UTC(2024, 0, 15);
const JAN_28 = Date.UTC(2024, 0, 28);

describe("set-filter membership identity", () => {
  it("matches Date cells by instant, not by instance", () => {
    const rows = [
      { id: "a", when: new Date(JAN_15) },
      { id: "b", when: new Date(JAN_15) }, // a different instance of the same instant
      { id: "c", when: new Date(JAN_28) },
    ];
    const core = createCore(rows, { key: "when", label: "When", type: ColumnType.DATE, filter: "set" });
    applyFilter(core, FilterType.NOT_IN, [new Date(JAN_15)]); // a third instance
    expect(viewIds(core)).toEqual(["c"]);

    applyFilter(core, FilterType.IN, [new Date(JAN_15)]);
    expect(viewIds(core)).toEqual(["a", "b"]);
  });

  it("the menu's universe and the row filter agree on Dates end to end", async () => {
    const rows = [
      { id: "a", when: new Date(JAN_15) },
      { id: "b", when: new Date(JAN_15) },
      { id: "c", when: new Date(JAN_28) },
    ];
    const core = createCore(rows, { colId: "when", key: "when", label: "When", type: ColumnType.DATE, filter: "set" });
    const api = new GridAPI(core);
    // One option per instant...
    expect((await api.getSetFilterValues("when")).map(v => (v as Date).getTime())).toEqual([JAN_15, JAN_28]);
    // ...and unchecking it hides every row at that instant.
    await api.uncheckSetFilterValue("when", new Date(JAN_15));
    expect(viewIds(core)).toEqual(["c"]);
  });

  it("the tree layout's date path rides on the same identity", async () => {
    const rows = [
      { id: "a", when: new Date(JAN_15) },
      { id: "b", when: new Date(JAN_15) },
      { id: "c", when: new Date(JAN_28) },
    ];
    const core = createCore(rows, { colId: "when", key: "when", label: "When", type: ColumnType.DATE, filter: "tree" });
    const api = new GridAPI(core);
    await api.setSetFilterValues("when", [new Date(JAN_28)], { mode: "include" });
    expect(viewIds(core)).toEqual(["c"]);
  });

  it("matches object cells by content without a keyCreator", () => {
    const rows = [
      { id: "a", region: { code: "EMEA" } },
      { id: "b", region: { code: "EMEA" } },
      { id: "c", region: { code: "APAC" } },
    ];
    const core = createCore(rows, { key: "region", label: "Region", filter: "set" });
    applyFilter(core, FilterType.NOT_IN, [{ code: "EMEA" }]);
    expect(viewIds(core)).toEqual(["c"]);
  });

  it("lets a persisted text value find the numeric cells the menu shows as one option", () => {
    const rows = [{ id: "a", qty: 5 }, { id: "b", qty: 7 }];
    const core = createCore(rows, { key: "qty", label: "Qty", type: ColumnType.NUMBER, filter: "set" });
    applyFilter(core, FilterType.IN, ["5"]);
    expect(viewIds(core)).toEqual(["a"]);
  });

  it("keeps the blanks bucket: null in the model stands for null, undefined, and empty text", () => {
    const rows = [{ id: "n", v: null }, { id: "u" }, { id: "e", v: "" }, { id: "x", v: "x" }];
    const plain = createCore(rows, { key: "v", label: "V", filter: "set" });
    applyFilter(plain, FilterType.NOT_IN, [null]);
    expect(viewIds(plain)).toEqual(["x"]);
    applyFilter(plain, FilterType.IN, [null]);
    expect(viewIds(plain)).toEqual(["n", "u", "e"]);

    // Same with a keyCreator, which is never asked about a blank.
    const keyed = createCore(rows, {
      key: "v", label: "V", filter: "set",
      filterParams: { keyCreator: (value: string) => value.toUpperCase() },
    });
    applyFilter(keyed, FilterType.NOT_IN, [null]);
    expect(viewIds(keyed)).toEqual(["x"]);
  });

  it("still folds text case unless caseSensitive, as every built-in comparison does", () => {
    const rows = [{ id: "upper", name: "Apple" }, { id: "lower", name: "apple" }, { id: "other", name: "pear" }];
    const folded = createCore(rows, { key: "name", label: "Name", filter: "set" });
    applyFilter(folded, FilterType.NOT_IN, ["Apple"]);
    expect(viewIds(folded)).toEqual(["other"]);

    const sensitive = createCore(rows, { key: "name", label: "Name", filter: "set", filterParams: { caseSensitive: true } });
    applyFilter(sensitive, FilterType.NOT_IN, ["Apple"]);
    expect(viewIds(sensitive)).toEqual(["lower", "other"]);
  });

  it("a keyCreator still decides identity, with raw values in the model", () => {
    const rows = [
      { id: "a", region: { code: "EMEA", name: "Europe" } },
      { id: "b", region: { code: "EMEA", name: "Duplicate" } },
      { id: "c", region: { code: "APAC", name: "Asia" } },
    ];
    const core = createCore(rows, {
      key: "region", label: "Region", filter: "set",
      filterParams: { keyCreator: (value: { code: string }) => value.code },
    });
    applyFilter(core, FilterType.NOT_IN, [{ code: "EMEA", name: "anything" }]);
    expect(viewIds(core)).toEqual(["c"]);
  });
});
