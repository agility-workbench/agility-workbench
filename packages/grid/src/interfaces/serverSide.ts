import { AggregateModel, AggregateScope } from "./aggregate";
import { ColDef } from "./column";
import { FilterType } from "./filter";
import { SortDir } from "./sort";

export interface IServerSideFilter {
  key: string;
  filters: Array<{
    type: FilterType;
    values: any;
  }>;
  join?: "and" | "or";
}

export interface IServerSideSort {
  key: string;
  dir: SortDir;
}

export interface IServerSideRequest {
  filters: IServerSideFilter[];
  sorts: IServerSideSort[];
  startRow: number | undefined;
  endRow: number | undefined;
}

export interface IServerSideResult {
  rows: any[];
  totalRows?: number;
  columns?: ColDef[];
  schemaVersion?: string;
}

export interface IServerSideAggregationRequest {
  aggregates: AggregateModel[];
  aggregateScope: AggregateScope;
  filters: IServerSideFilter[];
  sorts: IServerSideSort[];
  startRow: number | undefined;
  endRow: number | undefined;
}

export interface IServerSideAggregationResult {
  values: Record<string, any>;
}

export interface IServerSideGetRowsParams {
  request: IServerSideRequest;

  success: (result: IServerSideResult) => void;
  error: (error: any) => void;
}

export interface IServerSideAggregationParams {
  request: IServerSideAggregationRequest;

  success: (result: IServerSideAggregationResult) => void;
  error: (error: any) => void;
}

export interface IServerSideDataSource {
  getRows: (request: IServerSideGetRowsParams) => void | IServerSideResult | Promise<void | IServerSideResult>;

  getAggregates?: (request: IServerSideAggregationParams) => void | IServerSideAggregationResult | Promise<void | IServerSideAggregationResult>;
}
