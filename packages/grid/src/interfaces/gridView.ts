import type { FilterDef } from "./filter";
import type { ColumnState } from "./iGridCore";
import type { SortDir } from "./sort";

export interface GridViewSortState {
  colId: string;
  dir: SortDir;
}

export interface GridViewFilterState {
  colId: string;
  filters: FilterDef[];
  join?: "and" | "or";
}

export interface GridViewGroupExpansionState {
  groupId: string;
  expanded: boolean;
}

export interface GridViewPaginationState {
  pageIndex: number;
  pageSize: number;
}

/** One aggregate-model entry in serializable form (keyed by public colId, not instanceID). */
export interface GridViewAggregateState {
  colId: string;
  type: string;
}

/** Serializable grid presentation state captured by `api.captureViewState()`. */
export interface GridViewState {
  version: 1;
  columns: ColumnState[];
  rowGroupColumns: string[];
  sortModel: GridViewSortState[];
  filterModel: GridViewFilterState[];
  quickFilterText: string;
  groupExpansion: GridViewGroupExpansionState[];
  /** Present only when pagination is enabled at capture time. Absent in states saved before this
   * field existed; applyViewState leaves the page untouched when it's missing. */
  pagination?: GridViewPaginationState;
  /** Aggregate model by colId. Absent in states saved before pivot existed; applyViewState leaves
   * the aggregate model untouched when it's missing (same rule as `pagination`). */
  aggregateModel?: GridViewAggregateState[];
  /** Pivot columns' colIds in level order. Absent = leave untouched. */
  pivotColumns?: string[];
  /** Whether pivot mode is on. Absent = leave untouched. */
  pivotMode?: boolean;
}

export interface SavedGridView {
  id: string;
  name: string;
  state: GridViewState;
}

/**
 * One spreadsheet-style sheet: a named, live view state over the shared row model. The grid
 * captures the sheet's state whenever the user leaves it; a sheet supplied without a state adopts
 * the grid's state on its first activation instead of resetting anything.
 */
export interface GridSheet {
  id: string;
  name: string;
  state?: GridViewState;
}

/**
 * Application-owned sheet tabs (footer, left zone). Supplying this option mounts the tab strip;
 * like {@link SavedViewsOptions}, the grid renders and optimistically updates the supplied list,
 * then reports the complete next list through `onChange` — persistence stays with the application.
 * An empty/omitted `sheets` list shows a single synthesized "Data" tab for the grid's current
 * state. The strip's **+** button appends a fresh pivot sheet (pivot mode on, no roles assigned).
 */
export interface SheetsOptions {
  sheets?: readonly GridSheet[];
  activeSheetId?: string | null;
  onChange?: (sheets: GridSheet[]) => void;
  onActiveSheetChange?: (sheetId: string | null) => void;
}

/**
 * Application-owned saved views. The grid renders and optimistically updates the supplied list,
 * then reports the complete next list through `onChange`; persistence remains the application's
 * responsibility.
 */
export interface SavedViewsOptions {
  views?: readonly SavedGridView[];
  activeViewId?: string | null;
  onChange?: (views: SavedGridView[]) => void;
  onActiveViewChange?: (viewId: string | null) => void;
}
