import { describe, expect, it } from "vitest";
import {
  buildPivotTotalRoot,
  createPivotValueStamper,
  discoverPivot,
  enumeratePivotLeafColIds,
  identityPivotResolution,
  PIVOT_TOTAL_GROUP_ID,
} from "./pivot";
import { buildGroupTree, flattenGroupTree, BLANK_GROUP_KEY } from "./rowGroup";
import { ClientSideRowModel } from "./clientSide";
import { AggregateCalculator } from "../aggregate/calculator";
import { Column } from "../column/column";
import { ColDef, ColumnType } from "../interfaces/column";
import { AggregateType } from "../interfaces/aggregate";
import { FilterModel } from "../interfaces/filter";
import { SortModel } from "../interfaces/sort";
import { IRowNode } from "../interfaces/iRowNode";
import { IRowModelRequestParams } from "../interfaces/iRowModel";
import { IRowModelListener } from "../interfaces/iRowModelListener";
import { PivotDiscovery, PivotResolution, PivotValueEntry, pivotLeafColIdFromKey } from "../interfaces/pivot";

function leaf(id: string, data: object): IRowNode {
  return {
    id, data, viewIndex: -1, selected: false,
    type: "leaf", isGroup: false, level: 0, isExpanded: false,
  };
}

function col(key: string, type: ColumnType = ColumnType.STRING): Column {
  const c = new Column({ colId: key, key, label: key, type }, key);
  c.setComparator(
    type === ColumnType.NUMBER
      ? (a, b) => Number(a) - Number(b)
      : (a, b) => c.getCollator().compare(String(a), String(b)),
  );
  return c;
}

function pivotResultCol(colId: string): Column {
  const def = { colId, key: colId, label: colId, type: ColumnType.NUMBER, __internalRole: "pivotResult" } as ColDef;
  const c = new Column(def, colId);
  c.setComparator((a, b) => Number(a) - Number(b));
  return c;
}

function valueEntry(column: Column, type: AggregateType): PivotValueEntry {
  return { column, instanceID: column.instanceID, colId: column.colId, label: column.label, type };
}

const LEAVES = [
  leaf("1", { region: "EMEA", quarter: "Q2", product: "B", revenue: 10 }),
  leaf("2", { region: "EMEA", quarter: "Q1", product: "A", revenue: 20 }),
  leaf("3", { region: "APAC", quarter: "Q1", product: "A", revenue: 5 }),
  leaf("4", { region: "APAC", quarter: null, product: "B", revenue: 40 }),
];

describe("discoverPivot", () => {
  it("orders distinct values ascending with blanks last, stamping per-leaf path keys", () => {
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const { discovery, leafPathKeys, includedPaths } = discoverPivot({
      leaves: LEAVES,
      pivotColumns: [quarter],
      valueEntries: [valueEntry(revenue, AggregateType.SUM)],
      maxPivotColumns: 200,
    });
    expect(discovery.roots.map(r => r.key)).toEqual(["Q1", "Q2", BLANK_GROUP_KEY]);
    expect(discovery.pivotColumnCount).toBe(1);
    expect(discovery.truncatedLeafCount).toBe(0);
    expect(includedPaths).toEqual(["Q1", "Q2", encodeURIComponent(BLANK_GROUP_KEY)]);
    expect(leafPathKeys.get("2")).toBe("Q1");
    expect(leafPathKeys.get("4")).toBe(encodeURIComponent(BLANK_GROUP_KEY));
  });

  it("nests multiple pivot levels at uniform depth, each level ordered", () => {
    const quarter = col("quarter");
    const product = col("product");
    const revenue = col("revenue", ColumnType.NUMBER);
    const { discovery, includedPaths } = discoverPivot({
      leaves: LEAVES,
      pivotColumns: [quarter, product],
      valueEntries: [valueEntry(revenue, AggregateType.SUM)],
      maxPivotColumns: 200,
    });
    expect(discovery.roots.map(r => r.key)).toEqual(["Q1", "Q2", BLANK_GROUP_KEY]);
    expect(discovery.roots[0].children.map(c => c.key)).toEqual(["A"]);
    // Every path reaches full depth; deepest nodes are the paths.
    expect(includedPaths).toEqual(["Q1/A", "Q2/B", `${encodeURIComponent(BLANK_GROUP_KEY)}/B`]);
  });

  it("prefers a pivotComparator over the sort comparator", () => {
    const quarter = col("quarter");
    // Reverse ordering on purpose.
    quarter.pivotComparator = (a, b) => String(b).localeCompare(String(a));
    const revenue = col("revenue", ColumnType.NUMBER);
    const { discovery } = discoverPivot({
      leaves: LEAVES,
      pivotColumns: [quarter],
      valueEntries: [valueEntry(revenue, AggregateType.SUM)],
      maxPivotColumns: 200,
    });
    // Reversed — but blanks still last.
    expect(discovery.roots.map(r => r.key)).toEqual(["Q2", "Q1", BLANK_GROUP_KEY]);
  });

  it("encodes path segments so a slash in a value cannot collide with the separator", () => {
    const product = col("product");
    const revenue = col("revenue", ColumnType.NUMBER);
    const { leafPathKeys } = discoverPivot({
      leaves: [leaf("1", { product: "a/b", revenue: 1 })],
      pivotColumns: [product],
      valueEntries: [valueEntry(revenue, AggregateType.SUM)],
      maxPivotColumns: 200,
    });
    expect(leafPathKeys.get("1")).toBe("a%2Fb");
  });

  it("returns no structure without value entries", () => {
    const { discovery, leafPathKeys, includedPaths } = discoverPivot({
      leaves: LEAVES,
      pivotColumns: [col("quarter")],
      valueEntries: [],
      maxPivotColumns: 200,
    });
    expect(discovery.roots).toEqual([]);
    expect(includedPaths).toEqual([]);
    expect(leafPathKeys.size).toBe(0);
  });

  it("maps every leaf to the root path when there are no pivot columns", () => {
    const revenue = col("revenue", ColumnType.NUMBER);
    const { discovery, leafPathKeys, includedPaths } = discoverPivot({
      leaves: LEAVES,
      pivotColumns: [],
      valueEntries: [valueEntry(revenue, AggregateType.SUM)],
      maxPivotColumns: 200,
    });
    expect(discovery.roots).toEqual([]);
    expect(discovery.pivotColumnCount).toBe(0);
    expect(includedPaths).toEqual([""]);
    expect(LEAVES.every(l => leafPathKeys.get(l.id) === "")).toBe(true);
  });

  it("truncates past maxPivotColumns: first paths in header order survive, the tree is pruned", () => {
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const qty = col("qty", ColumnType.NUMBER);
    // Two value entries → 2 leaves per path; cap of 4 keeps ⌊4/2⌋ = 2 of the 3 paths.
    const { discovery, includedPaths } = discoverPivot({
      leaves: LEAVES,
      pivotColumns: [quarter],
      valueEntries: [valueEntry(revenue, AggregateType.SUM), valueEntry(qty, AggregateType.AVG)],
      maxPivotColumns: 4,
    });
    expect(includedPaths).toEqual(["Q1", "Q2"]);
    expect(discovery.roots.map(r => r.key)).toEqual(["Q1", "Q2"]);
    expect(discovery.truncatedLeafCount).toBe(2); // 1 dropped path × 2 value entries
  });

  it("always keeps at least one path, even when value entries outnumber the cap", () => {
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const qty = col("qty", ColumnType.NUMBER);
    const { includedPaths } = discoverPivot({
      leaves: LEAVES,
      pivotColumns: [quarter],
      valueEntries: [valueEntry(revenue, AggregateType.SUM), valueEntry(qty, AggregateType.SUM)],
      maxPivotColumns: 1,
    });
    expect(includedPaths).toEqual(["Q1"]);
  });
});

describe("enumeratePivotLeafColIds / identityPivotResolution", () => {
  it("enumerates generated leaf colIds in header order", () => {
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const { discovery } = discoverPivot({
      leaves: LEAVES,
      pivotColumns: [quarter],
      valueEntries: [valueEntry(revenue, AggregateType.SUM)],
      maxPivotColumns: 200,
    });
    const ids = enumeratePivotLeafColIds(discovery);
    expect(ids).toEqual([
      "pv:Q1|revenue|sum",
      "pv:Q2|revenue|sum",
      `pv:${encodeURIComponent(BLANK_GROUP_KEY)}|revenue|sum`,
    ]);
    const identity = identityPivotResolution(discovery);
    expect(identity.get("pv:Q1|revenue|sum")).toBe("pv:Q1|revenue|sum");
  });

  it("emits root-path leaf ids for a no-pivot-columns discovery", () => {
    const revenue = col("revenue", ColumnType.NUMBER);
    const discovery: PivotDiscovery = {
      roots: [],
      valueEntries: [valueEntry(revenue, AggregateType.SUM)],
      pivotColumnCount: 0,
      truncatedLeafCount: 0,
    };
    expect(enumeratePivotLeafColIds(discovery)).toEqual(["pv:|revenue|sum"]);
  });
});

describe("createPivotValueStamper", () => {
  function stamperFor(leaves: IRowNode[], pivotColumns: Column[], entries: PivotValueEntry[], resolution?: PivotResolution) {
    const { discovery, leafPathKeys, includedPaths } = discoverPivot({
      leaves, pivotColumns, valueEntries: entries, maxPivotColumns: 200,
    });
    return createPivotValueStamper({
      leafPathKeys,
      includedPaths,
      valueEntries: entries,
      valueColumns: new Map(entries.map(e => [e.instanceID, e.column])),
      resolution: resolution ?? identityPivotResolution(discovery),
      calculator: new AggregateCalculator(),
    });
  }

  it("stamps one value per present (path × entry), keyed through the resolution mapping", () => {
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const stamp = stamperFor(LEAVES, [quarter], [valueEntry(revenue, AggregateType.SUM)]);
    // EMEA bucket: Q1 → 20, Q2 → 10; no blank quarter, so no blank key at all.
    const emea = stamp(LEAVES.filter(l => l.data.region === "EMEA"));
    expect(emea["pv:Q1|revenue|sum"]).toBe(20);
    expect(emea["pv:Q2|revenue|sum"]).toBe(10);
    expect(Object.keys(emea)).toHaveLength(2);
  });

  it("routes stamping keys through a non-identity resolution", () => {
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const resolution: PivotResolution = new Map([
      ["pv:Q1|revenue|sum", "instance-1"],
      ["pv:Q2|revenue|sum", "instance-2"],
      [`pv:${encodeURIComponent(BLANK_GROUP_KEY)}|revenue|sum`, "instance-3"],
    ]);
    const stamp = stamperFor(LEAVES, [quarter], [valueEntry(revenue, AggregateType.SUM)], resolution);
    const all = stamp(LEAVES);
    expect(all["instance-1"]).toBe(25);
    expect(all["instance-2"]).toBe(10);
    expect(all["instance-3"]).toBe(40);
  });

  it("computes multiple aggregates of the same source column independently", () => {
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const stamp = stamperFor(
      LEAVES,
      [quarter],
      [valueEntry(revenue, AggregateType.SUM), valueEntry(revenue, AggregateType.AVG)],
    );
    const all = stamp(LEAVES);
    expect(all["pv:Q1|revenue|sum"]).toBe(25);
    expect(all["pv:Q1|revenue|avg"]).toBe(12.5);
  });

  it("never stamps truncated paths", () => {
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const { discovery, leafPathKeys, includedPaths } = discoverPivot({
      leaves: LEAVES,
      pivotColumns: [quarter],
      valueEntries: [valueEntry(revenue, AggregateType.SUM)],
      maxPivotColumns: 1, // keeps only Q1
    });
    const stamp = createPivotValueStamper({
      leafPathKeys, includedPaths,
      valueEntries: [valueEntry(revenue, AggregateType.SUM)],
      valueColumns: new Map([[revenue.instanceID, revenue]]),
      resolution: identityPivotResolution(discovery),
      calculator: new AggregateCalculator(),
    });
    const all = stamp(LEAVES);
    expect(Object.keys(all)).toEqual(["pv:Q1|revenue|sum"]);
  });
});

describe("buildGroupTree in pivot mode", () => {
  it("hides leaf rows: deepest groups are non-expandable and stay collapsed past expansion state", () => {
    const region = col("region");
    const { roots } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [region],
      // A pre-pivot expansion entry claims EMEA is open; hidden leaf rows must win.
      expansion: new Map([["g:EMEA", true]]),
      defaultExpanded: -1,
      hideLeafRows: true,
    });
    expect(roots.every(r => r.expandable === false)).toBe(true);
    expect(roots.every(r => r.isExpanded === false)).toBe(true);
    const flat = flattenGroupTree(roots);
    expect(flat.map(n => n.groupKey)).toEqual(["APAC", "EMEA"]);
    expect(flat.every(n => n.isGroup)).toBe(true);
  });

  it("keeps upper levels expandable while hiding only the deepest level's leaves", () => {
    const region = col("region");
    const product = col("product");
    const { roots } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [region, product],
      expansion: new Map(),
      defaultExpanded: -1,
      hideLeafRows: true,
    });
    expect(roots.every(r => r.expandable !== false && r.isExpanded)).toBe(true);
    const flat = flattenGroupTree(roots);
    expect(flat.every(n => n.isGroup)).toBe(true); // group rows only, never leaves
    expect(flat.length).toBe(6); // 2 regions + 2 products each
  });

  it("orders buckets by a pivot-result column sort at every level, empty buckets last", () => {
    const region = col("region");
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const sortCol = pivotResultCol("pv:Q1|revenue|sum");
    const entries = [valueEntry(revenue, AggregateType.SUM)];
    const { discovery, leafPathKeys, includedPaths } = discoverPivot({
      leaves: LEAVES, pivotColumns: [quarter], valueEntries: entries, maxPivotColumns: 200,
    });
    // Resolve the sorted generated colId onto the sort column's instanceID, like the core would.
    const resolution = identityPivotResolution(discovery);
    resolution.set("pv:Q1|revenue|sum", sortCol.instanceID);
    const stamp = createPivotValueStamper({
      leafPathKeys, includedPaths, valueEntries: entries,
      valueColumns: new Map([[revenue.instanceID, revenue]]),
      resolution, calculator: new AggregateCalculator(),
    });
    // Q1 sums: EMEA = 20, APAC = 5 → desc puts EMEA first.
    const { roots } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [region],
      sortModel: new SortModel([{ col: sortCol, key: sortCol.key, dir: "desc" }]),
      expansion: new Map(),
      defaultExpanded: 0,
      computeAggregates: stamp,
      hideLeafRows: true,
    });
    expect(roots.map(r => r.groupKey)).toEqual(["EMEA", "APAC"]);
    // asc puts APAC first.
    const { roots: asc } = buildGroupTree({
      leaves: LEAVES,
      groupColumns: [region],
      sortModel: new SortModel([{ col: sortCol, key: sortCol.key, dir: "asc" }]),
      expansion: new Map(),
      defaultExpanded: 0,
      computeAggregates: stamp,
      hideLeafRows: true,
    });
    expect(asc.map(r => r.groupKey)).toEqual(["APAC", "EMEA"]);
    // A bucket with no rows at the sorted cell goes last regardless of direction.
    const q2only = [leaf("9", { region: "LATAM", quarter: "Q2", revenue: 99 }), ...LEAVES];
    const rebuilt = discoverPivot({ leaves: q2only, pivotColumns: [quarter], valueEntries: entries, maxPivotColumns: 200 });
    const resolution2 = identityPivotResolution(rebuilt.discovery);
    resolution2.set("pv:Q1|revenue|sum", sortCol.instanceID);
    const stamp2 = createPivotValueStamper({
      leafPathKeys: rebuilt.leafPathKeys, includedPaths: rebuilt.includedPaths, valueEntries: entries,
      valueColumns: new Map([[revenue.instanceID, revenue]]),
      resolution: resolution2, calculator: new AggregateCalculator(),
    });
    const { roots: withEmpty } = buildGroupTree({
      leaves: q2only,
      groupColumns: [region],
      sortModel: new SortModel([{ col: sortCol, key: sortCol.key, dir: "desc" }]),
      expansion: new Map(),
      defaultExpanded: 0,
      computeAggregates: stamp2,
      hideLeafRows: true,
    });
    expect(withEmpty.map(r => r.groupKey)).toEqual(["EMEA", "APAC", "LATAM"]);
  });
});

describe("ClientSideRowModel pivot mode", () => {
  type ListenerCalls = { order: string[]; discoveries: PivotDiscovery[]; rows: IRowNode[][] };

  function makeListener(withPivotResult: boolean, resolve?: (d: PivotDiscovery) => PivotResolution) {
    const calls: ListenerCalls = { order: [], discoveries: [], rows: [] };
    const listener: IRowModelListener = {
      onLoadingStart: () => { calls.order.push("loadingStart"); },
      onRows: (_id, payload) => { calls.order.push("rows"); calls.rows.push(payload.rows); },
      onAggregates: () => { calls.order.push("aggregates"); },
      onLoadingEnd: () => { calls.order.push("loadingEnd"); },
      onError: () => { calls.order.push("error"); },
    };
    if (withPivotResult) {
      listener.onPivotResult = (_id, discovery) => {
        calls.order.push("pivotResult");
        calls.discoveries.push(discovery);
        return resolve ? resolve(discovery) : identityPivotResolution(discovery);
      };
    }
    return { listener, calls };
  }

  const ROWS = [
    { id: "1", region: "EMEA", quarter: "Q2", revenue: 10 },
    { id: "2", region: "EMEA", quarter: "Q1", revenue: 20 },
    { id: "3", region: "APAC", quarter: "Q1", revenue: 5 },
    { id: "4", region: "APAC", quarter: "Q2", revenue: 40 },
  ];

  function request(overrides: Partial<IRowModelRequestParams> = {}): IRowModelRequestParams {
    return {
      id: 1,
      reason: "pivot",
      sortModel: new SortModel(),
      filterModel: new FilterModel(),
      paginate: false,
      range: { start: 0, end: 100 },
      aggregateScope: "all",
      aggregates: [],
      leafColumns: [],
      groupColumns: [],
      groupSortMode: "local",
      ...overrides,
    };
  }

  function pivotRequest(opts: {
    groupColumns?: Column[];
    pivotColumns: Column[];
    entries: PivotValueEntry[];
    overrides?: Partial<IRowModelRequestParams>;
  }): IRowModelRequestParams {
    return request({
      groupColumns: opts.groupColumns ?? [],
      aggregates: opts.entries.map(e => ({ key: e.instanceID, type: e.type })),
      pivot: { columns: opts.pivotColumns, valueEntries: opts.entries, maxPivotColumns: 200 },
      ...opts.overrides,
    });
  }

  it("displays group rows only, stamped with generated pivot cells, and calls onPivotResult before onRows", () => {
    const { listener, calls } = makeListener(true);
    const model = new ClientSideRowModel({ rowIdKey: "id" }, listener);
    model.setRows(ROWS);
    const region = col("region");
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    model.applyRequest(pivotRequest({
      groupColumns: [region],
      pivotColumns: [quarter],
      entries: [valueEntry(revenue, AggregateType.SUM)],
    }));

    expect(calls.order.indexOf("pivotResult")).toBeGreaterThan(-1);
    expect(calls.order.indexOf("pivotResult")).toBeLessThan(calls.order.indexOf("rows"));
    expect(calls.discoveries[0].roots.map(r => r.key)).toEqual(["Q1", "Q2"]);

    const view = calls.rows[0];
    expect(view.every(n => n.isGroup)).toBe(true);
    expect(view.map(n => n.groupKey)).toEqual(["APAC", "EMEA"]);
    expect(view.every(n => n.expandable === false)).toBe(true);
    const emea = view.find(n => n.groupKey === "EMEA")!;
    expect(emea.aggregateValues!["pv:Q1|revenue|sum"]).toBe(20);
    expect(emea.aggregateValues!["pv:Q2|revenue|sum"]).toBe(10);
  });

  it("stamps through the mapping onPivotResult returns", () => {
    const { listener } = makeListener(true, (discovery) => {
      const map: PivotResolution = new Map();
      for (const [colId] of identityPivotResolution(discovery)) map.set(colId, `mapped:${colId}`);
      return map;
    });
    const model = new ClientSideRowModel({ rowIdKey: "id" }, listener);
    model.setRows(ROWS);
    const region = col("region");
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    model.applyRequest(pivotRequest({
      groupColumns: [region],
      pivotColumns: [quarter],
      entries: [valueEntry(revenue, AggregateType.SUM)],
    }));
    const emea = model.getRowNode("g:EMEA")!;
    expect(emea.aggregateValues!["mapped:pv:Q1|revenue|sum"]).toBe(20);
  });

  it("falls back to identity resolution without an onPivotResult listener", () => {
    const { listener } = makeListener(false);
    const model = new ClientSideRowModel({ rowIdKey: "id" }, listener);
    model.setRows(ROWS);
    const region = col("region");
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    model.applyRequest(pivotRequest({
      groupColumns: [region],
      pivotColumns: [quarter],
      entries: [valueEntry(revenue, AggregateType.SUM)],
    }));
    expect(model.getRowNode("g:APAC")!.aggregateValues!["pv:Q1|revenue|sum"]).toBe(5);
  });

  it("synthesizes a single non-expandable Total root when ungrouped", () => {
    const { listener, calls } = makeListener(true);
    const model = new ClientSideRowModel({ rowIdKey: "id" }, listener);
    model.setRows(ROWS);
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    model.applyRequest(pivotRequest({
      pivotColumns: [quarter],
      entries: [valueEntry(revenue, AggregateType.SUM)],
    }));
    const view = calls.rows[0];
    expect(view).toHaveLength(1);
    expect(view[0].id).toBe(PIVOT_TOTAL_GROUP_ID);
    expect(view[0].groupKey).toBe("Total");
    expect(view[0].expandable).toBe(false);
    expect(view[0].childCount).toBe(4);
    expect(view[0].aggregateValues!["pv:Q1|revenue|sum"]).toBe(25);
    expect(view[0].aggregateValues!["pv:Q2|revenue|sum"]).toBe(50);
  });

  it("computes footer aggregates as grand totals per generated column", () => {
    const { listener } = makeListener(true);
    const model = new ClientSideRowModel({ rowIdKey: "id" }, listener);
    model.setRows(ROWS);
    const region = col("region");
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    model.applyRequest(pivotRequest({
      groupColumns: [region],
      pivotColumns: [quarter],
      entries: [valueEntry(revenue, AggregateType.AVG)],
    }));
    const totals = model.getAggregateValues();
    // True grand averages over source rows — not averages of the per-group averages.
    expect(totals.get("pv:Q1|revenue|avg")).toBe(12.5);
    expect(totals.get("pv:Q2|revenue|avg")).toBe(25);
  });

  it("quick-filters through the supplied source columns, not the generated leaves", () => {
    const { listener, calls } = makeListener(true);
    const model = new ClientSideRowModel({ rowIdKey: "id" }, listener);
    model.setRows(ROWS);
    const region = col("region");
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    model.applyRequest(pivotRequest({
      groupColumns: [region],
      pivotColumns: [quarter],
      entries: [valueEntry(revenue, AggregateType.SUM)],
      overrides: {
        quickFilter: { text: "APAC", matchMode: "multiTerm", caseSensitive: false },
        quickFilterColumns: [region, quarter, revenue],
      },
    }));
    const view = calls.rows[0];
    expect(view.map(n => n.groupKey)).toEqual(["APAC"]);
    expect(view[0].aggregateValues!["pv:Q1|revenue|sum"]).toBe(5);
  });

  it("ignores expansion requests targeting non-expandable pivot groups", () => {
    const { listener, calls } = makeListener(true);
    const model = new ClientSideRowModel({ rowIdKey: "id" }, listener);
    model.setRows(ROWS);
    const region = col("region");
    const quarter = col("quarter");
    const revenue = col("revenue", ColumnType.NUMBER);
    const base = pivotRequest({
      groupColumns: [region],
      pivotColumns: [quarter],
      entries: [valueEntry(revenue, AggregateType.SUM)],
    });
    model.applyRequest(base);
    model.applyRequest({ ...base, id: 2, reason: "group", groupExpansion: { groupId: "g:EMEA", expanded: true } });
    const view = calls.rows[calls.rows.length - 1];
    expect(view.map(n => n.groupKey)).toEqual(["APAC", "EMEA"]);
    expect(view.every(n => n.isGroup)).toBe(true);
    expect(model.getRowNode("g:EMEA")!.isExpanded).toBe(false);
  });
});

describe("buildPivotTotalRoot", () => {
  it("builds a stable, non-expandable level-0 group over the supplied leaves", () => {
    const root = buildPivotTotalRoot(LEAVES, { x: 1 });
    expect(root.id).toBe(PIVOT_TOTAL_GROUP_ID);
    expect(root.isGroup).toBe(true);
    expect(root.level).toBe(0);
    expect(root.expandable).toBe(false);
    expect(root.childCount).toBe(4);
    expect(root.aggregateValues).toEqual({ x: 1 });
  });
});
