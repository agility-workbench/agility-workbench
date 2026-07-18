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
  if (props.allowExportAsCSV) options.allowExportAsCSV = props.allowExportAsCSV;
  if (props.allowExportAsExcel) options.allowExportAsExcel = props.allowExportAsExcel;
  if (props.pagination) options.pagination = props.pagination;
  if (props.rowNumbers) options.rowNumbers = props.rowNumbers;
  if (props.rowSelection != null) options.rowSelection = props.rowSelection;
  if (props.selectAllRowsOnHeaderClick != null) options.selectAllRowsOnHeaderClick = props.selectAllRowsOnHeaderClick;
  if (props.pageSize) options.pageSize = props.pageSize;
  if (props.pageSizes) options.pageSizes = props.pageSizes;
  if (props.serverSideBlockSize) options.serverSideBlockSize = props.serverSideBlockSize;
  if (props.rowModelType) options.rowModelType = props.rowModelType;
  if (props.undoLimit != null) options.undoLimit = props.undoLimit;
  if (props.reevaluateOnEdit != null) options.reevaluateOnEdit = props.reevaluateOnEdit;
  if (props.groupDisplayType) options.groupDisplayType = props.groupDisplayType;
  if (props.groupDefaultExpanded != null) options.groupDefaultExpanded = props.groupDefaultExpanded;
  if (props.groupRowsSelectable != null) options.groupRowsSelectable = props.groupRowsSelectable;
  if (props.quickFilter != null) options.quickFilter = props.quickFilter;
  if (props.serverSideDataSource) options.serverSideDataSource = props.serverSideDataSource;
  if (props.serverSideAggregationSource) options.serverSideAggregationSource = props.serverSideAggregationSource;
  if (props.icons) options.icons = props.icons;
  if (props.theme) options.theme = props.theme;
  return options;
}
