import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import { GridHistoryState } from "../core/historyModel";
import { RowDataChangeReason } from "@grid/interfaces/iRowModel";
import { ColId, GridId } from "../interfaces/iGridCore";
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
  | "paginationChanged"
  | "cellClicked"
  | "rowClicked"
  | "tooltipShow"
  | "tooltipHide"
  | "actionFrameChanged"
  | "keyboardNavigationModeChanged"
  | "error";

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

export type GridEventColumnsChangedParams = {
  reason: "defs" | "state" | "pin" | "visibility" | "order" | "sort" | "filter" | "group" | "add";
  /** Public ColDef colIds of the affected columns. */
  changedColIds?: ColId[];
  /** Internal instance ids of the affected columns (unique; renderer-facing). */
  changedColInstanceIds?: string[];
};

export type GridEventColumnWidthsChangedParams = {
  /** Public colIds of the columns whose computedWidth changed. Empty = "all visible columns". */
  changedColIds: ColId[];
  /** Internal instance ids, parallel to `changedColIds` (unique; renderer-facing). */
  changedColInstanceIds: string[];
};

export type GridEventRowsChangedParams = {
  reason: "rowData" | "transaction" | "group" | "viewport" | "add" | RowDataChangeReason;
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
  // full current selection snapshot (see snapshot.kind for the active selection kind)
  snapshot: SelectionSnapshot;
  /** Row-id membership changes since the previous selectionChanged event. */
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
  // "rejected" = an editor commit was vetoed by `onBeforeCellCommit`: the editor closes and the
  // cell keeps its old value (no write, no undo entry, no cellValueChanged).
  state: "started" | "stopped" | "cancelled" | "committed" | "rejected";
  /** Normalized on emit: public colId + colInstanceId. */
  cell?: CellRef;
  // committed value (for committed), or the vetoed proposed value (for rejected)
  value?: unknown;
  // the cell's value before the commit (committed / rejected)
  oldValue?: unknown;
  // For state "started" via edit-on-typing: the printable character that opened the editor, so
  // the renderer can seed the editor with it.
  charPress?: string;
};

/** What wrote the cell: an editor commit / `setCellValue`, a clipboard batch, or history. */
export type CellValueChangeSource = "edit" | "paste" | "cut" | "clear" | "undo" | "redo";

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

export type GridEventCellClickedParams = {
  rowId: GridId;
  /** Public ColDef colId of the clicked column. */
  colId: ColId;
  /** Internal instance id of the clicked column. */
  colInstanceId: string;
  /** View index of the clicked row. */
  viewIdx: number;
  /** Global leaf-column index of the clicked cell. */
  colIdx: number;
  /** The clicked row's underlying data object. */
  data: unknown;
  /** The clicked cell's raw value. */
  value: unknown;
  /** The originating DOM click event. */
  event: MouseEvent;
};

export type GridEventRowClickedParams = {
  rowId: GridId;
  /** View index of the clicked row. */
  viewIdx: number;
  /** The clicked row's underlying data object. */
  data: unknown;
  /** Whether the clicked row is a group (summary) row. */
  isGroup: boolean;
  /** The originating DOM click event. */
  event: MouseEvent;
};

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

export type GridEventErrorParams = {
  code: string;
  message: string;
  details?: unknown;
};

export interface GridEventMap {
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
  paginationChanged: GridEventPaginationChangedParams;
  cellClicked: GridEventCellClickedParams;
  rowClicked: GridEventRowClickedParams;
  tooltipShow: GridEventTooltipParams;
  tooltipHide: GridEventTooltipParams;
  actionFrameChanged: GridEventActionFrameParams;
  keyboardNavigationModeChanged: GridEventKeyboardNavigationModeChangedParams;
  error: GridEventErrorParams;
}

export type GridEventHandler<E extends GridEventName> = (ev: GridEventMap[E]) => void;
