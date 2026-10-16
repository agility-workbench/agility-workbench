import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import { GridHistoryState } from "../core/historyModel";
import { RowDataChangeReason } from "@grid/interfaces/iRowModel";
import { ColId, GridId } from "../interfaces/iGridCore";
import type { IRowNode } from "../interfaces/iRowNode";
import { QuickFilterFindState } from "../interfaces/find";
import { CellRef, SelectionSnapshot } from "../interfaces/selection";
import { TreeDataKeyboardNavigationMode } from "../interfaces/gridOptions";

export type GridEventName =
  | "overlayShow"
  | "modelUpdated"
  | "viewportChanged"
  | "columnsChanged"
  | "columnWidthsChanged"
  | "cellsChanged"
  | "rowsChanged"
  | "aggregateChanged"
  | "selectionChanged"
  | "focusChanged"
  | "headerFocusChanged"
  | "editingChanged"
  | "cellValueChanged"
  | "historyChanged"
  | "filterChanged"
  | "quickFilterFindChanged"
  | "paginationChanged"
  | "cellClicked"
  | "rowClicked"
  | "cellDoubleClicked"
  | "rowDoubleClicked"
  | "tooltipShow"
  | "tooltipHide"
  | "actionFrameChanged"
  | "keyboardNavigationModeChanged"
  | "pivotChanged"
  | "pivotColumnLimitReached"
  | "error"
  | "rowGroupOpened"
  | "columnGroupOpened"
  | "firstDataRendered"
  | "rowDataUpdated"
  | "bodyScroll";

export type Unsubscribe = () => void;

export type GridEventOverlayShowParams = {
  overlayType: "loading" | "noRows" | "none";
};

export type GridEventModelUpdatedParams = {
  reason:
    | "init"
    | "rowData"
    | "transaction"
    | "filter"
    | "sort"
    | "group"
    | "pivot"
    | "columns"
    | "viewport"
    | "options"
    | "api";
  // row-model specific step hints (optional)
  step?: "filter" | "sort" | "group" | "pivot" | "all";
};

export type GridEventViewportChangedParams = {
  scrollTopPx: number;
  scrollLeftPx: number;
  viewportWidthPx: number;
  viewportHeightPx: number;

  rowHeightPx: number;
  overscanRowCount: number;

  firstRowIndex: number; // displayed index
  lastRowIndex: number; // displayed index (inclusive)
};

/**
 * Who caused a column change. `"user"` is a gesture made through the grid's own UI — a header
 * click, drag or resize, a column-menu or column-panel item, a toolbar control, a header keyboard
 * shortcut. `"api"` is everything else: `IGridAPI` calls, saved-view and column-state restores,
 * `columnDefs` / option updates, server-sent schemas, and the grid's own follow-up adjustments.
 * Persist column state on `"user"` changes to save what the user did without echoing the
 * application's own restores back into storage.
 */
export type ColumnChangeSource = "user" | "api";

export type GridEventColumnsChangedParams = {
  reason: "defs" | "state" | "pin" | "visibility" | "order" | "sort" | "filter" | "group" | "pivot" | "add";
  /** Public ColDef colIds of the affected columns. */
  changedColIds?: ColId[];
  /** Internal instance ids of the affected columns (unique; renderer-facing). */
  changedColInstanceIds?: string[];
  /** Whether a UI gesture (`"user"`) or anything else (`"api"`) made the change. */
  source: ColumnChangeSource;
};

export type GridEventColumnWidthsChangedParams = {
  /** Public colIds of the columns whose computedWidth changed. Empty = "all visible columns". */
  changedColIds: ColId[];
  /** Internal instance ids, parallel to `changedColIds` (unique; renderer-facing). */
  changedColInstanceIds: string[];
  /**
   * `false` while a user is still dragging a column's resize handle (one event per pointer move,
   * so layout can follow live); `true` for the change that settles — the trailing event when the
   * drag ends (carrying every column the drag resized), a double-click autosize, and every
   * width change that is not a drag in progress. Persist column state when this is `true`.
   */
  final: boolean;
  /**
   * As on `columnsChanged`: `"user"` when a UI gesture caused the change — a resize-handle drag, a
   * header double-click autosize, or the re-fit that follows a grouping change made in the UI;
   * `"api"` otherwise (API calls, state restores, autosize after data or font changes).
   */
  source: ColumnChangeSource;
};

export type GridEventRowsChangedParams = {
  // "state" / "pin" / "visibility" / "order": the column change of that name re-laid every row out.
  reason: "rowData" | "transaction" | "group" | "viewport" | "add" | "state" | "pin" | "visibility" | "order" | RowDataChangeReason;
  // displayed indices impacted (optional optimization)
  firstRowIndex?: number;
  lastRowIndex?: number;
  rowCount?: number;
  // row IDs impacted (optional optimization)
  changedRowIds?: GridId[];
};

export type GridEventAggregateChangedParams = {
  reason: "model" | "scope" | "rows" | "columns" | "dataSource";
  scope: AggregateScope;
  aggregateModel: AggregateModel[];
  valuesAvailable: boolean;
};

export type GridEventCellsChangedParams = {
  reason: "data" | "format" | "style" | "editCommit" | "refresh";
  rowIds: GridId[];
  /** Public ColDef colIds of the affected columns. */
  colIds: ColId[];
  /** Internal instance ids of the affected columns (unique; renderer-facing). */
  colInstanceIds: string[];
  // If true, renderer may want to recreate cell content (e.g. renderer changed)
  force?: boolean;
};

export type GridEventSelectionChangedParams = {
  // full current selection snapshot (see snapshot.kind for the active selection kind). Under a
  // server-side select-all it carries `selectAll: true` + `toggledRowIds` (the exclusions), and
  // `selectedRowIds` lists the loaded selected rows only.
  snapshot: SelectionSnapshot;
  /**
   * Row-id membership changes since the previous selectionChanged event. Under a server-side
   * select-all these compare LOADED selected rows; rows that load later while select-all is on
   * paint selected without a selectionChanged of their own.
   */
  delta: {
    added: GridId[];
    removed: GridId[];
  };
  reason?: "mouse" | "keyboard" | "api" | "model";
};

export type GridEventFocusChangedParams = {
  prev?: { rowId: GridId; colId: ColId; colInstanceId?: string; rowPinned?: "top" | "bottom" };
  /** `colId` is the public ColDef colId; `colInstanceId` the internal instance id. */
  next?: { rowId: GridId; colId: ColId; colInstanceId?: string; rowPinned?: "top" | "bottom" };
  // active cell position in its row section (for scroll-into-view; survives unloaded body rows)
  viewIdx?: number;
  colIdx?: number;
  rowPinned?: "top" | "bottom";
  // if focus moved due to keyboard navigation
  reason?: "mouse" | "keyboard" | "api";
};

/**
 * The header keyboard cursor moved. Separate from `focusChanged`: the two are mutually exclusive
 * positions, and a header cursor selects nothing, cannot be edited or copied, and is not clamped to the
 * row view.
 */
export type GridEventHeaderFocusChangedParams = {
  /** Index into the visible leaf columns, or undefined when the header no longer holds the cursor. */
  colIdx?: number;
  /** Public ColDef colId of the header holding the cursor. */
  colId?: string;
  /** Internal instance id of that column. */
  colInstanceId?: string;
  /** `"mouse"` only ever clears the cursor — a click that places the body cursor takes it out of the header. */
  reason?: "keyboard" | "api" | "mouse";
};

export type GridEventEditingChangedParams = {
  // "rejected" = an editor commit was refused — by `onBeforeCellCommit`, or by the column's parser
  // (its valueParser, or the built-in one for its type: "abc" into a number column): the editor
  // closes and the cell keeps its old value (no write, no undo entry, no cellValueChanged).
  state: "started" | "stopped" | "cancelled" | "committed" | "rejected";
  /** Normalized on emit: public colId + colInstanceId. */
  cell?: CellRef;
  // committed value (for committed); for rejected, the vetoed parsed value, or the refused text
  value?: unknown;
  // the cell's value before the commit (committed / rejected)
  oldValue?: unknown;
  // For state "started" via edit-on-typing: the printable character that opened the editor, so
  // the renderer can seed the editor with it.
  charPress?: string;
};

/**
 * What wrote the cell: an editor commit / `setCellValue`, a clipboard batch, a fill (the fill
 * handle or `Ctrl/Cmd+D` / `Ctrl/Cmd+R`), or history.
 */
export type CellValueChangeSource = "edit" | "paste" | "cut" | "clear" | "fill" | "undo" | "redo";

/**
 * A cell's stored value changed. Covers every write path — editor commits, `setCellValue`,
 * paste/cut/clear batches, and undo/redo — unlike `editingChanged`, which tracks the editor
 * lifecycle and only fires for interactive commits. Emitted only when the stored value actually
 * changes (SameValueZero, `Date`s by instant — the exported `valuesAreSame`): committing the value
 * a cell already holds emits nothing. Exceptions: under `readOnlyEdit` nothing is written, so
 * every accepted value is reported; undo/redo report the recorded transition, which can be a no-op
 * against externally-mutated row data. `oldValue`/`value` are the stored (parsed) forms; for undo
 * they are oriented in the direction of the write (`value` is what the cell now holds). On a
 * `valueGetter` column `oldValue` (getter output) can equal `value` (stored form) even though the
 * slot moved — the event firing is the change signal; do not filter by comparing the two fields.
 */
export type GridEventCellValueChangedParams = {
  /** Normalized on emit: public colId + colInstanceId. */
  cell: CellRef;
  oldValue: unknown;
  value: unknown;
  source: CellValueChangeSource;
};

/** What moved the undo/redo stacks. */
export type HistoryChangeReason =
  /** A step was recorded (an edit, a paste/cut/clear batch, an `setCellValues` write, or a closed undo group). */
  | "commit"
  /** A step was undone, moving it onto the redo stack. */
  | "undo"
  /** A step was redone, moving it back onto the undo stack. */
  | "redo"
  /** Both stacks were discarded — `clearHistory()` or a `rowData` replacement. */
  | "clear";

/**
 * The undo/redo stacks moved. Emitted only when they actually change, so a toolbar can bind its
 * undo/redo buttons to `canUndo`/`canRedo` without polling. Writes that never enter history — a
 * vetoed commit, anything under `readOnlyEdit`, `applyTransaction`, or a write inside
 * `withoutUndoHistory` — do not fire it, and a whole `withUndoGroup` scope fires once on exit.
 * `historyChanged` follows the `cellValueChanged`/`cellsChanged` events of the write that caused it.
 */
export type GridEventHistoryChangedParams = GridHistoryState & {
  reason: HistoryChangeReason;
};

/**
 * The effective row filter changed: a column-filter model edit (add/update/remove/set), a
 * quick-filter change, or a columnDefs update that dropped an active filter. The canonical filter
 * signal — fires for every path that used to require subscribing to both
 * `columnsChanged {reason:"filter"}` and `modelUpdated {reason:"filter"}` (both still fire for
 * back-compat). Emitted after the row model has re-derived the view: on the client-side row model,
 * `getPaginationInfo()` / row counts read inside a handler are post-filter; on the server-side row
 * model rows refetch asynchronously and land via `rowsChanged` / `paginationChanged`. The quick
 * filter is client-side only, so `source: "quickFilter"` never fires on the server-side row model.
 */
export type GridEventFilterChangedParams = {
  /** What changed the filter: a column-filter model edit, the quick filter, or a columnDefs update. */
  source: "filter" | "quickFilter" | "columns";
  /** Public ColDef colIds of the affected columns. Empty for `source: "quickFilter"`. */
  changedColIds: ColId[];
  /** Internal instance ids of those columns (unique; renderer-facing). */
  changedColInstanceIds: string[];
};

/**
 * The quick filter's find state changed (`quickFilter.behavior: "find"`) — the search text or the
 * case setting was edited (`reason: "query"`, which also covers switching behavior), the user
 * stepped to another match (`"navigate"`), or the rows/columns under the search moved and the
 * matches were re-counted (`"model"`).
 *
 * Fires only for the find behavior. A filtering quick filter reports through `filterChanged`
 * (`source: "quickFilter"`) as it always has.
 */
export type GridEventQuickFilterFindChangedParams = QuickFilterFindState & {
  reason: "query" | "navigate" | "model";
};

export type GridEventPaginationChangedParams = {
  paginationEnabled: boolean;
  pageIndex: number;
  pageSize: number;
  totalRowCount: number;
  totalPageCount: number;
  /** False while the total is provisional: a server-side listing has not reported `totalRows` and
   * its end has not been reached, so totalRowCount/totalPageCount may still grow as rows load.
   * Always true for the client-side row model. */
  totalRowCountKnown: boolean;
  pageSizes: number[];
};

/** `TData` is the row type (default `any`); it types `data` and `node`. */
export type GridEventCellClickedParams<TData = any> = {
  rowId: GridId;
  /** Public ColDef colId of the clicked column. */
  colId: ColId;
  /** Internal instance id of the clicked column. */
  colInstanceId: string;
  /** View index of the clicked row. */
  viewIdx: number;
  /** Global leaf-column index of the clicked cell. */
  colIdx: number;
  /** The clicked row's underlying data object (a placeholder on a client-side group row). */
  data: TData;
  /**
   * The clicked cell's raw value. On a group row there is no data row: this is the column's
   * aggregate, else the group label on the group's label column, else undefined.
   */
  value: unknown;
  /** The clicked row's node; absent only when the row is not loaded. */
  node?: IRowNode<TData>;
  /** Whether the clicked row is a group (summary) row. */
  isGroup: boolean;
  /** The originating DOM click event. */
  event: MouseEvent;
};

/** `TData` is the row type (default `any`); it types `data` and `node`. */
export type GridEventRowClickedParams<TData = any> = {
  rowId: GridId;
  /** View index of the clicked row. */
  viewIdx: number;
  /** The clicked row's underlying data object (a placeholder on a client-side group row). */
  data: TData;
  /** Whether the clicked row is a group (summary) row. */
  isGroup: boolean;
  /** The clicked row's node; absent only when the row is not loaded. */
  node?: IRowNode<TData>;
  /** The originating DOM click event. */
  event: MouseEvent;
};

/** Same shape as the click payload; `event` is the `dblclick` event. Named separately so the two
 * can diverge without breaking either. */
export type GridEventCellDoubleClickedParams<TData = any> = GridEventCellClickedParams<TData>;

/** Same shape as the click payload; `event` is the `dblclick` event. */
export type GridEventRowDoubleClickedParams<TData = any> = GridEventRowClickedParams<TData>;

export type GridEventTooltipParams = {
  /** Where the tooltip is anchored. */
  location: "body" | "header" | "ui";
  /** Public ColDef colId for body/header tooltips; null for grid UI tooltips. */
  colId: ColId | null;
  /** Internal instance id for body/header tooltips; null for grid UI tooltips. */
  colInstanceId?: string | null;
  /** Row id (body tooltips only; null for header tooltips). */
  rowId: GridId | null;
  /** Global leaf-column index (body tooltips; null for header tooltips). */
  colIdx: number | null;
  /** View index of the row (body tooltips; null for header tooltips). */
  viewIdx: number | null;
};

export type GridEventActionFrameParams = {
  /** Whether the frame opened or closed. */
  state: "opened" | "closed";
  /** The cell the frame is (or was) attached to. */
  cell: CellRef | null;
};

export type GridEventKeyboardNavigationModeChangedParams = {
  mode: TreeDataKeyboardNavigationMode;
  previousMode: TreeDataKeyboardNavigationMode;
  source: "api" | "shortcut" | "options";
};

/** Pivot mode toggled or the pivot column set changed. Structure changes to the GENERATED columns
 * (new pivot values discovered, values gone) ride `columnsChanged { reason: "pivot" }` instead. */
export type GridEventPivotChangedParams = {
  pivotMode: boolean;
  /** Public colIds of the pivot columns, in level order. */
  pivotColumns: ColId[];
};

/**
 * The truncation state of the generated pivot columns changed: a discovery started producing more
 * generated leaf columns than `maxPivotColumns` (the excess is truncated deterministically, first
 * columns in header order surviving), the number dropped changed, or truncation ended.
 *
 * Latched — it fires on change, not on every re-derivation, so it drives a notice directly: show
 * it while `limited`, update the count, take it down when `limited` turns false. Leaving pivot
 * mode reports `limited: false` too, since the generated columns go with it.
 */
export type GridEventPivotColumnLimitReachedParams = {
  /** Whether the generated columns are currently truncated. False = back under the limit. */
  limited: boolean;
  /** How many generated leaf columns were dropped. 0 when `limited` is false. */
  truncatedColumnCount: number;
  maxPivotColumns: number;
};

export type GridEventErrorParams = {
  /** Machine-readable kind of failure. A failed row-model request — the data source rejected it,
   * or the grid refused what it returned — is `"row_model_error"`. */
  code: string;
  message: string;
  /** What failed, when known: the value a data source passed to `error()`, or a
   * `ServerSideDataError` for a server-side tree block whose row ids break the contract —
   * `isServerSideDataError(details)` tells the two apart. */
  details?: unknown;
};

/**
 * Row groups or tree nodes were expanded or collapsed. One event per user gesture or API call,
 * after the view has been re-flattened (so `api.getDisplayedRowCount()` read in a handler is the
 * new count), listing only the nodes whose state actually changed — a call that changes nothing
 * emits nothing. `api.setAllGroupsExpanded(true)` over a hundred groups is one event with up to a
 * hundred ids.
 */
export type GridEventRowGroupOpenedParams = {
  /** Ids of the group / tree-parent rows whose expanded state changed. Never empty. */
  groupIds: string[];
  /** The state those rows are now in: `true` expanded, `false` collapsed. */
  expanded: boolean;
  /**
   * `"user"` for the group chevron (on a body or sticky group row) and the tree-data keyboard
   * shortcuts; `"api"` for `api.setAllGroupsExpanded` / `api.setGroupExpanded`, dispatched
   * `groupToggleExpand` / `groupSetExpanded` actions without a `source`, saved-view restores, and
   * the grid's own follow-ups (revealing a quick-filter find match or a row scrolled to by id).
   */
  source: "user" | "api";
};

/**
 * Column groups were opened or closed — the header expander, or `api.setColumnGroupState` /
 * `columnGroupStateSet` (saved-view restores included). Emitted after the header has been rebuilt,
 * once per direction: a state restore that opens two groups and closes one emits one
 * `expanded: true` event and one `expanded: false` event. Groups already in the requested state are
 * not listed, and a call that changes nothing emits nothing.
 */
export type GridEventColumnGroupOpenedParams = {
  /** Public colIds of the column groups whose open state changed. Never empty. */
  groupIds: ColId[];
  /** The state those groups are now in: `true` open, `false` closed. */
  expanded: boolean;
  /** `"user"` for the header expander (click or keyboard), `"api"` for everything else. */
  source: ColumnChangeSource;
};

/**
 * The body painted its first row. Fires exactly once per grid instance, after the first paint
 * that shows at least one loaded row (a data row or a group row): never for a grid that stays
 * empty, and later — when the rows arrive — for one created without data or waiting on a
 * server-side block.
 */
export type GridEventFirstDataRenderedParams = {
  /** Rows in the view at that moment, across all pages (`getPaginationInfo().totalRowCount`). */
  rowCount: number;
};

/**
 * What replaced or changed the row set: `"rowData"` a `setRowData` / `rowData` update (diffed or
 * replaced), `"transaction"` an `applyTransaction` or a flushed `applyTransactionAsync` batch,
 * `"serverSide"` a server-side block landing (first load, scroll, refresh, re-query) or a purging
 * `refreshServerSideData`. Named like {@link GridEventModelUpdatedParams.reason}.
 */
export type RowDataUpdatedReason = "rowData" | "transaction" | "serverSide";

/**
 * The row data changed: a new `rowData`, a transaction, or a server-side load. Emitted after the
 * view has been re-derived, so counts read in a handler are current. Sorting, filtering, grouping
 * and expansion move rows without changing the data and do not fire it; a transaction that
 * changes nothing does not fire it either.
 */
export type GridEventRowDataUpdatedParams = {
  reason: RowDataUpdatedReason;
  /** Rows in the view after the change, across all pages (`getPaginationInfo().totalRowCount`). */
  rowCount: number;
};

/**
 * The body scrolled. Fires on every scroll tick that moved the body — synchronously from the
 * browser's scroll event, ahead of the animation-frame repaint of the row window (rows read in a
 * handler may still be the previous window's). The header, the scrollbar strip and the body's
 * centre section mirror one another's horizontal position; one movement of any of them is one
 * event, and a tick that moves neither offset emits nothing.
 */
export type GridEventBodyScrollParams = {
  /** Vertical scroll offset of the body. */
  scrollTopPx: number;
  /** Horizontal scroll offset of the centre (unpinned) section. */
  scrollLeftPx: number;
  /** Which offset moved since the previous `bodyScroll`. */
  direction: "vertical" | "horizontal" | "both";
};

/**
 * Every grid event and its payload, for `api.on(name, handler)`. Each event is also reachable
 * declaratively: a `GridOptions` callback named `on` + the capitalised event name
 * (`rowGroupOpened` → `onRowGroupOpened`), the React `<Grid>` prop of the same name, and the
 * Angular `<awb-grid>` output named like the event — except `error`, whose output is `gridError`
 * (an `(error)` binding would also catch native DOM `error` events on the host element).
 *
 * `TData` is the row type (default `any`): it types `data` / `node` on the click payloads, so
 * `IGridAPI<TData>.on("cellClicked", …)` hands the handler typed rows.
 *
 * The lifecycle and structure events added with the bridges:
 * - `rowGroupOpened` — row groups / tree nodes expanded or collapsed; one event per call, after the
 *   rebuild, listing only the nodes that changed, with a user-vs-API `source`.
 * - `columnGroupOpened` — column groups opened or closed (header expander, `setColumnGroupState`);
 *   one event per direction.
 * - `firstDataRendered` — once per grid, after the first paint that shows a row.
 * - `rowDataUpdated` — `setRowData`, a transaction, or a server-side block load / purge.
 * - `bodyScroll` — every body scroll tick, with the offsets and which of them moved. Follow
 *   scrolling with it: `viewportChanged` is emitted once, when the grid initialises.
 */
export interface GridEventMap<TData = any> {
  overlayShow: GridEventOverlayShowParams;
  modelUpdated: GridEventModelUpdatedParams;
  viewportChanged: GridEventViewportChangedParams;
  columnsChanged: GridEventColumnsChangedParams;
  columnWidthsChanged: GridEventColumnWidthsChangedParams;
  rowsChanged: GridEventRowsChangedParams;
  aggregateChanged: GridEventAggregateChangedParams;
  cellsChanged: GridEventCellsChangedParams;
  selectionChanged: GridEventSelectionChangedParams;
  focusChanged: GridEventFocusChangedParams;
  headerFocusChanged: GridEventHeaderFocusChangedParams;
  editingChanged: GridEventEditingChangedParams;
  cellValueChanged: GridEventCellValueChangedParams;
  historyChanged: GridEventHistoryChangedParams;
  filterChanged: GridEventFilterChangedParams;
  quickFilterFindChanged: GridEventQuickFilterFindChangedParams;
  paginationChanged: GridEventPaginationChangedParams;
  cellClicked: GridEventCellClickedParams<TData>;
  rowClicked: GridEventRowClickedParams<TData>;
  cellDoubleClicked: GridEventCellDoubleClickedParams<TData>;
  rowDoubleClicked: GridEventRowDoubleClickedParams<TData>;
  tooltipShow: GridEventTooltipParams;
  tooltipHide: GridEventTooltipParams;
  actionFrameChanged: GridEventActionFrameParams;
  keyboardNavigationModeChanged: GridEventKeyboardNavigationModeChangedParams;
  pivotChanged: GridEventPivotChangedParams;
  pivotColumnLimitReached: GridEventPivotColumnLimitReachedParams;
  error: GridEventErrorParams;
  /** Row groups / tree nodes expanded or collapsed — one event per call, changed ids only. */
  rowGroupOpened: GridEventRowGroupOpenedParams;
  /** Column groups opened or closed via the header expander or `setColumnGroupState`. */
  columnGroupOpened: GridEventColumnGroupOpenedParams;
  /** Once per grid, after the first paint that shows a row. */
  firstDataRendered: GridEventFirstDataRenderedParams;
  /** The row data changed: `setRowData`, a transaction, or a server-side load. */
  rowDataUpdated: GridEventRowDataUpdatedParams;
  /** Every body scroll tick, with the offsets and which of them moved. */
  bodyScroll: GridEventBodyScrollParams;
}

export type GridEventHandler<E extends GridEventName> = (ev: GridEventMap[E]) => void;
