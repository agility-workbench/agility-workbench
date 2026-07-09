import { RowModelType } from "./iRowModel";
import { IServerSideDataSource } from "./serverSide";
import { GridIconMap } from "../theme/icons";

/**
 * How grouped rows are displayed:
 * - "singleColumn": one auto-generated group column holds the expand/collapse chevron and the
 *   indented group label for every grouping level.
 * - "multipleColumns": one auto-generated group column per grouped field; each shows its label
 *   only on the group rows at its own level.
 * - "groupRows": no auto-group column — the group label spans the row (sticky to the left edge).
 */
export type GroupDisplayType = "singleColumn" | "multipleColumns" | "groupRows";

export interface GridOptions {
  headerHeight?: number;
  leafHeaderHeight?: number;
  parentHeaderHeight?: number;
  rowHeight?: number;
  getRowId?: (row: object) => string;
  rowIdKey?: string;
  overscanRowCount?: number;
  allowExportAsCSV?: boolean;
  allowExportAsExcel?: boolean;
  pagination?: boolean;
  rowNumbers?: boolean;
  rowSelection?: boolean;
  pageSize?: number;
  pageSizes?: number[];
  serverSideBlockSize?: number;
  rowModelType?: RowModelType;
  serverSideDataSource?: IServerSideDataSource;
  serverSideAggregationSource?: IServerSideDataSource["getAggregates"];
  /**
   * When true, every data refresh (after the first) recomputes column widths
   * from the new data and updates affected widths in place. When false, column
   * widths are computed only on the first data load and stay fixed thereafter.
   * Defaults to true for server-side row models, false for client-side.
   */
  autosizeColumnsOnDataChange?: boolean;
  /**
   * When true, clicking inside the grid body but outside any row clears the
   * current selection (cell range, row selection, and column selection).
   * Defaults to true.
   */
  clearSelectionOnBodyClick?: boolean;
  /**
   * Maximum number of undoable edit steps kept in history (one step = one edit / paste / cut).
   * Older steps are dropped once the limit is exceeded. Defaults to 100. Set to 0 to disable
   * undo/redo entirely. Negative or undefined falls back to the default.
   */
  undoLimit?: number;
  /**
   * When true (default), committing a cell edit re-runs the active sort and/or filter if the
   * edited column participates in them — so an edited row moves to its correct sorted position or
   * drops out of a filtered view. Set to false to keep edited rows in place until the next
   * explicit sort/filter. Client-side row model only (no-op for server-side).
   */
  reevaluateOnEdit?: boolean;
  /**
   * How grouped rows are laid out. Defaults to "singleColumn". Client-side row model only.
   */
  groupDisplayType?: GroupDisplayType;
  /**
   * Depth to which groups start expanded when a grouping is first applied. 0 (default) leaves all
   * groups collapsed; a value of N expands the first N levels; -1 expands all levels. Per-group
   * expansion state set by the user afterwards takes precedence.
   */
  groupDefaultExpanded?: number;
  /**
   * Whether group (summary) rows participate in cell selection, keyboard navigation, and clipboard
   * copy/cut. When false (default), group rows are skipped: clicking a group cell selects nothing,
   * arrow/block navigation jumps over group rows to the nearest leaf, and copy/cut omits group
   * rows. When true, group cells behave like ordinary cells for selection/nav/clipboard (editing is
   * always blocked on group rows regardless). Client-side row model only.
   */
  groupRowsSelectable?: boolean;
  /**
   * Named icon overrides. Values may be a URL, data URI, CSS image value
   * like `url(...)`, or inline SVG markup.
   */
  icons?: GridIconMap;
}

export interface InternalGridOptions extends GridOptions {
  headerHeight: number;
  leafHeaderHeight: number;
  parentHeaderHeight: number;
  rowHeight: number;
  overscanRowCount: number;
  minResizeWidth: number;
  maxColumnWidth: number;
  allowExportAsCSV: boolean;
  allowExportAsExcel: boolean;
  pagination: boolean;
  rowNumbers: boolean;
  rowSelection: boolean;
  pageSize: number;
  pageSizes: number[];
  serverSideBlockSize: number;
  autosizeColumnsOnDataChange: boolean;
  clearSelectionOnBodyClick: boolean;
  undoLimit: number;
  reevaluateOnEdit: boolean;
  groupDisplayType: GroupDisplayType;
  groupDefaultExpanded: number;
  groupRowsSelectable: boolean;
  icons?: GridIconMap;
}
