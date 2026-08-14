import { describe, expect, it, vi } from "vitest";
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

describe("FilterParams matching", () => {
  it.each([
    [FilterType.CONTAINS, "LP"],
    [FilterType.EQ, "ALPHA"],
    [FilterType.STARTS_WITH, "AL"],
    [FilterType.ENDS_WITH, "HA"],
  ])("uses caseSensitive for the %s operator", (type, query) => {
    const rows = [{ id: "upper", name: "ALPHA" }, { id: "lower", name: "alpha" }];

    const insensitive = createCore(rows, {
      key: "name", label: "Name", type: ColumnType.STRING, filter: "text",
    });
    applyFilter(insensitive, type, [query]);
    expect(viewIds(insensitive)).toEqual(["upper", "lower"]);

    const sensitive = createCore(rows, {
      key: "name", label: "Name", type: ColumnType.STRING, filter: "text",
      filterParams: { caseSensitive: true },
    });
    applyFilter(sensitive, type, [query]);
    expect(viewIds(sensitive)).toEqual(["upper"]);
  });

  it("trims filter inputs only when trimValues is enabled", () => {
    const rows = [{ id: "plain", name: "Alpha" }, { id: "spaced", name: " Alpha " }];

    const untrimmed = createCore(rows, {
      key: "name", label: "Name", type: ColumnType.STRING, filter: "text",
    });
    applyFilter(untrimmed, FilterType.EQ, [" Alpha "]);
    expect(viewIds(untrimmed)).toEqual(["spaced"]);

    const trimmed = createCore(rows, {
      key: "name", label: "Name", type: ColumnType.STRING, filter: "text",
      filterParams: { trimValues: true },
    });
    applyFilter(trimmed, FilterType.EQ, [" Alpha "]);
    expect(viewIds(trimmed)).toEqual(["plain"]);
  });

  it("formats both cell and filter values before built-in text comparison", () => {
    const formatter = vi.fn((value: any) => String(value).replace(/^(cell|query):/, ""));
    const core = createCore([{ id: "match", name: "cell:Alpha" }], {
      key: "name", label: "Name", type: ColumnType.STRING, filter: "text",
      filterParams: { textFormatter: formatter },
    });

    applyFilter(core, FilterType.EQ, ["query:alpha"]);

    expect(viewIds(core)).toEqual(["match"]);
    expect(formatter).toHaveBeenCalledWith("query:alpha");
    expect(formatter).toHaveBeenCalledWith("cell:Alpha");
  });

  it("formats every range operand and the cell before numeric comparison", () => {
    const formatter = vi.fn((value: any) => String(value).replace(/[$,]/g, ""));
    const core = createCore([{ id: "match", amount: "$1,200" }, { id: "miss", amount: "$900" }], {
      key: "amount", label: "Amount", type: ColumnType.NUMBER, filter: "number",
      filterParams: { textFormatter: formatter },
    });

    applyFilter(core, FilterType.IN_RANGE, ["$1,000", "$1,300"]);

    expect(viewIds(core)).toEqual(["match"]);
    expect(formatter).toHaveBeenCalledWith("$1,000");
    expect(formatter).toHaveBeenCalledWith("$1,300");
    expect(formatter).toHaveBeenCalledWith("$1,200");
  });

  it("formats set-filter operands and applies case sensitivity consistently", () => {
    const formatter = vi.fn((value: any) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const core = createCore([{ id: "match", name: "café" }, { id: "miss", name: "tea" }], {
      key: "name", label: "Name", type: ColumnType.STRING, filter: "set",
      filterParams: { textFormatter: formatter },
    });

    applyFilter(core, FilterType.IN, ["CAFE"]);

    expect(viewIds(core)).toEqual(["match"]);
    expect(formatter).toHaveBeenCalledWith("CAFE");
    expect(formatter).toHaveBeenCalledWith("café");
  });

  it("uses keyCreator for set-filter membership while retaining raw model values", () => {
    const keyCreator = vi.fn((value: any) => value.code);
    const core = createCore([
      { id: "first", region: { code: "emea", name: "Europe" } },
      { id: "second", region: { code: "emea", name: "European Union" } },
      { id: "third", region: { code: "apac", name: "Asia Pacific" } },
    ], {
      key: "region", label: "Region", type: ColumnType.STRING, filter: "set",
      filterParams: { keyCreator },
    });
    const selected = { code: "emea", name: "Configured label" };

    applyFilter(core, FilterType.IN, [selected]);

    expect(viewIds(core)).toEqual(["first", "second"]);
    expect(core.getFilterModel().items[0].filters[0].values).toEqual([selected]);
    expect(keyCreator).toHaveBeenCalledWith(selected);
  });

  it("keeps blank operators based on the raw cell value", () => {
    const formatter = vi.fn((value: any) => {
      if (value == null) throw new Error("blank values must not be formatted");
      return String(value);
    });
    const core = createCore([{ id: "null", name: null }, { id: "value", name: "Alpha" }], {
      key: "name", label: "Name", type: ColumnType.STRING, filter: "text",
      filterParams: { textFormatter: formatter },
    });

    applyFilter(core, FilterType.IS_BLANK, []);

    expect(viewIds(core)).toEqual(["null"]);
    expect(formatter).not.toHaveBeenCalled();
  });

  it("gives filterFunction precedence and passes formatted operands plus resolved flags", () => {
    const columnMatcher = vi.fn(() => false);
    const filterFunction = vi.fn((_type, values, cell, caseSensitive, trimValues) => {
      expect(caseSensitive).toBe(true);
      expect(trimValues).toBe(true);
      return cell === values[0];
    });
    const core = createCore([{ id: "match", name: "cell:Alpha" }], {
      key: "name", label: "Name", type: ColumnType.STRING, filter: columnMatcher,
      filterParams: {
        caseSensitive: true,
        trimValues: true,
        textFormatter: value => String(value).replace(/^(cell|query):/, ""),
        filterFunction,
      },
    });

    applyFilter(core, FilterType.EQ, ["query:Alpha"]);

    expect(viewIds(core)).toEqual(["match"]);
    expect(filterFunction).toHaveBeenCalledWith(FilterType.EQ, ["Alpha"], "Alpha", true, true);
    expect(columnMatcher).not.toHaveBeenCalled();
  });

  it("does not invoke filterFunction when Column.filter is explicitly false", () => {
    const filterFunction = vi.fn(() => false);
    const core = createCore([{ id: "one", name: "Alpha" }, { id: "two", name: "Beta" }], {
      key: "name", label: "Name", type: ColumnType.STRING, filter: false,
      filterParams: { filterFunction },
    });

    applyFilter(core, FilterType.EQ, ["Alpha"]);

    expect(viewIds(core)).toEqual(["one", "two"]);
    expect(filterFunction).not.toHaveBeenCalled();
  });

  it("falls back to Column.filter and supplies formatter-processed operands", () => {
    const matcher = vi.fn((cell, _node, values) => cell === values[0]);
    const core = createCore([{ id: "match", name: "cell:Alpha" }], {
      key: "name", label: "Name", type: ColumnType.STRING, filter: matcher,
      filterParams: { textFormatter: value => String(value).replace(/^(cell|query):/, "") },
    });

    applyFilter(core, FilterType.EQ, ["query:Alpha"]);

    expect(viewIds(core)).toEqual(["match"]);
    expect(matcher.mock.calls[0][0]).toBe("Alpha");
    expect(matcher.mock.calls[0][2]).toEqual(["Alpha"]);
  });
});
