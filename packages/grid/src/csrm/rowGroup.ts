import { Column } from "../column/column";
import { IRowNode } from "../interfaces/iRowNode";
import { SortModel } from "../interfaces/sort";
import { GroupSortMode } from "../interfaces/gridOptions";

// Placeholder group key used when a grouped column's value is null/undefined/empty.
export const BLANK_GROUP_KEY = "(Blanks)";

// Stable, position-independent id for a group node, derived from its key path (root → node).
// Because it depends only on content, the same group gets the same id across data refreshes, so
// per-group expansion state survives setRowData / transactions. The "g:" prefix guarantees no
// collision with data-row ids.
export function groupNodeId(path: string[]): string {
  return "g:" + path.map(encodeURIComponent).join("/");
}

export interface BuildGroupTreeParams<Row = any> {
  // Leaf nodes already filtered and sorted, in display order.
  leaves: IRowNode<Row>[];
  // Columns to group by, in grouping-level order (index 0 = top level).
  groupColumns: Column[];
  // Active leaf sort model. A sort on a grouping column also controls that group level's bucket
  // direction; grouping must not replace an explicit descending sort with its ascending fallback.
  sortModel?: SortModel;
  // Local keeps sorts at their own level; hierarchy propagates grouped sorts to ancestors; global
  // preserves first-seen bucket order for any non-current-level sort.
  groupSortMode?: GroupSortMode;
  // Expansion overrides keyed by group node id. Absent → falls back to defaultExpanded.
  expansion: Map<string, boolean>;
  // Levels expanded by default: 0 = none, N = first N levels, -1 = all.
  defaultExpanded: number;
  // Optional per-group aggregate computation over a group's full leaf-descendant set.
  computeAggregates?: (leaves: IRowNode<Row>[]) => { [key: string]: any } | undefined;
}

export interface GroupTreeResult<Row = any> {
  // Top-level group nodes (each with nested children).
  roots: IRowNode<Row>[];
  // Every group node created, keyed by id — lets the model resolve group ids for focus/selection.
  groupNodesById: Map<string, IRowNode<Row>>;
}

// Build a multi-level group tree from an ordered list of leaf nodes. Runs after filter + sort, so
// leaves keep the active sort order within each bucket. Group buckets use the grouping column's
// active sort direction when it has one, otherwise they fall back to ascending comparator order.
export function buildGroupTree<Row = any>(params: BuildGroupTreeParams<Row>): GroupTreeResult<Row> {
  const {
    leaves,
    groupColumns,
    sortModel,
    groupSortMode = "local",
    expansion,
    defaultExpanded,
    computeAggregates,
  } = params;
  const groupNodesById = new Map<string, IRowNode<Row>>();

  const isExpandedByDefault = (level: number): boolean =>
    defaultExpanded === -1 || level < defaultExpanded;

  const build = (
    nodes: IRowNode<Row>[],
    level: number,
    parentPath: string[],
  ): IRowNode<Row>[] => {
    const col = groupColumns[level];

    // Partition into buckets by group key, preserving first-seen order.
    const order: string[] = [];
    const buckets = new Map<string, { value: any; nodes: IRowNode<Row>[] }>();
    for (const node of nodes) {
      const rawValue = col.getValue(node);
      const key = rawValue == null || rawValue === "" ? BLANK_GROUP_KEY : String(rawValue);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { value: rawValue, nodes: [] };
        buckets.set(key, bucket);
        order.push(key);
      }
      bucket.nodes.push(node);
    }

    // An explicit grouping-column sort always controls this level. Otherwise local mode uses stable
    // ascending group-key order, while global mode may retain the sorted leaves' first-seen order.
    const comparator = col.getComparator();
    const collator = col.getCollator();
    const matchesColumn = (item: SortModel["items"][number], candidate: Column) =>
      item.col.instanceID === candidate.instanceID
      || item.col.colId === candidate.colId
      || item.col.key === candidate.key
      || item.key === candidate.colId
      || item.key === candidate.key;
    const groupSort = sortModel?.items.find(item => matchesColumn(item, col));
    const hasDescendantGroupSort = sortModel?.items.some(item =>
      groupColumns.slice(level + 1).some(groupCol => matchesColumn(item, groupCol))
    ) ?? false;
    const direction = groupSort?.dir === "desc" ? -1 : 1;
    // The leaves already carry the complete sort order. Retaining first-seen bucket order propagates
    // that order upward: hierarchy mode does so only for a sorted descendant grouping level, while
    // global mode does so for any active non-current-level sort.
    const preserveGlobalLeafOrder =
      !groupSort && (
        (groupSortMode === "hierarchy" && hasDescendantGroupSort)
        || (groupSortMode === "global" && (sortModel?.items.length ?? 0) > 0)
      );
    if (!preserveGlobalLeafOrder) {
      order.sort((a, b) => {
        const ba = buckets.get(a)!;
        const bb = buckets.get(b)!;
        if (comparator) {
          return comparator(ba.value, bb.value, ba.nodes[0], bb.nodes[0]) * direction;
        }
        return collator.compare(a, b) * direction;
      });
    }

    const lastLevel = level === groupColumns.length - 1;
    return order.map((key) => {
      const bucket = buckets.get(key)!;
      const path = [...parentPath, key];
      const id = groupNodeId(path);
      const children = lastLevel ? bucket.nodes : build(bucket.nodes, level + 1, path);
      const groupNode: IRowNode<Row> = {
        id,
        // Synthetic data so Column.getValue on any column is safe on a group row.
        data: { __group: true } as any,
        viewIndex: -1,
        selected: false,
        type: "group",
        isGroup: true,
        level,
        isExpanded: expansion.get(id) ?? isExpandedByDefault(level),
        children,
        childCount: bucket.nodes.length,
        groupKey: key,
        groupValue: bucket.value,
        aggregateValues: computeAggregates ? computeAggregates(bucket.nodes) : undefined,
      };
      groupNodesById.set(id, groupNode);
      return groupNode;
    });
  };

  const roots = groupColumns.length === 0 ? [] : build(leaves, 0, []);
  return { roots, groupNodesById };
}

// Pre-order flatten of a group tree into the flat display list: each group node, then (if expanded)
// its children. Collapsed subtrees are skipped. `viewIndex` is stamped as nodes are appended.
export function flattenGroupTree<Row = any>(roots: IRowNode<Row>[]): IRowNode<Row>[] {
  const out: IRowNode<Row>[] = [];
  const walk = (nodes: IRowNode<Row>[]) => {
    for (const node of nodes) {
      node.viewIndex = out.length;
      out.push(node);
      if (node.isGroup && node.isExpanded && node.children) {
        walk(node.children);
      }
    }
  };
  walk(roots);
  return out;
}
