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

/**
 * The label a tree row falls back to when the relationship mode supplies no path segment and the
 * app supplies no `getLabel`: the row's own `name`, then `label`, then its id. Shared with the
 * server-side tree store so both models name a row the same way.
 */
export function defaultLabel(row: any, id: string): string {
  const value = row?.name ?? row?.label ?? id;
  return value == null ? id : String(value);
}

/** `getLabel` if the app supplied one, else the path segment (path mode) or {@link defaultLabel}. */
export function labelFor<Row>(
  options: TreeDataOptions<Row>,
  node: Pick<IRowNode<Row>, "id" | "data">,
  pathLabel?: string,
): string {
  const custom = options.getLabel?.(node.data);
  if (custom != null) return String(custom);
  return pathLabel ?? defaultLabel(node.data, node.id);
}

/** How many offending ids/paths a duplicate warning names before it summarizes the rest. */
const WARN_LIST_LIMIT = 5;

function describeList(items: string[]): string {
  const shown = items.slice(0, WARN_LIST_LIMIT).join(", ");
  return items.length > WARN_LIST_LIMIT ? `${shown} and ${items.length - WARN_LIST_LIMIT} more` : shown;
}

/**
 * The client tree's duplicate-row warning: one `console.warn` per load that names the offending
 * ids (or paths) and how many rows were affected. Duplicates never throw — the first row keeps the
 * id or path; see {@link prepareTreeRows} and {@link buildTreeData} for what happens to the rest.
 */
function warnDuplicateIds(ids: string[], count: number): void {
  console.warn(
    `Tree data contains ${count} row(s) with a duplicate id: ${describeList(ids.map(id => JSON.stringify(id)))}. `
    + "The first row with each id is kept and later ones are dropped"
    + " (a dropped nested row's children stay, under the kept row).",
  );
}

// Duplicate-path rows already warned about, with the path they were warned for. A path-mode
// rebuild runs on every filter, sort and expansion change over the same row nodes, so warning per
// rebuild would repeat itself; a new load (new nodes) or a row whose path changed warns afresh.
const warnedDuplicatePath = new WeakMap<object, string>();

export interface PreparedTreeRows<Row> {
  rows: Row[];
  /** Direct parent relationships captured while flattening nested-children input. */
  nestedParents: Map<string, string | undefined>;
}

/**
 * Prepare one load of tree rows (`setRowData`, or a nested-children transaction's `add`): flatten
 * nested-children input, and drop duplicate ids in every mode.
 *
 * Duplicate ids never throw. The FIRST row with an id is kept and every later row with that id is
 * dropped, with one warning per call naming the ids and the number of rows dropped. In
 * nested-children mode a dropped row's own children are still visited, under the kept row (they
 * name the same parent id); the same row object listed twice is one duplicate, and its subtree is
 * not walked a second time. A parent cycle still throws — that is not a duplicate.
 */
export function prepareTreeRows<Row extends object>(
  rows: Row[],
  options: TreeDataOptions<Row>,
  getId: (row: Row) => string,
): PreparedTreeRows<Row> {
  const nestedParents = new Map<string, string | undefined>();
  const duplicateIds: string[] = [];
  let dropped = 0;
  const noteDuplicate = (id: string) => {
    dropped++;
    if (!duplicateIds.includes(id)) duplicateIds.push(id);
  };

  if (options.mode !== "children") {
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const row of rows) {
      const id = getId(row);
      if (seen.has(id)) { noteDuplicate(id); continue; }
      seen.add(id);
      out.push(row);
    }
    if (dropped > 0) warnDuplicateIds(duplicateIds, dropped);
    return { rows: out, nestedParents };
  }

  const out: Row[] = [];
  const seenObjects = new Set<object>();
  const active = new Set<object>();
  const seenIds = new Set<string>();

  const visit = (row: Row, parentId: string | undefined) => {
    if (active.has(row)) throw new Error("Tree data contains a cycle in nested children.");

    const id = getId(row);
    // The same object again: its subtree was already taken the first time.
    if (seenObjects.has(row)) { noteDuplicate(id); return; }
    seenObjects.add(row);

    // A different row reusing an id: drop it, keep walking its children under the kept row.
    const duplicate = seenIds.has(id);
    if (duplicate) {
      noteDuplicate(id);
    } else {
      seenIds.add(id);
      out.push(row);
      nestedParents.set(id, parentId);
    }
    active.add(row);

    const children = options.getChildren(row);
    if (children != null && !Array.isArray(children)) {
      throw new TypeError("treeData.getChildren must return an array, null, or undefined.");
    }
    for (const child of children ?? []) visit(child, id);
    active.delete(row);
  };

  for (const root of rows) visit(root, undefined);
  if (dropped > 0) warnDuplicateIds(duplicateIds, dropped);
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

  // prepareTreeRows already drops duplicate ids, and the row model turns a colliding add into an
  // update, so none should reach here; should one anyway, the first node keeps the id and the
  // rest stay out of the tree rather than taking the grid down.
  const byId = new Map<string, IRowNode<Row>>();
  const strayIds: string[] = [];
  let strayCount = 0;
  const unique: IRowNode<Row>[] = [];
  nodes.forEach(node => {
    if (byId.has(node.id)) {
      strayCount++;
      if (!warnedDuplicatePath.has(node)) {
        warnedDuplicatePath.set(node, node.id);
        if (!strayIds.includes(node.id)) strayIds.push(node.id);
      }
      return;
    }
    byId.set(node.id, node);
    unique.push(node);
    // Clear hierarchy fields from the previous build before rewiring the same stable data nodes.
    node.isTreeData = true;
    node.isGroup = false;
    node.type = "leaf";
    node.children = undefined;
    node.childCount = undefined;
    node.parentId = undefined;
    node.aggregateValues = undefined;
  });
  if (strayIds.length > 0) warnDuplicateIds(strayIds, strayCount);

  const specs = new Map<string, TreeSpec<Row>>();

  if (options.mode === "path") {
    const ownerByPath = new Map<string, IRowNode<Row>>();
    const pathsById = new Map<string, string[]>();

    // A path names one row. A later row with a path already taken does not own it: it is shown as
    // a leaf BESIDE the first row (same parent), and every descendant path hangs under the first.
    const duplicatePaths: string[] = [];
    let duplicateCount = 0;
    let warnNeeded = false;
    unique.forEach((node) => {
      const raw = options.getPath(node.data);
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new TypeError(`treeData.getPath must return a non-empty array (row "${node.id}").`);
      }
      const path = raw.map(segment => String(segment));
      const key = pathKey(path);
      pathsById.set(node.id, path);
      const owner = ownerByPath.get(key);
      if (owner) {
        duplicateCount++;
        const label = `${key} (row ${JSON.stringify(node.id)}, first held by row ${JSON.stringify(owner.id)})`;
        if (!duplicatePaths.includes(label)) duplicatePaths.push(label);
        if (warnedDuplicatePath.get(node) !== key) {
          warnedDuplicatePath.set(node, key);
          warnNeeded = true;
        }
        return;
      }
      ownerByPath.set(key, node);
    });
    if (warnNeeded) {
      console.warn(
        `Tree data contains ${duplicateCount} row(s) with a duplicate path: ${describeList(duplicatePaths)}. `
        + "The first row with a path keeps it (and its children); each later one is shown as a leaf beside it.",
      );
    }

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

    unique.forEach((node) => {
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
    unique.forEach((node) => {
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

  // Global sorting already computed the desired data-row order; siblings take it locally, each by
  // its OWN rank, so a parent's position never depends on its children (a parent "Z" with a child
  // "A" still sorts after a sibling "B" ascending). A node with no rank of its own — a synthetic
  // path ancestor (no row data to compare), or a real ancestor the filters dropped that stays only
  // to reach a matching descendant (the rank covers filtered rows only) — takes the earliest rank
  // among its children, so it sits where its first visible child would.
  const rankCache = new Map<string, number>();
  const rank = (node: IRowNode<Row>): number => {
    const cached = rankCache.get(node.id);
    if (cached != null) return cached;
    let best = node.isGroup ? undefined : sortRank.get(node.id);
    if (best == null) {
      best = Number.MAX_SAFE_INTEGER;
      for (const child of node.children ?? []) best = Math.min(best, rank(child));
    }
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
