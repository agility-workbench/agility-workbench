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
import { describe, expect, it, vi } from "vitest";
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
    valueKey?: (value: any) => string;
    valueLabel?: (value: any) => string;
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
    valueKey: opts.valueKey,
    valueLabel: opts.valueLabel,
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

  it("uses value keys for identity and formatted labels for sorting and mini-filtering", () => {
    const emea = { code: "emea", name: "Europe" };
    const emeaDuplicate = { code: "emea", name: "Duplicate" };
    const apac = { code: "apac", name: "Asia Pacific" };
    const { ctrl, options, lastApplied } = makeController([], null, {
      source: { kind: "fromRows" },
      rows: [{ fruit: emea }, { fruit: emeaDuplicate }, { fruit: apac }],
      valueKey: value => value.code,
      valueLabel: value => value.name,
    });

    expect(options().filter(o => o.type === "value").map(o => o.label)).toEqual([
      "Asia Pacific",
      "Europe",
    ]);

    ctrl.filterOptions(0, "europe");
    ctrl.applyMiniFilter(0);
    expect(lastApplied()!.filters[0].values).toEqual([apac]);
  });

  it("async source: loading flag until the callback resolves", async () => {
    const { options, state } = makeController([], null, {
      source: {
        kind: "async",
        load: ({ success }) => { setTimeout(() => success(["x", "y"]), 0); },
      },
    });
    expect(state().ui["c1"].loading).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(state().ui["c1"].loading).toBe(false);
    expect(options().map(o => o.label)).toEqual(["(Select All)", "x", "y"]);
  });

  it("async source: destructured error callback ends loading and exposes the message", async () => {
    const { state } = makeController([], null, {
      source: {
        kind: "async",
        load: ({ error }) => { setTimeout(() => error(new Error("Could not load fruit")), 0); },
      },
    });
    expect(state().ui["c1"].loading).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(state().ui["c1"].loading).toBe(false);
    expect(state().ui["c1"].error).toBe("Could not load fruit");
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

/**
 * Blanks belong to the grid, not to the application. `null` / `undefined` / `""` are blanks — never
 * `0` or `false` — decided from the raw value, so a `keyCreator` or filter `valueFormatter` written
 * for real values is never handed one. The unguarded callbacks here are the exact shape the React and
 * Angular playgrounds use, and they used to throw on menu open.
 */
describe("blanks never reach the application's callbacks", () => {
  type Region = { code: string; name: string };
  const amer: Region = { code: "AMER", name: "Americas" };
  const emea: Region = { code: "EMEA", name: "Europe" };
  // Deliberately unguarded: a null value reaching either of these is the bug under test.
  const valueKey = (value: Region) => value.code;
  const valueLabel = (value: Region) => value.name;

  it("builds the universe from rows that include blanks", () => {
    const { options } = makeController([], null, {
      source: { kind: "fromRows" },
      rows: [{ fruit: amer }, { fruit: null }, { fruit: emea }, { fruit: undefined }, { fruit: "" }],
      valueKey, valueLabel,
    });
    expect(options().map(o => [o.type, o.label])).toEqual([
      ["select_all", "(Select All)"],
      ["blanks", "(Blanks)"],
      ["value", "Americas"],
      ["value", "Europe"],
    ]);
  });

  it("counts the blanks bucket without asking the application about it", () => {
    const { options } = makeController([], null, {
      source: { kind: "fromRows" },
      showValueCounts: true,
      rows: [{ fruit: amer }, { fruit: null }, { fruit: "" }, { fruit: emea }, { fruit: amer }],
      valueKey, valueLabel,
    });
    expect(options().map(o => [o.label, o.count])).toEqual([
      ["(Select All)", undefined],
      ["(Blanks)", 2],
      ["Americas", 2],
      ["Europe", 1],
    ]);
  });

  it("toggles the blanks bucket, storing it as null", () => {
    const { toggle, lastApplied } = makeController([], null, {
      source: { kind: "fromRows" },
      rows: [{ fruit: amer }, { fruit: null }, { fruit: emea }],
      valueKey, valueLabel,
    });
    toggle("(Blanks)", false);
    expect(lastApplied()!.filters[0].values).toEqual([null]);

    toggle("Europe", false);
    expect(lastApplied()!.filters[0].values).toEqual([null, emea]);
  });

  it("also spares a static value list containing blanks", () => {
    const { options } = makeController([amer, null, emea, ""], null, { valueKey, valueLabel });
    expect(options().map(o => o.type)).toEqual(["select_all", "blanks", "value", "value"]);
  });

  it("treats 0 and false as values, not blanks", () => {
    const { options } = makeController([0, false, null, "", " "]);
    expect(options().map(o => [o.type, o.label])).toEqual([
      ["select_all", "(Select All)"],
      ["blanks", "(Blanks)"],
      ["value", "0"],
      ["value", "false"],
      ["value", " "],
    ]);
  });

  it("lets the application widen the bucket by returning an empty key", () => {
    // The application's say in what counts as blank, and why it needs no sentinel to declare one:
    // "N/A" is a real value in the data that only the app knows is empty.
    const { options, toggle, lastApplied } = makeController(["N/A", "apple", "banana"], null, {
      valueKey: value => value === "N/A" ? "" : String(value),
    });
    expect(options().map(o => [o.type, o.label])).toEqual([
      ["select_all", "(Select All)"],
      ["blanks", "(Blanks)"],
      ["value", "apple"],
      ["value", "banana"],
    ]);

    // ...and it lands in the same bucket as a natural blank, stored as null.
    toggle("(Blanks)", false);
    expect(lastApplied()!.filters[0].values).toEqual([null]);
  });

  it("folds a declared blank in with the natural ones, counted together", () => {
    const { options } = makeController([], null, {
      source: { kind: "fromRows" },
      showValueCounts: true,
      rows: [{ fruit: "N/A" }, { fruit: null }, { fruit: "apple" }, { fruit: "" }],
      valueKey: value => value === "N/A" ? "" : String(value),
    });
    expect(options().map(o => [o.label, o.count])).toEqual([
      ["(Select All)", undefined],
      ["(Blanks)", 3],
      ["apple", 1],
    ]);
  });

  it("does not label a declared blank either", () => {
    // Same protection the natural blanks get: the row is the grid's, so the grid labels it.
    const valueLabel = vi.fn((value: any) => value.name);
    const { options } = makeController([{ code: "", name: "should not be asked" }, { code: "A", name: "Alpha" }], null, {
      valueKey: (value: any) => value.code,
      valueLabel,
    });
    expect(options().map(o => o.label)).toEqual(["(Select All)", "(Blanks)", "Alpha"]);
    expect(valueLabel).not.toHaveBeenCalledWith({ code: "", name: "should not be asked" });
  });

  it("keeps a value whose key collides with a synthetic row", () => {
    // A keyCreator has no idea what the grid calls its own rows, so "__blanks__" and
    // "__select_all__" have to be ordinary keys. Value keys live in their own namespace.
    const { options, toggle, lastApplied } = makeController(["a", "b", "c"], null, {
      valueKey: value => value === "a" ? "__blanks__" : value === "b" ? "__select_all__" : "c",
    });
    expect(options().map(o => [o.type, o.label])).toEqual([
      ["select_all", "(Select All)"],
      ["value", "a"],
      ["value", "b"],
      ["value", "c"],
    ]);

    // Unchecking the colliding value must not take the whole column (select_all) or a blanks bucket
    // with it — the failure the old shared key space produced.
    toggle("a", false);
    expect(lastApplied()!.filters[0].values).toEqual(["a"]);
  });

  it("treats a nullish key as an empty one, since empty means blank", () => {
    // One rule at both ends: a nullish return declares a blank rather than raising anything. The
    // cost of "empty means blank" is that an accidental `value?.code` miss lands here too.
    const { options } = makeController(["apple", "banana"], null, {
      valueKey: () => undefined as unknown as string,
    });
    expect(options().map(o => [o.type, o.label])).toEqual([
      ["select_all", "(Select All)"],
      ["blanks", "(Blanks)"],
    ]);
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
