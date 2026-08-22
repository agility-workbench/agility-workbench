import { GridEventMap, GridEventName, Unsubscribe } from "../events/events";
import { ColumnState, GridId, IGridCore, RowData } from "./iGridCore";
import { ColDef } from "./column";
import { GridAction } from "../events/action";
import { CellRef, SelectionSnapshot } from "./selection";
import { IColumnModel } from "./iColumnModel";
import { IRowNode } from "./iRowNode";
import type { IBodyMenuAdapter } from "./iBodyMenuAdapter";
import type { IMenuAdapter } from "./iMenuAdapter";
import {
  GridOptions,
  QuickFilterMatchMode,
  RowPinnedPosition,
  RuntimeGridOptions,
  TreeDataKeyboardNavigationMode,
  TreeDataKeyboardNavigationOptions,
  UpdatableGridOptions,
} from "./gridOptions";
import { GridViewFilterState, GridViewState } from "./gridView";
import { SetFilterMode } from "./filter";
import { SetFilterSelection } from "../filter/setFilterCore";
import { RowTransaction, RowTransactionResult, ServerSideRefreshOptions } from "./iRowModel";
import { GridHistoryState } from "../core/historyModel";
import type { Column } from "../column/column";
import type { KeyboardShortcutInfo } from "../renderer/interaction/keyboardRouter";
import type { GridShortcut } from "../renderer/interaction/shortcutPolicy";

export type NavDir = "up" | "down" | "left" | "right";

/**
 * Where a row should end up when scrolled to. "auto" scrolls the least amount needed and leaves an
 * already-visible row where it is; the others place the row deliberately even when it is already on
 * screen. "top" means the top of the usable viewport — below any sticky group headers docked there.
 */
export type RowScrollPosition = "auto" | "top" | "middle" | "bottom";

/** Which rows/columns an export covers. */
export type ExportScope = "all" | "selection" | "selectedColumns";

/** The data-row segment currently being written to an Excel workbook. */
export type ExcelExportRowType = "body" | "pinnedTop" | "pinnedBottom";

/**
 * The intentionally small set of Excel cell styles supported by the built-in OOXML writer.
 * Colors, fills, borders, and arbitrary browser CSS are outside this contract.
 */
export interface ExcelExportCellStyle {
  /** Excel number-format code (for example `0.00%` or `yyyy-mm-dd`). */
  numFmt?: string;
  bold?: boolean;
  alignment?: {
    horizontal?: "left" | "center" | "right";
    vertical?: "top" | "middle" | "bottom";
    wrapText?: boolean;
  };
}

/** Context supplied for each real data cell written to an Excel workbook. */
export interface ExcelExportCellParams {
  /** Raw value resolved from the column before export customization. */
  value: unknown;
  /** Value after the column's value formatter, before export customization. */
  formattedValue: string;
  data: unknown;
  /** Zero-based index within the row segment identified by `rowType`. */
  rowIndex: number;
  rowType: ExcelExportRowType;
  column: Column;
}

/** A cell override returned by {@link ExportParams.processCellForExcel}. */
export interface ExcelExportCellResult {
  /** Replacement exported value. Omit to keep the grid-resolved value; `null` clears the cell. */
  value?: unknown;
  /** Style properties merge over the grid's default number format for this column. */
  style?: ExcelExportCellStyle;
}

export type ExcelExportCellProcessor = (
  params: ExcelExportCellParams,
) => ExcelExportCellResult | undefined;

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
  /**
   * Customize real data cells in Excel exports without changing grid data. Supports replacement
   * values plus number format, bold, and alignment. Applies to body and pinned rows; synthetic
   * group headers/subtotals and CSV output are unchanged.
   */
  processCellForExcel?: ExcelExportCellProcessor;
}

/**
 * Live-reconfiguration hooks provided by the renderer once it is attached (it owns the toolbar,
 * quick filter, tooltip layer, column panel, footer, pinned bands, and theme variables). Internal
 * wiring for {@link IGridAPI.updateGridOptions}: hosts call `updateGridOptions`, not this.
 */
export interface GridApiConfigController {
  setToolbarOptions: (options: GridOptions["toolbar"]) => void;
  setQuickFilterOptions: (options: GridOptions["quickFilter"]) => void;
  setTooltipOptions: (options: GridOptions["tooltip"]) => void;
  setColumnPanelOptions: (options: GridOptions["columnPanel"]) => void;
  setSavedViewsOptions: (options: GridOptions["savedViews"]) => void;
  setRowSelectionOptions: (options: GridOptions["rowSelection"]) => void;
  setPinnedRowOptions: (options: {
    pinnedTopRowData?: RowData[];
    pinnedBottomRowData?: RowData[];
    isRowPinned?: GridOptions["isRowPinned"];
    groupRowsSticky?: boolean;
  }) => void;
  togglePagination: (enabled: boolean) => void;
  setPaginationControls: (options: GridOptions["paginationControls"]) => void;
  setTheme: (theme: GridOptions["theme"]) => void;
  setIcons: (icons: GridOptions["icons"]) => void;
  setRuntimeOptions: (options: RuntimeGridOptions) => void;
  setServerSideDataSource: (dataSource: GridOptions["serverSideDataSource"]) => void;
  setServerSideAggregation: (source: GridOptions["serverSideAggregationSource"]) => void;
}

/**
 * Keyboard-shortcut hooks provided by the renderer once it is attached (it owns the keyboard
 * router). Internal wiring for {@link IGridAPI.registerShortcut} and
 * {@link IGridAPI.getKeyboardShortcuts}: hosts call those, not this.
 */
export interface GridApiShortcutController {
  register: (shortcut: GridShortcut) => () => void;
  getShortcuts: () => readonly KeyboardShortcutInfo[];
}

export interface IGridAPI {
  /** The underlying grid core (state + dispatch + event emission). */
  getCore(): IGridCore;

  /**
   * Reconfigure a mounted grid in place. Only the properties present in `options` change; a property
   * present with the value `undefined` is reset to the grid's default (that is how a callback such as
   * `getRowStyle` is removed). Object values replace wholesale — they are not deep-merged.
   *
   * This is the framework-neutral equivalent of changing a prop on the React or Angular wrapper, and
   * it preserves scroll position, selection, focus, and edit history:
   *
   * ```ts
   * api.updateGridOptions({ toolbar: { sorting: true }, zebraRows: false });
   * api.updateGridOptions({ getRowStyle: undefined });   // back to the default
   * ```
   *
   * Options that seed structure (`rowHeight`, `rowNumbers`, `rowModelType`, row identity) are not
   * updatable — see {@link UpdatableGridOptions}. Unknown keys are ignored with a warning.
   */
  updateGridOptions(options: UpdatableGridOptions): void;

  /**
   * Install (or, with `null`, remove) the column-menu adapter on a mounted grid — the deferred form
   * of `createGrid`'s `menuAdapter` option, for a host that does not know its adapter at creation
   * time. The adapter is consulted when a menu opens, so a swap needs no rebuild and takes effect on
   * the next open; a menu that is already open keeps the items and cleanup it was given.
   *
   * Most hosts should not need this. Application-owned items belong in `ColDef.columnMenu` (one
   * column) or `GridOptions.multiColumnMenu` (a selection), both of which run *before* the adapter.
   * An adapter earns its keep when items are rendered by a framework and must be torn down again —
   * that is what its `cleanup` return exists for, and why the React and Angular bindings use one.
   */
  registerMenuAdapter(adapter: IMenuAdapter | null): void;

  /**
   * Install (or, with `null`, remove) the body context-menu adapter on a mounted grid. Same timing
   * and same trade-off as {@link IGridAPI.registerMenuAdapter}: application-owned items belong in
   * `GridOptions.bodyContextMenu`, which is itself updatable via `updateGridOptions` and runs before
   * the adapter.
   */
  registerBodyMenuAdapter(adapter: IBodyMenuAdapter | null): void;

  /**
   * Register an application keyboard shortcut on this grid instance. It fires only while focus is
   * inside this grid (the listener lives on the grid root), below every built-in binding — or above
   * the non-blocking ones with `override: true`. Returns the disposer; registering is idempotent to
   * dispose twice, so framework cleanup (React StrictMode) is safe.
   *
   * Refused with a thrown error: reserved chords (Tab and Escape always; navigation keys while the
   * feature that claims them is on — see the error message for which switch frees the key),
   * `mod+alt+<printable>` chords (Windows AltGr), and a duplicate live `id` or duplicate
   * unconditional chord. A shortcut registered while a feature was off goes dormant if the feature
   * is later re-enabled, and wakes when it is disabled again.
   *
   * ```ts
   * const off = api.registerShortcut({
   *   id: "approve",
   *   chord: "mod+shift+y",
   *   label: "Approve the selected rows",
   *   run: () => approveRows(api.getSelection()),
   * });
   * ```
   */
  registerShortcut(shortcut: GridShortcut): () => void;

  /**
   * Every keyboard binding currently registered — built-ins and application shortcuts — innermost
   * scope first, as data for a shortcut-reference UI. Format each row's `chord` for the user with
   * `formatChord`. Pattern bindings (type-to-edit) appear without a `chord`.
   */
  getKeyboardShortcuts(): readonly KeyboardShortcutInfo[];

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

  /** Visit every row node that remains after filtering, before client-side sorting. */
  forEachNodeAfterFilter(callback: (node: IRowNode, idx: number) => void): void;
  /** Visit every row node that remains after filtering in its final sorted order. */
  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void;

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
  applyTransaction(tx: RowTransaction<RowData>): RowTransactionResult;
  /**
   * Mutate client-side rows immediately, then defer filter/sort/group/aggregate derivation and
   * rendering so nearby calls share one pass. Resolves after that pass with this call's own counts.
   */
  applyTransactionAsync(tx: RowTransaction<RowData>): Promise<RowTransactionResult>;
  /** Immediately finalize any pending asynchronous transactions. No-op when none are pending. */
  flushAsyncTransactions(): void;

  /** Set the quick-filter (global search) text. Client-side row model only. */
  setQuickFilter(text: string, opts?: { matchMode?: QuickFilterMatchMode; caseSensitive?: boolean }): void;
  /** Current quick-filter text ("" when inactive). */
  getQuickFilterText(): string;

  /* ----- Filtering ----- */
  /** Current per-column filters in serializable form (`colId` is the public ColDef colId). */
  getFilterModel(): GridViewFilterState[];
  /** Replace all column filters. Unknown colIds drop out; an empty array clears every filter.
   * Pagination follows `resetPageOn` (the current page is kept by default), row selection follows
   * `selectionPersistence`, and cell-range selection is always cleared. */
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

  /**
   * Reconfigure the two `treeData` fields that are not structural: the navigation mode and whether
   * the fixed Ctrl/Cmd+Shift+Space switch is enabled. Presence decides what changes, as with
   * `updateGridOptions`, so either can be set alone:
   *
   * ```ts
   * api.setTreeDataKeyboardNavigationOptions({ enableKeyboardNavigationModeSwitch: true });
   * ```
   *
   * This is the configuration-driven counterpart of `setKeyboardNavigationMode`: a mode change made
   * here reports `source: "options"` on `keyboardNavigationModeChanged`, whereas
   * `setKeyboardNavigationMode` reports `source: "api"` for an imperative switch. The switch takes
   * effect on the next keystroke — no rebuild. The rest of `treeData` decides the row shape and
   * cannot change on a mounted grid; the whole call is a no-op on a grid without `treeData`.
   */
  setTreeDataKeyboardNavigationOptions(options: TreeDataKeyboardNavigationOptions): void;

  /** Expand or collapse every group/tree node in one pass — a single view rebuild and repaint,
   * unlike dispatching one groupToggleExpand per node. No-op when the grid is not grouped. */
  setAllGroupsExpanded(expanded: boolean): void;

  /**
   * Every group / tree node currently in the model, at every level, in creation order. Empty when
   * the grid is not grouped. Group nodes are not visited by `forEachNodeAfterFilter*`, which walk
   * data rows; use this to address a group — for example to pin one with `setRowPinned`.
   */
  getGroupNodes(): IRowNode[];

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
   * pipeline (`onBeforeCellCommit`, then — only if the stored value actually changes —
   * `cellValueChanged` and one undo step; writing the value already present emits nothing and
   * records nothing).
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

  /**
   * Re-evaluate `getRowPresentation` for rendered body and pinned rows. Use after external state
   * captured by the callback changes; row-data transactions already repaint affected rows.
   */
  refreshRowPresentation(): void;

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
   * emits one `cellValueChanged {source:"edit"}` per cell whose stored value actually changed, and
   * the changed cells land as a **single** undo step — the programmatic counterpart to a
   * multi-cell paste. Vetoed and unchanged cells drop out of the undo step and the events; an
   * all-unchanged batch records nothing. Under `readOnlyEdit` nothing is written and nothing
   * enters history.
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
