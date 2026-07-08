import { FilterModel } from "../interfaces/filter";
import { SortModel } from "../interfaces/sort";
import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import { IRowModel, IRowModelRequestParams, RowDataChangeReason, RowModelType, RowTransaction, RowTransactionResult } from "../interfaces/iRowModel";
import { createRowIdFactory, IRowNode } from "../interfaces/iRowNode";
import { performFilter } from "../csrm/filter";
import { GridOptions } from "../interfaces/gridOptions";
import { IRowModelListener } from "@grid/interfaces/iRowModelListener";
import { AggregateCalculator } from "../aggregate/calculator";
import { Column } from "../column/column";

export class ClientSideRowModel<Row extends object = any> implements IRowModel<Row> {
  private nodes: IRowNode<Row>[] = [];
  private nodesMap: Map<string, IRowNode<Row>> = new Map();

  private filteredIdx: number[] = [];
  private sortedIdx: number[] = [];
  private viewIdx: number[] = [];
  private aggregateScope: AggregateScope = "all";
  private aggregates: AggregateModel[] = [];
  private leafColumns: Column[] = [];
  private aggregateValues: Map<string, any> = new Map();
  private aggregateCalculator = new AggregateCalculator();

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

  private createNode(row: Row): IRowNode<Row> {
    return {
      id: this.getId(row),
      data: row,
      selected: false,
      level: 0,
      isGroup: false,
      type: "leaf",
      isExpanded: false,
      viewIndex: -1,
    };
  }

  setRows(rows: Row[]) {
    this.nodes = rows.map((r) => this.createNode(r));

    // Index nodes by id so getRowNode / setCellValue can resolve rows by their stable id.
    this.nodesMap.clear();
    for (const node of this.nodes) {
      this.nodesMap.set(node.id, node);
    }

    // initial: no filter, no sort
    const n = this.nodes.length;
    this.filteredIdx = new Array(n);
    for (let i = 0; i < n; i++) this.filteredIdx[i] = i;

    // by default sortedIdx = filteredIdx (stable)
    this.sortedIdx = this.filteredIdx.slice();

    // Refresh or init must be called upon setting rows.
    // this.rebuildView();
  }

  // Apply an incremental add / update / remove against the current node set. This only mutates the
  // node store; the caller re-derives filter/sort/view via applyRequest afterwards. Removes are
  // applied first, then updates (data replaced in place, node identity kept), then adds appended.
  applyTransaction(tx: RowTransaction<Row>): RowTransactionResult {
    let removed = 0;
    if (tx.remove?.length) {
      const removeIds = new Set(tx.remove);
      const kept: IRowNode<Row>[] = [];
      for (const node of this.nodes) {
        if (removeIds.has(node.id) && this.nodesMap.delete(node.id)) {
          removed++;
        } else {
          kept.push(node);
        }
      }
      if (removed > 0) this.nodes = kept;
    }

    let updated = 0;
    if (tx.update?.length) {
      for (const { rowId, row } of tx.update) {
        const node = this.nodesMap.get(rowId);
        if (!node) continue;
        // Replace data in place so the node object (and its identity) is preserved — renderers that
        // diff against the previous node/value (change-flash, sparklines) keep working.
        node.data = row;
        updated++;
      }
    }

    let added = 0;
    if (tx.add?.length) {
      for (const row of tx.add) {
        const node = this.createNode(row);
        if (this.nodesMap.has(node.id)) {
          // An id collision with an existing row is treated as an update rather than a duplicate.
          const existing = this.nodesMap.get(node.id)!;
          existing.data = row;
          updated++;
          continue;
        }
        this.nodes.push(node);
        this.nodesMap.set(node.id, node);
        added++;
      }
    }

    return { added, updated, removed };
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

  setCellValue(rowId: string, key: string, value: any): boolean {
    const node = this.nodesMap.get(rowId);
    if (!node) return false;
    (node.data as any)[key] = value;
    return true;
  }

  forEachNode(callback: (node: IRowNode, idx: number) => void): void {
    this.nodes.forEach(callback);
  }

  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void {
    this.sortedIdx.forEach((i: number) => callback(this.nodes[i], i));
  }

  private setSorts(sort: SortModel): void {
    this.sortedIdx = this.filteredIdx.slice();
    const comparators = sort.items.filter(s => s.col && s.dir !== null)
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

  private applyFilters(filter: FilterModel): void {
    this.filteredIdx = performFilter(filter.items, this.nodes);
  }

  setAggregateScope(scope: AggregateScope): void {
    this.aggregateScope = scope;
  }

  private reAggregate(): void {
    this.aggregateValues.clear();
    if (this.aggregateScope === "none" || this.aggregates.length === 0) return;

    const rows = this.getAggregateRows();
    this.aggregateValues = this.aggregateCalculator.calculateAggregates(this.leafColumns, this.aggregates, rows);
  }

  getAggregateValues(): Map<string, any> {
    return new Map(this.aggregateValues);
  }

  applyRequest(params: IRowModelRequestParams): void {
    const { id, sortModel, filterModel, paginate, range, aggregateScope } = params;
    const aggregateOnly = params.reason === "aggregateScope" || params.reason === "aggregateModel";
    if (!aggregateOnly) this.listener.onLoadingStart(id);
    this.aggregateScope = aggregateScope;
    this.aggregates = params.aggregates.slice();
    this.leafColumns = params.leafColumns.slice();
    if (this.isReasonBeforeStep(params.reason, "filter")) this.applyFilters(filterModel);
    if (this.isReasonBeforeStep(params.reason, "sort")) this.setSorts(sortModel);
    this.setPagination(paginate, range.start, range.end);
    this.rebuildView();
    this.reAggregate();
    if (!aggregateOnly) {
      this.listener.onRows(id, {
        reason: params.reason,
        rows: this.viewIdx.map(i => this.nodes[i]),
        rowCount: this.filteredIdx.length,
        visibleStart: range.start,
        visibleEnd: range.end,
      });
    }
    this.listener.onAggregates(id, {
      reason: params.aggregateReason ?? (aggregateOnly ? (params.reason === "aggregateScope" ? "scope" : "model") : "rows"),
      scope: this.aggregateScope,
      aggregateModel: this.aggregates.slice(),
      valuesAvailable: this.aggregateValues.size > 0,
    });
    if (!aggregateOnly) this.listener.onLoadingEnd(id);
  }

  destroy(): void {
    this.nodesMap.clear();
  }

  private isReasonBeforeStep(reason: RowDataChangeReason, step: RowDataChangeReason): boolean {
    switch (reason) {
      case "filter": return step === "filter" || step === "sort";
      case "sort": return step === "sort";
      case "page":
      case "pagination":
      case "aggregateScope":
      case "aggregateModel":
        return false;
    }
    return true;
  }

  private getAggregateRows(): IRowNode<Row>[] {
    const indexes = this.aggregateScope === "all" ? this.sortedIdx : this.viewIdx;
    return indexes.map(i => this.nodes[i]).filter(Boolean);
  }

}
