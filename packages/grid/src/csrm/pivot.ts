import { Column } from "../column/column";
import { IRowNode } from "../interfaces/iRowNode";
import { AggregateCalculator } from "../aggregate/calculator";
import {
  PivotDiscovery,
  PivotPathNode,
  PivotResolution,
  PivotValueEntry,
  pivotLeafColIdFromKey,
} from "../interfaces/pivot";
import { BLANK_GROUP_KEY } from "./rowGroup";

// Mutable trie node used during discovery only; flattened to PivotPathNode for the core.
interface TrieNode {
  key: string;
  value: any;
  // A representative leaf for comparator calls (comparators may inspect the row node).
  firstLeaf: IRowNode;
  children: Map<string, TrieNode>;
}

export interface DiscoverPivotParams<Row = any> {
  // Filtered+sorted leaf nodes, in display order.
  leaves: IRowNode<Row>[];
  // Pivot columns in level order (outermost first). May be empty (degenerate root-path pivot).
  pivotColumns: Column[];
  valueEntries: PivotValueEntry[];
  // Cap on generated leaf columns. Truncation keeps the first ⌊max / valueEntries⌋ paths (at
  // least one) in header order and prunes the rest.
  maxPivotColumns: number;
}

export interface DiscoverPivotResult {
  discovery: PivotDiscovery;
  // Encoded pivot path per leaf node id ("" when there are no pivot columns).
  leafPathKeys: Map<string, string>;
  // Encoded deepest-level paths kept after truncation, in header order.
  includedPaths: string[];
}

// One pass over the filtered leaves: stamp each leaf's encoded pivot path and build the ordered
// distinct-path tree the generated header is made of. Sibling order is pivotComparator, else the
// column's sort comparator, else collator order — ascending, blanks always last (mirroring the
// set-filter blank policy). Runs before the group tree is built so the core can reconcile the
// generated columns first (see IRowModelListener.onPivotResult).
export function discoverPivot<Row = any>(params: DiscoverPivotParams<Row>): DiscoverPivotResult {
  const { leaves, pivotColumns, valueEntries, maxPivotColumns } = params;
  const leafPathKeys = new Map<string, string>();
  const emptyDiscovery = (): PivotDiscovery => ({
    roots: [],
    valueEntries,
    pivotColumnCount: pivotColumns.length,
    truncatedLeafCount: 0,
  });

  // No measures — nothing to generate, so skip the leaf pass entirely (the header renders the
  // "choose an aggregate" empty state instead).
  if (valueEntries.length === 0) {
    return { discovery: emptyDiscovery(), leafPathKeys, includedPaths: [] };
  }

  // No pivot columns: every leaf lives at the root path — one generated leaf per value entry.
  if (pivotColumns.length === 0) {
    for (const leaf of leaves) leafPathKeys.set(leaf.id, "");
    return { discovery: emptyDiscovery(), leafPathKeys, includedPaths: [""] };
  }

  const rootChildren = new Map<string, TrieNode>();
  for (const leaf of leaves) {
    let level = rootChildren;
    const encoded: string[] = [];
    for (const col of pivotColumns) {
      const raw = col.getValue(leaf);
      const key = raw == null || raw === "" ? BLANK_GROUP_KEY : String(raw);
      encoded.push(encodeURIComponent(key));
      let node = level.get(key);
      if (!node) {
        node = { key, value: raw, firstLeaf: leaf, children: new Map() };
        level.set(key, node);
      }
      level = node.children;
    }
    leafPathKeys.set(leaf.id, encoded.join("/"));
  }

  const sortSiblings = (nodes: TrieNode[], col: Column): TrieNode[] => {
    const pivotCmp = col.pivotComparator;
    const sortCmp = col.getComparator();
    const collator = col.getCollator();
    return nodes.sort((a, b) => {
      const aBlank = a.key === BLANK_GROUP_KEY;
      const bBlank = b.key === BLANK_GROUP_KEY;
      if (aBlank || bBlank) return aBlank && bBlank ? 0 : aBlank ? 1 : -1;
      if (pivotCmp) return pivotCmp(a.value, b.value);
      if (sortCmp) return sortCmp(a.value, b.value, a.firstLeaf, b.firstLeaf);
      return collator.compare(a.key, b.key);
    });
  };

  const toPathNode = (node: TrieNode, level: number): PivotPathNode => ({
    key: node.key,
    value: node.value,
    children: level + 1 < pivotColumns.length
      ? sortSiblings([...node.children.values()], pivotColumns[level + 1]).map(c => toPathNode(c, level + 1))
      : [],
  });
  let roots = sortSiblings([...rootChildren.values()], pivotColumns[0]).map(n => toPathNode(n, 0));

  // Every leaf carries a value (blanks included) at every pivot level, so the tree has uniform
  // depth: deepest-level nodes ARE the paths.
  const allPaths: string[] = [];
  const collect = (node: PivotPathNode, prefix: string) => {
    const key = prefix === "" ? encodeURIComponent(node.key) : prefix + "/" + encodeURIComponent(node.key);
    if (node.children.length === 0) allPaths.push(key);
    else node.children.forEach(c => collect(c, key));
  };
  roots.forEach(r => collect(r, ""));

  const maxPaths = Math.max(1, Math.floor(maxPivotColumns / valueEntries.length));
  let includedPaths = allPaths;
  let truncatedLeafCount = 0;
  if (allPaths.length > maxPaths) {
    includedPaths = allPaths.slice(0, maxPaths);
    truncatedLeafCount = (allPaths.length - maxPaths) * valueEntries.length;
    const kept = new Set(includedPaths);
    const prune = (nodes: PivotPathNode[], prefix: string): PivotPathNode[] =>
      nodes
        .map((n): PivotPathNode | null => {
          const key = prefix === "" ? encodeURIComponent(n.key) : prefix + "/" + encodeURIComponent(n.key);
          if (n.children.length === 0) return kept.has(key) ? n : null;
          const children = prune(n.children, key);
          return children.length > 0 ? { ...n, children } : null;
        })
        .filter((n): n is PivotPathNode => n !== null);
    roots = prune(roots, "");
  }

  return {
    discovery: { roots, valueEntries, pivotColumnCount: pivotColumns.length, truncatedLeafCount },
    leafPathKeys,
    includedPaths,
  };
}

// Every generated leaf colId a discovery implies, in header order.
export function enumeratePivotLeafColIds(discovery: PivotDiscovery): string[] {
  if (discovery.valueEntries.length === 0) return [];
  const out: string[] = [];
  const emit = (pathKey: string) => {
    for (const entry of discovery.valueEntries) out.push(pivotLeafColIdFromKey(pathKey, entry.colId, entry.type));
  };
  if (discovery.pivotColumnCount === 0) {
    emit("");
    return out;
  }
  const walk = (node: PivotPathNode, prefix: string) => {
    const key = prefix === "" ? encodeURIComponent(node.key) : prefix + "/" + encodeURIComponent(node.key);
    if (node.children.length === 0) emit(key);
    else node.children.forEach(c => walk(c, key));
  };
  discovery.roots.forEach(r => walk(r, ""));
  return out;
}

// Fallback for a listener without onPivotResult (model-level tests, wrappers-in-progress):
// generated colIds double as instanceIDs.
export function identityPivotResolution(discovery: PivotDiscovery): PivotResolution {
  const map: PivotResolution = new Map();
  for (const colId of enumeratePivotLeafColIds(discovery)) map.set(colId, colId);
  return map;
}

export interface PivotStamperParams {
  leafPathKeys: Map<string, string>;
  includedPaths: string[];
  valueEntries: PivotValueEntry[];
  // Live source value columns keyed by instanceID; aggregate computation reads through these.
  valueColumns: Map<string, Column>;
  resolution: PivotResolution;
  calculator: AggregateCalculator;
}

export type PivotValueStamper = (bucketLeaves: IRowNode[]) => { [key: string]: any };

// Build the per-group-bucket value computation buildGroupTree runs as its computeAggregates
// callback: partition the bucket's leaves by pivot path, run the aggregate per (path × value
// entry), and key the result by the resolved instanceID so the existing group-row cell paint
// (row.aggregateValues[col.instanceID]) works unchanged. Pivot cells always aggregate SOURCE
// rows — never child aggregates — so avg/median stay correct at every level. A path absent from
// a bucket produces no entry (the cell renders blank).
export function createPivotValueStamper(params: PivotStamperParams): PivotValueStamper {
  const { leafPathKeys, includedPaths, valueEntries, valueColumns, resolution, calculator } = params;
  const included = new Set(includedPaths);

  // Resolve each (path × value entry) to its stamping key and source column once, up front.
  const cellsByPath = new Map<string, { stampKey: string; col: Column; type: PivotValueEntry["type"] }[]>();
  for (const pathKey of includedPaths) {
    const cells: { stampKey: string; col: Column; type: PivotValueEntry["type"] }[] = [];
    for (const entry of valueEntries) {
      const col = valueColumns.get(entry.instanceID);
      if (!col) continue;
      const leafColId = pivotLeafColIdFromKey(pathKey, entry.colId, entry.type);
      cells.push({ stampKey: resolution.get(leafColId) ?? leafColId, col, type: entry.type });
    }
    cellsByPath.set(pathKey, cells);
  }

  return (bucketLeaves: IRowNode[]) => {
    const byPath = new Map<string, IRowNode[]>();
    for (const leaf of bucketLeaves) {
      const key = leafPathKeys.get(leaf.id);
      if (key == null || !included.has(key)) continue;
      let rows = byPath.get(key);
      if (!rows) byPath.set(key, rows = []);
      rows.push(leaf);
    }
    const out: { [key: string]: any } = {};
    for (const [pathKey, rows] of byPath) {
      for (const cell of cellsByPath.get(pathKey)!) {
        out[cell.stampKey] = calculator.calculateAggregate(cell.col, cell.type, rows);
      }
    }
    return out;
  };
}

// The synthesized single group row an ungrouped pivot displays (its aggregateValues are also the
// footer aggregate row's source). Stable id so expansion/selection maps never collide with data.
export const PIVOT_TOTAL_GROUP_ID = "g:__pivotTotal__";

export function buildPivotTotalRoot<Row = any>(
  leaves: IRowNode<Row>[],
  aggregateValues: { [key: string]: any } | undefined,
): IRowNode<Row> {
  return {
    id: PIVOT_TOTAL_GROUP_ID,
    data: { __group: true } as any,
    viewIndex: -1,
    selected: false,
    type: "group",
    isGroup: true,
    level: 0,
    isExpanded: false,
    expandable: false,
    children: leaves,
    childCount: leaves.length,
    groupKey: "Total",
    groupValue: "Total",
    aggregateValues,
  };
}
