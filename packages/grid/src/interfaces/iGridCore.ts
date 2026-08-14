import {
  GridEventHandler,
  GridEventName,
  GridEventPaginationChangedParams,
  Unsubscribe,
} from "../events/events";
import { SortModel } from "./sort";
import { FilterModel } from "./filter";
import { IRowModel, RowDataChangeReason, RowTransaction, RowTransactionResult, ServerSideRefreshOptions } from "./iRowModel";
import { IColumnModel } from "./iColumnModel";
import { GridAction } from "../events/action";
import { CellPos, CellRef, SelectionRange, SelectionSnapshot } from "./selection";
import { AggregateModel, AggregateScope } from "./aggregate";
import {
  GridOptions,
  GroupDisplayType,
  GroupSortMode,
  RowPinnedPosition,
  RowPresentation,
  RuntimeGridOptions,
  TreeDataKeyboardNavigationMode,
} from "./gridOptions";
import { IServerSideDataSource } from "./serverSide";
import { ColDef } from "./column";
import { Column } from "../column/column";
import { IRowNode } from "./iRowNode";

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

  /** Subscribe to core events. */
  on<E extends GridEventName>(event: E, handler: GridEventHandler<E>): Unsubscribe;

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

  /** Returns cell value (raw). */
  getCellValue(rowId: GridId, colId: ColId): unknown;

  /** Returns cell display string (formatted). */
  getCellDisplayValue(rowId: GridId, colId: ColId): string;

  /* ----- Models via facade getters (optional but handy) ----- */
  getSortModel(): SortModel;
  getFilterModel(): FilterModel;
  /** Current quick-filter (global search) text. Empty string when inactive. */
  getQuickFilterText(): string;
  getAggregateModel(): AggregateModel[];
  getAggregateScope(): AggregateScope;
  getRowGroupColumns(): Column[];
  /** Change how grouped rows are displayed without rebuilding the grid instance. */
  setGroupDisplayType(groupDisplayType: GroupDisplayType): void;
  /** Change whether non-grouped sorts can reorder group buckets. */
  setGroupSortMode(groupSortMode: GroupSortMode): void;
  /** Change whether group rows can be selected without rebuilding the grid instance. */
  setGroupRowsSelectable(groupRowsSelectable: boolean): void;
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
  isCellInActiveSelection(viewIdx: number, colIdx: number, rowId: string, colId: string): boolean;
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
