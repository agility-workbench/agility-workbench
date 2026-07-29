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

/** Serializable grid presentation state captured by `api.captureViewState()`. */
export interface GridViewState {
  version: 1;
  columns: ColumnState[];
  rowGroupColumns: string[];
  sortModel: GridViewSortState[];
  filterModel: GridViewFilterState[];
  quickFilterText: string;
  groupExpansion: GridViewGroupExpansionState[];
}

export interface SavedGridView {
  id: string;
  name: string;
  state: GridViewState;
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
