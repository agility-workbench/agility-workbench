import { describe, expect, it, vi } from "vitest";
import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import type { IGridCore } from "../interfaces";
import type { ColDef } from "../interfaces/column";
import { ColumnFilterMenuService } from "./filterMenuService";

function buildSpec(colDef: ColDef) {
  const core = { getOptions: () => ({ filterDebounceMs: 100 }) } as unknown as IGridCore;
  const column = new Column(colDef);
  return { column, spec: new ColumnFilterMenuService(core).buildFilterMenu({ trigger: "api", targetCol: column }) };
}

describe("ColumnFilterMenuService set-filter values", () => {
  it("wires keyCreator to valueKey", () => {
    const keyCreator = (value: any) => value.code;
    const { spec } = buildSpec({
      colId: "region",
      key: "region",
      label: "Region",
      filter: "set",
      filterParams: { keyCreator },
    });

    expect(spec.valueKey).toBe(keyCreator);
    expect(spec.valueKey!({ code: "emea" })).toBe("emea");
  });

  it("prefers the Set-filter valueFormatter and supplies the runtime column", () => {
    const columnFormatter = vi.fn(({ value }) => `Cell ${value}`);
    const filterFormatter = vi.fn(({ value }) => `Filter ${value}`);
    const { column, spec } = buildSpec({
      colId: "region",
      key: "region",
      label: "Region",
      filter: "set",
      valueFormatter: columnFormatter,
      filterParams: { valueFormatter: filterFormatter },
    });

    expect(spec.valueLabel!("EMEA")).toBe("Filter EMEA");
    expect(filterFormatter).toHaveBeenCalledWith({ value: "EMEA", col: column });
    expect(columnFormatter).not.toHaveBeenCalled();
  });

  it("falls back to the column valueFormatter", () => {
    const { spec } = buildSpec({
      colId: "region",
      key: "region",
      label: "Region",
      filter: "set",
      valueFormatter: ({ value }) => `Cell ${value}`,
    });

    expect(spec.valueLabel!("APAC")).toBe("Cell APAC");
  });
});

describe("ColumnFilterMenuService tree layout", () => {
  it("a plain set filter builds no tree spec", () => {
    const { spec } = buildSpec({ colId: "region", key: "region", label: "Region", filter: "set" });
    expect(spec.kind).toBe("set");
    expect(spec.tree).toBeUndefined();
  });

  it("filter: \"tree\" is the set filter with a tree spec; a date column gets the year › month › day path", () => {
    const { spec } = buildSpec({ colId: "due", key: "due", label: "Due", type: ColumnType.DATE, filter: "tree" });
    expect(spec.kind).toBe("set");
    expect(spec.conditionTemplate.valueInputType).toBe("tree");
    expect(spec.tree!.defaultExpanded).toBe(0);
    expect(spec.tree!.pathOf("2024-03-09")).toEqual([2024, 3, 9]);
    expect(spec.tree!.pathOf(new Date(2023, 11, 31))).toEqual([2023, 12, 31]);
    expect(spec.tree!.pathOf("not a date")).toBeNull();
    expect(spec.tree!.formatSegment(3, 1, [2024])).toBe("March");
    expect(spec.tree!.formatSegment(9, 2, [2024, 3])).toBe("9");
  });

  it("a non-date tree column only paths Date values by default, leaving text at the root", () => {
    const { spec } = buildSpec({ colId: "code", key: "code", label: "Code", filter: "tree" });
    expect(spec.tree!.pathOf("20240309")).toBeNull();
    expect(spec.tree!.pathOf(new Date(2024, 2, 9))).toEqual([2024, 3, 9]);
  });

  it("names months in the column's formatter locale", () => {
    const { spec } = buildSpec({
      colId: "due", key: "due", label: "Due", type: ColumnType.DATE, filter: "tree",
      formatterOptions: { locale: "fr-FR" },
    });
    expect(spec.tree!.formatSegment(3, 1, [2024])).toBe("mars");
  });

  it("wires the comparator to the spec and to the tree spec", () => {
    const comparator = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
    const { spec } = buildSpec({ colId: "item", key: "item", label: "Item", filter: "tree", filterParams: { comparator } });
    expect(spec.compare).toBe(comparator);
    expect(spec.tree!.compare).toBe(comparator);

    const flat = buildSpec({ colId: "item", key: "item", label: "Item", filter: "set", filterParams: { comparator } });
    expect(flat.spec.compare).toBe(comparator);
    expect(buildSpec({ colId: "item", key: "item", label: "Item", filter: "text", filterParams: { comparator } }).spec.compare).toBeUndefined();
  });

  it("wires the application's path getter, formatter, and default depth", () => {
    const treePathGetter = (value: any) => String(value).split("/");
    const treePathFormatter = (segment: any, level: number) => `${level}:${segment}`;
    const { spec } = buildSpec({
      colId: "item", key: "item", label: "Item", filter: "tree",
      filterParams: { treePathGetter, treePathFormatter, treeDefaultExpanded: -1 },
    });
    expect(spec.tree!.pathOf).toBe(treePathGetter);
    expect(spec.tree!.formatSegment).toBe(treePathFormatter);
    expect(spec.tree!.defaultExpanded).toBe(-1);
  });

  it("an application path getter without a formatter labels segments as text, even on a date column", () => {
    const { spec } = buildSpec({
      colId: "due", key: "due", label: "Due", type: ColumnType.DATE, filter: "tree",
      filterParams: { treePathGetter: () => ["q1", 3] },
    });
    expect(spec.tree!.formatSegment(3, 1, ["q1"])).toBe("3");
  });
});
