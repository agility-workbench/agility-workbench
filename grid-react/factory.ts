import { GridCore, GridOptions } from "@grid";
import { CanvasMeasurer } from "@grid/renderer";
import { GridReactProps } from "./interface";

export function createCore(options: GridOptions): GridCore {
  return new GridCore(new CanvasMeasurer(), options);
}

export function getGridOptions(props: GridReactProps): GridOptions {
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
  if (props.pageSize) options.pageSize = props.pageSize;
  if (props.pageSizes) options.pageSizes = props.pageSizes;
  if (props.serverSideBlockSize) options.serverSideBlockSize = props.serverSideBlockSize;
  if (props.rowModelType) options.rowModelType = props.rowModelType;
  if (props.undoLimit != null) options.undoLimit = props.undoLimit;
  if (props.reevaluateOnEdit != null) options.reevaluateOnEdit = props.reevaluateOnEdit;
  if (props.serverSideDataSource) options.serverSideDataSource = props.serverSideDataSource;
  if (props.serverSideAggregationSource) options.serverSideAggregationSource = props.serverSideAggregationSource;
  if (props.icons) options.icons = props.icons;
  return options;
}
