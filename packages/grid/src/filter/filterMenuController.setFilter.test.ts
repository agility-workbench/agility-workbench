/**
 * Characterization tests for the set-filter behavior of FilterController — written BEFORE the
 * extraction of the pure set-filter logic, to pin the outward contract the menu renderer and the
 * filter pipeline rely on:
 *   - universe building (select_all / blanks synthesis, dedupe by valueKey, fromRows/static/async)
 *   - toggle semantics and the in/notIn storage representation
 *   - select-all tri-state
 *   - model commits through hooks.applyModel (null = remove the filter)
 *   - pruning of stored values not present in the loaded universe
 *   - mini-filter rewriting
 *
 * Several of these started life as `it.fails` documents of known bugs (off-by-one flip threshold,
 * numeric re-check no-op, blanks lookup misses, select_all pollution); the setFilterCore
 * extraction fixed them and they now run as plain regression tests.
 */
import { describe, expect, it } from "vitest";
import { FilterController } from "./filterMenuController";
import { FilterPanelSpec, FilterRuntimeState, FilterValueSource } from "./types";
import { FilterItem, FilterType } from "../interfaces/filter";
import { Column } from "../column/column";
import { IRowNode } from "../interfaces/iRowNode";

function makeColumn(): Column {
  return new Column({ colId: "fruit", key: "fruit", label: "Fruit", filter: "set" });
}

function makeController(
  values: unknown[],
  model: FilterItem | null = null,
  opts: {
    column?: Column;
    source?: FilterValueSource;
    rows?: Record<string, unknown>[];
    showValueCounts?: boolean;
  } = {},
) {
  const column = opts.column ?? makeColumn();
  const spec: FilterPanelSpec = {
    column,
    kind: "set",
    conditionTemplate: {
      ops: [{ value: FilterType.NOT_IN, label: "Not in" }],
      valueInputType: "set",
      valueSource: opts.source ?? { kind: "static", values },
    },
    params: { showValueCounts: opts.showValueCounts },
    limits: { maxNumConditions: 1, defaultNumConditions: 1, exceededByModel: false },
    defaultOp: FilterType.NOT_IN,
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

  return { ctrl, column, applied, options, idxOf, toggle, stateOf, draft, lastApplied, state: () => state };
}

describe("set-filter universe building", () => {
  it("static source: select_all first, values deduped by key, order preserved", () => {
    const { options } = makeController(["banana", "apple", "banana"]);
    expect(options().map(o => ({ type: o.type, label: o.label }))).toEqual([
      { type: "select_all", label: "(Select All)" },
      { type: "value", label: "banana" },
      { type: "value", label: "apple" },
    ]);
  });

  it("folds null/blank values into a single synthetic (Blanks) option at index 1", () => {
    const { options } = makeController(["apple", null, "", "banana"]);
    expect(options().map(o => o.type)).toEqual(["select_all", "blanks", "value", "value"]);
    expect(options()[1].label).toBe("(Blanks)");
  });

  it("fromRows source: unique values from all rows, sorted by label, blanks folded", () => {
    const { options } = makeController([], null, {
      source: { kind: "fromRows" },
      rows: [{ fruit: "banana" }, { fruit: "apple" }, { fruit: "apple" }, { fruit: null }],
    });
    expect(options().map(o => o.label)).toEqual(["(Select All)", "(Blanks)", "apple", "banana"]);
  });

  it("counts loaded rows per value, including blanks", () => {
    const { options } = makeController([], null, {
      source: { kind: "fromRows" },
      showValueCounts: true,
      rows: [{ fruit: "banana" }, { fruit: "apple" }, { fruit: "apple" }, { fruit: null }, { fruit: "" }],
    });
    expect(options().map(o => [o.label, o.count])).toEqual([
      ["(Select All)", undefined],
      ["(Blanks)", 2],
      ["apple", 2],
      ["banana", 1],
    ]);
  });

  it("reports zero for configured values absent from the loaded rows", () => {
    const { options } = makeController(["apple", "banana"], null, {
      showValueCounts: true,
      rows: [{ fruit: "apple" }, { fruit: "apple" }, { fruit: "cherry" }],
    });
    expect(options().map(o => [o.label, o.count])).toEqual([
      ["(Select All)", undefined],
      ["apple", 2],
      ["banana", 0],
    ]);
  });

  it("async source: loading flag until the callback resolves", async () => {
    const { options, state } = makeController([], null, {
      source: {
        kind: "async",
        load: (res) => { setTimeout(() => res.success(["x", "y"]), 0); },
      },
    });
    expect(state().ui["c1"].loading).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(state().ui["c1"].loading).toBe(false);
    expect(options().map(o => o.label)).toEqual(["(Select All)", "x", "y"]);
  });
});

describe("set-filter toggle semantics (string universe)", () => {
  it("starts with everything checked and no committed model", () => {
    const { applied, stateOf } = makeController(["apple", "banana", "cherry"]);
    expect(stateOf("(Select All)")).toEqual({ selected: true, indeterminate: false });
    expect(stateOf("apple").selected).toBe(true);
    expect(applied).toEqual([]);
  });

  it("unchecking one value stores notIn [value] and commits; select_all goes indeterminate", () => {
    const { toggle, stateOf, lastApplied } = makeController(["apple", "banana", "cherry"]);
    toggle("banana", false);
    expect(lastApplied()!.filters).toEqual([{ type: FilterType.NOT_IN, values: ["banana"] }]);
    expect(stateOf("banana").selected).toBe(false);
    expect(stateOf("(Select All)")).toEqual({ selected: false, indeterminate: true });
  });

  it("re-checking the value empties notIn and commits null (filter removed)", () => {
    const { toggle, lastApplied, applied } = makeController(["apple", "banana", "cherry"]);
    toggle("banana", false);
    toggle("banana", true);
    expect(applied.length).toBe(2);
    expect(lastApplied()).toBeNull();
  });

  it("unchecking select_all stores in [] (matches nothing); checking one value stores in [value]", () => {
    const { toggle, lastApplied } = makeController(["apple", "banana", "cherry"]);
    toggle("(Select All)", false);
    expect(lastApplied()!.filters).toEqual([{ type: FilterType.IN, values: [] }]);
    toggle("apple", true);
    expect(lastApplied()!.filters).toEqual([{ type: FilterType.IN, values: ["apple"] }]);
  });

  it("checking select_all commits null (no filter)", () => {
    const { toggle, lastApplied } = makeController(["apple", "banana", "cherry"]);
    toggle("(Select All)", false);
    toggle("(Select All)", true);
    expect(lastApplied()).toBeNull();
  });

  it("checking every value one-by-one lands on null (no filter)", () => {
    const { toggle, lastApplied } = makeController(["apple", "banana", "cherry"]);
    toggle("(Select All)", false);
    toggle("apple", true);
    toggle("banana", true);
    toggle("cherry", true);
    expect(lastApplied()).toBeNull();
  });

  it("unchecking every value one-by-one lands on in []", () => {
    const { toggle, lastApplied } = makeController(["apple", "banana", "cherry"]);
    toggle("apple", false);
    toggle("banana", false);
    toggle("cherry", false);
    expect(lastApplied()!.filters).toEqual([{ type: FilterType.IN, values: [] }]);
  });
});

describe("set-filter toggle semantics (typed universes)", () => {
  it("unchecking a numeric value stores the raw number, not a string", () => {
    const { toggle, lastApplied } = makeController([1, 2, 3]);
    toggle("2", false);
    expect(lastApplied()!.filters).toEqual([{ type: FilterType.NOT_IN, values: [2] }]);
  });

  it("re-checking a numeric value removes it and commits null", () => {
    const { toggle, lastApplied } = makeController([1, 2, 3]);
    toggle("2", false);
    toggle("2", true);
    expect(lastApplied()).toBeNull();
  });

  it("the (Blanks) option reports checked when no filter is active", () => {
    const { stateOf } = makeController(["apple", null]);
    expect(stateOf("(Blanks)").selected).toBe(true);
  });

  it("unchecking (Blanks) stores the blanks bucket as null", () => {
    const { toggle, lastApplied } = makeController(["apple", null]);
    toggle("(Blanks)", false);
    expect(lastApplied()!.filters).toEqual([{ type: FilterType.NOT_IN, values: [null] }]);
  });
});

describe("set-filter model loading", () => {
  it("prunes stored values that are missing from the loaded universe", () => {
    const column = makeColumn();
    const { draft } = makeController(["apple", "banana"], {
      col: column,
      key: column.key,
      join: "and",
      filters: [{ type: FilterType.IN, values: ["apple", "zzz"] }],
    }, { column });
    expect(draft()).toMatchObject({ type: FilterType.IN, values: ["apple"] });
  });

  it("reflects a loaded in-model in the option states", () => {
    const column = makeColumn();
    const { stateOf } = makeController(["apple", "banana"], {
      col: column,
      key: column.key,
      join: "and",
      filters: [{ type: FilterType.IN, values: ["apple"] }],
    }, { column });
    expect(stateOf("apple").selected).toBe(true);
    expect(stateOf("banana").selected).toBe(false);
    expect(stateOf("(Select All)").indeterminate).toBe(true);
  });
});

describe("set-filter mini-filter", () => {
  it("hides non-matching options (select_all stays visible) and commits a filter that keeps only matches", () => {
    const { ctrl, options, lastApplied } = makeController(["apple", "banana", "cherry"]);
    ctrl.filterOptions(0, "an");
    expect(options().find(o => o.label === "apple")!.hidden).toBe(true);
    expect(options().find(o => o.label === "banana")!.hidden).toBe(false);
    expect(options().find(o => o.type === "select_all")!.hidden).toBe(false);

    ctrl.applyMiniFilter(0);
    const def = lastApplied()!.filters[0];
    expect(def.type).toBe(FilterType.NOT_IN);
    expect(def.values).toContain("apple");
    expect(def.values).toContain("cherry");
    expect(def.values).not.toContain("banana");
  });

  it("mini-filter commit stores exactly the non-matching values", () => {
    const { ctrl, lastApplied } = makeController(["apple", "banana", "cherry"]);
    ctrl.filterOptions(0, "an");
    ctrl.applyMiniFilter(0);
    expect(lastApplied()!.filters[0].values).toEqual(["apple", "cherry"]);
  });
});
