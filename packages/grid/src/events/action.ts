import { AggregateModel } from "@grid/interfaces";
import { ColDef } from "../interfaces/column";
import { FilterItem } from "../interfaces/filter";
import { GridViewColumnGroupState } from "../interfaces/gridView";
import { ColumnState } from "../interfaces/iGridCore";
import { CellRef } from "../interfaces/selection";
import { SortItemUpdate } from "../interfaces/sort";
import { QuickFilterBehavior, QuickFilterMatchMode, TreeDataKeyboardNavigationMode } from "../interfaces/gridOptions";
import type { ColumnChangeSource } from "./events";

export type GridActionInit = {
  type: "init";
};

export type GridActionDestroy = {
  type: "destroy";
};

export type GridActionOverlayShow = {
  type: "overlayShow";
  overlayType: "loading" | "noRows" | "none";
};

// Viewport actions
export type GridActionViewportResize = {
  type: "viewportResize";
  widthPx: number;
  heightPx: number;
};

/** Not handled by the core (dispatching it does nothing): scroll with `api.scrollTo`. */
export type GridActionScrollSet = {
  type: "scrollSet";
  topPx: number;
  leftPx: number;
};

export type GridActionRowHeightSet = {
  type: "rowHeightSet";
  rowHeightPx: number;
};

export type GridActionOverscanSet = {
  type: "overscanSet";
  overscanRowCount: number;
};

// Column actions
export type GridActionColumnDefsSet = {
  type: "columnDefsSet";
  defs: ColDef[];
};

export type GridActionColumnStateSet = {
  type: "columnStateSet";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  state: ColumnState[];
  // Applied to columns absent from `state` (see ColumnModel.applyColumnState). Omit for a merge.
  defaultState?: Partial<ColumnState>;
};

export type GridActionColumnAutosize = {
  type: "columnAutosize";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  colId: string;
};

export type GridActionColumnResize = {
  type: "columnResize";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  colId: string;
  widthPx: number;
};

export type GridActionColumnPin = {
  type: "columnPin";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  colIds: string[];
  pinned: "left" | "right" | null;
};

export type GridActionColumnVisibility = {
  type: "columnVisibility";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  colIds: string[];
  hidden: boolean;
};

export type GridActionColumnMove = {
  type: "columnMove";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  colId: string;
  toIndex: number;
  toSection: "left" | "center" | "right";
};

/** `api.moveColumns`: see ColumnModel.moveColumnsToIndex for the `toIndex` semantics. */
export type GridActionColumnsMove = {
  type: "columnsMove";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  colIds: string[];
  /** Index into the order `getColumnState()` returns, clamped to each column's own section. */
  toIndex: number;
};

export type GridActionAddSparklineColumn = {
  type: "addSparklineColumn";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  /** Column whose menu opened the command; it has formatter precedence over the selection. */
  targetColId: string;
  colIds: string[];
  sparklineType: "line" | "bar" | "area";
  newColId?: string;
};

export type GridActionThemeFontSet = {
  type: "themeFontSet";
  headerFont: string;
  cellFont: string;
  reason: string;
};

// Data actions
export type GridActionRowDataSet = {
  type: "rowDataSet";
  rows: any[];
};

export type GridActionTransactionApply = {
  type: "rowTransactionApply";
  add?: unknown[];
  addIndex?: number;
  update?: { rowId: string; row: unknown }[];
  remove?: string[];
};

// Pagination actions
export type GridActionPaginationSet = {
  type: "paginationSet";
  enabled: boolean;
  pageIndex: number;
  pageSize: number;
};

// Sort/Filter actions
export type GridActionSortModelSet = {
  type: "sortModelSet";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  sortItems: SortItemUpdate[];
};

export type GridActionFilterModelSet = {
  type: "filterModelSet";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  filterModel: FilterItem[];
};

export type GridActionQuickFilterSet = {
  type: "quickFilterSet";
  text: string;
  matchMode?: QuickFilterMatchMode;
  caseSensitive?: boolean;
  behavior?: QuickFilterBehavior;
};

// Step the active find match (quickFilter behavior "find"). Wraps at either end; a no-op when the
// search has no matches.
export type GridActionFindNavigate = {
  type: "findNavigate";
  direction: "next" | "previous";
};

export type GridActionAggregateModelSet = {
  type: "aggregateModelSet";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  aggregateModels: AggregateModel[];
}

// Row-grouping actions
// Replace the set of columns the rows are grouped by (order = grouping level). An empty array
// clears grouping. Client-side row model only.
export type GridActionRowGroupSet = {
  type: "rowGroupSet";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  colIds: string[];
};

// Turn pivot mode on or off. Off restores the source columns exactly; on derives the generated
// pivot header from the current pivot columns + aggregate model. Client-side row model only.
export type GridActionPivotModeSet = {
  type: "pivotModeSet";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  on: boolean;
};

// Replace the set of columns pivoted on (order = pivot level). Stored even while pivot mode is
// off (it applies when the mode turns on); an empty array clears the pivot columns but leaves the
// mode alone (the degenerate grouped-aggregate view). Client-side row model only.
export type GridActionPivotColumnsSet = {
  type: "pivotColumnsSet";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  colIds: string[];
};

// Replace the manual arrangement of the generated pivot columns: the displayed leaf order, by
// generated colId (the split header tree is derived from it — a group caption repeats around each
// contiguous run). Null clears back to the canonical discovery layout. Stored until the next
// explicit role edit (aggregateModelSet / pivotColumnsSet), which resets it; data- and
// filter-driven re-discoveries keep it. Client-side row model only.
export type GridActionPivotColumnOrderSet = {
  type: "pivotColumnOrderSet";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  order: string[] | null;
};

// Expand or collapse a single group node. When `expanded` is omitted the node's state is toggled.
export type GridActionGroupToggleExpand = {
  type: "groupToggleExpand";
  groupId: string;
  expanded?: boolean;
  /** Who made the change, stamped on the `rowGroupOpened` event; omitted = `"api"`. The group
   * chevron dispatches `"user"`. */
  source?: "user" | "api";
};

// Expand or collapse many group nodes in one pass — one view rebuild and one repaint, regardless
// of how many nodes change. `groupIds` omitted = every group node in the current grouping/tree.
export type GridActionGroupSetExpanded = {
  type: "groupSetExpanded";
  expanded: boolean;
  groupIds?: string[];
  /** Who made the change, stamped on the `rowGroupOpened` event; omitted = `"api"`. */
  source?: "user" | "api";
};

// Open or close COLUMN groups (the header expander) in one rebuild — the batch form of
// `headerAction: "toggleGroupExpand"`, with the same follow-ups (revealed leaves sized to content,
// aggregates re-derived). Groups absent from the list keep their state; ids that resolve to no
// group are ignored, and nothing is rebuilt when no group changes.
export type GridActionColumnGroupStateSet = {
  type: "columnGroupStateSet";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  groups: GridViewColumnGroupState[];
};

export type GridActionKeyboardNavigationModeSet = {
  type: "keyboardNavigationModeSet";
  mode: TreeDataKeyboardNavigationMode;
  source?: "api" | "shortcut" | "options";
};

export type GridActionTreeNavigate = {
  type: "treeNavigate";
  command: "expand" | "collapse" | "parent";
};

// Focus/Selection actions
export type GridActionFocusSet = {
  type: "focusSet";
  viewIdx: number;
  colIdx: number;
  rowPinned?: "top" | "bottom";
  reason?: "mouse" | "keyboard" | "api";
};

export type GridActionSelectionClear = {
  type: "selectionClear";
  what?: "all" | "range" | "rows" | "columns";
};

/** What a header interaction asks the core to do. `filterClick`, `menuClick` and `click` change
 * no core state (the renderer opens the filter or menu itself); they are dispatched so listeners
 * see them. */
export type HeaderActionKind = "toggleSort" | "toggleGroupExpand" | "filterClick" | "menuClick" | "click";

export type GridActionHeaderAction = {
  type: "headerAction";
  /** Who made the change, stamped on the column events it causes; omitted = `"api"`. */
  source?: ColumnChangeSource;
  colId: string;
  action: HeaderActionKind;
  // For action "toggleSort": add the column to a multi-column sort instead of replacing it.
  additive?: boolean;
};

/**
 * Move or clear the header keyboard cursor. Separate from `focusSet`: the active cell is a *selection*
 * cursor (a 1×1 range that feeds copy/edit/ActionFrame and is clamped to the row view) and a header
 * position is none of that. Keeping it out of `CellPos` means no consumer of the active cell has to learn
 * about a position that can never be a data cell.
 */
export type GridActionHeaderFocusSet = {
  type: "headerFocusSet";
  /** Index into the visible leaf columns, or null to leave the header. */
  colIdx: number | null;
  reason?: "keyboard" | "api" | "mouse";
};

/** Step the header cursor. `down` leaves the header for the first body row in the same column. */
export type GridActionHeaderNavigate = {
  type: "headerNavigate";
  dir: "left" | "right" | "down" | "home" | "end";
};

export type GridActionRowSelectSet = {
  type: "rowSelectSet";
  viewIdx: number;
  // "range" replaces with anchor..row (row-number gesture); "rangeAdd" unions it in (checkbox).
  mode: "replace" | "toggle" | "range" | "rangeAdd";
  /** Utility-cell activation keeps the cursor on the row-number/checkbox cell after row selection
   * replaces the cell range. */
  preserveFocus?: boolean;
  reason?: "mouse" | "keyboard";
};

// Select or clear all selectable data rows in the current view (row-number header click).
// Programmatic row selection by stable row id — lets an external selection owner drive the grid.
export type GridActionRowSelectByIds = {
  type: "rowSelectByIds";
  rowIds: string[];
  // "set" (default) replaces the row selection; "add"/"remove" adjust it.
  mode?: "set" | "add" | "remove";
};

export type GridActionRowSelectAll = {
  type: "rowSelectAll";
  selected: boolean;
  /** Omitted by API callers; header pointer/keyboard gestures identify their user-input source. */
  reason?: "mouse" | "keyboard";
};

export type GridActionColumnSelectSet = {
  type: "columnSelectSet";
  /**
   * "replace" / "toggle" pick a column and re-plant the range anchor; "range" replaces the selection
   * with anchor..colId in leaf order (the header's Shift+Arrow gesture) and leaves the anchor where
   * it is, so reversing direction shrinks the range.
   */
  colId: string;
  mode?: "replace" | "toggle" | "range";
};

export type GridActionRangeSelectSet = {
  type: "rangeSelectSet";
  // Start a fresh range at this cell, or extend the current range's active corner to it.
  viewIdx: number;
  colIdx: number;
  rowPinned?: "top" | "bottom";
  mode: "start" | "extend";
};

// Editing actions
export type GridActionEditStart = {
  type: "editStart";
  cell: CellRef;
  source?: "mouse" | "keyboard" | "api";
  // When editing was triggered by typing a printable character, that character — the editor seeds
  // itself with it (edit-on-typing) and places the caret at the end.
  charPress?: string;
};

export type GridActionEditCommit = {
  type: "editCommit";
  cell: CellRef;
  value: unknown;
  // When true, `value` is already the final typed value and the column's valueParser is skipped
  // (typed editors like number/date/boolean/select produce their own value). Defaults to false,
  // where `value` is treated as raw text and run through valueParser.
  parsed?: boolean;
};

export type GridActionEditCancel = {
  type: "editCancel";
  cell: CellRef;
};

// Batch-commit many cells in one shot (e.g. multi-cell paste / cut-clear). Each value runs
// through its column's valueParser, and a single cellsChanged is emitted for the whole batch.
export type GridActionCellsCommit = {
  type: "cellsCommit";
  // Per-edit `parsed` mirrors editCommit's flag: when true the value is already the final typed
  // form and the column's valueParser is skipped. Clipboard edits are raw text and leave it unset.
  edits: { cell: CellRef; value: unknown; parsed?: boolean }[];
  // "fill" is the fill handle (and Ctrl/Cmd+D / Ctrl/Cmd+R): a copy or series of the selection's
  // own values, so it reports and undoes under its own name.
  reason?: "paste" | "cut" | "clear" | "fill" | "api";
};

// ActionFrame actions — open/close the persistent frame + form popover on a body cell. Only one
// frame is open at a time (like editing); opening the editor closes it (mutual exclusion in core).
export type GridActionActionFrameOpen = {
  type: "actionFrameOpen";
  cell: CellRef;
  source?: "mouse" | "keyboard" | "api";
};

export type GridActionActionFrameClose = {
  type: "actionFrameClose";
};

// Undo / redo the last recorded cell-edit step.
export type GridActionUndo = { type: "undo" };
export type GridActionRedo = { type: "redo" };

// Keyboard navigation action.
// jump: undefined = one cell (Arrow); "edge" = hard first/last (Home/End);
// "block" = Excel-style data-block jump (Ctrl+Arrow); "page" = one viewport of rows
// (PageUp/PageDown) — pageRows is supplied by the renderer, which knows the viewport height.
export type GridActionKeyboardNavigate = {
  type: "navigate";
  dir: "up" | "down" | "left" | "right";
  extend?: boolean;
  jump?: "edge" | "block" | "page";
  pageRows?: number;
};

// Jump the active cell to a grid corner (Ctrl+Home / Ctrl+End)
export type GridActionNavigateCorner = {
  type: "navigateCorner";
  corner: "topLeft" | "bottomRight";
  extend?: boolean;
};

// Select the entire grid (Ctrl+A)
export type GridActionSelectAll = {
  type: "selectAll";
};

// Union type of all actions
export type GridAction =
  | GridActionInit
  | GridActionDestroy
  | GridActionOverlayShow
  | GridActionViewportResize
  | GridActionScrollSet
  | GridActionRowHeightSet
  | GridActionOverscanSet
  | GridActionColumnDefsSet
  | GridActionColumnStateSet
  | GridActionColumnAutosize
  | GridActionColumnResize
  | GridActionColumnPin
  | GridActionColumnVisibility
  | GridActionColumnMove
  | GridActionColumnsMove
  | GridActionAddSparklineColumn
  | GridActionThemeFontSet
  | GridActionRowDataSet
  | GridActionTransactionApply
  | GridActionPaginationSet
  | GridActionSortModelSet
  | GridActionFilterModelSet
  | GridActionQuickFilterSet
  | GridActionFindNavigate
  | GridActionAggregateModelSet
  | GridActionRowGroupSet
  | GridActionPivotModeSet
  | GridActionPivotColumnsSet
  | GridActionPivotColumnOrderSet
  | GridActionGroupToggleExpand
  | GridActionGroupSetExpanded
  | GridActionKeyboardNavigationModeSet
  | GridActionTreeNavigate
  | GridActionFocusSet
  | GridActionHeaderAction
  | GridActionHeaderFocusSet
  | GridActionHeaderNavigate
  | GridActionSelectionClear
  | GridActionRowSelectSet
  | GridActionRowSelectAll
  | GridActionRowSelectByIds
  | GridActionColumnSelectSet
  | GridActionRangeSelectSet
  | GridActionEditStart
  | GridActionEditCommit
  | GridActionEditCancel
  | GridActionActionFrameOpen
  | GridActionActionFrameClose
  | GridActionCellsCommit
  | GridActionUndo
  | GridActionRedo
  | GridActionKeyboardNavigate
  | GridActionNavigateCorner
  | GridActionSelectAll
  | GridActionColumnGroupStateSet;

/**
 * The actions that can change columns and so carry an optional `source`, stamped on the
 * `columnsChanged` / `columnWidthsChanged` events they cause. The renderer's gesture handlers
 * dispatch them with `source: "user"`; every other dispatcher (the API, view restores) omits it,
 * which reads as `"api"`. Listed at runtime because other actions use a `source` field with a
 * different meaning (`keyboardNavigationModeSet`), so "has a source" is not the test.
 */
export const COLUMN_CHANGE_ACTION_TYPES: ReadonlySet<GridAction["type"]> = new Set<GridAction["type"]>([
  "columnStateSet",
  "columnAutosize",
  "columnResize",
  "columnPin",
  "columnVisibility",
  "columnMove",
  "addSparklineColumn",
  "sortModelSet",
  "filterModelSet",
  "aggregateModelSet",
  "rowGroupSet",
  "pivotModeSet",
  "pivotColumnsSet",
  "pivotColumnOrderSet",
  "columnGroupStateSet",
  "headerAction",
]);
