import { IRowNode } from "../interfaces/iRowNode";
import { TreeDataOptions } from "../interfaces/gridOptions";

const PATH_NODE_PREFIX = "t:path:";

function encodePath(path: readonly string[]): string {
  return path.map(encodeURIComponent).join("/");
}

function syntheticPathId(path: readonly string[]): string {
  return PATH_NODE_PREFIX + encodePath(path);
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function defaultLabel(row: any, id: string): string {
  const value = row?.name ?? row?.label ?? id;
  return value == null ? id : String(value);
}

function labelFor<Row>(
  options: TreeDataOptions<Row>,
  node: IRowNode<Row>,
  pathLabel?: string,
): string {
  const custom = options.getLabel?.(node.data);
  if (custom != null) return String(custom);
  return pathLabel ?? defaultLabel(node.data, node.id);
}

export interface PreparedTreeRows<Row> {
  rows: Row[];
  /** Direct parent relationships captured while flattening nested-children input. */
  nestedParents: Map<string, string | undefined>;
}

/**
 * Flatten nested-children input once at ingestion time. Path and parent-reference modes already
 * consume flat arrays and pass through unchanged.
 */
export function prepareTreeRows<Row extends object>(
  rows: Row[],
  options: TreeDataOptions<Row>,
  getId: (row: Row) => string,
): PreparedTreeRows<Row> {
  const nestedParents = new Map<string, string | undefined>();
  if (options.mode !== "children") return { rows: rows.slice(), nestedParents };

  const out: Row[] = [];
  const seenObjects = new Set<object>();
  const active = new Set<object>();
  const seenIds = new Set<string>();

  const visit = (row: Row, parentId: string | undefined) => {
    if (active.has(row)) throw new Error("Tree data contains a cycle in nested children.");
    if (seenObjects.has(row)) throw new Error("Tree data contains the same row object more than once.");

    const id = getId(row);
    if (seenIds.has(id)) throw new Error(`Tree data contains duplicate row id "${id}".`);
    seenIds.add(id);
    seenObjects.add(row);
    active.add(row);
    out.push(row);
    nestedParents.set(id, parentId);

    const children = options.getChildren(row);
    if (children != null && !Array.isArray(children)) {
      throw new TypeError("treeData.getChildren must return an array, null, or undefined.");
    }
    for (const child of children ?? []) visit(child, id);
    active.delete(row);
  };

  for (const root of rows) visit(root, undefined);
  return { rows: out, nestedParents };
}

interface TreeSpec<Row> {
  id: string;
  node: IRowNode<Row>;
  parentId?: string;
}

export interface BuildTreeDataParams<Row> {
  nodes: IRowNode<Row>[];
  options: TreeDataOptions<Row>;
  nestedParents: Map<string, string | undefined>;
  /** Data-row ids that passed the active column and quick filters. */
  includedIds: Set<string>;
  /** Rank after applying the active sort model. */
  sortRank: Map<string, number>;
  expansion: Map<string, boolean>;
  defaultExpanded: number;
  onMissingParent?: (rowId: string, parentId: string) => void;
}

export interface TreeDataResult<Row> {
  roots: IRowNode<Row>[];
  expandableNodesById: Map<string, IRowNode<Row>>;
}

/**
 * Normalize path, parent-reference, and nested-children relationships into one node tree. Actual
 * rows stay ordinary data rows even when they have children; only missing path ancestors are
 * synthetic group rows.
 */
export function buildTreeData<Row extends object>(
  params: BuildTreeDataParams<Row>,
): TreeDataResult<Row> {
  const {
    nodes,
    options,
    nestedParents,
    includedIds,
    sortRank,
    expansion,
    defaultExpanded,
    onMissingParent,
  } = params;

  const byId = new Map<string, IRowNode<Row>>();
  nodes.forEach(node => {
    if (byId.has(node.id)) throw new Error(`Tree data contains duplicate row id "${node.id}".`);
    byId.set(node.id, node);
    // Clear hierarchy fields from the previous build before rewiring the same stable data nodes.
    node.isTreeData = true;
    node.isGroup = false;
    node.type = "leaf";
    node.children = undefined;
    node.childCount = undefined;
    node.parentId = undefined;
    node.aggregateValues = undefined;
  });

  const specs = new Map<string, TreeSpec<Row>>();

  if (options.mode === "path") {
    const ownerByPath = new Map<string, IRowNode<Row>>();
    const pathsById = new Map<string, string[]>();

    nodes.forEach((node) => {
      const raw = options.getPath(node.data);
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new TypeError(`treeData.getPath must return a non-empty array (row "${node.id}").`);
      }
      const path = raw.map(segment => String(segment));
      const key = pathKey(path);
      if (ownerByPath.has(key)) {
        throw new Error(`Tree data contains duplicate path ${key}.`);
      }
      ownerByPath.set(key, node);
      pathsById.set(node.id, path);
    });

    // Materialize missing prefixes as synthetic ancestors.
    for (const path of pathsById.values()) {
      for (let length = 1; length < path.length; length++) {
        const prefix = path.slice(0, length);
        if (ownerByPath.has(pathKey(prefix))) continue;
        const id = syntheticPathId(prefix);
        if (specs.has(id)) continue;
        const node: IRowNode<Row> = {
          id,
          data: { __tree: true } as Row,
          viewIndex: -1,
          selected: false,
          type: "group",
          isGroup: true,
          isTreeData: true,
          level: length - 1,
          isExpanded: false,
          groupKey: prefix[prefix.length - 1],
          groupValue: prefix[prefix.length - 1],
          treeKey: prefix[prefix.length - 1],
        };
        specs.set(id, { id, node });
      }
    }

    nodes.forEach((node) => {
      const path = pathsById.get(node.id)!;
      node.treeKey = labelFor(options, node, path[path.length - 1]);
      const parentPath = path.slice(0, -1);
      const parentOwner = ownerByPath.get(pathKey(parentPath));
      const parentId = parentPath.length === 0
        ? undefined
        : parentOwner?.id ?? syntheticPathId(parentPath);
      specs.set(node.id, { id: node.id, node, parentId });
    });

    // Parent links for synthetic prefixes are known only after all real path owners are indexed.
    for (const spec of specs.values()) {
      if (!spec.node.isGroup) continue;
      const encoded = spec.id.slice(PATH_NODE_PREFIX.length);
      const path = encoded.split("/").map(decodeURIComponent);
      const parentPath = path.slice(0, -1);
      const owner = ownerByPath.get(pathKey(parentPath));
      spec.parentId = parentPath.length === 0
        ? undefined
        : owner?.id ?? syntheticPathId(parentPath);
    }
  } else {
    nodes.forEach((node) => {
      node.treeKey = labelFor(options, node);
      const requestedParent = options.mode === "parent"
        ? options.getParentId(node.data)
        : nestedParents.get(node.id);
      const parentId = requestedParent == null ? undefined : String(requestedParent);
      specs.set(node.id, { id: node.id, node, parentId });
    });
  }

  // Missing parent references are recoverable: keep the orphan visible at the root.
  for (const spec of specs.values()) {
    if (spec.parentId != null && !specs.has(spec.parentId)) {
      if (onMissingParent) onMissingParent(spec.id, spec.parentId);
      else console.warn(`Tree data parent "${spec.parentId}" for row "${spec.id}" was not found; rendering it as a root.`);
      spec.parentId = undefined;
    }
  }

  // Reject self-links and longer parent cycles before mutating children.
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string) => {
    const current = state.get(id) ?? 0;
    if (current === 1) throw new Error(`Tree data contains a parent cycle involving row "${id}".`);
    if (current === 2) return;
    state.set(id, 1);
    const parentId = specs.get(id)?.parentId;
    if (parentId != null) visit(parentId);
    state.set(id, 2);
  };
  for (const id of specs.keys()) visit(id);

  const fullRoots: IRowNode<Row>[] = [];
  for (const spec of specs.values()) {
    if (spec.parentId == null) {
      fullRoots.push(spec.node);
      continue;
    }
    const parent = specs.get(spec.parentId)!.node;
    (parent.children ??= []).push(spec.node);
    spec.node.parentId = parent.id;
  }

  const expandedByDefault = (level: number) =>
    defaultExpanded === -1 || level < defaultExpanded;
  const expandableNodesById = new Map<string, IRowNode<Row>>();

  const decorate = (node: IRowNode<Row>, level: number): number => {
    node.level = level;
    const children = node.children ?? [];
    let descendantRows = node.isGroup ? 0 : 1;
    for (const child of children) descendantRows += decorate(child, level + 1);
    if (children.length > 0) {
      node.isExpanded = expansion.get(node.id) ?? expandedByDefault(level);
      node.childCount = descendantRows - (node.isGroup ? 0 : 1);
      expandableNodesById.set(node.id, node);
    } else {
      node.isExpanded = false;
    }
    return descendantRows;
  };
  fullRoots.forEach(root => decorate(root, 0));

  // Global sorting already computed the desired data-row order. Ordering siblings by the earliest
  // sorted descendant applies that order locally while also giving synthetic path nodes a rank.
  const rankCache = new Map<string, number>();
  const rank = (node: IRowNode<Row>): number => {
    const cached = rankCache.get(node.id);
    if (cached != null) return cached;
    const own = node.isGroup ? Number.MAX_SAFE_INTEGER : (sortRank.get(node.id) ?? Number.MAX_SAFE_INTEGER);
    let best = own;
    for (const child of node.children ?? []) best = Math.min(best, rank(child));
    rankCache.set(node.id, best);
    return best;
  };
  const sortTree = (siblings: IRowNode<Row>[]) => {
    siblings.sort((a, b) => rank(a) - rank(b));
    for (const node of siblings) if (node.children) sortTree(node.children);
  };
  sortTree(fullRoots);

  // Keep every matching data node plus the ancestors required to reach it. Synthetic nodes never
  // match by themselves. Clone child arrays through pruning so hidden branches do not leak into the
  // flattened view, while the full expandable-node map keeps expansion state stable across filters.
  const prune = (node: IRowNode<Row>): IRowNode<Row> | undefined => {
    const keptChildren = (node.children ?? [])
      .map(prune)
      .filter((child): child is IRowNode<Row> => !!child);
    const selfMatches = !node.isGroup && includedIds.has(node.id);
    if (!selfMatches && keptChildren.length === 0) return undefined;
    node.children = keptChildren.length > 0 ? keptChildren : undefined;
    return node;
  };

  const roots = fullRoots
    .map(prune)
    .filter((node): node is IRowNode<Row> => !!node);
  for (const root of roots) delete root.parentId;
  return { roots, expandableNodesById };
}
