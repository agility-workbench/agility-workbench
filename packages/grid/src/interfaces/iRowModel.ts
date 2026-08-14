import { AggregateModel, AggregateScope } from "./aggregate";
import { Column } from "../column/column";
import { FilterModel } from "./filter";
import { IRowModelListener } from "./iRowModelListener";
import { IRowNode } from "./iRowNode";
import { SortModel } from "./sort";
import { GroupSortMode, QuickFilterMatchMode } from "./gridOptions";

export type RowModelType = "clientSide" | "serverSide";

/** Scope/behavior of a server-side data refresh (see IGridAPI.refreshServerSideData). */
export interface ServerSideRefreshOptions {
  /** Group path identifying the subtree to refresh (that parent's listing and every descendant
   * listing). Omitted = the whole store. Each entry is a grouped column key + raw group value. */
  groupKeys?: Array<{ key: string; value: any }>;
  /** True drops the affected rows and counts immediately (loading state, exact reload). False
   * (default) keeps current rows rendered while visible blocks refetch and swap in place;
   * off-screen blocks are dropped and lazily reload on scroll. */
  purge?: boolean;
}
export type RowDataChangeReason = "init" | "refresh" | "filter" | "quickFilter" | "sort" | "pagination" | "page" | "viewport" | "aggregateScope" | "aggregateModel" | "transaction" | "group";

export interface RowTransaction<Row = any> {
  add?: Row[];
  /**
   * Zero-based position in the underlying client-side row order at which new rows are inserted.
   * Omitted values append. The index is evaluated after removals in the same transaction; derived
   * sorting, filtering, grouping, and pagination may place the rows elsewhere in the displayed view.
   */
  addIndex?: number;
  update?: { rowId: string; row: Row }[];
  remove?: string[];
}

export interface RowTransactionResult {
  added: number;
  updated: number;
  removed: number;
}

/**
 * A row-level diff of an incoming `rowData` array against the rows already in the model, so a new
 * array reference can be applied as a transaction instead of a wholesale replacement. See
 * `IRowModel.diffRows`.
 */
export interface RowDataDiff<Row = any> extends RowTransaction<Row> {
  /** Row ids in the order the incoming array supplied them — the display order when unsorted. */
  order: string[];
}

export interface IRowModelRequestParams {
  readonly id: number;
  readonly reason: RowDataChangeReason;
  readonly sortModel: SortModel;
  readonly filterModel: FilterModel;
  readonly paginate: boolean;
  readonly range: { start: number; end: number };
  readonly loadRange?: { start: number; end: number };
  readonly aggregateScope: AggregateScope;
  readonly aggregates: AggregateModel[];
  readonly aggregateReason?: "model" | "scope" | "rows" | "columns" | "dataSource";
  readonly leafColumns: Column[];
  // Columns the rows are grouped by, in grouping-level order. Empty = no grouping.
  readonly groupColumns: Column[];
  // Whether non-grouped sorts only order leaves within groups or also reorder the group buckets.
  readonly groupSortMode: GroupSortMode;
  // When present, this request is a pure expand/collapse — the model updates expansion state and
  // re-flattens the view once, without rebuilding the group tree. Target one node via `groupId`
  // (omitted `expanded` toggles), a batch via `groupIds`, or every group node via `all` (batch
  // forms require an explicit `expanded`).
  readonly groupExpansion?: {
    groupId?: string;
    groupIds?: string[];
    all?: boolean;
    expanded?: boolean;
  };
  // Quick-filter (global search) state. Applied by the client-side model as a second predicate
  // ANDed with the column filters. Empty text disables it. Ignored by the server-side model.
  readonly quickFilter?: QuickFilterState;
}

export interface QuickFilterState {
  readonly text: string;
  readonly matchMode: QuickFilterMatchMode;
  readonly caseSensitive: boolean;
}

export interface IRowModel<Row = any> {
  readonly listener: IRowModelListener;

  getType(): RowModelType;
  isValid(): boolean;

  // data update
  setRows(rows: any[]): void;

  // Incremental add / update / remove of rows without a full data replacement. Node identity is
  // preserved for updated rows so renderers (e.g. change-flash) can detect deltas. Returns counts
  // of rows actually applied. The caller (core) is responsible for re-deriving the view afterwards.
  // `order`, when given, is the full set of row ids in the order the nodes should end up in and
  // takes precedence over `tx.addIndex`; it is used when the caller supplied a whole ordered array.
  applyTransaction(tx: RowTransaction, order?: string[]): RowTransactionResult;

  /**
   * Diff an incoming `rowData` array against the current nodes so a new array reference can be
   * applied as a transaction (preserving node identity, edit history and the page) instead of a
   * wholesale replacement. A row is "updated" only when its object reference differs — diffing
   * therefore assumes the caller produces new row objects for changed rows.
   *
   * Returns null when this model cannot diff and the caller must fall back to `setRows`: no stable
   * row id configured, or a data shape the diff does not cover. Pure — computes only, mutates
   * nothing.
   */
  diffRows?(rows: Row[]): RowDataDiff<Row> | null;

  // accessors for what the viewport needs
  getRowCount(): number;                    // total displayed (may be estimate)
  getViewCount(): number;                   // total in current view (after filter/sort/pagination)
  /**
   * Rows in the current view after filter/sort but BEFORE pagination — "how many rows are in this grid",
   * pages included. Both neighbours above answer something else: `getViewCount()` is one page and
   * `getRowCount()` is the raw node total, ignoring filtering. Needed because `aria-rowcount` must be the
   * full set while `aria-rowindex` counts absolutely across pages; a page size there puts row indices
   * past the declared count.
   */
  getViewTotalCount(): number;
  getRowNodeAt(index: number): IRowNode<Row> | undefined;
  getRowNodeAtViewIndex(displayIndex: number): IRowNode<Row> | undefined;

  // iteration
  forEachNode(callback: (node: IRowNode, idx: number) => void): void;
  forEachNodeAfterFilter(callback: (node: IRowNode, idx: number) => void): void;
  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void;

  // All synthetic group nodes in the current grouping (empty when not grouping). Used e.g. to size
  // columns to their per-group aggregate values.
  getGroupNodes(): IRowNode<Row>[];
  /** Root nodes of the current grouped/tree hierarchy, including data-bearing tree roots. */
  getHierarchyRoots?(): IRowNode<Row>[];

  // identity
  getRowNode(id: string): IRowNode<Row> | undefined;

  /** Whether the total row count is exact. The server-side model returns false while any listing
   * contributing to the flattened count is open-ended (no `totalRows` reported and end not yet
   * reached). Absent = always known (client-side model). */
  isTotalRowCountKnown?(): boolean;

  /**
   * Index of a row in the whole displayed view — after filter/sort/grouping but BEFORE pagination —
   * or undefined when it has no slot there (unknown id, excluded by the filter, inside a collapsed
   * group, or not loaded). Deliberately not `node.viewIndex`, which is page-local on some models
   * and absolute on others, and goes stale for rows that lost their slot; a caller that must decide
   * WHICH page a row lives on needs a page-independent answer.
   */
  getViewIndexInFullView?(rowId: string): number | undefined;

  /** View index of a group's last visible descendant (its own index when collapsed/empty),
   * answered from store metadata so it works when the rows themselves are not loaded. Absent on
   * models where every visible row is materialized (client-side) — callers scan rows instead. */
  getSubtreeEndViewIndex?(groupId: string): number | undefined;

  /** Root-first chain of loaded ancestor group nodes owning a view slot, excluding the slot's own
   * row. Works for server-side slots whose row data is not loaded (ancestors always are). Absent
   * on the client-side model. */
  getAncestorChainAtViewIndex?(viewIndex: number): IRowNode<Row>[];

  /** Server-side only: re-invoke the data source for the whole store or one group subtree.
   * `requestId` is a fresh core request id used for the resulting listener callbacks. */
  refreshServerSideData?(options: ServerSideRefreshOptions | undefined, requestId: number): Promise<boolean>;

  // in-place cell edit: mutate a single field of a row's data. Returns true if the row exists.
  setCellValue(rowId: string, key: string, value: any): boolean;

  applyRequest(params: IRowModelRequestParams): void;

  // aggregation
  setAggregateScope(scope: AggregateScope): void | Promise<void>;
  getAggregateValues(): Map<string, any>;

  // lifecycle
  destroy(): void;
}
