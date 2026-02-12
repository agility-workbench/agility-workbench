import { FilterModel } from "../interfaces/filter";
import { SortModel } from "../interfaces/sort";
import { AggregateScope } from "../interfaces/aggregate";
import { IRowModel, IRowModelRequestParams, RowDataChangeReason, RowModelType } from "../interfaces/iRowModel";
import { createRowIdFactory, IRowNode } from "../interfaces/iRowNode";
import { performFilter } from "../csrm/filter";
import { GridOptions } from "../interfaces/gridOptions";
import { IRowModelListener } from "@grid/interfaces/iRowModelListener";

export class ClientSideRowModel<Row extends object = any> implements IRowModel<Row> {
  private nodes: IRowNode<Row>[] = [];
  private nodesMap: Map<string, IRowNode<Row>> = new Map();

  private filteredIdx: number[] = [];
  private sortedIdx: number[] = [];
  private viewIdx: number[] = [];

  paginate: boolean = false;
  startIdx = 0;
  endIdx = 100;

  private getId: (row: Row) => string;

  constructor(opts: GridOptions, readonly listener: IRowModelListener) {
    this.getId = createRowIdFactory(opts);
  }

  getType(): RowModelType {
    return "clientSide";
  }

  isValid(): boolean {
    return true;
  }

  setRows(rows: Row[]) {
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
      viewIndex: -1,
    }));

    // initial: no filter, no sort
    const n = this.nodes.length;
    this.filteredIdx = new Array(n);
    for (let i = 0; i < n; i++) this.filteredIdx[i] = i;

    // by default sortedIdx = filteredIdx (stable)
    this.sortedIdx = this.filteredIdx.slice();

    // Refresh or init must be called upon setting rows.
    // this.rebuildView();
  }

  getRowCount(): number {
    return this.nodes.length;
  }

  private setPagination(paginate: boolean, startIdx: number, endIdx: number) {
    this.paginate = paginate;
    this.startIdx = startIdx;
    this.endIdx = endIdx;
  }

  private rebuildView() {
    const end = this.paginate ? this.endIdx : undefined;
    this.viewIdx = this.sortedIdx.slice(this.startIdx, end);
    for (let i = 0; i < this.viewIdx.length; i++) {
      const nodeIdx = this.viewIdx[i];
      this.nodes[nodeIdx].viewIndex = i;
    }
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

  forEachNode(callback: (node: IRowNode, idx: number) => void): void {
    this.nodes.forEach(callback);
  }

  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void {
    this.sortedIdx.forEach((i: number) => callback(this.nodes[i], i));
  }

  private setSorts(sorts: SortModel[]): void {
    this.sortedIdx = this.filteredIdx.slice();
    const comparators = sorts.filter(s => s.col && s.dir !== null)
      .map(sort => {
        const { col, dir } = sort;
        const mult = dir === "desc" ? -1 : 1;
        const cmp = col.comparator!;
        return (a: any, b: any, nodeA: IRowNode, nodeB: IRowNode) => cmp(a, b, nodeA, nodeB) * mult;
      })
      .filter(Boolean) as Array<(a: any, b: any, nodeA: IRowNode, nodeB: IRowNode) => number>;

    this.sortedIdx.sort((a, b) => {
      for (const cmp of comparators) {
        const result = cmp(this.nodes[a].data, this.nodes[b].data, this.nodes[a], this.nodes[b]);
        if (result !== 0) return result;
      }
      return 0;
    });
  }

  private applyFilters(filters: FilterModel[]): void {
    this.filteredIdx = performFilter(filters, this.nodes);
  }

  setAggregateScope(scope: AggregateScope): void {
    return;
  }

  reAggregate(): void {
    return;
  }

  applyRequest(params: IRowModelRequestParams): void {
    const { id, sortModels, filterModels, paginate, range, aggregateScope } = params;
    this.listener.onLoadingStart(id);
    if (this.isReasonBeforeStep(params.reason, "filter")) this.applyFilters(filterModels);
    if (this.isReasonBeforeStep(params.reason, "sort")) this.setSorts(sortModels);
    this.setPagination(paginate, range.start, range.end);
    this.rebuildView();
    this.listener.onRows(id, {
      reason: params.reason,
      rows: this.viewIdx.map(i => this.nodes[i]),
      rowCount: this.filteredIdx.length,
      visibleStart: range.start,
      visibleEnd: range.end,
    });
    this.listener.onLoadingEnd(id);
  }

  destroy(): void {
    this.nodesMap.clear();
  }

  private isReasonBeforeStep(reason: RowDataChangeReason, step: RowDataChangeReason): boolean {
    switch (reason) {
      case "filter": return step === "init" || step === "refresh" || step === "filter";
      case "sort": return step === "init" || step === "refresh" || step === "filter" || step === "sort";
      case "page":
      case "pagination":
      case "aggregateScope":
        return false;
    }
    return true;
  }
}
