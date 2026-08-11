import { AggregateModel } from "@grid/interfaces";
import { ColDef } from "../interfaces/column";
import { FilterItem } from "../interfaces/filter";
import { ColumnState } from "../interfaces/iGridCore";
import { CellRef } from "../interfaces/selection";
import { SortItemUpdate } from "../interfaces/sort";
import { QuickFilterMatchMode, TreeDataKeyboardNavigationMode } from "../interfaces/gridOptions";

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
  state: ColumnState[];
  // Applied to columns absent from `state` (see ColumnModel.applyColumnState). Omit for a merge.
  defaultState?: Partial<ColumnState>;
};

export type GridActionColumnAutosize = {
  type: "columnAutosize";
  colId: string;
};

export type GridActionColumnResize = {
  type: "columnResize";
  colId: string;
  widthPx: number;
};

export type GridActionColumnPin = {
  type: "columnPin";
  colIds: string[];
  pinned: "left" | "right" | null;
};

export type GridActionColumnVisibility = {
  type: "columnVisibility";
  colIds: string[];
  hidden: boolean;
};

export type GridActionColumnMove = {
  type: "columnMove";
  colId: string;
  toIndex: number;
  toSection: "left" | "center" | "right";
};

export type GridActionAddSparklineColumn = {
  type: "addSparklineColumn";
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
  sortItems: SortItemUpdate[];
};

export type GridActionFilterModelSet = {
  type: "filterModelSet";
  filterModel: FilterItem[];
};

export type GridActionQuickFilterSet = {
  type: "quickFilterSet";
  text: string;
  matchMode?: QuickFilterMatchMode;
  caseSensitive?: boolean;
};

export type GridActionAggregateModelSet = {
  type: "aggregateModelSet";
  aggregateModels: AggregateModel[];
}

// Row-grouping actions
// Replace the set of columns the rows are grouped by (order = grouping level). An empty array
// clears grouping. Client-side row model only.
export type GridActionRowGroupSet = {
  type: "rowGroupSet";
  colIds: string[];
};

// Expand or collapse a single group node. When `expanded` is omitted the node's state is toggled.
export type GridActionGroupToggleExpand = {
  type: "groupToggleExpand";
  groupId: string;
  expanded?: boolean;
};

// Expand or collapse many group nodes in one pass — one view rebuild and one repaint, regardless
// of how many nodes change. `groupIds` omitted = every group node in the current grouping/tree.
export type GridActionGroupSetExpanded = {
  type: "groupSetExpanded";
  expanded: boolean;
  groupIds?: string[];
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

export type GridActionHeaderAction = {
  type: "headerAction";
  colId: string;
  action: string;
  // For action "toggleSort": add the column to a multi-column sort instead of replacing it.
  additive?: boolean;
};

/**
 * Move or clear the header keyboard cursor (accessibility plan 6.9).
 *
 * Deliberately separate from `focusSet`: the selection model's active cell is a *selection* cursor
 * (it carries a 1×1 range, feeds copy/edit/ActionFrame and gets clamped to the row view), and a
 * header position is none of those things. Keeping it out of `CellPos` means no consumer of the
 * active cell has to learn about a position that can never be a data cell.
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
  mode: "replace" | "toggle" | "range";
};

// Select or clear all selectable data rows in the current view (row-number header click).
export type GridActionRowSelectAll = {
  type: "rowSelectAll";
  selected: boolean;
};

export type GridActionColumnSelectSet = {
  type: "columnSelectSet";
  colId: string;
  mode?: "replace" | "toggle";
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
  edits: { cell: CellRef; value: unknown }[];
  reason?: "paste" | "cut" | "clear" | "api";
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
  | GridActionAddSparklineColumn
  | GridActionThemeFontSet
  | GridActionRowDataSet
  | GridActionTransactionApply
  | GridActionPaginationSet
  | GridActionSortModelSet
  | GridActionFilterModelSet
  | GridActionQuickFilterSet
  | GridActionAggregateModelSet
  | GridActionRowGroupSet
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
  | GridActionSelectAll;
