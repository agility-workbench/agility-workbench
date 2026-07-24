/**
 * Sort configuration:
 *  - ColDef.comparator — custom per-column sort logic (wins over type-based auto-derivation).
 *  - ColDef.sort / sortIndex — per-column initial sort, ordered by sortIndex.
 *  - GridOptions.initialSort — grid-level initial sort; fills only columns not covered by ColDef.sort.
 *  - Seeding happens once (first column setup) and is preserved across later columnDefs updates.
 */
import { describe, it, expect } from "vitest";
import { GridCore } from "./core";
import { ColumnType } from "../interfaces/column";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (t: string) => t.length * 7 };

function viewOrder(core: GridCore, key: string): unknown[] {
  const rm = core.getRowModel();
  const out: unknown[] = [];
  for (let i = 0; i < rm.getViewCount(); i++) out.push(rm.getRowNodeAtViewIndex(i)!.data[key]);
  return out;
}

const ROWS = [
  { id: "1", size: "M", n: 2 },
  { id: "2", size: "XL", n: 1 },
  { id: "3", size: "S", n: 3 },
  { id: "4", size: "L", n: 1 },
];

describe("ColDef.comparator", () => {
  it("sorts by a custom comparator instead of the type default", () => {
    const order = ["S", "M", "L", "XL"];
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(ROWS.map(r => ({ ...r })));
    core.setColumnDefsFromProps([
      {
        colId: "size", key: "size", label: "Size", type: ColumnType.STRING,
        comparator: (a: string, b: string) => order.indexOf(a) - order.indexOf(b),
      },
    ]);
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: core.getColumnModel().getByColId("size")!.instanceID });
    // Custom size order, not alphabetical (which would be L, M, S, XL).
    expect(viewOrder(core, "size")).toEqual(["S", "M", "L", "XL"]);
  });
});

describe("ColDef.sort / sortIndex (initial sort)", () => {
  it("applies a single-column initial sort on first load", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(ROWS.map(r => ({ ...r })));
    core.setColumnDefsFromProps([
      { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER, sort: "asc" },
      { colId: "size", key: "size", label: "Size", type: ColumnType.STRING },
    ]);
    expect(viewOrder(core, "id")).toEqual(["2", "4", "1", "3"]); // n: 1,1,2,3 (stable within ties)
  });

  it("orders a multi-column initial sort by sortIndex", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(ROWS.map(r => ({ ...r })));
    core.setColumnDefsFromProps([
      // Secondary by size asc, primary by n asc — sortIndex sets precedence regardless of def order.
      { colId: "size", key: "size", label: "Size", type: ColumnType.STRING, sort: "asc", sortIndex: 1 },
      { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER, sort: "asc", sortIndex: 0 },
    ]);
    // n asc primary: (1,1,2,3) → ids 2/4 tie on n=1, broken by size asc: "L"(4) < "XL"(2).
    expect(viewOrder(core, "id")).toEqual(["4", "2", "1", "3"]);
  });
});

describe("GridOptions.initialSort", () => {
  it("applies a grid-level initial sort", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", initialSort: [{ colId: "n", dir: "desc" }] });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(ROWS.map(r => ({ ...r })));
    core.setColumnDefsFromProps([
      { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER },
      { colId: "size", key: "size", label: "Size", type: ColumnType.STRING },
    ]);
    expect(viewOrder(core, "n")).toEqual([3, 2, 1, 1]); // desc
  });

  it("ColDef.sort takes precedence; initialSort only fills uncovered columns", () => {
    const core = new GridCore(measurer, {
      rowIdKey: "id", rowModelType: "clientSide",
      // Grid asks for n asc, but the ColDef pins n desc — ColDef wins for n.
      initialSort: [{ colId: "n", dir: "asc" }],
    });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(ROWS.map(r => ({ ...r })));
    core.setColumnDefsFromProps([
      { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER, sort: "desc" },
      { colId: "size", key: "size", label: "Size", type: ColumnType.STRING },
    ]);
    expect(viewOrder(core, "n")).toEqual([3, 2, 1, 1]); // desc from ColDef, not asc from initialSort
  });

  it("does not re-seed (clobber user sort) when columnDefs change again", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", initialSort: [{ colId: "n", dir: "asc" }] });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData(ROWS.map(r => ({ ...r })));
    core.setColumnDefsFromProps([{ colId: "n", key: "n", label: "N", type: ColumnType.NUMBER }]);
    // User re-sorts n descending.
    const nId = core.getColumnModel().getByColId("n")!.instanceID;
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: nId }); // asc→desc from current asc? toggle cycles
    const afterUser = viewOrder(core, "n");
    // A later columnDefs update must NOT re-seed the initial asc sort.
    core.setColumnDefsFromProps([
      { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER },
      { colId: "size", key: "size", label: "Size", type: ColumnType.STRING },
    ]);
    expect(viewOrder(core, "n")).toEqual(afterUser);
  });
});

describe("columns-before-data order (React wrapper sequence)", () => {
  // The React wrapper sets columnDefs BEFORE data. An initial sort is therefore seeded while there
  // are no rows (so comparators aren't resolved yet); the first setRowData must resolve comparators
  // and apply the seeded sort without crashing. Regression for "cmp is not a function".
  const order = ["S", "M", "L", "XL"];

  function buildColsFirst(options: object, colDefs: any[]) {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide", ...options });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setColumnDefsFromProps(colDefs); // columns first, no data
    core.setRowData(ROWS.map(r => ({ ...r }))); // data second → applies seeded sort
    return core;
  }

  it("applies a ColDef initial sort seeded before data (no crash)", () => {
    const core = buildColsFirst({}, [
      { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER, sort: "asc" },
      { colId: "size", key: "size", label: "Size", type: ColumnType.STRING },
    ]);
    expect(viewOrder(core, "id")).toEqual(["2", "4", "1", "3"]); // n asc: 1,1,2,3
  });

  it("applies a grid initialSort with a CUSTOM comparator seeded before data (the demo case)", () => {
    const core = buildColsFirst({ initialSort: [{ colId: "size", dir: "asc" }] }, [
      {
        colId: "size", key: "size", label: "Size", type: ColumnType.STRING,
        comparator: (a: string, b: string) => order.indexOf(a) - order.indexOf(b),
      },
      { colId: "n", key: "n", label: "N", type: ColumnType.NUMBER },
    ]);
    // Custom size order applied on first load, not alphabetical.
    expect(viewOrder(core, "size")).toEqual(["S", "M", "L", "XL"]);
  });
});
