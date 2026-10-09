/**
 * The tree layout is a regrouping of the flat universe: groups are synthetic rows that stand for
 * the leaves beneath them and are never stored. These tests pin the pre-order shape, sibling
 * ordering, count roll-up, expansion defaults, the mini filter's ancestor/descendant rule, and the
 * group toggle's effect on the def — all against `setFilterCore`'s own universe builder.
 */
import { describe, expect, it } from "vitest";
import { FilterDef, FilterType } from "../interfaces/filter";
import { addSetOptionCounts, buildSetOptions, isValueChecked, valueOptions } from "./setFilterCore";
import {
  applySetMiniFilter,
  buildSetFilterTree,
  groupExpansion,
  setAllGroupsExpanded,
  dateSegmentFormatter,
  dateTreePath,
  defaultSegmentFormatter,
  findSetFilterPath,
  groupCheckState,
  groupLeafOptions,
  hasSetFilterGroups,
  parentIndex,
  pathKey,
  SetFilterTreeSpec,
  setFilterTreeNodes,
  setOptionStates,
  subtreeEnd,
  toggleGroup,
  visibleSetOptions,
} from "./setFilterTree";
import { SetFilterOptions } from "./types";

const slashPath = (value: any): any[] | null => (typeof value === "string" ? value.split("/") : null);

function spec(overrides: Partial<SetFilterTreeSpec> = {}): SetFilterTreeSpec {
  return { pathOf: slashPath, formatSegment: defaultSegmentFormatter, defaultExpanded: 0, ...overrides };
}

function tree(values: any[], overrides: Partial<SetFilterTreeSpec> = {}): SetFilterOptions[] {
  return buildSetFilterTree(buildSetOptions(values), spec(overrides));
}

/** One line per row: indentation by level, `+` marks a group. */
const shape = (options: SetFilterOptions[]): string[] =>
  options.map(o => `${"  ".repeat(o.level ?? 0)}${o.type === "group" ? "+" : ""}${o.label}`);

const labelsAt = (options: SetFilterOptions[], indices: number[]) => indices.map(i => options[i].label);

const FRUIT = ["Fruit/Citrus/Orange", "Veg/Root/Carrot", "Fruit/Citrus/Lemon", "Fruit/Berry/Blueberry"];

describe("buildSetFilterTree", () => {
  it("groups values along their paths, pre-order, siblings sorted by label", () => {
    expect(shape(tree(FRUIT))).toEqual([
      "(Select All)",
      "+Fruit",
      "  +Berry",
      "    Blueberry",
      "  +Citrus",
      "    Lemon",
      "    Orange",
      "+Veg",
      "  +Root",
      "    Carrot",
    ]);
  });

  it("keeps the leaves' identity: same keys and raws as the flat universe, labelled by the last segment", () => {
    const flat = buildSetOptions(FRUIT);
    const leaves = valueOptions(tree(FRUIT));
    expect(new Set(leaves.map(o => o.key))).toEqual(new Set(valueOptions(flat).map(o => o.key)));
    expect(leaves.find(o => o.raw === "Fruit/Citrus/Orange")!.label).toBe("Orange");
  });

  it("places a value without a path at the root with its ordinary label", () => {
    const options = tree(["Fruit/Apple", 42]);
    expect(shape(options)).toEqual(["(Select All)", "42", "+Fruit", "  Apple"]);
    expect(options[1].type).toBe("value");
    expect(options[1].parentKey).toBeUndefined();
  });

  it("keeps the blanks row above the tree and never asks for its path", () => {
    const seen: any[] = [];
    const options = tree(["Fruit/Apple", null, ""], { pathOf: v => { seen.push(v); return slashPath(v); } });
    expect(shape(options)).toEqual(["(Select All)", "(Blanks)", "+Fruit", "  Apple"]);
    expect(seen).toEqual(["Fruit/Apple"]);
  });

  it("stamps the path on groups and leaves, for group components and path lookups", () => {
    const options = tree(["Fruit/Citrus/Orange", "loose"], { pathOf: v => (v === "loose" ? null : slashPath(v)) });
    expect(options.find(o => o.label === "Citrus")!.path).toEqual(["Fruit", "Citrus"]);
    expect(options.find(o => o.label === "Orange")!.path).toEqual(["Fruit", "Citrus", "Orange"]);
    expect(options.find(o => o.label === "loose")!.path).toBeUndefined();
    expect(options[0].path).toBeUndefined();
  });

  it("stamps level and parentKey so rows can find their group", () => {
    const options = tree(FRUIT);
    const citrus = options.findIndex(o => o.label === "Citrus");
    const lemon = options.findIndex(o => o.label === "Lemon");
    expect(options[lemon].level).toBe(2);
    expect(options[lemon].parentKey).toBe(options[citrus].key);
    expect(parentIndex(options, lemon)).toBe(citrus);
    expect(parentIndex(options, options.findIndex(o => o.label === "Fruit"))).toBe(-1);
    expect(subtreeEnd(options, citrus)).toBe(lemon + 2);
  });

  it("sorts numeric segments numerically and formats them for display", () => {
    const options = tree([[2024, 10], [2024, 9], [2023, 12]], {
      pathOf: v => v,
      formatSegment: (segment, level) => (level === 1 ? `M${segment}` : String(segment)),
    });
    expect(shape(options)).toEqual(["(Select All)", "+2023", "  M12", "+2024", "  M9", "  M10"]);
  });

  it("hands the formatter the level and the path above", () => {
    const calls: [any, number, any[]][] = [];
    tree(["a/b/c"], { formatSegment: (segment, level, parents) => { calls.push([segment, level, parents]); return String(segment); } });
    expect(calls).toEqual([["a", 0, []], ["b", 1, ["a"]], ["c", 2, ["a", "b"]]]);
  });

  it("rolls leaf counts up into their groups, and only when the leaves are counted", () => {
    const counted = addSetOptionCounts(
      buildSetOptions(FRUIT),
      cb => ["Fruit/Citrus/Orange", "Fruit/Citrus/Orange", "Fruit/Citrus/Lemon", "Veg/Root/Carrot"].forEach((v, i) => cb({ v }, i)),
      row => row.v,
    );
    const options = buildSetFilterTree(counted, spec());
    const countOf = (label: string) => options.find(o => o.label === label)!.count;
    expect(countOf("Fruit")).toBe(3);
    expect(countOf("Citrus")).toBe(3);
    expect(countOf("Berry")).toBe(0);
    expect(countOf("Veg")).toBe(1);
    expect(countOf("Orange")).toBe(2);

    expect(tree(FRUIT).find(o => o.label === "Fruit")!.count).toBeUndefined();
  });

  it("opens groups to the default depth: 0 none, N levels, -1 all", () => {
    const expandedLabels = (depth: number) =>
      tree(FRUIT, { defaultExpanded: depth }).filter(o => o.type === "group" && o.expanded).map(o => o.label);
    expect(expandedLabels(0)).toEqual([]);
    expect(expandedLabels(1)).toEqual(["Fruit", "Veg"]);
    expect(expandedLabels(-1)).toEqual(["Fruit", "Berry", "Citrus", "Veg", "Root"]);
  });

  it("reports expansion as all, none, or some, and sets it across every group, for the root's chevron", () => {
    const options = tree(FRUIT, { defaultExpanded: 1 });
    expect(groupExpansion(options)).toBe("some");
    setAllGroupsExpanded(options, true);
    expect(groupExpansion(options)).toBe("all");
    expect(labelsAt(options, visibleSetOptions(options))).toHaveLength(options.length);
    setAllGroupsExpanded(options, false);
    expect(groupExpansion(options)).toBe("none");
    expect(labelsAt(options, visibleSetOptions(options))).toEqual(["(Select All)", "Fruit", "Veg"]);
    options.find(o => o.label === "Root")!.expanded = true;
    expect(groupExpansion(options)).toBe("some");
    // A universe without groups is trivially all open.
    expect(groupExpansion(buildSetOptions(["a"]))).toBe("all");
  });

  it("reports whether the layout produced any groups", () => {
    expect(hasSetFilterGroups(tree(FRUIT))).toBe(true);
    expect(hasSetFilterGroups(tree(["loose"], { pathOf: () => null }))).toBe(false);
  });
});

describe("the built-in date path", () => {
  const parse = (value: any) => (typeof value === "string" ? new Date(value + "T00:00:00") : null);
  const dateSpec = (): SetFilterTreeSpec => ({ pathOf: dateTreePath(parse), formatSegment: dateSegmentFormatter("en-US"), defaultExpanded: -1 });

  it("places Date values under year › month name, with the day as the leaf, in date order", () => {
    const values = [new Date(2024, 0, 15), new Date(2023, 11, 3), new Date(2024, 0, 2), new Date(2024, 8, 30)];
    expect(shape(buildSetFilterTree(buildSetOptions(values), dateSpec()))).toEqual([
      "(Select All)",
      "+2023",
      "  +December",
      "    3",
      "+2024",
      "  +January",
      "    2",
      "    15",
      "  +September",
      "    30",
    ]);
  });

  it("parses text through the supplied parser and leaves what it rejects at the root", () => {
    const options = buildSetFilterTree(buildSetOptions(["2024-03-09", "not a date"]), dateSpec());
    // Root siblings sort by label, so the year's digits come before the text.
    expect(shape(options)).toEqual(["(Select All)", "+2024", "  +March", "    9", "not a date"]);
  });

  it("names months in the requested locale", () => {
    expect(dateSegmentFormatter("de-DE")(3, 1, [2024])).toBe("März");
    expect(dateSegmentFormatter("en-US")(2024, 0, [])).toBe("2024");
    expect(dateSegmentFormatter("en-US")(9, 2, [2024, 3])).toBe("9");
  });
});

describe("visibleSetOptions", () => {
  it("lists only the rows inside open groups", () => {
    const options = tree(FRUIT);
    expect(labelsAt(options, visibleSetOptions(options))).toEqual(["(Select All)", "Fruit", "Veg"]);

    options.find(o => o.label === "Fruit")!.expanded = true;
    expect(labelsAt(options, visibleSetOptions(options))).toEqual(["(Select All)", "Fruit", "Berry", "Citrus", "Veg"]);

    options.find(o => o.label === "Citrus")!.expanded = true;
    expect(labelsAt(options, visibleSetOptions(options))).toEqual([
      "(Select All)", "Fruit", "Berry", "Citrus", "Lemon", "Orange", "Veg",
    ]);
  });

  it("treats every group as open when asked, without touching their state", () => {
    const options = tree(FRUIT);
    expect(visibleSetOptions(options, true)).toHaveLength(options.length);
    expect(options.filter(o => o.type === "group").every(o => o.expanded === false)).toBe(true);
  });

  it("skips hidden rows even inside an open group", () => {
    const options = tree(FRUIT, { defaultExpanded: -1 });
    options.find(o => o.label === "Lemon")!.hidden = true;
    expect(labelsAt(options, visibleSetOptions(options))).not.toContain("Lemon");
    expect(labelsAt(options, visibleSetOptions(options))).toContain("Orange");
  });

  it("is the flat rule for a flat universe", () => {
    const options = buildSetOptions(["b", "a", null]);
    options[2].hidden = true;
    expect(labelsAt(options, visibleSetOptions(options))).toEqual(["(Select All)", "(Blanks)", "a"]);
  });
});

describe("applySetMiniFilter in the tree layout", () => {
  const visibleLabels = (options: SetFilterOptions[]) => options.filter(o => !o.hidden).map(o => o.label);

  it("keeps a matching leaf with its ancestors and hides the rest", () => {
    const options = tree(FRUIT);
    applySetMiniFilter(options, "lem");
    expect(visibleLabels(options)).toEqual(["(Select All)", "Fruit", "Citrus", "Lemon"]);
  });

  it("keeps every leaf beneath a matching group", () => {
    const options = tree(FRUIT);
    applySetMiniFilter(options, "citrus");
    expect(visibleLabels(options)).toEqual(["(Select All)", "Fruit", "Citrus", "Lemon", "Orange"]);
  });

  it("matches a root-level leaf by its own label", () => {
    const options = tree(["Fruit/Apple", "loose"], { pathOf: v => (v === "loose" ? null : slashPath(v)) });
    applySetMiniFilter(options, "loo");
    expect(visibleLabels(options)).toEqual(["(Select All)", "loose"]);
  });

  it("hides everything but select_all when nothing matches, and shows all again when cleared", () => {
    const options = tree(FRUIT);
    applySetMiniFilter(options, "zzz");
    expect(visibleLabels(options)).toEqual(["(Select All)"]);
    applySetMiniFilter(options, "");
    expect(visibleLabels(options)).toHaveLength(options.length);
  });

  it("is case-insensitive and reads the blanks row like any leaf", () => {
    const options = tree(["Fruit/Apple", null]);
    applySetMiniFilter(options, "BLANK");
    expect(visibleLabels(options)).toEqual(["(Select All)", "(Blanks)"]);
  });

  it("is the flat rule for a flat universe", () => {
    const options = buildSetOptions(["apple", "banana", "cherry"]);
    applySetMiniFilter(options, "an");
    expect(visibleLabels(options)).toEqual(["(Select All)", "banana"]);
  });
});

describe("setOptionStates", () => {
  const byLabel = (options: SetFilterOptions[], states: ReturnType<typeof setOptionStates>) =>
    Object.fromEntries(options.map((o, i) => [o.label, `${states[i].selected ? "on" : "off"}${states[i].indeterminate ? "/mixed" : ""}`]));

  it("answers every row from one checked set, groups and select_all tallied from their leaves", () => {
    const options = tree(FRUIT);
    const lemon = options.find(o => o.label === "Lemon")!;
    expect(byLabel(options, setOptionStates(null, options))).toEqual({
      "(Select All)": "on", Fruit: "on", Berry: "on", Blueberry: "on", Citrus: "on", Lemon: "on", Orange: "on", Veg: "on", Root: "on", Carrot: "on",
    });
    expect(byLabel(options, setOptionStates({ type: FilterType.NOT_IN, values: [lemon.raw] }, options))).toEqual({
      "(Select All)": "off/mixed", Fruit: "off/mixed", Berry: "on", Blueberry: "on", Citrus: "off/mixed", Lemon: "off", Orange: "on", Veg: "on", Root: "on", Carrot: "on",
    });
    expect(byLabel(options, setOptionStates({ type: FilterType.IN, values: [] }, options))["Fruit"]).toBe("off");
  });

  it("agrees with the per-option rules on every index, under every representation", () => {
    const options = tree(FRUIT);
    const raws = valueOptions(options).map(o => o.raw);
    const defs: (Pick<FilterDef, "type" | "values"> | null)[] = [
      null,
      { type: FilterType.IN, values: [] },
      { type: FilterType.IN, values: [raws[0], raws[2]] },
      { type: FilterType.NOT_IN, values: [raws[1]] },
      { type: FilterType.NOT_IN, values: raws },
    ];
    for (const def of defs) {
      const states = setOptionStates(def, options);
      options.forEach((o, i) => {
        if (o.type === "group") expect(states[i]).toEqual(groupCheckState(def, options, i));
        else if (o.type !== "select_all") expect(states[i]).toEqual({ selected: isValueChecked(def, o), indeterminate: false });
      });
    }
  });

  it("leaves the mini filter hides count for nothing, and select_all follows the visible scope only while typed", () => {
    const options = tree(FRUIT);
    const orange = options.find(o => o.label === "Orange")!;
    applySetMiniFilter(options, "lem");
    // Orange is hidden: Citrus is wholly checked within what it shows, even though Orange is unchecked.
    const def = { type: FilterType.NOT_IN, values: [orange.raw] };
    expect(byLabel(options, setOptionStates(def, options, undefined, true))["Citrus"]).toBe("on");
    expect(byLabel(options, setOptionStates(def, options, undefined, true))["(Select All)"]).toBe("on");
    // Without the mini-filter flag, select_all still describes every leaf.
    expect(byLabel(options, setOptionStates(def, options, undefined, false))["(Select All)"]).toBe("off/mixed");
  });

  it("is the flat rule for a flat universe, select_all over an empty scope reading checked", () => {
    const options = buildSetOptions(["a", "b", null]);
    const states = setOptionStates({ type: FilterType.NOT_IN, values: [null] }, options);
    expect(byLabel(options, states)).toEqual({ "(Select All)": "off/mixed", "(Blanks)": "off", a: "on", b: "on" });
    expect(setOptionStates(null, buildSetOptions([]))[0]).toEqual({ selected: true, indeterminate: false });
  });
});

describe("paths and tree nodes for the API", () => {
  it("finds the group a path names, else the leaf whose full path it is, else nothing", () => {
    const options = tree([...FRUIT, "Fruit"]); // "Fruit" is also a root leaf — the group wins
    expect(options[findSetFilterPath(options, ["Fruit"])].type).toBe("group");
    expect(options[findSetFilterPath(options, ["Fruit", "Citrus", "Lemon"])].raw).toBe("Fruit/Citrus/Lemon");
    expect(findSetFilterPath(options, ["Fruit", "Pome"])).toBe(-1);
    expect(findSetFilterPath(options, [])).toBe(-1);
  });

  it("compares segments by type and value", () => {
    const options = tree([[2024, 1, 15]], { pathOf: v => v });
    expect(findSetFilterPath(options, [2024, 1])).toBeGreaterThan(0);
    expect(findSetFilterPath(options, ["2024", "1"])).toBe(-1);
    expect(pathKey([2024, 1])).not.toBe(pathKey(["2024", "1"]));
    expect(pathKey([new Date(0)])).toBe(pathKey([new Date(0)]));
  });

  it("nests the pre-order list into nodes with the states folded in, select_all left out", () => {
    const options = tree(["Fruit/Citrus/Orange", "Veg/Carrot", null]);
    const orange = options.find(o => o.label === "Orange")!;
    const nodes = setFilterTreeNodes(options, setOptionStates({ type: FilterType.NOT_IN, values: [orange.raw] }, options));
    expect(nodes).toEqual([
      { path: [], label: "(Blanks)", checked: true, value: null },
      { path: ["Fruit"], label: "Fruit", checked: false, children: [
        { path: ["Fruit", "Citrus"], label: "Citrus", checked: false, children: [
          { path: ["Fruit", "Citrus", "Orange"], label: "Orange", checked: false, value: "Fruit/Citrus/Orange" },
        ] },
      ] },
      { path: ["Veg"], label: "Veg", checked: true, children: [
        { path: ["Veg", "Carrot"], label: "Carrot", checked: true, value: "Veg/Carrot" },
      ] },
    ]);
  });
});

describe("group check state and toggle", () => {
  it("a group is checked, unchecked, or mixed according to its leaves", () => {
    const options = tree(FRUIT);
    const citrus = options.findIndex(o => o.label === "Citrus");
    const lemon = options.find(o => o.label === "Lemon")!;
    const orange = options.find(o => o.label === "Orange")!;

    expect(groupCheckState(null, options, citrus)).toEqual({ selected: true, indeterminate: false });
    expect(groupCheckState({ type: FilterType.NOT_IN, values: [lemon.raw] }, options, citrus))
      .toEqual({ selected: false, indeterminate: true });
    expect(groupCheckState({ type: FilterType.NOT_IN, values: [lemon.raw, orange.raw] }, options, citrus))
      .toEqual({ selected: false, indeterminate: false });
  });

  it("unchecking a group stores its leaves, and re-checking removes them", () => {
    const options = tree(FRUIT);
    const fruit = options.findIndex(o => o.label === "Fruit");
    const def = toggleGroup(null, options, fruit, false);
    expect(def).toEqual({
      type: FilterType.NOT_IN,
      values: ["Fruit/Berry/Blueberry", "Fruit/Citrus/Lemon", "Fruit/Citrus/Orange"],
    });
    expect(isValueChecked(def, options.find(o => o.label === "Carrot")!)).toBe(true);
    expect(toggleGroup(def, options, fruit, true)).toBeNull();
  });

  it("checking a group under an include mode keeps the representation pinned", () => {
    const options = tree(FRUIT);
    const veg = options.findIndex(o => o.label === "Veg");
    const def = toggleGroup({ type: FilterType.IN, values: [], mode: "include" }, options, veg, true);
    expect(def).toEqual({ type: FilterType.IN, values: ["Veg/Root/Carrot"], mode: "include" });
  });

  it("scopes a group to the leaves the mini filter shows", () => {
    const options = tree(FRUIT);
    applySetMiniFilter(options, "lem");
    const citrus = options.findIndex(o => o.label === "Citrus");
    expect(groupLeafOptions(options, citrus).map(o => o.label)).toEqual(["Lemon"]);

    const def = toggleGroup(null, options, citrus, false);
    expect(def).toEqual({ type: FilterType.NOT_IN, values: ["Fruit/Citrus/Lemon"] });
    // Orange is hidden, so it is outside the group's state as well as its toggle.
    expect(groupCheckState(def, options, citrus)).toEqual({ selected: false, indeterminate: false });
  });
});
