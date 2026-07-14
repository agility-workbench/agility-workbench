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

/** How the quick-filter search string is matched against each row. */
export type QuickFilterMatchMode = "substring" | "multiTerm";

/**
 * Quick filter (global search) configuration.
 * - `mode`: "onDemand" (default) hides the widget until summoned with Ctrl/Cmd+F; "always" keeps it
 *   pinned open under the header.
 * - `matchMode`: "multiTerm" (default) splits the search on whitespace and requires every token to
 *   match somewhere in the row; "substring" matches the whole string as one contiguous run.
 * - `caseSensitive`: false by default.
 * - `debounceMs`: delay before a keystroke triggers a refilter. Defaults to 150.
 * - `showOptions`: whether the widget exposes the match-mode / match-case popover to end users.
 *   Defaults to true. When false the configured defaults are fixed.
 * These are the *initial* defaults; end-user changes made in the widget popover are sticky for the
 * session (they are not written back to grid options). Client-side row model only.
 */
export interface QuickFilterOptions {
  mode?: "always" | "onDemand";
  matchMode?: QuickFilterMatchMode;
  caseSensitive?: boolean;
  debounceMs?: number;
  showOptions?: boolean;
}

/** Fully-resolved quick-filter configuration (all defaults applied). `enabled` is false when the
 * `quickFilter` option was omitted or set to false. */
export interface ResolvedQuickFilterOptions {
  enabled: boolean;
  mode: "always" | "onDemand";
  matchMode: QuickFilterMatchMode;
  caseSensitive: boolean;
  debounceMs: number;
  showOptions: boolean;
}

export function resolveQuickFilterOptions(
  opt: boolean | QuickFilterOptions | undefined,
): ResolvedQuickFilterOptions {
  const o = typeof opt === "object" && opt !== null ? opt : {};
  return {
    enabled: opt === true || (typeof opt === "object" && opt !== null),
    mode: o.mode ?? "onDemand",
    matchMode: o.matchMode ?? "multiTerm",
    caseSensitive: o.caseSensitive ?? false,
    debounceMs: o.debounceMs != null && o.debounceMs >= 0 ? o.debounceMs : 150,
    showOptions: o.showOptions ?? true,
  };
}

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
   * Quick filter (global search across all visible columns). Pass `true` to enable with defaults,
   * or an options object to customise. Omitted/false disables the feature. Client-side row model
   * only (server-side ignores it).
   */
  quickFilter?: boolean | QuickFilterOptions;
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
  quickFilter: boolean | QuickFilterOptions;
  icons?: GridIconMap;
}
