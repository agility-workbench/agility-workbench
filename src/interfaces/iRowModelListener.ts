import { RowDataChangeReason } from "./iRowModel";
import { IRowNode } from "./iRowNode";
import { ColDef } from "./column";
import { AggregateModel, AggregateScope } from "./aggregate";

export interface IRowModelOnRowsParams {
  reason: RowDataChangeReason;
  rows: IRowNode[];
  visibleStart: number;     // index of first row in viewport
  visibleEnd: number;       // index of last row in viewport
  rowCount?: number;          // if known
  storeInfo?: any;            // optional (block cache / group state)
}

export interface IRowModelOnAggregatesParams {
  reason: "model" | "scope" | "rows" | "columns" | "dataSource";
  scope: AggregateScope;
  aggregateModel: AggregateModel[];
  valuesAvailable: boolean;
}

export type IRowModelListener = {
  onLoadingStart: (id: number) => void;
  onServerSideSchema?: (id: number, payload: { columns: ColDef[]; schemaVersion?: string }) => void;
  onRows: (id: number, payload: IRowModelOnRowsParams) => void;
  onAggregates: (id: number, payload: IRowModelOnAggregatesParams) => void;
  onLoadingEnd: (id: number) => void;
  onError: (id: number, err: unknown) => void;
};
