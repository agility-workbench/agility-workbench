import { AggregateKind, AggregateModel, AggregateScope } from "./aggregate";
import { ColDef } from "./column";
import { FilterType } from "./filter";
import { QuickFilterMatchMode } from "./gridOptions";
import { SortDir } from "./sort";

export interface IServerSideFilter {
  key: string;
  filters: Array<{
    type: FilterType;
    values: any;
    /** Set filters (in/notIn) only: the pinned user intent — "include" (only the listed values
     * pass, unknown/new values are hidden) or "exclude" (listed values are hidden, everything
     * else passes). Absent on filters driven purely by the menu. */
    mode?: "include" | "exclude";
  }>;
  join?: "and" | "or";
}

export interface IServerSideSort {
  key: string;
  dir: SortDir;
}

/** One level of the group path in a server-side request: the grouped column's key and the raw
 * group value at that level (null/undefined for the blank-values group — not the "(Blanks)"
 * display label), so servers can build WHERE clauses without reverse-engineering display keys. */
export interface IServerSideGroupKey {
  key: string;
  value: any;
}

/**
 * The parent whose children a tree-mode request asks for (`treeData: { mode: "server" }`).
 * `undefined` on the request means the root listing.
 */
export interface IServerSideTreeParent {
  /** The parent row's grid row id, from `getRowId`/`rowIdKey`. */
  id: string;
  /** Row ids from the root down to and including the parent. */
  path: string[];
  /** The parent's row object, exactly as the server returned it. */
  data: any;
}

/**
 * The grid's quick filter (global search) as the server should apply it: keep only rows where the
 * text matches the row's values, across the searchable columns, under `mode` — `"substring"` (the
 * whole text appears inside some cell), `"multiTerm"` (every whitespace-separated term appears
 * somewhere in the row) or `"wholeCell"` (some cell equals the text). Matching is case-insensitive
 * unless `caseSensitive` is true. Applied together with `filters` (AND), before grouping.
 */
export interface IServerSideQuickFilter {
  /** The search text exactly as typed (never empty or whitespace-only — then the field is absent). */
  text: string;
  mode: QuickFilterMatchMode;
  caseSensitive: boolean;
}

/**
 * The pivot a server-side request asks for (`pivotMode` on a server-side grid). Present only while
 * pivot mode is on; absent otherwise.
 *
 * Rows are still requested by `groupBy`/`groupKeys`, and a pivot never asks for leaf rows: the
 * deepest row-group level does not expand. With no row groups (`groupBy` empty) the request is for
 * the single grand-total row — return exactly one row.
 */
export interface IServerSidePivot {
  /** Pivot column keys in level order (outermost header level first). May be empty: then each
   * measure is one column at the root, with `pivotKeys: []` in `pivotFields`. */
  pivotBy: string[];
  /** The measures, one per (column key, aggregate type). A column may appear once per type. Empty
   * while no value is chosen yet: return the group rows with no pivot values on them. */
  values: AggregateModel[];
  /** The grid shows at most this many generated value columns and drops the rest past it, in
   * header order. A server may use it to stop enumerating pivot values early. */
  maxPivotColumns: number;
}

/**
 * One generated pivot value column, as the server names it. Declared in
 * {@link IServerSideResult.pivotFields}; each group row carries its value for the column under
 * `row[field]`.
 */
export interface IServerSidePivotField {
  /** The property a group row carries this column's value under. Any string unique within the
   * response; it is also the `key` a sort on this column is sent with. */
  field: string;
  /** The raw pivot values, one per `pivotBy` key in order (null for the blank value) — the same
   * raw-value convention as `groupKeys`. Empty when `pivotBy` is empty. */
  pivotKeys: any[];
  /** Key of the source value column (one of `pivot.values[].key`). */
  valueKey: string;
  /** The measure's aggregate type (the matching `pivot.values[].type`). */
  aggregate: AggregateKind;
}

export interface IServerSideRequest {
  /** Leaf-level column filters, applied before grouping at every level: a group exists only if it
   * has at least one matching leaf, and its aggregates/counts reflect filtered leaves only. */
  filters: IServerSideFilter[];
  /** Active sorts. A sort on a grouping column orders the group buckets at that level; sorts on
   * other columns order leaf rows within their group. Ordering must be deterministic per request —
   * the grid pages within a listing across multiple requests. */
  sorts: IServerSideSort[];
  /** Requested range, relative to the requested parent's children (see groupKeys). */
  startRow: number | undefined;
  endRow: number | undefined;
  /** Grouping column keys in level order. Empty = flat request (no grouping). */
  groupBy: string[];
  /** Path to the parent whose children are requested; empty = root. When groupKeys.length <
   * groupBy.length, return one row per group at column groupBy[groupKeys.length]; when equal,
   * return leaf rows within that path. */
  groupKeys: IServerSideGroupKey[];
  /** Aggregates to compute per group row, keyed by column key. Only sent (non-empty) when the
   * requested level is a group level and aggregates are configured. Put each aggregated value on
   * the group row under its own column key. */
  aggregates: AggregateModel[];
  /** Tree mode only (`treeData: { mode: "server" }`): the parent whose children are requested;
   * absent/undefined = the root listing. `startRow`/`endRow` are relative to that parent's
   * children and `totalRows` in the result is its immediate-children count. In tree mode
   * `groupBy`, `groupKeys`, and `aggregates` are always empty — the hierarchy is the rows'
   * own, not a column-value grouping. */
  treeParent?: IServerSideTreeParent;
  /** The active quick filter; absent when the search box is empty. A change of text, mode or case
   * sensitivity resets the block store and refetches, like a `filters` change. Under the
   * server-side model the quick filter always filters: the `"find"` behavior (highlight without
   * filtering) needs the rows in the browser and falls back to filtering here. */
  quickFilter?: IServerSideQuickFilter;
  /** The pivot, while pivot mode is on (see {@link IServerSidePivot}); absent otherwise. A change
   * of pivot columns, measures or row groups resets the block store and refetches. While pivoting,
   * `aggregates` is empty (the measures are in `pivot.values`), and a sort on a generated column is
   * sent with its pivot `field` as the `key` — order the group rows by that value. */
  pivot?: IServerSidePivot;
}

export interface IServerSideResult {
  /** Leaf rows, or — for a group-level request — one plain object per group with the group's value
   * under the grouped column's key and requested aggregates under their column keys. */
  rows: any[];
  /** Count of the requested parent's immediate children. Optional, but omitting it makes the
   * listing open-ended: the grid then infers the end from a short block (fewer rows than
   * requested), the total row/page count is provisional until then, and with pagination enabled
   * page boundaries drift as children load. Return it unless counting is genuinely prohibitive. */
  totalRows?: number;
  /** Dynamic schema. Honored on root requests only (no `groupKeys`, no `treeParent`). */
  columns?: ColDef[];
  schemaVersion?: string;
  /** Pivot mode only: every generated value column for the current filters — the WHOLE set,
   * whatever `startRow`/`endRow` asked for, since columns must not appear as rows are scrolled in.
   * Read on root-listing responses (no `groupKeys`); return it on each one. The grid orders the
   * header itself (`pivotComparator`, else the pivot column's comparator, blanks last), so array
   * order does not matter. Fields naming a measure that was not requested, or with the wrong
   * number of `pivotKeys`, are ignored. */
  pivotFields?: IServerSidePivotField[];
}

export interface IServerSideAggregationRequest {
  aggregates: AggregateModel[];
  aggregateScope: AggregateScope;
  filters: IServerSideFilter[];
  /** The active quick filter, as on {@link IServerSideRequest.quickFilter}; absent when empty. */
  quickFilter?: IServerSideQuickFilter;
  sorts: IServerSideSort[];
  startRow: number | undefined;
  endRow: number | undefined;
  /** Pivot mode only: the grand totals are per generated column. `aggregates` is then empty and
   * the measures are in `pivot.values`; return each total in `values` under its pivot field's
   * `field`, as declared on the rows' `pivotFields`. */
  pivot?: IServerSidePivot;
}

export interface IServerSideAggregationResult {
  /** Totals keyed by column key — or, while pivoting, by pivot `field`. */
  values: Record<string, any>;
}

export interface IServerSideGetRowsParams {
  request: IServerSideRequest;

  success: (result: IServerSideResult) => void;
  error: (error: any) => void;
}

export interface IServerSideAggregationParams {
  request: IServerSideAggregationRequest;

  success: (result: IServerSideAggregationResult) => void;
  error: (error: any) => void;
}

export interface IServerSideDataSource {
  getRows: (request: IServerSideGetRowsParams) => void | IServerSideResult | Promise<void | IServerSideResult>;

  getAggregates?: (request: IServerSideAggregationParams) => void | IServerSideAggregationResult | Promise<void | IServerSideAggregationResult>;
}
