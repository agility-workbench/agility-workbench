import { AggregateModel, AggregateScope } from "./aggregate";
import { Column } from "../column/column";
import { FilterModel } from "./filter";
import { IRowModelListener } from "./iRowModelListener";
import { IRowNode } from "./iRowNode";
import { SortModel } from "./sort";

export type RowModelType = "clientSide" | "serverSide";
export type RowDataChangeReason = "init" | "refresh" | "filter" | "sort" | "pagination" | "page" | "viewport" | "aggregateScope" | "aggregateModel" | "transaction" | "group";

export interface RowTransaction<Row = any> {
  add?: Row[];
  update?: { rowId: string; row: Row }[];
  remove?: string[];
}

export interface RowTransactionResult {
  added: number;
  updated: number;
  removed: number;
}

export interface IRowModelRequestParams {
  readonly id: number;
  readonly reason: RowDataChangeReason;
  readonly sortModel: SortModel;
  readonly filterModel: FilterModel;
  readonly paginate: boolean;
  readonly range: { start: number; end: number };
  readonly loadRange?: { start: number; end: number };
  readonly aggregateScope: AggregateScope;
  readonly aggregates: AggregateModel[];
  readonly aggregateReason?: "model" | "scope" | "rows" | "columns" | "dataSource";
  readonly leafColumns: Column[];
  // Columns the rows are grouped by, in grouping-level order. Empty = no grouping.
  readonly groupColumns: Column[];
  // When present, this request is a pure expand/collapse of a single group node — the model
  // updates its expansion state and re-flattens the view without rebuilding the group tree.
  readonly groupExpansion?: { groupId: string; expanded?: boolean };
}

export interface IRowModel<Row = any> {
  readonly listener: IRowModelListener;

  getType(): RowModelType;
  isValid(): boolean;

  // data update
  setRows(rows: any[]): void;

  // Incremental add / update / remove of rows without a full data replacement. Node identity is
  // preserved for updated rows so renderers (e.g. change-flash) can detect deltas. Returns counts
  // of rows actually applied. The caller (core) is responsible for re-deriving the view afterwards.
  applyTransaction(tx: RowTransaction): RowTransactionResult;

  // accessors for what the viewport needs
  getRowCount(): number;                    // total displayed (may be estimate)
  getViewCount(): number;                   // total in current view (after filter/sort/pagination)
  getRowNodeAt(index: number): IRowNode<Row> | undefined;
  getRowNodeAtViewIndex(displayIndex: number): IRowNode<Row> | undefined;

  // iteration
  forEachNode(callback: (node: IRowNode, idx: number) => void): void;
  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void;

  // All synthetic group nodes in the current grouping (empty when not grouping). Used e.g. to size
  // columns to their per-group aggregate values.
  getGroupNodes(): IRowNode<Row>[];

  // identity
  getRowNode(id: string): IRowNode<Row> | undefined;

  // in-place cell edit: mutate a single field of a row's data. Returns true if the row exists.
  setCellValue(rowId: string, key: string, value: any): boolean;

  applyRequest(params: IRowModelRequestParams): void;

  // aggregation
  setAggregateScope(scope: AggregateScope): void | Promise<void>;
  getAggregateValues(): Map<string, any>;

  // lifecycle
  destroy(): void;
}
