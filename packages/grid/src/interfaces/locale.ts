/**
 * Localization: every user-visible string the grid renders on its own — visible text, aria-labels,
 * tooltips, placeholders, menu labels, screen-reader announcements and default column labels — as
 * one typed key set.
 *
 * Conventions:
 * - One camelCase key per string.
 * - Variables are `{name}` placeholders (`"Page {page} of {total}"`), filled from the
 *   `variableValues` the grid passes. A placeholder with no matching value is left as written.
 * - A string that depends on a count has two keys, `…One` and `…Other`, picked with
 *   `count === 1`. That covers languages with one singular and one plural form through the map
 *   alone; a language with richer rules uses {@link GetLocaleText}, which receives the `count`.
 */
export interface GridLocaleText {
  // ---- Overlays ----
  /** Loading overlay label (the `loadingMessage` option wins over this key). */
  loading: string;
  /** No-rows overlay label (the `noRowsMessage` option wins over this key). */
  noRows: string;
  /** Pivot header hint with no values chosen (the `pivotNoValuesMessage` option wins). */
  pivotNoValues: string;
  /** Pivot empty state with nothing configured (the `pivotEmptyMessage` option wins). */
  pivotEmpty: string;

  // ---- Grid-level messages ----
  /** Toast shown when tree keyboard navigation switches mode. */
  hierarchyNavigationMode: string;
  gridNavigationMode: string;
  /** No-rows overlay while a quick-filter search hides every row. */
  noRowsMatchSearch: string;
  noRowsMatchFilters: string;
  /** Announced when find navigation lands on no match. */
  findNoMatches: string;
  findMatchOfTotal: string;

  // ---- Pagination footer ----
  rowsPerPage: string;
  page: string;
  firstPage: string;
  previousPage: string;
  nextPage: string;
  lastPage: string;
  /** Page select option: `{page}` of `{total}` (`{total}` may carry the unknown-total suffix). */
  pageOfTotalOption: string;
  /** A page count that may still grow (server total unknown). */
  pageCountUnknown: string;
  /** Accessible name of the page selector / page buttons / a page button. */
  pageOfTotal: string;
  /** As `pageOfTotal` when the total is provisional. */
  pageOfAtLeastTotal: string;
  /** As `pageOfAtLeastTotal`, followed by the unknown-total hint. */
  pageOfAtLeastTotalWithHint: string;
  /** Tooltip of the page selector while the server total is unknown (the
   * `paginationUnknownTotalTooltip` option wins over this key). */
  paginationUnknownTotal: string;
  aggregate: string;
  aggregateScopeNone: string;
  aggregateScopeCurrentPage: string;
  aggregateScopeEntireDataset: string;
  hideAggregateRow: string;
  moreFooterControls: string;
  moreFooterControlsAggregationOn: string;
  newPivotSheet: string;
  /** Tooltip of the unavailable "Entire dataset" option (`paginationControls.aggregateScope.unavailableMessage` wins). */
  aggregateScopeEntireDatasetUnavailable: string;

  // ---- Aggregate footer and totals ----
  /** The aggregate footer's short name for Average. */
  aggAvgShort: string;
  changeAggregation: string;
  changeAggregationTooltip: string;
  /** Default label of the grand-total footer row (`groupTotalRowLabel` wins). */
  grandTotal: string;
  /** Default label of a group footer row. */
  groupTotal: string;
  /** The single group row an ungrouped pivot shows. */
  pivotTotal: string;

  // ---- Aggregate functions ----
  aggCount: string;
  aggDistinctCount: string;
  aggSum: string;
  aggAvg: string;
  aggMin: string;
  aggMax: string;
  aggMedian: string;
  aggFirst: string;
  aggLast: string;

  // ---- Toolbar ----
  views: string;
  savedViews: string;
  savedViewNamed: string;
  noSavedViews: string;
  saveCurrentViewMenu: string;
  updateView: string;
  renameViewMenu: string;
  deleteViewMenu: string;
  /** Title of the view-name form when saving a new view. */
  saveCurrentView: string;
  renameView: string;
  viewName: string;
  deleteViewConfirm: string;
  deleteViewMessage: string;
  /** The views entry of the toolbar's overflow menu while a view is active. */
  viewNamed: string;
  exportTable: string;
  export: string;
  exportSelection: string;
  exportEntireTable: string;
  exportCsv: string;
  exportExcel: string;
  exportTableAsCsv: string;
  exportTableAsExcel: string;
  togglePivotMode: string;
  pivot: string;
  pivotMode: string;
  pivotModeOn: string;
  pivotModeOff: string;
  moreToolbarActions: string;
  moreToolbarActionsActive: string;
  moreActions: string;
  search: string;
  searchHighlighting: string;
  searchFiltering: string;
  columnsEllipsis: string;
  groupedBy: string;
  sortBy: string;
  groupedByCount: string;
  sortByCount: string;
  /** A collapsed chip section: `{caption}` is `groupedBy` / `sortBy`. */
  sectionSummary: string;
  sectionSummaryEditorOne: string;
  sectionSummaryEditorOther: string;
  sectionSummaryEditorEmpty: string;
  moreGroupingLevelsOne: string;
  moreGroupingLevelsOther: string;
  moreSortColumnsOne: string;
  moreSortColumnsOther: string;
  rowGrouping: string;
  columnSorting: string;
  rowGroupingOrder: string;
  columnSortPriority: string;
  addGroup: string;
  addSort: string;
  addGroupEditor: string;
  addSortEditor: string;
  clearRowGrouping: string;
  clearGrouping: string;
  clearAllSorting: string;
  clearSorting: string;
  reorderHintHorizontal: string;
  reorderHintVertical: string;
  groupChip: string;
  sortChipAscending: string;
  sortChipDescending: string;
  removeFromRowGrouping: string;
  removeFromSorting: string;
  sortDirectionFixedAscending: string;
  sortDirectionFixedDescending: string;
  sortColumnAscending: string;
  sortColumnDescending: string;
  cancel: string;
  save: string;
  delete: string;

  // ---- Column panel ----
  columns: string;
  columnManagement: string;
  pivotSetup: string;
  openColumnPanel: string;
  closeColumnPanel: string;
  searchColumns: string;
  searchColumnsPlaceholder: string;
  allColumns: string;
  allMatchingColumns: string;
  modified: string;
  resetLayout: string;
  columnLayoutReset: string;
  pinnedLeft: string;
  pinnedRight: string;
  noColumns: string;
  noMatchingColumns: string;
  columnsHiddenOne: string;
  columnsHiddenOther: string;
  columnsShownOne: string;
  columnsShownOther: string;
  matchingColumnsHiddenOne: string;
  matchingColumnsHiddenOther: string;
  matchingColumnsShownOne: string;
  matchingColumnsShownOther: string;
  expandColumnGroup: string;
  collapseColumnGroup: string;
  showColumn: string;
  hideColumn: string;
  columnHidden: string;
  columnShown: string;
  pinColumn: string;
  unpinned: string;
  pinLeftOption: string;
  pinRightOption: string;
  columnPinnedLeft: string;
  columnPinnedRight: string;
  columnUnpinned: string;
  moveItemUp: string;
  moveItemDown: string;
  movedToPosition: string;
  groupRole: string;
  groupRoleNumbered: string;
  pivotRole: string;
  pivotRoleNumbered: string;
  removeFromRowGroups: string;
  removeFromPivotColumns: string;
  removeAggregateFromColumn: string;
  removedFromRowGroups: string;
  removedFromPivotColumns: string;
  aggregateChangedTo: string;
  aggregateRemovedFrom: string;
  rowGroupsWell: string;
  columnLabelsWell: string;
  valuesWell: string;
  addRowGroup: string;
  addPivotColumn: string;
  addValue: string;
  valueEntry: string;
  wellEmpty: string;
  wellOrder: string;
  removeFromWell: string;
  movedToPositionInWell: string;
  noColumnsToAdd: string;
  aggregateFunctionFor: string;
  dropToSectionEnd: string;

  // ---- Quick filter ----
  searchPlaceholder: string;
  findPlaceholder: string;
  searchAllColumns: string;
  findInAllColumns: string;
  clearSearch: string;
  searchOptions: string;
  closeSearch: string;
  closeSearchHint: string;
  previousMatch: string;
  nextMatch: string;
  previousMatchHint: string;
  nextMatchHint: string;
  findMatchesOne: string;
  findMatchesOther: string;
  findUnavailableServerSide: string;
  findUnavailablePivot: string;
  matchModeLabel: string;
  matchAllWords: string;
  matchExactPhrase: string;
  matchWholeCell: string;
  matchCase: string;
  behaviorFilterRows: string;
  behaviorHighlightMatches: string;
  anchorLabel: string;
  anchorRight: string;
  anchorLeft: string;
  keepFilterWhenClosed: string;
  activeSearchPill: string;

  // ---- Sheets ----
  sheets: string;
  addPivotSheet: string;
  pivotSheetsUnsupported: string;
  /** Name of the default sheet when `sheets.sheets` is empty. */
  dataSheetName: string;
  /** Name of a new pivot sheet; must contain `{index}`. */
  pivotSheetName: string;
  sheetCopyName: string;
  renameSheet: string;
  rename: string;
  changeColor: string;
  duplicate: string;
  sheetColorNone: string;
  sheetColorCustom: string;
  lastSheetCannotBeDeleted: string;
  sheetActions: string;

  // ---- Sheet tab colors ----
  sheetColorRed: string;
  sheetColorOrange: string;
  sheetColorAmber: string;
  sheetColorLime: string;
  sheetColorGreen: string;
  sheetColorTeal: string;
  sheetColorCyan: string;
  sheetColorBlue: string;
  sheetColorIndigo: string;
  sheetColorViolet: string;
  sheetColorPink: string;
  sheetColorGray: string;

  // ---- Column menu ----
  sortAscending: string;
  sortDescending: string;
  clearSort: string;
  clearSorts: string;
  hideColumnMenu: string;
  hideColumnsMenu: string;
  pinColumnMenu: string;
  pinColumnsMenu: string;
  pinLeft: string;
  pinRight: string;
  unpinColumn: string;
  unpinColumns: string;
  manageColumns: string;
  clearSelection: string;
  /** Caption of a multi-column menu once its columns are too many to name. */
  columnsCount: string;
  showSparklines: string;
  barSparklines: string;
  lineSparklines: string;
  areaSparklines: string;
  aggregateNumeric: string;
  aggregateString: string;
  clearAggregation: string;
  clearAggregations: string;
  exportAsCsv: string;
  exportAsExcel: string;
  ungroup: string;
  ungroupAll: string;
  grouping: string;
  groupByColumn: string;
  groupByColumns: string;
  replaceExistingGrouping: string;
  addToExistingGrouping: string;
  removeColumnFromGrouping: string;
  removeColumnsFromGrouping: string;
  clearAllGrouping: string;
  pivotOnColumn: string;
  pivotOnColumns: string;
  replaceExistingPivot: string;
  addToExistingPivot: string;
  removeColumnFromPivot: string;
  removeColumnsFromPivot: string;
  exitPivotMode: string;

  // ---- Body menu ----
  cut: string;
  copy: string;
  copyWithHeaders: string;
  paste: string;
  fillDown: string;
  fillRight: string;
  fillAsCopyInstead: string;
  fillAsSeriesInstead: string;
  exportWithRowGroups: string;
  exportLeafRows: string;
  exportGroupHeadingNotInRange: string;
  insert: string;
  insertRowAbove: string;
  insertRowBelow: string;
  pinRow: string;
  pinRows: string;
  unpinRow: string;
  unpinRows: string;
  pinToTop: string;
  pinToBottom: string;

  // ---- Menus ----
  /** Fallback accessible name of a menu. */
  menu: string;
  submenu: string;
  cellMenu: string;
  columnMenu: string;
  columnMenuMultiple: string;

  // ---- Header ----
  /** Accessible name of the row-number column header. */
  rowNumber: string;
  selectAllRows: string;
  deselectAllRows: string;

  // ---- Default column labels ----
  /** Header of the auto-group column (`groupColumnDef.label` wins). */
  groupColumn: string;
  /** Header of the tree-data column (`treeData.columnDef.label` wins). */
  hierarchyColumn: string;
  /** Header of a column created by "Show Sparklines". */
  sparklineColumn: string;

  // ---- Filter operators ----
  filterEqual: string;
  filterNotEqual: string;
  filterGreaterThan: string;
  filterGreaterThanOrEqual: string;
  filterLessThan: string;
  filterLessThanOrEqual: string;
  filterBetween: string;
  filterNotBetween: string;
  filterContains: string;
  filterExcludes: string;
  filterStartsWith: string;
  filterEndsWith: string;
  filterIsBlank: string;
  filterIsNotBlank: string;
  filterNotIn: string;

  // ---- Filter panel ----
  /** Accessible name of a column's filter popup. */
  filterDialog: string;
  filterJoinAnd: string;
  filterJoinOr: string;
  filterValue: string;
  /** The empty first choice of a select-style filter value. */
  filterAny: string;
  filterTrue: string;
  filterFalse: string;
  clearFilterValue: string;
  /** Filter buttons; the stylesheet capitalizes them (`text-transform: capitalize`). */
  filterApply: string;
  filterCancel: string;
  filterClear: string;
  filterReset: string;

  // ---- Set filter ----
  selectAll: string;
  /** The set filter's blank-values row. */
  blanks: string;
  selectAllValues: string;
  includeBlankValues: string;
  filterValues: string;
  /** Mini filter placeholder (`filterParams.miniFilterPlaceholder` wins). */
  setFilterSearchPlaceholder: string;
  /** Tree layout: `{example}` is a leaf's formatted value. */
  setFilterSearchPlaceholderWithExample: string;
  setFilterLoading: string;
  setFilterLoadError: string;
  /** Error recorded when an async value source fails without a message. */
  setFilterLoadFailed: string;
  /** Screen-reader unit after a value's count ("3 rows"). */
  setFilterRowCountUnitOne: string;
  setFilterRowCountUnitOther: string;

  // ---- Fill handle announcements ----
  filledCellsOne: string;
  filledCellsOther: string;
  filledCellsAsCopiesOne: string;
  filledCellsAsCopiesOther: string;
  filledCellsAsSeriesOne: string;
  filledCellsAsSeriesOther: string;
  fillNothingNoEditableCells: string;
  fillNothingNoAdjacentData: string;

  // ---- Screen-reader announcements ----
  rowsSelectedOne: string;
  rowsSelectedOther: string;
  columnsSelectedOne: string;
  columnsSelectedOther: string;
  /** A cell range: `{rows}` and `{columns}` are the `rangeRows…` / `rangeColumns…` texts. */
  rangeSelected: string;
  rangeRowsOne: string;
  rangeRowsOther: string;
  rangeColumnsOne: string;
  rangeColumnsOther: string;
  selectionCleared: string;
  sortingCleared: string;
  /** `{columns}` is the `sortedColumn…` texts joined with `sortedBySeparator`. */
  sortedBy: string;
  sortedBySeparator: string;
  sortedColumnAscending: string;
  sortedColumnDescending: string;
  loadingAnnouncement: string;
  rowsLoadedOne: string;
  rowsLoadedOther: string;

  // ---- Editors ----
  /** The select cell editor's placeholder while its values load. */
  selectEditorLoading: string;

  // ---- Cell renderers ----
  /** Accessible name of the rating renderer's stars. */
  ratingValue: string;

  // ---- Keyboard shortcut labels ----
  /** Labels of the built-in shortcuts, as `api.getKeyboardShortcuts()` lists them. */
  shortcutQuickFilter: string;
  shortcutNextSheet: string;
  shortcutPreviousSheet: string;
  shortcutOpenColumnMenu: string;
  shortcutOpenColumnFilter: string;
  shortcutExtendColumnSelectionLeft: string;
  shortcutExtendColumnSelectionRight: string;
  shortcutExtendColumnSelectionFirst: string;
  shortcutExtendColumnSelectionLast: string;
  shortcutFirstColumn: string;
  shortcutLastColumn: string;
  shortcutPreviousColumn: string;
  shortcutNextColumn: string;
  shortcutEnterRows: string;
  shortcutSelectColumn: string;
  shortcutSortColumn: string;
  shortcutSwitchTreeNavigationMode: string;
  shortcutTreeNavigation: string;
  shortcutToggleRowSelection: string;
  shortcutSelectRow: string;
  shortcutOpenActionFrame: string;
  shortcutEditCell: string;
  shortcutSelectAllCells: string;
  shortcutCopy: string;
  shortcutCut: string;
  shortcutPaste: string;
  shortcutFillDown: string;
  shortcutFillRight: string;
  shortcutUndo: string;
  shortcutRedo: string;
  shortcutClearCells: string;
  shortcutMoveToHeader: string;
  shortcutTypeToEdit: string;
  shortcutMoveUp: string;
  shortcutMoveDown: string;
  shortcutMoveLeft: string;
  shortcutMoveRight: string;
}

/** The grid's built-in English strings. */
export const DEFAULT_LOCALE_TEXT: GridLocaleText = {
  // Overlays
  loading: "Loading data...",
  noRows: "No rows to show",
  pivotNoValues: "Choose Aggregate on a column to add values",
  pivotEmpty: "Add row groups, column labels or values to build the pivot",

  // Grid-level messages
  hierarchyNavigationMode: "Hierarchy navigation mode",
  gridNavigationMode: "Grid navigation mode",
  noRowsMatchSearch: "No rows match \"{text}\"",
  noRowsMatchFilters: "No rows match the current filters",
  findNoMatches: "No matches",
  findMatchOfTotal: "Match {index} of {total}",

  // Pagination footer
  rowsPerPage: "Rows per page",
  page: "Page",
  firstPage: "First page",
  previousPage: "Previous page",
  nextPage: "Next page",
  lastPage: "Last page",
  pageOfTotalOption: "{page} of {total}",
  pageCountUnknown: "{count}+",
  pageOfTotal: "Page {page} of {total}",
  pageOfAtLeastTotal: "Page {page} of at least {total}",
  pageOfAtLeastTotalWithHint: "Page {page} of at least {total}. {hint}",
  paginationUnknownTotal: "More rows may exist on the server; the total updates as they load",
  aggregate: "Aggregate",
  aggregateScopeNone: "None",
  aggregateScopeCurrentPage: "Current page",
  aggregateScopeEntireDataset: "Entire dataset",
  hideAggregateRow: "Hide aggregate row",
  moreFooterControls: "More footer controls",
  moreFooterControlsAggregationOn: "More footer controls (aggregation on)",
  newPivotSheet: "New pivot sheet",
  aggregateScopeEntireDatasetUnavailable: "Entire-dataset totals need a server aggregation source: the data source's getAggregates, or serverSideAggregationSource.",

  // Aggregate footer and totals
  aggAvgShort: "Avg",
  changeAggregation: "Change {column} aggregation. Current function: {aggregate}",
  changeAggregationTooltip: "{aggregate} — change aggregation function",
  grandTotal: "Grand Total",
  groupTotal: "Total {group}",
  pivotTotal: "Total",

  // Aggregate functions
  aggCount: "Count",
  aggDistinctCount: "Distinct Count",
  aggSum: "Sum",
  aggAvg: "Average",
  aggMin: "Min",
  aggMax: "Max",
  aggMedian: "Median",
  aggFirst: "First",
  aggLast: "Last",

  // Toolbar
  views: "Views",
  savedViews: "Saved views",
  savedViewNamed: "Saved view: {name}",
  noSavedViews: "No saved views",
  saveCurrentViewMenu: "Save current view…",
  updateView: "Update “{name}”",
  renameViewMenu: "Rename “{name}”…",
  deleteViewMenu: "Delete “{name}”…",
  saveCurrentView: "Save current view",
  renameView: "Rename view",
  viewName: "View name",
  deleteViewConfirm: "Delete “{name}”?",
  deleteViewMessage: "This removes the view from the application-owned list.",
  viewNamed: "View: {name}",
  exportTable: "Export table",
  export: "Export",
  exportSelection: "Selection",
  exportEntireTable: "Entire table",
  exportCsv: "CSV",
  exportExcel: "Excel",
  exportTableAsCsv: "Table as CSV",
  exportTableAsExcel: "Table as Excel",
  togglePivotMode: "Toggle pivot mode",
  pivot: "Pivot",
  pivotMode: "Pivot mode",
  pivotModeOn: "Pivot mode on",
  pivotModeOff: "Pivot mode off",
  moreToolbarActions: "More toolbar actions",
  moreToolbarActionsActive: "More toolbar actions (active)",
  moreActions: "More actions",
  search: "Search",
  searchHighlighting: "Search — highlighting “{term}”",
  searchFiltering: "Search — filtering by “{term}”",
  columnsEllipsis: "Columns…",
  groupedBy: "Grouped by",
  sortBy: "Sort by",
  groupedByCount: "Grouped by ({count})…",
  sortByCount: "Sort by ({count})…",
  sectionSummary: "{caption} {count}",
  sectionSummaryEditorOne: "{caption} {count} column — open the editor",
  sectionSummaryEditorOther: "{caption} {count} columns — open the editor",
  sectionSummaryEditorEmpty: "{caption} — open the editor",
  moreGroupingLevelsOne: "{count} more grouping levels — open the grouping editor",
  moreGroupingLevelsOther: "{count} more grouping levels — open the grouping editor",
  moreSortColumnsOne: "{count} more sort columns — open the sort editor",
  moreSortColumnsOther: "{count} more sort columns — open the sort editor",
  rowGrouping: "Row grouping",
  columnSorting: "Column sorting",
  rowGroupingOrder: "Row grouping order",
  columnSortPriority: "Column sort priority",
  addGroup: "Add group",
  addSort: "Add sort",
  addGroupEditor: "+ Add group",
  addSortEditor: "+ Add sort",
  clearRowGrouping: "Clear row grouping",
  clearGrouping: "Clear grouping",
  clearAllSorting: "Clear all sorting",
  clearSorting: "Clear sorting",
  reorderHintHorizontal: "Use Left and Right arrows to reorder.",
  reorderHintVertical: "Use Up and Down arrows to reorder.",
  groupChip: "{column}, grouping level {index} of {total}. {hint}",
  sortChipAscending: "{column}, sort priority {index} of {total}, ascending. {hint}",
  sortChipDescending: "{column}, sort priority {index} of {total}, descending. {hint}",
  removeFromRowGrouping: "Remove {column} from row grouping",
  removeFromSorting: "Remove {column} from sorting",
  sortDirectionFixedAscending: "{column} sort direction is fixed to ascending",
  sortDirectionFixedDescending: "{column} sort direction is fixed to descending",
  sortColumnAscending: "Sort {column} ascending",
  sortColumnDescending: "Sort {column} descending",
  cancel: "Cancel",
  save: "Save",
  delete: "Delete",

  // Column panel
  columns: "Columns",
  columnManagement: "Column management",
  pivotSetup: "Pivot setup",
  openColumnPanel: "Open column panel",
  closeColumnPanel: "Close column panel",
  searchColumns: "Search columns",
  searchColumnsPlaceholder: "Search columns…",
  allColumns: "All columns",
  allMatchingColumns: "All matching columns",
  modified: "Modified",
  resetLayout: "Reset layout",
  columnLayoutReset: "Column layout reset",
  pinnedLeft: "Pinned left",
  pinnedRight: "Pinned right",
  noColumns: "No columns",
  noMatchingColumns: "No matching columns",
  columnsHiddenOne: "{count} column hidden",
  columnsHiddenOther: "{count} columns hidden",
  columnsShownOne: "{count} column shown",
  columnsShownOther: "{count} columns shown",
  matchingColumnsHiddenOne: "{count} matching column hidden",
  matchingColumnsHiddenOther: "{count} matching columns hidden",
  matchingColumnsShownOne: "{count} matching column shown",
  matchingColumnsShownOther: "{count} matching columns shown",
  expandColumnGroup: "Expand {group}",
  collapseColumnGroup: "Collapse {group}",
  showColumn: "Show {column}",
  hideColumn: "Hide {column}",
  columnHidden: "{column} hidden",
  columnShown: "{column} shown",
  pinColumn: "Pin {column}",
  unpinned: "Unpinned",
  pinLeftOption: "Pin left",
  pinRightOption: "Pin right",
  columnPinnedLeft: "{column} pinned left",
  columnPinnedRight: "{column} pinned right",
  columnUnpinned: "{column} unpinned",
  moveItemUp: "Move {item} up",
  moveItemDown: "Move {item} down",
  movedToPosition: "{item} moved to position {position} of {total}",
  groupRole: "Group",
  groupRoleNumbered: "Group {index}",
  pivotRole: "Pivot",
  pivotRoleNumbered: "Pivot {index}",
  removeFromRowGroups: "Remove {column} from row groups",
  removeFromPivotColumns: "Remove {column} from pivot columns",
  removeAggregateFromColumn: "Remove {aggregate} aggregate from {column}",
  removedFromRowGroups: "{column} removed from row groups",
  removedFromPivotColumns: "{column} removed from pivot columns",
  aggregateChangedTo: "{column} aggregate changed to {aggregate}",
  aggregateRemovedFrom: "{aggregate} aggregate removed from {column}",
  rowGroupsWell: "Row groups",
  columnLabelsWell: "Column labels",
  valuesWell: "Values",
  addRowGroup: "Add row group",
  addPivotColumn: "Add pivot column",
  addValue: "Add value",
  valueEntry: "{column} — {aggregate}",
  wellEmpty: "None",
  wellOrder: "{well} order",
  removeFromWell: "Remove {item} from {well}",
  movedToPositionInWell: "{item} moved to position {position} of {total} in {well}",
  noColumnsToAdd: "No columns available to add",
  aggregateFunctionFor: "Aggregate function for {column}",
  dropToSectionEnd: "Drop here to move branch to section end",

  // Quick filter
  searchPlaceholder: "Search…",
  findPlaceholder: "Find…",
  searchAllColumns: "Search all columns",
  findInAllColumns: "Find in all columns",
  clearSearch: "Clear search",
  searchOptions: "Search options",
  closeSearch: "Close search",
  closeSearchHint: "Close (Esc)",
  previousMatch: "Previous match",
  nextMatch: "Next match",
  previousMatchHint: "Previous match (Shift+Enter)",
  nextMatchHint: "Next match (Enter)",
  findMatchesOne: "{count} match",
  findMatchesOther: "{count} matches",
  findUnavailableServerSide: "Highlighting matches is not available when rows load from the server",
  findUnavailablePivot: "Highlighting matches is not available while the grid is pivoted",
  matchModeLabel: "Match",
  matchAllWords: "All words",
  matchExactPhrase: "Exact phrase",
  matchWholeCell: "Whole cell",
  matchCase: "Match case",
  behaviorFilterRows: "Filter rows",
  behaviorHighlightMatches: "Highlight matches",
  anchorLabel: "Anchor",
  anchorRight: "Right",
  anchorLeft: "Left",
  keepFilterWhenClosed: "Keep filter when closed",
  activeSearchPill: "Active search — click to edit",

  // Sheets
  sheets: "Sheets",
  addPivotSheet: "Add pivot sheet",
  pivotSheetsUnsupported: "Pivot sheets need the client-side row model without tree data",
  dataSheetName: "Data",
  pivotSheetName: "Pivot {index}",
  sheetCopyName: "{name} (copy)",
  renameSheet: "Rename sheet {name}",
  rename: "Rename",
  changeColor: "Change color",
  duplicate: "Duplicate",
  sheetColorNone: "None",
  sheetColorCustom: "Custom…",
  lastSheetCannotBeDeleted: "The last sheet cannot be deleted",
  sheetActions: "Sheet actions",

  // Sheet tab colors
  sheetColorRed: "Red",
  sheetColorOrange: "Orange",
  sheetColorAmber: "Amber",
  sheetColorLime: "Lime",
  sheetColorGreen: "Green",
  sheetColorTeal: "Teal",
  sheetColorCyan: "Cyan",
  sheetColorBlue: "Blue",
  sheetColorIndigo: "Indigo",
  sheetColorViolet: "Violet",
  sheetColorPink: "Pink",
  sheetColorGray: "Gray",

  // Column menu
  sortAscending: "Sort Ascending",
  sortDescending: "Sort Descending",
  clearSort: "Clear Sort",
  clearSorts: "Clear Sorts",
  hideColumnMenu: "Hide Column",
  hideColumnsMenu: "Hide Columns",
  pinColumnMenu: "Pin Column",
  pinColumnsMenu: "Pin Columns",
  pinLeft: "Pin Left",
  pinRight: "Pin Right",
  unpinColumn: "Unpin Column",
  unpinColumns: "Unpin Columns",
  manageColumns: "Manage columns…",
  clearSelection: "Clear Selection",
  columnsCount: "{count} columns",
  showSparklines: "Show Sparklines",
  barSparklines: "Bar Sparklines",
  lineSparklines: "Line Sparklines",
  areaSparklines: "Area Sparklines",
  aggregateNumeric: "Aggregate (numeric)",
  aggregateString: "Aggregate (string)",
  clearAggregation: "Clear Aggregation",
  clearAggregations: "Clear Aggregations",
  exportAsCsv: "Export as CSV",
  exportAsExcel: "Export as Excel",
  ungroup: "Ungroup",
  ungroupAll: "Ungroup All",
  grouping: "Grouping",
  groupByColumn: "Group by Column",
  groupByColumns: "Group by Columns",
  replaceExistingGrouping: "Replace Existing Grouping",
  addToExistingGrouping: "Add to Existing Grouping",
  removeColumnFromGrouping: "Remove Column from Grouping",
  removeColumnsFromGrouping: "Remove Columns from Grouping",
  clearAllGrouping: "Clear All Grouping",
  pivotOnColumn: "Pivot on Column",
  pivotOnColumns: "Pivot on Columns",
  replaceExistingPivot: "Replace Existing Pivot",
  addToExistingPivot: "Add to Existing Pivot",
  removeColumnFromPivot: "Remove Column from Pivot",
  removeColumnsFromPivot: "Remove Columns from Pivot",
  exitPivotMode: "Exit Pivot Mode",

  // Body menu
  cut: "Cut",
  copy: "Copy",
  copyWithHeaders: "Copy with Headers",
  paste: "Paste",
  fillDown: "Fill down",
  fillRight: "Fill right",
  fillAsCopyInstead: "Copy cells instead",
  fillAsSeriesInstead: "Fill series instead",
  exportWithRowGroups: "Export with row groups",
  exportLeafRows: "Export leaf rows",
  exportGroupHeadingNotInRange: "The group heading column is not part of the selected range.",
  insert: "Insert",
  insertRowAbove: "1 row above",
  insertRowBelow: "1 row below",
  pinRow: "Pin row",
  pinRows: "Pin rows",
  unpinRow: "Unpin row",
  unpinRows: "Unpin rows",
  pinToTop: "Pin to top",
  pinToBottom: "Pin to bottom",

  // Menus
  menu: "Menu",
  submenu: "Submenu",
  cellMenu: "Cell menu",
  columnMenu: "Column menu",
  columnMenuMultiple: "Column menu, {count} columns",

  // Header
  rowNumber: "Row number",
  selectAllRows: "Select all rows",
  deselectAllRows: "Deselect all rows",

  // Default column labels
  groupColumn: "Group",
  hierarchyColumn: "Hierarchy",
  sparklineColumn: "Sparkline",

  // Filter operators
  filterEqual: "Equal",
  filterNotEqual: "Not equal",
  filterGreaterThan: "Greater than",
  filterGreaterThanOrEqual: "Greater than or equal",
  filterLessThan: "Less than",
  filterLessThanOrEqual: "Less than or equal",
  filterBetween: "Between",
  filterNotBetween: "Not between",
  filterContains: "Contains",
  filterExcludes: "Excludes",
  filterStartsWith: "Starts with",
  filterEndsWith: "Ends with",
  filterIsBlank: "Is blank",
  filterIsNotBlank: "Is not blank",
  filterNotIn: "Not in",

  // Filter panel
  filterDialog: "Filter {column}",
  filterJoinAnd: "AND",
  filterJoinOr: "OR",
  filterValue: "Filter value",
  filterAny: "Any",
  filterTrue: "True",
  filterFalse: "False",
  clearFilterValue: "Clear",
  filterApply: "apply",
  filterCancel: "cancel",
  filterClear: "clear",
  filterReset: "reset",

  // Set filter
  selectAll: "(Select All)",
  blanks: "(Blanks)",
  selectAllValues: "Select all values",
  includeBlankValues: "Include blank values",
  filterValues: "Filter values",
  setFilterSearchPlaceholder: "Type to filter values",
  setFilterSearchPlaceholderWithExample: "Type to filter values, e.g. {example}",
  setFilterLoading: "Loading data…",
  setFilterLoadError: "Error loading values",
  setFilterLoadFailed: "Failed to load values",
  setFilterRowCountUnitOne: "row",
  setFilterRowCountUnitOther: "rows",

  // Fill handle announcements
  filledCellsOne: "Filled {count} cell",
  filledCellsOther: "Filled {count} cells",
  filledCellsAsCopiesOne: "Filled {count} cell as copies",
  filledCellsAsCopiesOther: "Filled {count} cells as copies",
  filledCellsAsSeriesOne: "Filled {count} cell as a series",
  filledCellsAsSeriesOther: "Filled {count} cells as a series",
  fillNothingNoEditableCells: "Nothing to fill: no editable cells",
  fillNothingNoAdjacentData: "Nothing to fill: no data beside the selection",

  // Screen-reader announcements
  rowsSelectedOne: "{count} row selected",
  rowsSelectedOther: "{count} rows selected",
  columnsSelectedOne: "{count} column selected",
  columnsSelectedOther: "{count} columns selected",
  rangeSelected: "{rows} by {columns} selected",
  rangeRowsOne: "{count} row",
  rangeRowsOther: "{count} rows",
  rangeColumnsOne: "{count} column",
  rangeColumnsOther: "{count} columns",
  selectionCleared: "Selection cleared",
  sortingCleared: "Sorting cleared",
  sortedBy: "Sorted by {columns}",
  sortedBySeparator: ", then ",
  sortedColumnAscending: "{column} ascending",
  sortedColumnDescending: "{column} descending",
  loadingAnnouncement: "Loading data",
  rowsLoadedOne: "{count} row loaded",
  rowsLoadedOther: "{count} rows loaded",

  // Editors
  selectEditorLoading: "Loading…",

  // Cell renderers
  ratingValue: "{value} of {max}",

  // Keyboard shortcut labels
  shortcutQuickFilter: "Quick filter",
  shortcutNextSheet: "Next sheet",
  shortcutPreviousSheet: "Previous sheet",
  shortcutOpenColumnMenu: "Open column menu",
  shortcutOpenColumnFilter: "Open column filter",
  shortcutExtendColumnSelectionLeft: "Extend the column selection left",
  shortcutExtendColumnSelectionRight: "Extend the column selection right",
  shortcutExtendColumnSelectionFirst: "Extend the column selection to the first column",
  shortcutExtendColumnSelectionLast: "Extend the column selection to the last column",
  shortcutFirstColumn: "First column",
  shortcutLastColumn: "Last column",
  shortcutPreviousColumn: "Previous column",
  shortcutNextColumn: "Next column",
  shortcutEnterRows: "Enter the rows",
  shortcutSelectColumn: "Select column",
  shortcutSortColumn: "Sort column",
  shortcutSwitchTreeNavigationMode: "Switch tree navigation mode",
  shortcutTreeNavigation: "Tree navigation",
  shortcutToggleRowSelection: "Toggle row selection",
  shortcutSelectRow: "Select row",
  shortcutOpenActionFrame: "Open the cell's action frame",
  shortcutEditCell: "Edit cell",
  shortcutSelectAllCells: "Select all cells",
  shortcutCopy: "Copy",
  shortcutCut: "Cut",
  shortcutPaste: "Paste",
  shortcutFillDown: "Fill down",
  shortcutFillRight: "Fill right",
  shortcutUndo: "Undo",
  shortcutRedo: "Redo",
  shortcutClearCells: "Clear cell contents",
  shortcutMoveToHeader: "Move to the column header",
  shortcutTypeToEdit: "Start editing by typing",
  shortcutMoveUp: "Move up",
  shortcutMoveDown: "Move down",
  shortcutMoveLeft: "Move left",
  shortcutMoveRight: "Move right",
};

/** A key of {@link GridLocaleText}. */
export type GridLocaleKey = keyof GridLocaleText;

/** What a {@link GetLocaleText} callback is asked to translate. */
export interface LocaleTextParams {
  /** The string being asked for. */
  key: GridLocaleKey;
  /**
   * The text the grid would show without the callback: the `localeText` entry for `key` when one
   * is set, else the English default — still with its `{placeholder}`s, uninterpolated.
   */
  defaultValue: string;
  /** The values for the string's `{placeholder}`s (`count` for the `…One` / `…Other` keys). */
  variableValues?: Record<string, string | number>;
}

/**
 * Translate one grid string. The returned text is interpolated afterwards, so it may keep
 * `{placeholder}`s (or already contain the final values). Use it for anything the `localeText` map
 * cannot express — ICU messages, plural rules with more than two forms, a translation library.
 */
export type GetLocaleText = (params: LocaleTextParams) => string;

/** Where the resolver reads the application's translations from (the grid options). */
export interface LocaleTextSource {
  localeText?: Partial<GridLocaleText>;
  getLocaleText?: GetLocaleText;
}

/** A bound resolver: `t(key, variableValues?)`. */
export type LocaleTextResolver = (key: GridLocaleKey, variableValues?: Record<string, string | number>) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

/** Replace each `{name}` with `variableValues[name]`; an unknown name is left as written. */
export function interpolateLocaleText(text: string, variableValues?: Record<string, string | number>): string {
  if (!variableValues || !text.includes("{")) return text;
  return text.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(variableValues, name) ? String(variableValues[name]) : match);
}

/**
 * Resolve one grid string.
 *
 * Precedence, highest first:
 * 1. the `getLocaleText` callback — called for every string, with the text the next two steps
 *    would produce as its `defaultValue`;
 * 2. the `localeText` map entry for `key` (a `null`/`undefined` entry falls through; an empty
 *    string is honoured);
 * 3. {@link DEFAULT_LOCALE_TEXT}.
 *
 * The winner is then interpolated: each `{name}` becomes `variableValues[name]`.
 */
export function resolveLocaleText(
  source: LocaleTextSource | undefined,
  key: GridLocaleKey,
  variableValues?: Record<string, string | number>,
): string {
  const entry = source?.localeText?.[key];
  const base = entry ?? DEFAULT_LOCALE_TEXT[key] ?? key;
  const callback = source?.getLocaleText;
  const text = callback ? callback({ key, defaultValue: base, variableValues }) ?? base : base;
  return interpolateLocaleText(String(text), variableValues);
}

/** Bind {@link resolveLocaleText} to one source. */
export function createLocaleTextResolver(source?: LocaleTextSource): LocaleTextResolver {
  return (key, variableValues) => resolveLocaleText(source, key, variableValues);
}

/** The English-only resolver, for code paths with no grid to ask (and as a default argument). */
export const defaultLocaleText: LocaleTextResolver = createLocaleTextResolver();

/**
 * The `…One` / `…Other` pair for `count`: `pluralKey("rowsSelected", 3)` → `"rowsSelectedOther"`.
 * The resolver then gets `{ count }` among the variable values.
 */
export function pluralLocaleText(
  t: LocaleTextResolver,
  baseKey: PluralLocaleBase,
  count: number,
  variableValues?: Record<string, string | number>,
): string {
  const key = `${baseKey}${count === 1 ? "One" : "Other"}` as GridLocaleKey;
  return t(key, { count, ...variableValues });
}

/** The base names of the `…One` / `…Other` key pairs. */
export type PluralLocaleBase = {
  [K in GridLocaleKey]: K extends `${infer Base}One` ? (`${Base}Other` extends GridLocaleKey ? Base : never) : never;
}[GridLocaleKey];

/**
 * The resolver of whatever grid API a renderer or component was handed — English defaults when
 * there is none (a renderer driven outside a grid, a test double).
 */
export function localeTextFromApi(
  api: { getLocaleText?: (key: GridLocaleKey, variableValues?: Record<string, string | number>) => string } | null | undefined,
): LocaleTextResolver {
  return (key, variableValues) => typeof api?.getLocaleText === "function"
    ? api.getLocaleText(key, variableValues)
    : defaultLocaleText(key, variableValues);
}
