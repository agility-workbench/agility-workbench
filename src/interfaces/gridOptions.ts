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
  pageSize?: number;
  pageSizes?: number[];
  serverSideBlockSize?: number;
  rowModelType?: RowModelType;
  serverSideDataSource?: IServerSideDataSource;
  serverSideAggregationSource?: IServerSideDataSource["getAggregates"];
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
  pageSize: number;
  pageSizes: number[];
  serverSideBlockSize: number;
  icons?: GridIconMap;
}
