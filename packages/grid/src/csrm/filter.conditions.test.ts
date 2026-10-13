import { describe, expect, it } from "vitest";
import { GridAPI } from "../api/api";
import { GridCore } from "../core/core";
import { ColDef, ColumnType } from "../interfaces/column";
import { FilterDef, FilterType } from "../interfaces/filter";
import { ITextMeasurer } from "../interfaces/iTextMeasure";

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };

function createCore(rows: any[], column: ColDef): GridCore {
  const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  core.setRowData(rows);
  core.setColumnDefsFromProps([column]);
  return core;
}

function applyFilters(core: GridCore, filters: FilterDef[], join?: "and" | "or"): void {
  const col = core.getColumnModel().getLeaves()[0];
  core.addFilterModel({ col, key: col.key, filters, join });
}

function viewIds(core: GridCore): string[] {
  const ids: string[] = [];
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) ids.push(core.getRowIdAtViewIndex(i)!);
  return ids;
}

describe("filter join", () => {
  const rows = [{ id: "a", name: "alpha" }, { id: "b", name: "beta" }, { id: "c", name: "gamma" }];
  const col: ColDef = { key: "name", label: "Name", type: ColumnType.STRING, filter: "text" };
  const conditions: FilterDef[] = [
    { type: FilterType.EQ, values: ["alpha"] },
    { type: FilterType.EQ, values: ["beta"] },
  ];

  it("keeps a row that matches any condition when the join is or", () => {
    const core = createCore(rows, col);
    applyFilters(core, conditions, "or");
    expect(viewIds(core)).toEqual(["a", "b"]);
  });

  it("requires every condition when the join is and, or absent", () => {
    const and = createCore(rows, col);
    applyFilters(and, conditions, "and");
    expect(viewIds(and)).toEqual([]);

    const absent = createCore(rows, col);
    applyFilters(absent, conditions);
    expect(viewIds(absent)).toEqual([]);
  });

  it("joins within a column only; columns are still ANDed", () => {
    const core = new GridCore(measurer, { rowIdKey: "id", rowModelType: "clientSide" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
    core.setRowData([
      { id: "a", name: "alpha", n: 1 },
      { id: "b", name: "beta", n: 2 },
      { id: "c", name: "gamma", n: 1 },
    ]);
    core.setColumnDefsFromProps([
      { key: "name", label: "Name", type: ColumnType.STRING, filter: "text" },
      { key: "n", label: "N", type: ColumnType.NUMBER, filter: "number" },
    ]);
    const [name, n] = core.getColumnModel().getLeaves();
    core.addFilterModel({ col: name, key: name.key, join: "or", filters: conditions });
    core.addFilterModel({ col: n, key: n.key, filters: [{ type: FilterType.EQ, values: [1] }] });
    expect(viewIds(core)).toEqual(["a"]);
  });
});

describe("filter join through the public API", () => {
  it("survives getFilterModel / setFilterModel and a saved view, and keeps filtering with or", () => {
    const core = createCore(
      [{ id: "a", name: "alpha" }, { id: "b", name: "beta" }, { id: "c", name: "gamma" }],
      { colId: "name", key: "name", label: "Name", type: ColumnType.STRING, filter: "text" },
    );
    const api = new GridAPI(core);
    api.setFilterModel([{
      colId: "name",
      join: "or",
      filters: [{ type: FilterType.EQ, values: ["alpha"] }, { type: FilterType.EQ, values: ["gamma"] }],
    }]);
    expect(viewIds(core)).toEqual(["a", "c"]);
    expect(api.getFilterModel()[0].join).toBe("or");

    const saved = JSON.parse(JSON.stringify(api.captureViewState()));
    api.setFilterModel([]);
    expect(viewIds(core)).toEqual(["a", "b", "c"]);
    api.applyViewState(saved);
    expect(api.getFilterModel()[0].join).toBe("or");
    expect(viewIds(core)).toEqual(["a", "c"]);
  });
});

describe("number ranges", () => {
  const rows = [{ id: "1", n: 1 }, { id: "5", n: 5 }, { id: "9", n: 9 }];
  const col: ColDef = { key: "n", label: "N", type: ColumnType.NUMBER, filter: "number" };

  it("inRange keeps both ends; notInRange keeps the outside", () => {
    const inside = createCore(rows, col);
    applyFilters(inside, [{ type: FilterType.IN_RANGE, values: ["1", "5"] }]);
    expect(viewIds(inside)).toEqual(["1", "5"]);

    const outside = createCore(rows, col);
    applyFilters(outside, [{ type: FilterType.NOT_IN_RANGE, values: ["2", "6"] }]);
    expect(viewIds(outside)).toEqual(["1", "9"]);
  });
});

describe("date filters", () => {
  // Local-time construction keeps the expectations independent of the machine's zone.
  const rows = [
    { id: "may31", d: new Date(2025, 4, 31, 23, 59) },
    { id: "jun1-morning", d: new Date(2025, 5, 1, 0, 0) },
    { id: "jun1-evening", d: new Date(2025, 5, 1, 18, 30) },
    { id: "jun2", d: new Date(2025, 5, 2, 9) },
    { id: "blank", d: null },
  ];
  const col: ColDef = { key: "d", label: "D", type: ColumnType.DATE };
  const run = (filters: FilterDef[], data: any[] = rows) => {
    const core = createCore(data, col);
    applyFilters(core, filters);
    return viewIds(core);
  };

  it("eq / neq compare the calendar day of a date input's yyyy-mm-dd text", () => {
    expect(run([{ type: FilterType.EQ, values: ["2025-06-01"] }])).toEqual(["jun1-morning", "jun1-evening"]);
    expect(run([{ type: FilterType.NEQ, values: ["2025-06-01"] }])).toEqual(["may31", "jun2", "blank"]);
  });

  it("gt is after the day, gte from its start, lt before its start, lte through its end", () => {
    expect(run([{ type: FilterType.GT, values: ["2025-06-01"] }])).toEqual(["jun2"]);
    expect(run([{ type: FilterType.GTE, values: ["2025-06-01"] }])).toEqual(["jun1-morning", "jun1-evening", "jun2"]);
    expect(run([{ type: FilterType.LT, values: ["2025-06-01"] }])).toEqual(["may31"]);
    expect(run([{ type: FilterType.LTE, values: ["2025-06-01"] }])).toEqual(["may31", "jun1-morning", "jun1-evening"]);
  });

  it("inRange spans the start of the first day through the end of the second; notInRange is the rest", () => {
    expect(run([{ type: FilterType.IN_RANGE, values: ["2025-05-31", "2025-06-01"] }]))
      .toEqual(["may31", "jun1-morning", "jun1-evening"]);
    expect(run([{ type: FilterType.NOT_IN_RANGE, values: ["2025-05-31", "2025-06-01"] }]))
      .toEqual(["jun2", "blank"]);
  });

  it("accepts Date and epoch operands from the API", () => {
    expect(run([{ type: FilterType.EQ, values: [new Date(2025, 5, 1, 12)] }])).toEqual(["jun1-morning", "jun1-evening"]);
    expect(run([{ type: FilterType.GT, values: [new Date(2025, 5, 1).getTime()] }])).toEqual(["jun2"]);
  });

  it("reads ISO-string and epoch cells", () => {
    const mixed = [
      { id: "iso-day", d: "2025-06-01" },
      { id: "iso-time", d: "2025-06-01T15:30:00" },
      { id: "epoch", d: new Date(2025, 5, 1, 8).getTime() },
      { id: "epoch-next", d: new Date(2025, 5, 2, 8).getTime() },
      { id: "junk", d: "not a date" },
    ];
    expect(run([{ type: FilterType.EQ, values: ["2025-06-01"] }], mixed)).toEqual(["iso-day", "iso-time", "epoch"]);
    expect(run([{ type: FilterType.GT, values: ["2025-06-01"] }], mixed)).toEqual(["epoch-next"]);
    expect(run([{ type: FilterType.LT, values: ["2025-06-02"] }], mixed)).toEqual(["iso-day", "iso-time", "epoch"]);
  });

  it("treats a column declared filter: \"date\" the same way", () => {
    const core = createCore([{ id: "a", d: "2025-06-01" }, { id: "b", d: "2025-06-03" }], {
      key: "d", label: "D", type: ColumnType.STRING, filter: "date",
    });
    applyFilters(core, [{ type: FilterType.GT, values: ["2025-06-02"] }]);
    expect(viewIds(core)).toEqual(["b"]);
  });

  it("leaves number columns on the numeric compare", () => {
    const core = createCore([{ id: "a", n: 20250601 }, { id: "b", n: 5 }], {
      key: "n", label: "N", type: ColumnType.NUMBER,
    });
    applyFilters(core, [{ type: FilterType.EQ, values: ["20250601"] }]);
    expect(viewIds(core)).toEqual(["a"]);
  });
});

describe("boolean filters", () => {
  const rows = [
    { id: "t", v: true },
    { id: "f", v: false },
    { id: "s-true", v: "TRUE" },
    { id: "s-no", v: "no" },
    { id: "one", v: 1 },
    { id: "zero", v: 0 },
    { id: "blank", v: null },
  ];

  it.each([
    ["the select's text", "true"],
    ["a boolean", true],
  ])("eq true with %s matches true, \"TRUE\", and 1", (_label, operand) => {
    const core = createCore(rows, { key: "v", label: "V", type: ColumnType.BOOLEAN });
    applyFilters(core, [{ type: FilterType.EQ, values: [operand] }]);
    expect(viewIds(core)).toEqual(["t", "s-true", "one"]);
  });

  it("neq false keeps everything that is not false, blanks included", () => {
    const core = createCore(rows, { key: "v", label: "V", type: ColumnType.STRING, filter: "boolean" });
    applyFilters(core, [{ type: FilterType.NEQ, values: ["false"] }]);
    expect(viewIds(core)).toEqual(["t", "s-true", "one", "blank"]);
  });
});
