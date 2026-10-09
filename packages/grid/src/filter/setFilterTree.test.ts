/**
 * The tree layout is a regrouping of the flat universe: groups are synthetic rows that stand for
 * the leaves beneath them and are never stored. These tests pin the pre-order shape, sibling
 * ordering, count roll-up, expansion defaults, the mini filter's ancestor/descendant rule, and the
 * group toggle's effect on the def — all against `setFilterCore`'s own universe builder.
 */
import { describe, expect, it } from "vitest";
import { FilterType } from "../interfaces/filter";
import { addSetOptionCounts, buildSetOptions, isValueChecked, valueOptions } from "./setFilterCore";
import {
  allGroupsExpanded,
  applySetMiniFilter,
  buildSetFilterTree,
  setAllGroupsExpanded,
  dateSegmentFormatter,
  dateTreePath,
  defaultSegmentFormatter,
  groupCheckState,
  groupLeafOptions,
  hasSetFilterGroups,
  parentIndex,
  SetFilterTreeSpec,
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

  it("reports and sets expansion across every group, for the root's chevron", () => {
    const options = tree(FRUIT, { defaultExpanded: 1 });
    expect(allGroupsExpanded(options)).toBe(false);
    setAllGroupsExpanded(options, true);
    expect(allGroupsExpanded(options)).toBe(true);
    expect(labelsAt(options, visibleSetOptions(options))).toHaveLength(options.length);
    setAllGroupsExpanded(options, false);
    expect(allGroupsExpanded(options)).toBe(false);
    expect(labelsAt(options, visibleSetOptions(options))).toEqual(["(Select All)", "Fruit", "Veg"]);
    // A universe without groups is trivially all-expanded.
    expect(allGroupsExpanded(buildSetOptions(["a"]))).toBe(true);
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
