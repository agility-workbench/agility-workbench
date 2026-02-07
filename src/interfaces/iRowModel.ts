import { AggregateScope } from "./aggregate";
import { FilterModel } from "./filter";
import { IRowNode } from "./iRowNode";
import { SortDef } from "./sort";

export type RowModelType = "clientSide" | "serverSide";

export interface IRowModel<Row = any> {
  getType(): RowModelType;
  isValid(): boolean;

  // data update
  setRows(rows: any[]): void;
  refreshData(): boolean | Promise<boolean>;

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

  // operations the grid triggers
  setSorts(sorts: SortDef[]): void | Promise<void>;
  applyFilters(filters: FilterModel[]): void | Promise<void>;
  setPagination(paginate: boolean, pageSize: number, pageIndex: number): void | Promise<void>;
  setPage(pageSize: number, pageIndex: number): void | Promise<void>;

  // aggregation
  setAggregateScope(scope: AggregateScope): void | Promise<void>;
  reAggregate(): void | Promise<void>;

  // lifecycle
  destroy(): void;
}
