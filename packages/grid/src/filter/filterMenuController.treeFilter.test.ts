/**
 * FilterController in the tree layout (`filter: "tree"`): the universe it loads is the flat one
 * regrouped under group rows, a group toggle commits its leaves, group state is derived from them,
 * expansion is presentation state the draft never sees, and the mini filter's "visible becomes
 * checked" rule counts leaves through their ancestors.
 */
import { describe, expect, it } from "vitest";
import { FilterController } from "./filterMenuController";
import { FilterPanelSpec, FilterRuntimeState, FilterValueSource } from "./types";
import { FilterItem, FilterType } from "../interfaces/filter";
import { Column } from "../column/column";
import { IRowNode } from "../interfaces/iRowNode";
import { dateSegmentFormatter, dateTreePath, defaultSegmentFormatter, SetFilterTreeSpec } from "./setFilterTree";
import { parseDateInput } from "../column/formatters";

const slashPath = (value: any): any[] | null => (typeof value === "string" ? value.split("/") : null);

function makeColumn(): Column {
  return new Column({ colId: "item", key: "item", label: "Item", filter: "tree" });
}

function makeController(
  values: unknown[],
  model: FilterItem | null = null,
  opts: {
    column?: Column;
    source?: FilterValueSource;
    rows?: Record<string, unknown>[];
    showValueCounts?: boolean;
    tree?: Partial<SetFilterTreeSpec>;
  } = {},
) {
  const column = opts.column ?? makeColumn();
  const spec: FilterPanelSpec = {
    column,
    kind: "set",
    conditionTemplate: {
      ops: [{ value: FilterType.NOT_IN, label: "Not in" }],
      valueInputType: "tree",
      valueSource: opts.source ?? { kind: "static", values },
    },
    params: { showValueCounts: opts.showValueCounts },
    limits: { maxNumConditions: 1, defaultNumConditions: 1, exceededByModel: false },
    defaultOp: FilterType.NOT_IN,
    tree: { pathOf: slashPath, formatSegment: defaultSegmentFormatter, defaultExpanded: 0, ...opts.tree },
  };
  const applied: (FilterItem | null)[] = [];
  let state!: FilterRuntimeState;
  const ctrl = new FilterController(spec, model, {
    applyModel: (_col, m) =>
      applied.push(m ? { ...m, filters: m.filters.map(f => ({ ...f, values: [...f.values] })) } : null),
    getAllRows: (cb) => (opts.rows ?? []).forEach((data, i) => cb({ data } as unknown as IRowNode, i)),
  });
  ctrl.subscribe(s => { state = s; });

  const options = () => state.ui["c1"].options ?? [];
  const idxOf = (label: string) => options().findIndex(o => o.label === label);
  const toggle = (label: string, checked: boolean) => ctrl.toggleSetValue(0, idxOf(label), checked);
  const stateOf = (label: string) => {
    const option = options()[idxOf(label)];
    return ctrl.getSetOptionState(0, option.type, option.raw);
  };
  const draft = () => state.draft["c1"];
  const lastApplied = () => applied[applied.length - 1];
  const shape = () => options().map(o => `${"  ".repeat(o.level ?? 0)}${o.type === "group" ? "+" : ""}${o.label}`);

  return { ctrl, column, applied, options, idxOf, toggle, stateOf, draft, lastApplied, shape, state: () => state };
}

const FRUIT = ["Fruit/Citrus/Orange", "Veg/Root/Carrot", "Fruit/Citrus/Lemon"];

describe("tree-layout universe", () => {
  it("loads the flat universe regrouped under group rows", () => {
    const { shape } = makeController(FRUIT);
    expect(shape()).toEqual([
      "(Select All)",
      "+Fruit",
      "  +Citrus",
      "    Lemon",
      "    Orange",
      "+Veg",
      "  +Root",
      "    Carrot",
    ]);
  });

  it("groups rows from the row model, blanks above the tree, counts rolled up", () => {
    const { shape, options } = makeController([], null, {
      source: { kind: "fromRows" },
      showValueCounts: true,
      rows: [{ item: "Fruit/Citrus/Orange" }, { item: "Fruit/Citrus/Orange" }, { item: null }, { item: "Veg/Root/Carrot" }],
    });
    expect(shape()).toEqual(["(Select All)", "(Blanks)", "+Fruit", "  +Citrus", "    Orange", "+Veg", "  +Root", "    Carrot"]);
    expect(options().map(o => o.count)).toEqual([undefined, 1, 2, 2, 2, 1, 1, 1]);
  });

  it("date column: ISO text groups by year and month name through the column's own parser", () => {
    const { shape } = makeController(["2024-03-09", "2024-01-20", "2023-12-31"], null, {
      tree: { pathOf: dateTreePath(parseDateInput), formatSegment: dateSegmentFormatter("en-US") },
    });
    expect(shape()).toEqual([
      "(Select All)",
      "+2023",
      "  +December",
      "    31",
      "+2024",
      "  +January",
      "    20",
      "  +March",
      "    9",
    ]);
  });
});

describe("group toggles and state", () => {
  it("starts with every group checked and nothing committed", () => {
    const { stateOf, applied } = makeController(FRUIT);
    expect(stateOf("Fruit")).toEqual({ selected: true, indeterminate: false });
    expect(stateOf("Citrus")).toEqual({ selected: true, indeterminate: false });
    expect(applied).toEqual([]);
  });

  it("unchecking a group commits its leaves as notIn; the model never holds a group", () => {
    const { toggle, lastApplied, stateOf } = makeController(FRUIT);
    toggle("Citrus", false);
    expect(lastApplied()!.filters).toEqual([
      { type: FilterType.NOT_IN, values: ["Fruit/Citrus/Lemon", "Fruit/Citrus/Orange"] },
    ]);
    expect(stateOf("Citrus")).toEqual({ selected: false, indeterminate: false });
    expect(stateOf("Fruit")).toEqual({ selected: false, indeterminate: false });
    expect(stateOf("Veg").selected).toBe(true);
    expect(stateOf("(Select All)")).toEqual({ selected: false, indeterminate: true });
  });

  it("a group turns mixed when one of its leaves is unchecked, and re-checking the group clears the filter", () => {
    const { toggle, lastApplied, stateOf } = makeController(FRUIT);
    toggle("Lemon", false);
    expect(stateOf("Citrus")).toEqual({ selected: false, indeterminate: true });
    expect(stateOf("Fruit")).toEqual({ selected: false, indeterminate: true });

    toggle("Fruit", true);
    expect(lastApplied()).toBeNull();
    expect(stateOf("Citrus")).toEqual({ selected: true, indeterminate: false });
  });

  it("checking a group after select_all was cleared stores in [leaves]", () => {
    const { toggle, lastApplied } = makeController(FRUIT);
    toggle("(Select All)", false);
    toggle("Veg", true);
    expect(lastApplied()!.filters).toEqual([{ type: FilterType.IN, values: ["Veg/Root/Carrot"] }]);
  });

  it("reflects a loaded in-model on the groups", () => {
    const column = makeColumn();
    const { stateOf } = makeController(FRUIT, {
      col: column,
      key: column.key,
      join: "and",
      filters: [{ type: FilterType.IN, values: ["Fruit/Citrus/Lemon"] }],
    }, { column });
    expect(stateOf("Lemon").selected).toBe(true);
    expect(stateOf("Citrus")).toEqual({ selected: false, indeterminate: true });
    expect(stateOf("Veg")).toEqual({ selected: false, indeterminate: false });
  });
});

describe("expansion", () => {
  it("is presentation state: it re-emits with focus on the group and leaves the draft and the model alone", () => {
    const { ctrl, options, idxOf, draft, applied, state } = makeController(FRUIT);
    const before = { ...draft() };
    ctrl.setSetGroupExpanded(0, idxOf("Fruit"), true);
    expect(options()[idxOf("Fruit")].expanded).toBe(true);
    expect(state().ui["c1"].selectedIdx).toBe(idxOf("Fruit"));
    expect(draft()).toEqual(before);
    expect(applied).toEqual([]);

    ctrl.setSetGroupExpanded(0, idxOf("Fruit"), false);
    expect(options()[idxOf("Fruit")].expanded).toBe(false);
  });

  it("on the Select All row it opens or closes every group and focuses that row", () => {
    const { ctrl, options, idxOf, draft, applied, state } = makeController(FRUIT);
    const groups = () => options().filter(o => o.type === "group").map(o => o.expanded);
    ctrl.setSetGroupExpanded(0, idxOf("(Select All)"), true);
    expect(groups()).toEqual([true, true, true, true]);
    expect(state().ui["c1"].selectedIdx).toBe(0);

    ctrl.setSetGroupExpanded(0, idxOf("Citrus"), false);
    ctrl.setSetGroupExpanded(0, idxOf("(Select All)"), false);
    expect(groups()).toEqual([false, false, false, false]);
    expect(draft()).toMatchObject({ type: FilterType.NOT_IN, values: [] });
    expect(applied).toEqual([]);
  });

  it("ignores a non-group row", () => {
    const { ctrl, options, idxOf } = makeController(FRUIT);
    ctrl.setSetGroupExpanded(0, idxOf("Lemon"), true);
    expect(options()[idxOf("Lemon")].expanded).toBeUndefined();
  });

  it("honours the default depth from the spec", () => {
    const { options } = makeController(FRUIT, null, { tree: { defaultExpanded: 1 } });
    expect(options().filter(o => o.type === "group").map(o => [o.label, o.expanded])).toEqual([
      ["Fruit", true], ["Citrus", false], ["Veg", true], ["Root", false],
    ]);
  });
});

describe("mini filter in the tree layout", () => {
  it("typing a group's name keeps its leaves checked and unchecks the rest, committed on Enter", () => {
    const { ctrl, options, lastApplied, stateOf } = makeController(FRUIT);
    ctrl.filterOptions(0, "citrus");
    expect(options().filter(o => !o.hidden).map(o => o.label)).toEqual(["(Select All)", "Fruit", "Citrus", "Lemon", "Orange"]);
    expect(stateOf("Citrus")).toEqual({ selected: true, indeterminate: false });

    ctrl.applyMiniFilter(0);
    expect(lastApplied()!.filters).toEqual([{ type: FilterType.NOT_IN, values: ["Veg/Root/Carrot"] }]);
  });

  it("typing a leaf's name keeps only that leaf, and select_all describes the visible leaves", () => {
    const { ctrl, stateOf, draft } = makeController(FRUIT);
    ctrl.filterOptions(0, "lem");
    expect(draft()).toMatchObject({ type: FilterType.NOT_IN, values: ["Fruit/Citrus/Orange", "Veg/Root/Carrot"] });
    expect(stateOf("(Select All)")).toEqual({ selected: true, indeterminate: false });
    // Orange is hidden by the filter, so Citrus is wholly checked within what it shows.
    expect(stateOf("Citrus")).toEqual({ selected: true, indeterminate: false });
  });

  it("clearing the text shows everything again and checks it all", () => {
    const { ctrl, options, draft } = makeController(FRUIT);
    ctrl.filterOptions(0, "lem");
    ctrl.filterOptions(0, "");
    expect(options().every(o => !o.hidden)).toBe(true);
    expect(draft()).toMatchObject({ type: FilterType.NOT_IN, values: [] });
  });
});
