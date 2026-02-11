import { AggregateScope } from "./aggregate";
import { FilterModel } from "./filter";
import { IRowModelListener } from "./iRowModelListener";
import { IRowNode } from "./iRowNode";
import { SortDef } from "./sort";

export type RowModelType = "clientSide" | "serverSide";
export type RowDataChangeReason = "init" | "refresh" | "filter" | "sort" | "pagination" | "page" | "aggregateScope";

export interface IRowModelRequestParams {
  readonly id: number;
  readonly reason: RowDataChangeReason;
  readonly sortModels: SortDef[];
  readonly filterModels: FilterModel[];
  readonly paginate: boolean;
  readonly range: { start: number; end: number };
  readonly aggregateScope: AggregateScope;
}

export interface IRowModel<Row = any> {
  readonly listener: IRowModelListener;

  getType(): RowModelType;
  isValid(): boolean;

  // data update
  setRows(rows: any[]): void;

  // accessors for what the viewport needs
  getRowCount(): number;                    // total displayed (may be estimate)
  getViewCount(): number;                   // total in current view (after filter/sort/pagination)
  getRowNodeAt(index: number): IRowNode<Row> | undefined;
  getRowNodeAtViewIndex(displayIndex: number): IRowNode<Row> | undefined;

  // iteration
  forEachNode(callback: (node: IRowNode, idx: number) => void): void;
  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void;

  // identity
  getRowNode(id: string): IRowNode<Row> | undefined;

  applyRequest(params: IRowModelRequestParams): void;

  // aggregation
  setAggregateScope(scope: AggregateScope): void | Promise<void>;
  reAggregate(): void | Promise<void>;

  // lifecycle
  destroy(): void;
}
