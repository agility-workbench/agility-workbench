import { RowModelType } from "./iRowModel";
import { IServerSideDataSource } from "./serverSide";
import { GridIconMap } from "../theme/icons";

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
  icons?: GridIconMap;
}
