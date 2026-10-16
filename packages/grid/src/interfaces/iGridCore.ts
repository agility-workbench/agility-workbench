import {
  GridEventHandler,
  GridEventMap,
  GridEventName,
  GridEventPaginationChangedParams,
  Unsubscribe,
} from "../events/events";
import { SortDir, SortModel } from "./sort";
import { FilterModel } from "./filter";
import { IRowModel, RowDataChangeReason, RowTransaction, RowTransactionResult, ServerSideRefreshOptions } from "./iRowModel";
import { IColumnModel } from "./iColumnModel";
import { GridAction } from "../events/action";
import { CellPos, CellRef, SelectionRange, SelectionSnapshot } from "./selection";
import { AggregateModel, AggregateScope, ColumnAggregate } from "./aggregate";
import { PivotResultColumnDescriptor } from "./pivot";
// Type-only: gridView.ts imports ColumnState from here, so this pair must never emit a runtime
// import cycle.
import type { GridPivotStateLayers } from "./gridView";
import type { QuickFilterFindState } from "./find";
import {
  GridOptions,
  GroupDisplayType,
  GroupSortMode,
  QuickFilterBehavior,
  QuickFilterMatchMode,
  RowPinnedPosition,
  RowPresentation,
  RuntimeGridOptions,
  TreeDataKeyboardNavigationMode,
} from "./gridOptions";
import { IServerSideDataSource } from "./serverSide";
import { ColDef } from "./column";
import { Column } from "../column/column";
import { IRowNode } from "./iRowNode";
import type { GroupCellValue } from "../core/groupCellValue";

export type GridId = string;
export type ColId = string;

export type RowData = unknown;

export interface ColumnState {
  colId: ColId;
  widthPx?: number;
  pinned?: "left" | "right" | null;
  hidden?: boolean;
  order?: number; // leaf order
  selected?: boolean; // for column selection (e.g. for menu)
  /**
   * The column's sort direction; `null` when it is not sorted. `api.getColumnState()` always
   * reports it. On `api.applyColumnState()` an entry applies it only when the field is present:
   * a direction sorts the column, `null` clears its sort, and an absent field leaves it alone.
   */
  sort?: SortDir | null;
  /**
   * The column's position in the multi-column sort — its index in `api.getSortModel()`, 0 sorting
   * first — or `null` when it is not sorted. On apply it places the entries that set a `sort`;
   * entries without one are appended after the rest of the model, in array order.
   */
  sortIndex?: number | null;
}

/* ---------- Read-only view of derived state for renderer ---------- */

export interface ViewportInfo {
  scrollTopPx: number;
  scrollLeftPx: number;
  rowHeightPx: number;
  overscanRowCount: number;
}

export interface RenderCell {
  rowId: GridId;
  colId: ColId;
  // display value is what the renderer can put in the cell fast
  display: string;
  // raw can be useful for edit start etc.
  value: unknown;
}

export interface RenderRow {
  rowId: GridId;
  displayedIndex: number;
}

export interface GridSnapshot {
  viewport: ViewportInfo;
  displayedRowCount: number;
  visibleLeafColIds: ColId[]; // includes pinned handling as you define
  focusedCell?: CellRef;
  selectedRowIds?: GridId[];
  // optional: selection range if you implement it
  selectionRange?: SelectionRange;
}

/* ---------- Core interface ---------- */

export interface IGridCore {
  /** Stable grid id (useful if multiple grids exist). */
  readonly id: string;

  getOptions(): Readonly<GridOptions>;

  /** Dispatch an action (from renderer and/or API). */
  dispatch(action: GridAction): void;

  /**
   * Run `fn` once the dispatch in progress has finished — synchronously, before `dispatch` returns,
   * and once however many times it was asked for (dedup is by function identity, so pass a stable
   * reference). For a listener whose response to a change is expensive and idempotent: one mutation
   * can emit several events, and this collapses the response into a single run once the state has
   * settled. Outside a dispatch it runs `fn` immediately.
   */
  afterDispatch(fn: () => void): void;

  /** Subscribe to core events. */
  on<E extends GridEventName>(event: E, handler: GridEventHandler<E>): Unsubscribe;

  /**
   * Deliver an event to its subscribers. State changes go through `dispatch`, whose handlers emit
   * their own events; this is for the API's batch operations that drive a model directly (sizing
   * several columns at once) and must announce the result as ONE event rather than one per column.
   */
  emit<E extends GridEventName>(eventType: E, args: GridEventMap[E]): void;

  /** Read-only snapshot (useful to renderer to initialize). */
  getSnapshot(): GridSnapshot;

  setColumnDefsFromProps(colDefs?: ColDef[] | null): void;

  /* ----- Derived read APIs renderer will need (hot paths) ----- */
  getRowModel(): IRowModel;
  getColumnModel(): IColumnModel;

  /** Resolve the application-owned presentation/state for one logical row. */
  resolveRowPresentation(
    row: IRowNode,
    rowIndex: number,
    rowPinned?: RowPinnedPosition,
  ): RowPresentation | undefined;

  /** Returns rowId for a displayed index (post filter/sort/group pipeline). */
  getRowIdAtViewIndex(displayedIndex: number): GridId | null;

  /** Returns the current page-local slot for a rowId; null when it is not on the rendered page
   * (unknown, filtered/collapsed, unloaded, or on another page). */
  getViewIndexForRowId(rowId: GridId): number | null;

  /**
   * Expand a row's collapsed ancestors and page to it, then report the view slot it occupies (with
   * the frozen band when it is pinned into one), or null when it has no slot at all. Does not
   * scroll — the renderer pairs this with the scroll half for `api.ensureRowVisible`.
   */
  revealRow(rowId: GridId): { viewIndex: number; rowPinned?: RowPinnedPosition } | null;

  /**
   * Fit every visible column to its content (header and cell values, group aggregates included).
   * Keeps user-resized widths and, unless `identifyComparators` is false, re-derives each column's
   * comparator from the data. Emits nothing; returns the instance ids whose width changed.
   */
  autosizeColumns(identifyComparators?: boolean): string[];
  /**
   * Fit one column (a group: each of its visible leaves) to its content, dropping any user-resized
   * width first. Resolves `colId` tolerantly (instance id, colId, key). Emits nothing; returns the
   * instance ids of the leaves it sized (empty for an unknown column).
   */
  autosizeColumn(colId: string): string[];

  /** Returns cell value (raw). */
  getCellValue(rowId: GridId, colId: ColId): unknown;

  /** Returns cell display string (formatted). */
  getCellDisplayValue(rowId: GridId, colId: ColId): string;

  /* ----- Models via facade getters (optional but handy) ----- */
  getSortModel(): SortModel;
  /** Whether a sort colId addresses a column that exists right now — including the internal ones a
   * user can sort (the auto-group column, a generated pivot column), which the public column
   * lookups deliberately do not hold. */
  canResolveSortColId(colId: string): boolean;
  getFilterModel(): FilterModel;
  /** Current quick-filter (global search) text. Empty string when inactive. */
  getQuickFilterText(): string;
  /** Whether the quick filter narrows the rows ("filter") or highlights matching cells ("find"). */
  getQuickFilterBehavior(): QuickFilterBehavior;
  /** The quick filter's live match settings (the option's defaults until changed at runtime). */
  getQuickFilterMatchSettings(): { matchMode: QuickFilterMatchMode; caseSensitive: boolean };
  /** The find behavior's live state — match count, active match. @see QuickFilterFindState */
  getFindState(): QuickFilterFindState;
  getAggregateModel(): AggregateModel[];
  /** The aggregate model keyed by public colId (the model keys by instanceID). */
  getAggregateModelByColId(): ColumnAggregate[];
  getAggregateScope(): AggregateScope;
  getRowGroupColumns(): Column[];
  /**
   * Whether this grid can pivot at all — false for the server-side row model (no pivot handling)
   * and for tree data. Fixed for the life of the grid: pivot affordances gate on it rather than
   * letting users reach `setPivotMode`'s refusal.
   */
  isPivotSupported(): boolean;
  getPivotMode(): boolean;
  /**
   * Pivot mode is on but no row group, pivot column or value is configured — the blank canvas a
   * fresh pivot sheet opens on. Nothing is displayed in this state: no columns (not even the
   * auto-group column) and no rows.
   */
  isPivotUnconfigured(): boolean;
  getPivotColumns(): Column[];
  /** The manual arrangement of the generated pivot columns, or null when the layout is canonical. */
  getPivotColumnOrder(): string[] | null;
  /** Change what dragging a generated pivot column does. Read live at drag time — no rebuild. */
  setPivotColumnMoveMode(mode: "measures" | "free"): void;
  /** Descriptors of the current generated pivot value columns, in header order. */
  getPivotResultColumns(): PivotResultColumnDescriptor[];
  /** The stashed pivot state layers: what pivot mode exits to, and what it re-enters with. */
  getPivotStateLayers(): GridPivotStateLayers;
  /** Replace both stashed pivot state layers (bookkeeping only — nothing displayed changes). */
  setPivotStateLayers(layers: GridPivotStateLayers): void;
  /** Change how grouped rows are displayed without rebuilding the grid instance. */
  setGroupDisplayType(groupDisplayType: GroupDisplayType): void;
  /** Change whether non-grouped sorts can reorder group buckets. */
  setGroupSortMode(groupSortMode: GroupSortMode): void;
  /** Change whether group rows can be selected without rebuilding the grid instance. */
  setGroupRowsSelectable(groupRowsSelectable: boolean): void;
  /** Change what group rows show as their count (`groupChildCount`); repaints the group rows. */
  setGroupChildCount(groupChildCount: GridOptions["groupChildCount"]): void;
  /**
   * The label a group row shows: its key, then the count `groupChildCount` resolves for it. The
   * one owner for every surface that writes a group row. `rowCount` overrides the node's own.
   */
  getGroupRowLabel(node: IRowNode, rowCount?: number): string;
  /**
   * What a group row's cell holds for `col`: its aggregate for that column, else the group label
   * on the group's label column, else its `groupValueGetter` result, else nothing. Precondition:
   * `node.isGroup` (a leaf gets the empty result).
   */
  getGroupCellValue(col: Column, node: IRowNode): GroupCellValue;
  /**
   * The raw value a cell holds, leaf or group: a leaf's `getValue`, a group row's group cell
   * value. The one place that chooses between the two rules.
   */
  getNodeCellValue(col: Column, node: IRowNode): unknown;
  /** Swap the per-row selection gate; prunes selected rows the new predicate disables. */
  setIsRowSelectable(isRowSelectable: GridOptions["isRowSelectable"]): void;
  /** Reconfigure row-selection mode and its checkbox column without rebuilding the grid. */
  setRowSelectionOptions(rowSelection: GridOptions["rowSelection"]): void;
  getKeyboardNavigationMode(): TreeDataKeyboardNavigationMode;
  setKeyboardNavigationMode(
    mode: TreeDataKeyboardNavigationMode,
    source?: "api" | "shortcut" | "options",
  ): void;
  setTreeDataKeyboardNavigationOptions(
    mode?: TreeDataKeyboardNavigationMode,
    enableModeSwitch?: boolean,
  ): void;
  /** Update behavior/presentation options that are supported after construction. */
  setRuntimeOptions(options: RuntimeGridOptions): void;
  setAggregateModel(aggregates: AggregateModel[]): void;
  setAggregateScope(scope: AggregateScope): void;

  /* ----- Selection reads (owned by core) ----- */
  getSelectionRange(): SelectionRange | null;
  getSelectionAnchor(): CellPos | null;
  getActiveCell(): CellPos | null;
  /**
   * Index of the column header holding the keyboard cursor, or null when the body holds it. The header is
   * row 0 of the grid for navigation, but its cursor is deliberately not a `CellPos`: it selects nothing
   * and cannot be edited or copied. Mutually exclusive with `getActiveCell()`.
   */
  getHeaderFocusColIdx(): number | null;
  /** Row node rendered at `rowIndex` of a pinned band, or null. Band-local indexing. */
  getDisplayedPinnedRow(position: "top" | "bottom", rowIndex: number): import("./iRowNode").IRowNode | null;
  /** Number of rows currently displayed in a pinned band. */
  getDisplayedPinnedRowCount(position: "top" | "bottom"): number;
  /** Locate a pinned band row by id, with its band position and band-local index. */
  getDisplayedPinnedRowRef(
    rowId: GridId,
  ): { node: import("./iRowNode").IRowNode; position: "top" | "bottom"; rowIndex: number } | null;
  /** Number of body-pinned rows displayed before `viewIndex` (used to offset body row positions). */
  getBodyPinnedRowCountBefore(viewIndex: number): number;
  /** Current pagination state (same payload the `paginationChanged` event carries). */
  getPaginationInfo(): GridEventPaginationChangedParams;
  getEditingCell(): CellRef | null;
  getActionFrameCell(): CellRef | null;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Undo/redo stack snapshot (same payload the `historyChanged` event carries, minus `reason`). */
  getHistoryState(): import("../core/historyModel").GridHistoryState;
  clearHistory(): void;
  /** Redirect undo recording for the duration of `fn`: coalesce every step into one entry
   * ("group") or keep them out of history ("skip"). Synchronous; nested scopes inherit the mode. */
  runInHistoryScope<T>(mode: "group" | "skip", fn: () => T): T;
  getSelectedColumnIds(): Set<string>;
  getSelectedRowIds(): Set<string>;
  getSelectedNodes(): unknown[];
  getSelectedRows(): unknown[];
  areAllRowsSelected(): boolean;
  selectAllRows(): void;
  deselectAllRows(): void;
  /** Programmatic row selection by stable row id ("set" replaces, "add"/"remove" adjust). */
  selectRowsById(rowIds: GridId[], mode?: "set" | "add" | "remove"): void;
  isCellInActiveSelection(viewIdx: number, colIdx: number, rowId: string, colId: string, rowPinned?: "top" | "bottom"): boolean;
  getSelectionSnapshot(resolveIds?: boolean): SelectionSnapshot;
  pruneColumnSelection(): void;
  clampSelectionToView(): void;

  refreshRows(reason?: RowDataChangeReason, range?: { start: number; end: number }): void;

  /** Client-side row model only: apply an add/update/remove transaction. Returns what was
   * actually applied; all-zero counts on the server-side row model or when nothing matched. */
  applyTransaction(tx: RowTransaction<RowData>): RowTransactionResult;
  /** Apply row mutations immediately and defer model derivation/rendering into a shared batch. */
  applyTransactionAsync(tx: RowTransaction<RowData>): Promise<RowTransactionResult>;
  /** Immediately finalize any pending asynchronous row transactions. */
  flushAsyncTransactions(): void;

  setServerSideDataSource(callback: IServerSideDataSource | null): void;
  setServerSideAggregationSource(callback: IServerSideDataSource["getAggregates"] | null): void;
  /** Server-side only: re-invoke the data source (whole store or one group subtree). */
  refreshServerSideData(options?: ServerSideRefreshOptions): Promise<boolean>;

  /** Ensure core releases resources (timers, subscriptions). Renderer/React calls on unmount. */
  destroy(): void;
}
