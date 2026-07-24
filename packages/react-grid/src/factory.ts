import { GridCore, GridOptions } from "@agility-workbench/grid";
import { CanvasMeasurer } from "@agility-workbench/grid";
import { GridProps } from "./interface";

export function createCore(options: GridOptions): GridCore {
  return new GridCore(new CanvasMeasurer(), options);
}

export function getGridOptions(props: GridProps): GridOptions {
  const options: GridOptions = {};
  if (props.headerHeight) options.headerHeight = props.headerHeight;
  if (props.leafHeaderHeight) options.leafHeaderHeight = props.leafHeaderHeight;
  if (props.parentHeaderHeight) options.parentHeaderHeight = props.parentHeaderHeight;
  if (props.rowHeight) options.rowHeight = props.rowHeight;
  if (props.getRowId) options.getRowId = props.getRowId;
  if (props.rowIdKey) options.rowIdKey = props.rowIdKey;
  if (props.overscanRowCount) options.overscanRowCount = props.overscanRowCount;
  if (props.minResizeWidth != null) options.minResizeWidth = props.minResizeWidth;
  if (props.maxColumnWidth != null) options.maxColumnWidth = props.maxColumnWidth;
  if (props.allowExportAsCSV) options.allowExportAsCSV = props.allowExportAsCSV;
  if (props.allowExportAsExcel) options.allowExportAsExcel = props.allowExportAsExcel;
  if (props.pagination) options.pagination = props.pagination;
  if (props.rowNumbers) options.rowNumbers = props.rowNumbers;
  if (props.rowHover != null) options.rowHover = props.rowHover;
  if (props.columnHover != null) options.columnHover = props.columnHover;
  if (props.zebraRows != null) options.zebraRows = props.zebraRows;
  if (props.getRowClass) options.getRowClass = props.getRowClass;
  if (props.getRowStyle) options.getRowStyle = props.getRowStyle;
  if (props.onCellClicked) options.onCellClicked = props.onCellClicked;
  if (props.onRowClicked) options.onRowClicked = props.onRowClicked;
  if (props.onCellValueChanged) options.onCellValueChanged = props.onCellValueChanged;
  if (props.onSelectionChanged) options.onSelectionChanged = props.onSelectionChanged;
  if (props.onSortChanged) options.onSortChanged = props.onSortChanged;
  if (props.highlightActiveCell != null) options.highlightActiveCell = props.highlightActiveCell;
  if (props.rowSelection != null) options.rowSelection = props.rowSelection;
  if (props.cellSelection != null) options.cellSelection = props.cellSelection;
  if (props.rangeSelection != null) options.rangeSelection = props.rangeSelection;
  if (props.columnSelection != null) options.columnSelection = props.columnSelection;
  if (props.showColumnButtonsOnHover != null) options.showColumnButtonsOnHover = props.showColumnButtonsOnHover;
  if (props.selectAllRowsOnHeaderClick != null) options.selectAllRowsOnHeaderClick = props.selectAllRowsOnHeaderClick;
  // Forward only the boolean intent to core: false disables the menu (native menu shows); everything
  // else (true / omitted / a function) leaves core at its "show menu" default and lets the React
  // body-menu adapter apply the function arm (so React-node slots are handled). This avoids running
  // a user callback twice (once in core, once in the adapter).
  if (props.bodyContextMenu === false) options.bodyContextMenu = false;
  if (props.pageSize) options.pageSize = props.pageSize;
  if (props.pageSizes) options.pageSizes = props.pageSizes;
  if (props.serverSideBlockSize) options.serverSideBlockSize = props.serverSideBlockSize;
  if (props.rowModelType) options.rowModelType = props.rowModelType;
  if (props.undoLimit != null) options.undoLimit = props.undoLimit;
  if (props.editTrigger != null) options.editTrigger = props.editTrigger;
  if (props.initialSort != null) options.initialSort = props.initialSort;
  if (props.suppressKeyboardEdit != null) options.suppressKeyboardEdit = props.suppressKeyboardEdit;
  if (props.suppressTypeToEdit != null) options.suppressTypeToEdit = props.suppressTypeToEdit;
  if (props.moveAfterEdit != null) options.moveAfterEdit = props.moveAfterEdit;
  if (props.commitOnBlur != null) options.commitOnBlur = props.commitOnBlur;
  if (props.reevaluateOnEdit != null) options.reevaluateOnEdit = props.reevaluateOnEdit;
  if (props.groupDisplayType) options.groupDisplayType = props.groupDisplayType;
  if (props.groupDefaultExpanded != null) options.groupDefaultExpanded = props.groupDefaultExpanded;
  if (props.groupRowsSelectable != null) options.groupRowsSelectable = props.groupRowsSelectable;
  if (props.quickFilter != null) options.quickFilter = props.quickFilter;
  if (props.loadingMessage != null) options.loadingMessage = props.loadingMessage;
  if (props.noRowsMessage != null) options.noRowsMessage = props.noRowsMessage;
  if (props.filterDebounceMs != null) options.filterDebounceMs = props.filterDebounceMs;
  if (props.cellFlashDuration != null) options.cellFlashDuration = props.cellFlashDuration;
  if (props.cellFadeDuration != null) options.cellFadeDuration = props.cellFadeDuration;
  if (props.rowModelType === "serverSide" && props.serverSideDataSource) {
    options.serverSideDataSource = props.serverSideDataSource;
  }
  if (props.rowModelType === "serverSide" && props.serverSideAggregationSource) {
    options.serverSideAggregationSource = props.serverSideAggregationSource;
  }
  if (props.icons) options.icons = props.icons;
  if (props.theme) options.theme = props.theme;
  return options;
}
