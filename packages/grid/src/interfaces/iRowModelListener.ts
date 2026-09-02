import { RowDataChangeReason } from "./iRowModel";
import { IRowNode } from "./iRowNode";
import { ColDef } from "./column";
import { AggregateModel, AggregateScope } from "./aggregate";
import { PivotDiscovery, PivotResolution } from "./pivot";

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
  /**
   * Pushed by the model mid-request, after discovering the pivot header structure and BEFORE
   * onRows: the core reconciles the generated pivot columns (reusing live instances by colId) and
   * returns generated-leaf colId → instanceID, which the model stamps group-node aggregateValues
   * with. Synchronous by design — rows must paint against the already-reconciled header. Absent
   * listener method = identity resolution (colIds double as instanceIDs; model tests use this).
   */
  onPivotResult?: (id: number, discovery: PivotDiscovery) => PivotResolution;
  onRows: (id: number, payload: IRowModelOnRowsParams) => void;
  onAggregates: (id: number, payload: IRowModelOnAggregatesParams) => void;
  onLoadingEnd: (id: number) => void;
  onError: (id: number, err: unknown) => void;
};
