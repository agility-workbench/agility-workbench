import { describe, expect, it } from "vitest";
import { buildGroupTree, flattenGroupTree, groupNodeId, BLANK_GROUP_KEY } from "./rowGroup";
import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";
import { SortModel } from "../interfaces/sort";

// Minimal leaf node factory.
function leaf(id: string, data: object): IRowNode {
  return {
    id, data, viewIndex: -1, selected: false,
    type: "leaf", isGroup: false, level: 0, isExpanded: false,
  };
}

function col(key: string, type: ColumnType = ColumnType.STRING): Column {
  const c = new Column({ colId: key, key, label: key, type }, key);
  // Comparator mirrors what the column model would assign; string columns use the collator.
  c.setComparator((a, b) => c.getCollator().compare(String(a), String(b)));
  return c;
}

const LEAVES = [
  leaf("1", { region: "EMEA", country: "UK" }),
  leaf("2", { region: "EMEA", country: "France" }),
  leaf("3", { region: "APAC", country: "Japan" }),
  leaf("4", { region: "APAC", country: "Japan" }),
];

describe("groupNodeId", () => {
  it("is stable and path-derived, with a g: prefix and encoded separators", () => {
    expect(groupNodeId(["APAC"])).toBe("g:APAC");
    expect(groupNodeId(["EMEA", "UK"])).toBe("g:EMEA/UK");
    // Slashes in a key don't collide with the path separator.
    expect(groupNodeId(["a/b"])).toBe("g:a%2Fb");
  });
});

describe("buildGroupTree", () => {
  it("builds one bucket per distinct value, ordered by comparator, with leaf-count childCount", () => {
    const { roots, groupNodesById } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [col("region")],
      expansion: new Map(),
      defaultExpanded: 0,
    });
    expect(roots.map(r => r.groupKey)).toEqual(["APAC", "EMEA"]); // collator order
    expect(roots.map(r => r.childCount)).toEqual([2, 2]);
    expect(roots.every(r => r.isGroup && r.level === 0)).toBe(true);
    expect(groupNodesById.get("g:APAC")).toBe(roots[0]);
  });

  it("honors a descending sort on the grouping column", () => {
    const region = col("region");
    const { roots } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [region],
      sortModel: new SortModel([{ col: region, key: region.key, dir: "desc" }]),
      expansion: new Map(),
      defaultExpanded: 0,
    });
    expect(roots.map(r => r.groupKey)).toEqual(["EMEA", "APAC"]);
  });

  it("honors independent sort directions at each grouping level", () => {
    const region = col("region");
    const country = col("country");
    const { roots } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [region, country],
      sortModel: new SortModel([
        { col: region, key: region.key, dir: "desc" },
        { col: country, key: country.key, dir: "desc" },
      ]),
      expansion: new Map(),
      defaultExpanded: -1,
    });
    expect(roots.map(r => r.groupKey)).toEqual(["EMEA", "APAC"]);
    expect(roots[0].children!.map(r => r.groupKey)).toEqual(["UK", "France"]);
  });

  it("keeps a non-grouped sort local by default", () => {
    const region = col("region");
    const sales = col("sales", ColumnType.NUMBER);
    const sortedLeaves = [
      leaf("1", { region: "EMEA", sales: 5 }),
      leaf("2", { region: "APAC", sales: 15 }),
      leaf("3", { region: "EMEA", sales: 20 }),
      leaf("4", { region: "APAC", sales: 30 }),
    ];
    const { roots } = buildGroupTree({
      leaves: sortedLeaves,
      groupColumns: [region],
      sortModel: new SortModel([{ col: sales, key: sales.key, dir: "asc" }]),
      expansion: new Map(),
      defaultExpanded: -1,
    });
    expect(roots.map(r => r.groupKey)).toEqual(["APAC", "EMEA"]);
    expect(roots.find(r => r.groupKey === "EMEA")!.children!.map(r => r.data.sales)).toEqual([5, 20]);
  });

  it("lets a non-grouped sort reorder buckets in global mode", () => {
    const region = col("region");
    const sales = col("sales", ColumnType.NUMBER);
    const sortedLeaves = [
      leaf("1", { region: "EMEA", sales: 5 }),
      leaf("2", { region: "APAC", sales: 15 }),
      leaf("3", { region: "EMEA", sales: 20 }),
      leaf("4", { region: "APAC", sales: 30 }),
    ];
    const { roots } = buildGroupTree({
      leaves: sortedLeaves,
      groupColumns: [region],
      sortModel: new SortModel([{ col: sales, key: sales.key, dir: "asc" }]),
      groupSortMode: "global",
      expansion: new Map(),
      defaultExpanded: -1,
    });
    expect(roots.map(r => r.groupKey)).toEqual(["EMEA", "APAC"]);
  });

  it("propagates a descendant grouped-column sort to ancestor groups in hierarchy mode", () => {
    const region = col("region");
    const country = col("country");
    // Already sorted by country ascending: France, Japan, UK.
    const sortedLeaves = [
      leaf("1", { region: "EMEA", country: "France" }),
      leaf("2", { region: "APAC", country: "Japan" }),
      leaf("3", { region: "EMEA", country: "UK" }),
    ];
    const { roots } = buildGroupTree({
      leaves: sortedLeaves,
      groupColumns: [region, country],
      sortModel: new SortModel([{ col: country, key: country.key, dir: "asc" }]),
      groupSortMode: "hierarchy",
      expansion: new Map(),
      defaultExpanded: -1,
    });
    expect(roots.map(r => r.groupKey)).toEqual(["EMEA", "APAC"]);
    expect(roots[0].children!.map(r => r.groupKey)).toEqual(["France", "UK"]);
  });

  it("does not propagate a non-grouped sort in hierarchy mode", () => {
    const region = col("region");
    const sales = col("sales", ColumnType.NUMBER);
    const sortedLeaves = [
      leaf("1", { region: "EMEA", sales: 5 }),
      leaf("2", { region: "APAC", sales: 15 }),
    ];
    const { roots } = buildGroupTree({
      leaves: sortedLeaves,
      groupColumns: [region],
      sortModel: new SortModel([{ col: sales, key: sales.key, dir: "asc" }]),
      groupSortMode: "hierarchy",
      expansion: new Map(),
      defaultExpanded: -1,
    });
    expect(roots.map(r => r.groupKey)).toEqual(["APAC", "EMEA"]);
  });

  it("nests multiple levels", () => {
    const { roots } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [col("region"), col("country")],
      expansion: new Map(),
      defaultExpanded: -1,
    });
    const emea = roots.find(r => r.groupKey === "EMEA")!;
    expect(emea.children!.every(c => c.isGroup && c.level === 1)).toBe(true);
    expect(emea.children!.map(c => c.groupKey)).toEqual(["France", "UK"]);
    // Leaf children live under the deepest group level.
    const japan = roots.find(r => r.groupKey === "APAC")!.children!.find(c => c.groupKey === "Japan")!;
    expect(japan.children!.every(c => !c.isGroup)).toBe(true);
    expect(japan.children!.length).toBe(2);
  });

  it("buckets null/empty values under (Blanks)", () => {
    const { roots } = buildGroupTree({
      leaves: [leaf("1", { region: null }), leaf("2", { region: "" }), leaf("3", { region: "EMEA" })],
      groupColumns: [col("region")],
      expansion: new Map(),
      defaultExpanded: 0,
    });
    const blanks = roots.find(r => r.groupKey === BLANK_GROUP_KEY);
    expect(blanks).toBeDefined();
    expect(blanks!.childCount).toBe(2);
  });

  it("honors defaultExpanded depth and per-group expansion overrides", () => {
    const expansion = new Map([["g:APAC", false]]);
    const { roots } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [col("region")],
      expansion,
      defaultExpanded: 1, // level 0 expanded by default
    });
    const emea = roots.find(r => r.groupKey === "EMEA")!;
    const apac = roots.find(r => r.groupKey === "APAC")!;
    expect(emea.isExpanded).toBe(true);   // default
    expect(apac.isExpanded).toBe(false);  // override wins
  });

  it("computes per-group aggregates via the injected callback", () => {
    const { roots } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [col("region")],
      expansion: new Map(),
      defaultExpanded: 0,
      computeAggregates: (ls) => ({ count: ls.length }),
    });
    expect(roots.every(r => r.aggregateValues!.count === 2)).toBe(true);
  });
});

describe("flattenGroupTree", () => {
  it("pre-order flattens, skipping collapsed subtrees, stamping viewIndex", () => {
    const { roots } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [col("region")],
      expansion: new Map([["g:APAC", true]]), // only APAC expanded
      defaultExpanded: 0,
    });
    const flat = flattenGroupTree(roots);
    // APAC header + 2 APAC leaves + EMEA header (collapsed) = 4
    expect(flat.length).toBe(4);
    expect(flat[0].groupKey).toBe("APAC");
    expect(flat[1].isGroup).toBe(false);
    expect(flat[2].isGroup).toBe(false);
    expect(flat[3].groupKey).toBe("EMEA");
    flat.forEach((n, i) => expect(n.viewIndex).toBe(i));
  });
});
