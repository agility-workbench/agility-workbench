import { AggregateModel, AggregateScope } from "./aggregate";
import { ColDef } from "./column";
import { FilterType } from "./filter";
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
  /** Dynamic schema. Honored on root requests only (groupKeys empty). */
  columns?: ColDef[];
  schemaVersion?: string;
}

export interface IServerSideAggregationRequest {
  aggregates: AggregateModel[];
  aggregateScope: AggregateScope;
  filters: IServerSideFilter[];
  sorts: IServerSideSort[];
  startRow: number | undefined;
  endRow: number | undefined;
}

export interface IServerSideAggregationResult {
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
