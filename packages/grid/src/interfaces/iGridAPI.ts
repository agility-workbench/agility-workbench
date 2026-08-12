import { GridEventMap, GridEventName, Unsubscribe } from "../events/events";
import { ColumnState, GridId, IGridCore, RowData } from "./iGridCore";
import { ColDef } from "./column";
import { GridAction } from "../events/action";
import { CellRef, SelectionSnapshot } from "./selection";
import { IColumnModel } from "./iColumnModel";
import { IRowNode } from "./iRowNode";
import {
  QuickFilterMatchMode,
  RowPinnedPosition,
  TreeDataKeyboardNavigationMode,
} from "./gridOptions";
import { GridViewFilterState, GridViewState } from "./gridView";
import { SetFilterMode } from "./filter";
import { SetFilterSelection } from "../filter/setFilterCore";
import { RowTransactionResult, ServerSideRefreshOptions } from "./iRowModel";
import { GridHistoryState } from "../core/historyModel";

export type NavDir = "up" | "down" | "left" | "right";

/**
 * Where a row should end up when scrolled to. "auto" scrolls the least amount needed and leaves an
 * already-visible row where it is; the others place the row deliberately even when it is already on
 * screen. "top" means the top of the usable viewport — below any sticky group headers docked there.
 */
export type RowScrollPosition = "auto" | "top" | "middle" | "bottom";

/** Which rows/columns an export covers. */
export type ExportScope = "all" | "selection" | "selectedColumns";

/** Options for a programmatic CSV/Excel export (all optional). */
export interface ExportParams {
  /** "all" (default) exports the full view; "selection" a cell range; "selectedColumns" the picked columns. */
  scope?: ExportScope;
  /** Output filename. Auto-derived (e.g. "grid-all.xlsx") when omitted; the extension is enforced. */
  fileName?: string;
  /** Restrict the export to these column instanceIDs / colIds / keys. */
  columnIds?: string[];
  /** Include the (hierarchical) header rows. Defaults to true. */
  includeHeaders?: boolean;
  /** For a row-grouped grid: "tree" (group headers + subtotals, default) or "leaves" (flat rows). */
  groupMode?: "tree" | "leaves";
}

export interface IGridAPI {
  /** The underlying grid core (state + dispatch + event emission). */
  getCore(): IGridCore;

  /** Dispatch an action to the core. */
  dispatch(action: GridAction): void;

  /** Subscribe to core events. */
  on<E extends GridEventName>(event: E, handler: (ev: GridEventMap[E]) => void): Unsubscribe;

  /** Get the current column state. */
  getColumnState(): ColumnState[];

  /**
   * Restore a previously-captured column layout (widths / pinning / visibility / order). By default
   * merges over the current columns: unknown colIds are ignored and columns absent from `state` keep
   * their place. Pass `opts.defaultState` to apply a fallback to those absent columns instead — e.g.
   * `{ hidden: true }` for an exact restore that hides everything not in the saved view (including
   * columns added since it was captured).
   */
  applyColumnState(state: ColumnState[], opts?: { defaultState?: Partial<ColumnState> }): void;

  /** Read-only access to the column model (columns, leaves, lookups). */
  getColumnModel(): IColumnModel;

  /** Set the column definitions. */
  setColumnDefs(defs: ColDef[]): void;

  /** Set the row data. */
  setRowData(rows: RowData[]): void;

  /**
   * Server-side row model only: re-invoke the data source because the server's data changed —
   * distinct from a plain redraw. `groupKeys` scopes the refresh to one group subtree (that
   * parent's listing and everything below it); omitted = the whole store. `purge: true` drops the
   * affected rows and counts immediately (loading state); the default keeps current rows rendered
   * while blocks in the current view refetch and swap in place, and drops off-screen blocks to
   * reload lazily on scroll. Expansion state is kept either way. Resolves true if a refresh was
   * issued.
   */
  refreshServerSideData(options?: ServerSideRefreshOptions): Promise<boolean>;

  /** Replace the application-owned rows in the frozen top band. */
  setPinnedTopRowData(rows: RowData[]): void;
  /** Replace the application-owned rows in the frozen bottom band. */
  setPinnedBottomRowData(rows: RowData[]): void;
  /**
   * Explicitly mirror a displayed row-model node in a frozen band. Generated group node ids are
   * supported; pass null to unpin. When an {@link GridOptions.isRowPinned} callback is configured,
   * null is remembered as an explicit unpin override for that row — it wins over the callback until
   * the row is pinned again. The original row remains in the hierarchy.
   */
  setRowPinned(rowId: GridId, position: RowPinnedPosition | null): void;

  /** Apply a transaction to the row data (client-side row model only). Returns what was actually
   * applied; all-zero counts on the server-side row model or when nothing matched. */
  applyTransaction(tx: { add?: RowData[]; update?: { rowId: GridId; row: RowData }[]; remove?: GridId[] }): RowTransactionResult;

  /** Set the quick-filter (global search) text. Client-side row model only. */
  setQuickFilter(text: string, opts?: { matchMode?: QuickFilterMatchMode; caseSensitive?: boolean }): void;
  /** Current quick-filter text ("" when inactive). */
  getQuickFilterText(): string;

  /* ----- Filtering ----- */
  /** Current per-column filters in serializable form (`colId` is the public ColDef colId). */
  getFilterModel(): GridViewFilterState[];
  /** Replace all column filters. Unknown colIds drop out; an empty array clears every filter.
   * Applying filters resets to page 1 and clears the selection. */
  setFilterModel(filters: GridViewFilterState[]): void;
  /** Add or replace the filter for one column, keeping every other column's filter. */
  addFilterModel(filter: GridViewFilterState): void;
  /** Remove one column's filter. No-op (no page reset, no selection clear) when it has none. */
  removeFilterModel(colId: string): void;

  /* ----- Set filter (columns with `filter: "set"`) -----
   * Intent-level helpers: express WHICH values are checked/unchecked and the set filter manages
   * its own storage. Inputs are resolved against the column's value universe (so a string "5"
   * finds the numeric 5 the rows hold); null addresses the "(Blanks)" bucket. All methods are
   * async because a column's filter values may come from an async source; with the default
   * from-rows universe they resolve immediately. On non-set columns they warn and no-op. */
  /** The column's full value universe (distinct values as shown in the menu; null = blanks). */
  getSetFilterValues(colId: string): Promise<unknown[]>;
  /** Intent-level view of the column's active set filter, or null when it has none (all values
   * visible). `mode` says what happens to values that arrive after filtering: "exclude" shows
   * them, "include" hides them. */
  getSetFilterState(colId: string): Promise<SetFilterSelection | null>;
  /** Check one value (make rows with it visible). No-op if already checked. */
  checkSetFilterValue(colId: string, value: unknown): Promise<void>;
  /** Uncheck one value (hide rows with it). No-op if already unchecked. */
  uncheckSetFilterValue(colId: string, value: unknown): Promise<void>;
  /**
   * Replace the column's set filter wholesale. With `mode: "include"` (default) `values` is the
   * checked set — everything else, including values that arrive later, is hidden. With
   * `mode: "exclude"` `values` is the unchecked set — everything else, including later arrivals,
   * stays visible. An explicit mode is pinned: subsequent menu or helper toggles keep the
   * representation instead of optimizing it to the shorter list.
   */
  setSetFilterValues(colId: string, values: unknown[], opts?: { mode?: SetFilterMode }): Promise<void>;

  /** Current tree-data keyboard navigation mode. Non-tree grids always report "grid". */
  getKeyboardNavigationMode(): TreeDataKeyboardNavigationMode;
  /** Switch tree-data keyboard navigation immediately. No-op for "hierarchy" on non-tree grids. */
  setKeyboardNavigationMode(mode: TreeDataKeyboardNavigationMode): void;

  /** Expand or collapse every group/tree node in one pass — a single view rebuild and repaint,
   * unlike dispatching one groupToggleExpand per node. No-op when the grid is not grouped. */
  setAllGroupsExpanded(expanded: boolean): void;

  /** Capture serializable column, grouping, sorting, filtering, expansion, and page state. */
  captureViewState(): GridViewState;
  /** Apply a captured view through the grid's existing state actions. */
  applyViewState(state: GridViewState, opts?: { columns?: "exact" | "merge" }): void;

  /* ----- Selection ----- */
  /** Focus a single cell (view index + global leaf column index). */
  setFocusedCell(viewIdx: number, colIdx: number): void;
  /** Start a range selection at a cell (collapses to a single cell). */
  selectRange(viewIdx: number, colIdx: number): void;
  /** Extend the current range's active corner to a cell. */
  extendRangeTo(viewIdx: number, colIdx: number): void;
  /** Move the selection by keyboard-style navigation. */
  navigate(dir: NavDir, opts?: { extend?: boolean; jump?: "edge" | "block" | "page"; pageRows?: number }): void;
  /** Jump the active cell to a grid corner (Ctrl+Home / Ctrl+End). */
  navigateToCorner(corner: "topLeft" | "bottomRight", opts?: { extend?: boolean }): void;
  /** Select the entire grid. */
  selectAll(): void;
  /** Select/toggle a row by view index. */
  selectRow(viewIdx: number, mode?: "replace" | "toggle" | "range"): void;
  /** Select/toggle a column by colId. */
  selectColumn(colId: string, mode?: "replace" | "toggle"): void;
  /** Clear all or part of the selection. */
  clearSelection(what?: "all" | "range" | "rows" | "columns"): void;
  /** Read the current selection snapshot. */
  getSelection(): SelectionSnapshot;
  /** Underlying data objects of the currently-selected rows. */
  getSelectedRows(): unknown[];
  /** Currently-selected row nodes (unloaded / no-longer-present rows are omitted). */
  getSelectedNodes(): IRowNode[];
  /** Select every selectable data row in the select-all scope — the whole filtered set by
   * default, or the current page under `selectAllScope: "page"`. Skips group rows. */
  selectAllRows(): void;
  /** Clear the row selection. */
  deselectAllRows(): void;
  /** Whether every selectable data row in the select-all scope is currently selected. */
  areAllRowsSelected(): boolean;
  /**
   * Programmatic row selection by stable row id — for an external selection owner driving the
   * grid. "set" (default) replaces the selection; "add"/"remove" adjust it. Unknown or
   * non-selectable ids are dropped (client-side row model). Emits selectionChanged reason "api".
   */
  selectRowsById(rowIds: GridId[], mode?: "set" | "add" | "remove"): void;

  /* ----- Editing ----- */
  /** Begin editing a cell. No-op if the column is not editable or the cell doesn't exist. */
  startEditingCell(cell: CellRef): void;
  /** Commit the current edit with the given raw value (passed through the column's valueParser). */
  stopEditing(value: unknown): void;
  /** Cancel the current edit without changing the cell value. */
  cancelEditing(): void;
  /** The cell currently being edited, or null when not editing. */
  getEditingCell(): CellRef | null;
  /**
   * Set a cell's value directly, bypassing the inline editor but running the rest of the write
   * pipeline (`onBeforeCellCommit`, `cellValueChanged`, one undo step).
   *
   * A **string** `value` is treated as user-style input and passed through the column's
   * `valueParser`; any other type is taken as the final stored value. So `setCellValue(cell, 99)`
   * stores the number 99 even on a column with no parser, while `setCellValue(cell, "99")` gives the
   * parser its say.
   */
  setCellValue(cell: CellRef, value: unknown): void;

  /* ----- Scrolling ----- */
  /**
   * Scroll a row into view, doing whatever it takes to give it a slot first: collapsed group/tree
   * ancestors are expanded, and under pagination the grid pages to the row (one page change, so
   * `paginationChanged` fires once). Returns whether the row ended up visible — false means it has
   * no slot at all: an unknown id, a row the current filter excludes, or, on the server-side row
   * model, a row that is not loaded (the server owns the row order, so the grid cannot work out
   * which page an unloaded row is on — reveal it by paging or refiltering to it instead).
   *
   * A row mirrored into a frozen top/bottom band is already on screen; the band scrolls if it is
   * itself taller than the space it has.
   */
  ensureRowVisible(rowId: GridId, opts?: { position?: RowScrollPosition }): boolean;
  /**
   * Scroll a column into view horizontally. Returns whether the column is visible afterwards —
   * false for an unknown colId or a hidden column (including one hidden by a collapsed column
   * group; this does not expand groups). Leading, left- and right-pinned columns are always in
   * view, so revealing one is a no-op that reports true.
   */
  ensureColumnVisible(colId: string): boolean;
  /**
   * Scroll a cell into view on both axes — {@link ensureRowVisible} plus
   * {@link ensureColumnVisible}. Returns true only when both halves succeeded; the successful half
   * still scrolls (a row that exists is revealed even if the colId is bogus).
   */
  ensureCellVisible(cell: CellRef, opts?: { position?: RowScrollPosition }): boolean;

  /* ----- Tooltips ----- */
  /** Programmatically show the tooltip for a body cell (bypasses the hover delay). No-op if the
   * cell resolves nothing to show or the grid isn't rendered yet. */
  showTooltip(cell: CellRef): void;
  /** Hide any visible tooltip. */
  hideTooltip(): void;

  /* ----- ActionFrame ----- */
  /** Open the persistent ActionFrame (frame + form popover) on a body cell. Closes any open editor
   * or previously-open frame (only one at a time). No-op on a group row / missing cell. */
  openActionFrame(cell: CellRef): void;
  /** Close any open ActionFrame. */
  closeActionFrame(): void;
  /** The cell with an open ActionFrame, or null. */
  getActionFrameCell(): CellRef | null;

  /* ----- Clipboard ----- */
  /** Copy the current selection to the clipboard as TSV. */
  copySelection(): void;
  /** Copy the current selection as TSV, then clear its editable cells. */
  cutSelection(): void;
  /** Paste the clipboard's first cell into the active cell (runs the column's valueParser). */
  paste(): Promise<void>;

  /* ----- Undo / redo ----- */
  /** Undo the last cell-edit step (single edit, paste, or cut). */
  undo(): void;
  /** Redo the last undone step. */
  redo(): void;
  /** Whether there is a step to undo. */
  canUndo(): boolean;
  /** Whether there is a step to redo. */
  canRedo(): boolean;
  /**
   * Undo/redo stack snapshot — `canUndo`/`canRedo` plus the depth of each stack. The same payload
   * the `historyChanged` event carries, for reading the state on demand (initial toolbar render)
   * rather than reacting to it.
   */
  getHistoryState(): GridHistoryState;
  /** Clear the undo/redo history. */
  clearHistory(): void;
  /**
   * Write many cells in one step. Each value runs the full write pipeline for its own destination
   * (the column's `valueParser`, then `onBeforeCellCommit`, which can transform or veto that cell),
   * emits one `cellValueChanged {source:"edit"}`, and the batch lands as a **single** undo step —
   * the programmatic counterpart to a multi-cell paste. Vetoed cells drop out of the write, the
   * undo step, and the events. Under `readOnlyEdit` nothing is written and nothing enters history.
   *
   * Values follow the same string-vs-typed rule as {@link setCellValue}, per cell.
   */
  setCellValues(edits: { cell: CellRef; value: unknown }[]): void;
  /**
   * Run `fn` with every cell write inside it coalesced into a **single** undo step, so a bulk
   * programmatic update (a loop of `setCellValue` calls, or several batches) undoes as one user
   * action instead of N. Returns whatever `fn` returns.
   *
   * Synchronous only: writes made after `fn` returns — inside a promise, timer, or event handler it
   * schedules — fall outside the group and record normally. Nested scopes inherit the outermost
   * mode, so a `withUndoGroup` helper called inside `withoutUndoHistory` stays suppressed.
   */
  withUndoGroup<T>(fn: () => T): T;
  /**
   * Run `fn` with undo recording suppressed — writes apply and emit their normal events, but
   * nothing enters history and the user's undo stack is left exactly as it was. For applying
   * external changes the user did not make (op-protocol reconciliation, server pushes, recomputed
   * derived columns), which should not be undoable as if they were the user's own edits.
   *
   * `applyTransaction` never enters undo history and needs no scope; this is for the cell-write
   * paths (`setCellValue`, `setCellValues`) that do. Same synchronous/nesting rules as
   * {@link withUndoGroup}.
   */
  withoutUndoHistory<T>(fn: () => T): T;

  /* ----- Export ----- */
  /**
   * Download the grid as a CSV file. No-op until the grid is rendered (the exporter is wired by the
   * renderer on attach).
   */
  exportDataAsCsv(params?: ExportParams): void;
  /** Download the grid as an Excel (.xlsx) file. No-op until the grid is rendered. */
  exportDataAsExcel(params?: ExportParams): void;
  /**
   * Return the CSV text for the current state + params WITHOUT downloading — for programmatic export
   * (upload, custom filename dialog, further processing). "" before the grid is rendered or when
   * there's nothing to export.
   */
  getDataAsCsv(params?: ExportParams): string;
  /**
   * Return the raw .xlsx bytes (Uint8Array) for the current state + params WITHOUT downloading — so
   * the caller decides what to do (stream to a server, encrypt/password-protect, wrap in a Blob,
   * upload, etc.). Empty Uint8Array before the grid is rendered or when there's nothing to export.
   */
  getDataAsExcel(params?: ExportParams): Promise<Uint8Array>;

  destroy(): void;
}
