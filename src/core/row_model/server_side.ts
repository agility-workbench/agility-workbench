import { createRowIdFactory, GridOptions } from "./node";
import { IRowModel, RowModelType } from "../../interfaces/IRowModel";
import { IRowNode } from "../../interfaces/IRowNode";
import { FilterDef } from "../../interfaces/filter";
import { SortDef } from "../../interfaces/sort";
import { AggregateModel, AggregateScope } from "../../interfaces/aggregate";

export interface ServerSideRequest {
  filters: FilterDef[];
  sorts: SortDef[];
  page: number;
  pageSize: number;
}

export interface ServerSideResult {
  rows: any[];
  totalRows?: number;
}

export type ServerSideDataSource = (request: ServerSideRequest) => Promise<ServerSideResult> | ServerSideResult;

export interface ServerSideAggregationRequest {
  aggregates: AggregateModel[];
  filters: FilterDef[];
  sorts: SortDef[];
  scope: AggregateScope;
  page: number;
  pageSize: number;
}

export type ServerSideAggregationResult = {
  values: Record<string, any>;
} | Record<string, any>;

export type ServerSideAggregationSource = (request: ServerSideAggregationRequest) => Promise<ServerSideAggregationResult> | ServerSideAggregationResult;

export class ServerSideRowModel<Row extends object = any> implements IRowModel<Row> {
  nodes: IRowNode<Row>[] = [];
  nodesMap: Map<string, IRowNode<Row>> = new Map();

  filteredIdx: number[] = [];
  sortedIdx: number[] = [];
  viewIdx: number[] = [];

  sorts: SortDef[] = [];
  filters: FilterDef[] = [];

  serverDataSource?: ServerSideDataSource;
  serverAggregationSource?: ServerSideAggregationSource;

  paginate: boolean = false;
  pageIndex = 0;
  pageSize = 100;

  private serverRequestSeq = 0;

  private getId: (row: Row) => string;

  constructor(opts: GridOptions<Row>, serverDataSource?: ServerSideDataSource, serverAggregationSource?: ServerSideAggregationSource) {
    this.getId = createRowIdFactory(opts);
    this.serverDataSource = serverDataSource;
    this.serverAggregationSource = serverAggregationSource;
  }

  getType(): RowModelType {
    return "serverSide";
  }

  isValid(): boolean {
    return this.serverDataSource != null;
  }

  setRows(rows: Row[], totalRows: number = 0) {
    this.nodes = rows.map((r, i) => ({
      id: this.getId(r),
      data: r,
      rowIndex: i,
      selected: false,
      level: 0,
      isGroup: false,
      expanded: false,
      type: "leaf",
      isExpanded: false,
    }));

    // initial: no filter, no sort
    const n = this.nodes.length;
    this.filteredIdx = new Array(n);
    for (let i = 0; i < n; i++) this.filteredIdx[i] = i;

    // by default sortedIdx = filteredIdx (stable)
    this.sortedIdx = this.filteredIdx.slice();

    this.rebuildView();
  }

  async refreshData(): Promise<boolean> {
    const filters = this.filters
      .map(f => {
        return {
          key: f.key,
          type: f.type,
          v: f.v,
        };
      })
      .filter(Boolean) as ServerSideRequest["filters"];

    const sorts = this.sorts
      .map(s => {
        return {
          key: s.key,
          dir: s.dir,
        };
      })
      .filter(Boolean) as ServerSideRequest["sorts"];

    const pageSize = this.paginate ? this.pageSize : Math.max(1, this.pageSize || this.nodes.length || 1);

    const req: ServerSideRequest = {
      filters,
      sorts,
      page: this.paginate ? this.pageIndex : 0,
      pageSize: pageSize,
    };

    const requestId = ++this.serverRequestSeq;
    try {
      const result = await this.serverDataSource?.(req);
      if (requestId !== this.serverRequestSeq) return false; // outdated
      const rows = result?.rows ?? [];
      const totalRows = result?.totalRows ?? rows.length;
      this.setRows(rows, totalRows);
    } catch (err) {
      console.error("Failed to fetch server-side rows", err);
      return false;
    }
    return true;
  }

  getRowCount(): number {
    return this.nodes.length;
  }

  forEachNode(callback: (node: IRowNode, idx: number) => void): void {
    this.nodes.forEach(callback);
  }

  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void {
    this.sortedIdx.forEach((i: number) => callback(this.nodes[i], i));
  }

  setPagination(paginate: boolean, pageSize: number, pageIndex: number) {
    this.paginate = paginate;
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
    this.rebuildView();
  }

  setPage(pageSize: number, pageIndex: number) {
    this.pageIndex = pageIndex;
    this.pageSize = pageSize;
    this.rebuildView();
  }

  rebuildView() {
    const start = this.pageIndex * this.pageSize;
    const end = Math.min(start + this.pageSize, this.sortedIdx.length);
    this.viewIdx = this.sortedIdx.slice(start, end);

    // optionally update rowIndex to "view row index" if you want
    // but I'd keep node.rowIndex as index within displayed list or source list
  }

  getViewCount() {
    return this.viewIdx.length;
  }

  getRowNodeAt(index: number): IRowNode<Row> | undefined {
    if (index < 0 || index >= this.nodes.length) return undefined;
    return this.nodes[index];
  }

  getRowNodeAtViewIndex(viewRowIndex: number): IRowNode<Row> | undefined {
    const nodeIdx = this.viewIdx[viewRowIndex];
    if (nodeIdx == null) return undefined;
    return this.nodes[nodeIdx];
  }

  getRowNode(id: string): IRowNode<Row> | undefined {
    return this.nodesMap.get(id);
  }

  async setSorts(sorts: SortDef[]): Promise<void> {
    this.sorts = sorts;
    await this.refreshData();
  }

  setFilters(filters: FilterDef[]): void {
    this.filters = filters;
  }

  async setAggregateScope(scope: AggregateScope): Promise<void> {
    console.warn("Setting server-side aggregation scope on 'serverSide' row model is not implemented yet.");
  }

  async reAggregate(): Promise<void> {
    console.warn("Re-aggregating server-side aggregation on 'serverSide' row model is not implemented yet.");
  }

  destroy(): void {
    this.nodesMap.clear();
  }

}
