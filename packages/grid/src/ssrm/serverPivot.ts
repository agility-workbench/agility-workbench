import { finishPivotDiscovery, PivotTrieNode } from "../csrm/pivot";
import { groupKeyForValue } from "../csrm/rowGroup";
import {
  appendPivotPathKey,
  PivotDiscovery,
  PivotRequestState,
  PivotValueEntry,
  pivotLeafColIdFromKey,
} from "../interfaces/pivot";
import { IServerSidePivot, IServerSidePivotField } from "../interfaces/serverSide";

export interface ServerPivotFieldsResult {
  /** The header the declared fields imply, ordered and capped exactly as client-side discovery. */
  discovery: PivotDiscovery;
  /** Generated value-leaf colId → the server's field, for the leaves kept after truncation. */
  fieldByColId: Map<string, string>;
  /** Fields dropped as malformed: an unrequested measure or the wrong number of `pivotKeys`. */
  ignoredCount: number;
}

/**
 * The pivot block of a server-side request: pivot column keys and one wire measure per value
 * entry, both keyed by column key (the core keys them by instance id).
 */
export function serializeServerPivot(pivot: PivotRequestState): IServerSidePivot {
  return {
    pivotBy: pivot.columns.map(col => col.key),
    values: pivot.valueEntries.map(entry => ({ key: entry.column.key, type: entry.type })),
    maxPivotColumns: pivot.maxPivotColumns,
  };
}

/**
 * Turn the fields a server declared into the discovery the core reconciles generated columns from
 * — the server-side counterpart of `discoverPivot`, which finds the same paths in the leaves
 * themselves. The server names the fields and the grid orders them: both row models end in
 * `finishPivotDiscovery`, so one pivot configuration gives one header order whichever model ran.
 *
 * A path the server declares for only some measures still gets a column per measure (as a path
 * found client-side does); its undeclared cells are blank.
 */
export function resolveServerPivotFields(
  fields: IServerSidePivotField[],
  pivot: PivotRequestState,
): ServerPivotFieldsResult {
  const { columns: pivotColumns, valueEntries, maxPivotColumns } = pivot;
  const entryFor = (field: IServerSidePivotField): PivotValueEntry | undefined =>
    valueEntries.find(entry => entry.column.key === field.valueKey && entry.type === field.aggregate);

  const rootChildren = new Map<string, PivotTrieNode>();
  // Encoded path key → (generated leaf colId → field) for every well-formed field.
  const fieldsByPath = new Map<string, Map<string, string>>();
  let ignoredCount = 0;
  for (const field of fields) {
    const entry = entryFor(field);
    const keys = Array.isArray(field.pivotKeys) ? field.pivotKeys : [];
    if (!entry || typeof field.field !== "string" || keys.length !== pivotColumns.length) {
      ignoredCount++;
      continue;
    }
    let level = rootChildren;
    let pathKey = "";
    for (const raw of keys) {
      const key = groupKeyForValue(raw);
      pathKey = appendPivotPathKey(pathKey, key);
      let node = level.get(key);
      if (!node) {
        node = { key, value: raw, children: new Map() };
        level.set(key, node);
      }
      level = node.children;
    }
    let byColId = fieldsByPath.get(pathKey);
    if (!byColId) fieldsByPath.set(pathKey, byColId = new Map());
    byColId.set(pivotLeafColIdFromKey(pathKey, entry.colId, entry.type), field.field);
  }

  const { discovery, includedPaths } = finishPivotDiscovery({
    rootChildren: [...rootChildren.values()],
    pivotColumns,
    valueEntries,
    maxPivotColumns,
  });

  const fieldByColId = new Map<string, string>();
  for (const pathKey of includedPaths) {
    for (const [colId, field] of fieldsByPath.get(pathKey) ?? []) fieldByColId.set(colId, field);
  }
  return { discovery, fieldByColId, ignoredCount };
}
