import { CanvasMeasurer, GridCore, GridOptions } from "@agility-workbench/grid";
import type { NgAdapters } from "./adapters";
import type { AwbGrid } from "./grid.component";

export function createCore(options: GridOptions): GridCore {
  return new GridCore(new CanvasMeasurer(), options);
}

function setIfDefined<K extends keyof GridOptions>(
  options: GridOptions,
  key: K,
  value: GridOptions[K] | null,
): void {
  if (value != null) options[key] = value;
}

/**
 * Snapshot the component's inputs into core GridOptions. Mirrors the React wrapper's
 * `getGridOptions(props)`, reading Angular signal inputs instead of props. Event callbacks are
 * bridged separately by the component (they become Angular outputs).
 */
export function getGridOptions(grid: AwbGrid, adapters: NgAdapters): GridOptions {
  const options: GridOptions = {};
  setIfDefined(options, "headerHeight", grid.headerHeight());
  setIfDefined(options, "leafHeaderHeight", grid.leafHeaderHeight());
  setIfDefined(options, "parentHeaderHeight", grid.parentHeaderHeight());
  setIfDefined(options, "rowHeight", grid.rowHeight());
  setIfDefined(options, "pinnedTopRowData", grid.pinnedTopRowData());
  setIfDefined(options, "pinnedBottomRowData", grid.pinnedBottomRowData());
  setIfDefined(options, "getRowId", grid.getRowId());
  setIfDefined(options, "rowIdKey", grid.rowIdKey());
  setIfDefined(options, "overscanRowCount", grid.overscanRowCount());
  setIfDefined(options, "minResizeWidth", grid.minResizeWidth());
  setIfDefined(options, "maxColumnWidth", grid.maxColumnWidth());
  setIfDefined(options, "autosizeColumnsOnDataChange", grid.autosizeColumnsOnDataChange());
  setIfDefined(options, "allowExportAsCSV", grid.allowExportAsCSV());
  setIfDefined(options, "allowExportAsExcel", grid.allowExportAsExcel());
  setIfDefined(options, "pagination", grid.pagination());
  setIfDefined(options, "rowNumbers", grid.rowNumbers());
  setIfDefined(options, "rowHover", grid.rowHover());
  setIfDefined(options, "columnHover", grid.columnHover());
  setIfDefined(options, "zebraRows", grid.zebraRows());
  setIfDefined(options, "getRowClass", grid.getRowClass());
  setIfDefined(options, "getRowStyle", grid.getRowStyle());
  setIfDefined(options, "ariaLabel", grid.ariaLabel());
  setIfDefined(options, "ariaLabelledBy", grid.ariaLabelledBy());
  setIfDefined(options, "highlightActiveCell", grid.highlightActiveCell());
  setIfDefined(options, "rowSelection", grid.rowSelection());
  setIfDefined(options, "cellSelection", grid.cellSelection());
  setIfDefined(options, "rangeSelection", grid.rangeSelection());
  setIfDefined(options, "columnSelection", grid.columnSelection());
  setIfDefined(options, "showColumnButtonsOnHover", grid.showColumnButtonsOnHover());
  setIfDefined(options, "selectAllRowsOnHeaderClick", grid.selectAllRowsOnHeaderClick());
  setIfDefined(options, "clearSelectionOnBodyClick", grid.clearSelectionOnBodyClick());
  setIfDefined(options, "pageSize", grid.pageSize());
  setIfDefined(options, "pageSizes", grid.pageSizes());
  setIfDefined(options, "serverSideBlockSize", grid.serverSideBlockSize());
  setIfDefined(options, "rowModelType", grid.rowModelType());
  setIfDefined(options, "getGroupChildCount", grid.getGroupChildCount());
  setIfDefined(options, "paginationUnknownTotalTooltip", grid.paginationUnknownTotalTooltip());
  setIfDefined(options, "undoLimit", grid.undoLimit());
  setIfDefined(options, "editTrigger", grid.editTrigger());
  setIfDefined(options, "readOnlyEdit", grid.readOnlyEdit());
  setIfDefined(options, "initialSort", grid.initialSort());
  setIfDefined(options, "multiSortKey", grid.multiSortKey());
  setIfDefined(options, "showSortPriority", grid.showSortPriority());
  setIfDefined(options, "pinnedRowsEditable", grid.pinnedRowsEditable());
  setIfDefined(options, "rowPinningMenu", grid.rowPinningMenu());
  setIfDefined(options, "suppressKeyboardEdit", grid.suppressKeyboardEdit());
  setIfDefined(options, "suppressTypeToEdit", grid.suppressTypeToEdit());
  setIfDefined(options, "moveAfterEdit", grid.moveAfterEdit());
  setIfDefined(options, "commitOnBlur", grid.commitOnBlur());
  setIfDefined(options, "reevaluateOnEdit", grid.reevaluateOnEdit());
  setIfDefined(options, "groupDisplayType", grid.groupDisplayType());
  setIfDefined(options, "groupColumnDef", grid.groupColumnDef());
  setIfDefined(options, "groupDefaultExpanded", grid.groupDefaultExpanded());
  setIfDefined(options, "groupSortMode", grid.groupSortMode());
  setIfDefined(options, "treeData", grid.treeData());
  setIfDefined(options, "groupRowsSelectable", grid.groupRowsSelectable());
  setIfDefined(options, "isRowPinned", grid.isRowPinned());
  setIfDefined(options, "groupRowsSticky", grid.groupRowsSticky());
  setIfDefined(options, "isFullWidthRow", grid.isFullWidthRow());
  setIfDefined(options, "tooltip", grid.tooltip());
  setIfDefined(options, "quickFilter", grid.quickFilter());
  setIfDefined(options, "columnPanel", grid.columnPanel());
  setIfDefined(options, "toolbar", grid.toolbar());
  setIfDefined(options, "savedViews", grid.savedViews());
  setIfDefined(options, "loadingMessage", grid.loadingMessage());
  setIfDefined(options, "noRowsMessage", grid.noRowsMessage());
  setIfDefined(options, "filterDebounceMs", grid.filterDebounceMs());
  setIfDefined(options, "cellFlashDuration", grid.cellFlashDuration());
  setIfDefined(options, "cellFadeDuration", grid.cellFadeDuration());
  setIfDefined(options, "icons", grid.icons());
  setIfDefined(options, "theme", grid.theme());
  setIfDefined(options, "suppressStyleInjection", grid.suppressStyleInjection());
  setIfDefined(options, "styleNonce", grid.styleNonce());

  const fullWidthCellRenderer = grid.fullWidthCellRenderer();
  if (fullWidthCellRenderer != null) {
    options.fullWidthCellRenderer = adapters.adaptCellRenderer(fullWidthCellRenderer);
  }
  const defaultColDef = grid.defaultColDef();
  if (defaultColDef != null) options.defaultColDef = adapters.adaptDefaultColDef(defaultColDef);

  // Forward only the boolean intent to core: false disables the menu (native menu shows);
  // everything else (true / omitted / a function) leaves core at its "show menu" default and lets
  // the body-menu adapter apply the function arm (so TemplateRef slots are handled). This avoids
  // running a user callback twice (once in core, once in the adapter).
  if (grid.bodyContextMenu() === false) options.bodyContextMenu = false;

  if (grid.rowModelType() === "serverSide") {
    setIfDefined(options, "serverSideDataSource", grid.serverSideDataSource());
    setIfDefined(options, "serverSideAggregationSource", grid.serverSideAggregationSource());
  }

  return options;
}
