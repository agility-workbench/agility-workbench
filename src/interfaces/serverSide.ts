import { AggregateModel, AggregateScope } from "./aggregate";
import { FilterModel } from "./filter";
import { SortModel } from "./sort";

export interface IServerSideRequest {
  filters: FilterModel[];
  sorts: SortModel[];
  startRow: number | undefined;
  endRow: number | undefined;
}

export interface IServerSideResult {
  rows: any[];
  totalRows?: number;
}

export interface IServerSideAggregationRequest {
  aggregates: AggregateModel[];
  aggregateScope: AggregateScope;
  filters: FilterModel[];
  sorts: SortModel[];
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
  getRows: (request: IServerSideGetRowsParams) => void;

  getAggregates?: (request: IServerSideAggregationParams) => void;
}
