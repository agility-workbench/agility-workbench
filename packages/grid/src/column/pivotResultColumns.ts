import { ColDef, ColumnType } from "../interfaces/column";
import { Column } from "./column";
import {
  PivotDiscovery,
  PivotPathNode,
  PivotValueEntry,
  pivotLeafColIdFromKey,
} from "../interfaces/pivot";
import { AggregateType } from "../interfaces/aggregate";
import { BLANK_GROUP_KEY } from "../csrm/rowGroup";

export interface BuildPivotResultColDefsParams {
  discovery: PivotDiscovery;
  // Pivot columns in level order — their value formatting names the generated group headers.
  pivotColumns: Column[];
  // Client overlay applied to every generated VALUE LEAF (widths, cellClass, formatter…). Group
  // headers are structural and take no overlay. Identity/behavior keys are forced afterwards, so
  // the overlay can never make a generated column editable, movable, or filterable.
  pivotResultColumnDef?: Partial<ColDef>;
}

// Forced parts lack `label` (composed at the call site), so they satisfy ColDef minus label.
type PivotInternalColDef = Omit<ColDef, "label"> & { __internalRole: "pivotResult"; __pinnable: false };

// Keys the overlay/projection can never override on a generated column.
function forcedLeafDef(colId: string) {
  return {
    colId,
    key: colId,
    children: undefined,
    sortable: true,
    filter: false as const,
    groupable: false,
    aggregatable: false,
    pivotable: false,
    editable: false,
    movable: false,
    hideable: false,
    // Column-scoped export of a generated leaf has no leaf values to export; whole-grid pivot
    // export (nested headers) is its own phase.
    exportable: false,
    suppressColumnPanel: true,
    // columnGroupShow deliberately omitted: absent = "always", so generated groups never grow
    // open/closed expanders.
    __internalRole: "pivotResult",
    __pinnable: false,
  } satisfies PivotInternalColDef;
}

function forcedGroupDef(colId: string) {
  return {
    colId,
    key: colId,
    sortable: false,
    filter: false as const,
    groupable: false,
    aggregatable: false,
    pivotable: false,
    editable: false,
    movable: false,
    hideable: false,
    // Column-scoped export of a generated leaf has no leaf values to export; whole-grid pivot
    // export (nested headers) is its own phase.
    exportable: false,
    suppressColumnPanel: true,
    // columnGroupShow deliberately omitted: absent = "always", so generated groups never grow
    // open/closed expanders.
    __internalRole: "pivotResult",
    __pinnable: false,
  } satisfies PivotInternalColDef;
}

// What a generated value cell holds: sums/averages/medians and counts are numbers regardless of
// the source type; min/max surface source values unchanged.
function aggregateOutputType(entry: PivotValueEntry): ColumnType {
  switch (entry.type) {
    case AggregateType.MIN:
    case AggregateType.MAX:
      return entry.column.type;
    default:
      return ColumnType.NUMBER;
  }
}

// Value-preserving aggregates inherit the source column's EXPLICIT formatter (a currency
// formatter should format the sum of currencies); counts are plain numbers and never inherit.
function inheritedFormatter(entry: PivotValueEntry): ColDef["valueFormatter"] | undefined {
  if (entry.type === AggregateType.COUNT || entry.type === AggregateType.DISTINCT_COUNT) return undefined;
  return entry.column.col.valueFormatter ?? undefined;
}

// A generated group header shows the pivot value: the pivot column's explicit formatter when it
// has one (fallback to the raw key if it throws on the synthetic row), otherwise the raw key.
// Blanks always render the blank label.
function groupLabel(col: Column | undefined, node: PivotPathNode): string {
  if (node.key === BLANK_GROUP_KEY) return node.key;
  if (col?.col.valueFormatter) {
    try {
      const formatted = col.formatValue(node.value, { data: {} } as any);
      if (formatted != null && formatted !== "") return formatted;
    } catch {
      // A formatter that needs real row context can't format a pivot value — use the key.
    }
  }
  return node.key;
}

/**
 * Build the generated pivot header as ColDefs: one nested group per discovered pivot value, one
 * value leaf per (deepest path × value entry). Ids are deterministic (path + source colId +
 * aggregate type), so reconciliation can reuse live Column instances across re-discoveries.
 */
export function buildPivotResultColDefs(params: BuildPivotResultColDefsParams): ColDef[] {
  const { discovery, pivotColumns, pivotResultColumnDef } = params;
  const { valueEntries } = discovery;
  if (valueEntries.length === 0) return [];

  // A source column carrying several aggregates disambiguates its leaves with the aggregate name.
  const colIdCounts = new Map<string, number>();
  for (const entry of valueEntries) colIdCounts.set(entry.colId, (colIdCounts.get(entry.colId) ?? 0) + 1);

  const leafDefs = (pathKey: string): ColDef[] =>
    valueEntries.map((entry) => ({
      type: aggregateOutputType(entry),
      valueFormatter: inheritedFormatter(entry),
      ...pivotResultColumnDef,
      ...forcedLeafDef(pivotLeafColIdFromKey(pathKey, entry.colId, entry.type)),
      label: (colIdCounts.get(entry.colId) ?? 0) > 1 ? `${entry.label} (${entry.type})` : entry.label,
    }));

  if (discovery.pivotColumnCount === 0) return leafDefs("");

  const walk = (node: PivotPathNode, level: number, prefix: string): ColDef => {
    const pathKey = prefix === "" ? encodeURIComponent(node.key) : prefix + "/" + encodeURIComponent(node.key);
    return {
      ...forcedGroupDef("pv:" + pathKey),
      label: groupLabel(pivotColumns[level], node),
      children: node.children.length > 0
        ? node.children.map(c => walk(c, level + 1, pathKey))
        : leafDefs(pathKey),
    };
  };

  return discovery.roots.map(r => walk(r, 0, ""));
}
