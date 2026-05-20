import { IRowModel, IRowModelRequestParams, RowModelType } from "../interfaces/iRowModel";
import { createRowIdFactory, IRowNode } from "../interfaces/iRowNode";
import { AggregateModel, AggregateScope, AggregateType } from "../interfaces/aggregate";
import { GridOptions } from "../interfaces/gridOptions";
import { IRowModelListener } from "../interfaces/iRowModelListener";
import { AggregateCalculator } from "../aggregate/calculator";
import { Column } from "../column/column";
import {
  IServerSideAggregationRequest,
  IServerSideDataSource,
  IServerSideFilter,
  IServerSideRequest,
  IServerSideResult,
  IServerSideSort,
} from "../interfaces/serverSide";

export type ServerSideRequest = IServerSideRequest;
export type ServerSideResult = IServerSideResult;
export type ServerSideDataSource = IServerSideDataSource;
export type ServerSideAggregationRequest = IServerSideAggregationRequest;
export type ServerSideAggregationSource = NonNullable<IServerSideDataSource["getAggregates"]>;

export class ServerSideRowModel<Row extends object = any> implements IRowModel<Row> {
  private nodes: IRowNode<Row>[] = [];
  private nodesMap: Map<string, IRowNode<Row>> = new Map();
  private nodesByRowIndex: Map<number, IRowNode<Row>> = new Map();

  private rowCount = 0;
  private viewStartRow = 0;
  private viewEndRow = 0;
  private paginate = false;
  private aggregateScope: AggregateScope = "all";
  private aggregates: AggregateModel[] = [];
  private leafColumns: Column[] = [];
  private aggregateValues: Map<string, any> = new Map();
  private aggregateCalculator = new AggregateCalculator();
  private aggregateRequestSeq = 0;

  private activeRequestId = -1;
  private requestGeneration = 0;
  private lastRequestParams: IRowModelRequestParams | null = null;

  private getId: (row: Row) => string;

  constructor(
    opts: GridOptions,
    readonly listener: IRowModelListener,
    public serverDataSource?: IServerSideDataSource,
    public serverAggregationSource?: IServerSideDataSource["getAggregates"],
  ) {
    this.getId = createRowIdFactory(opts);
  }

  getType(): RowModelType {
    return "serverSide";
  }

  isValid(): boolean {
    return this.serverDataSource?.getRows != null;
  }

  setRows(rows: Row[], totalRows: number = rows.length, startRow: number = 0, replace: boolean = true) {
    this.rowCount = totalRows;
    if (replace) {
      this.nodesMap.clear();
      this.nodesByRowIndex.clear();
    }
    const viewOffset = this.paginate ? this.viewStartRow : 0;
    rows.forEach((r, i) => {
      const rowIndex = startRow + i;
      const existing = this.nodesByRowIndex.get(rowIndex);
      if (existing) {
        this.nodesMap.delete(existing.id);
      }

      const node: IRowNode<Row> = {
        id: this.getId(r),
        data: r,
        selected: existing?.selected ?? false,
        level: 0,
        isGroup: false,
        type: "leaf",
        isExpanded: false,
        viewIndex: rowIndex - viewOffset,
      };
      this.nodesByRowIndex.set(rowIndex, node);
      this.nodesMap.set(node.id, node);
    });
    this.nodes = Array.from(this.nodesByRowIndex.entries())
      .sort(([a], [b]) => a - b)
      .map(([, node]) => node);
  }

  async refreshData(): Promise<boolean> {
    if (!this.lastRequestParams) return false;
    return this.requestRows(this.lastRequestParams);
  }

  getRowCount(): number {
    return this.rowCount;
  }

  forEachNode(callback: (node: IRowNode, idx: number) => void): void {
    this.nodes.forEach(callback);
  }

  forEachNodeAfterFilterAndSort(callback: (node: IRowNode, idx: number) => void): void {
    this.nodes.forEach(callback);
  }

  getViewCount() {
    if (!this.paginate) return this.rowCount;
    return Math.max(0, Math.min(this.rowCount, this.viewEndRow) - this.viewStartRow);
  }

  getRowNodeAt(index: number): IRowNode<Row> | undefined {
    return this.getRowNodeAtViewIndex(index);
  }

  getRowNodeAtViewIndex(viewRowIndex: number): IRowNode<Row> | undefined {
    const absoluteRowIndex = this.paginate ? this.viewStartRow + viewRowIndex : viewRowIndex;
    return this.nodesByRowIndex.get(absoluteRowIndex);
  }

  getRowNode(id: string): IRowNode<Row> | undefined {
    return this.nodesMap.get(id);
  }

  applyRequest(params: IRowModelRequestParams): void {
    if (params.reason !== "viewport") {
      this.lastRequestParams = params;
    }
    this.aggregateScope = this.normalizeAggregateScope(params.aggregateScope);
    this.aggregates = params.aggregates.slice();
    this.leafColumns = params.leafColumns.slice();
    if (params.reason === "aggregateScope" || params.reason === "aggregateModel") {
      void this.reAggregate(params.id, params.reason, params.aggregateReason);
      return;
    }
    if (this.aggregates.length > 0) {
      this.aggregateRequestSeq++;
    }
    void this.requestRows(params);
  }

  setAggregateScope(scope: AggregateScope): void {
    this.aggregateScope = this.normalizeAggregateScope(scope);
  }

  private async reAggregate(
    requestId: number,
    reason: "aggregateScope" | "aggregateModel" = "aggregateModel",
    aggregateReason?: IRowModelRequestParams["aggregateReason"],
  ): Promise<void> {
    this.aggregateValues.clear();
    const requestSeq = ++this.aggregateRequestSeq;
    if (this.aggregateScope !== "none" && this.aggregates.length > 0) {
      if (this.aggregateScope === "all" && this.serverAggregationSource) {
        await this.requestServerAggregates(requestSeq);
      } else {
        this.calculateLocalAggregates();
      }
    }

    if (requestSeq !== this.aggregateRequestSeq) return;
    this.listener.onAggregates(requestId, {
      reason: aggregateReason ?? (reason === "aggregateScope" ? "scope" : "model"),
      scope: this.aggregateScope,
      aggregateModel: this.aggregates.slice(),
      valuesAvailable: this.aggregateValues.size > 0,
    });
  }

  getAggregateValues(): Map<string, any> {
    return new Map(this.aggregateValues);
  }

  destroy(): void {
    this.nodesMap.clear();
    this.nodesByRowIndex.clear();
  }

  private async requestRows(params: IRowModelRequestParams): Promise<boolean> {
    if (!this.isValid()) {
      this.listener.onError(params.id, new Error("Server-side row model requires a data source."));
      return false;
    }

    const requestId = params.id;
    const replaceRows = params.reason !== "viewport";
    if (replaceRows) {
      this.activeRequestId = requestId;
      this.requestGeneration++;
    }
    const requestGeneration = this.requestGeneration;
    this.paginate = params.paginate;
    if (replaceRows) {
      this.viewStartRow = params.paginate ? params.range.start : 0;
      this.viewEndRow = params.paginate ? params.range.end : Number.MAX_SAFE_INTEGER;
    }
    this.listener.onLoadingStart(requestId);

    const request = this.createRequest(params);

    try {
      const result = await new Promise<IServerSideResult>((resolve, reject) => {
        const maybePromise = this.serverDataSource!.getRows({
          request,
          success: resolve,
          error: reject,
        });
        Promise.resolve(maybePromise)
          .then((maybeResult) => {
            if (maybeResult && typeof maybeResult === "object") {
              resolve(maybeResult);
            }
          })
          .catch(reject);
      });

      if (requestGeneration !== this.requestGeneration) return false;
      if (replaceRows && requestId !== this.activeRequestId) return false;

      if (result?.columns?.length) {
        this.listener.onServerSideSchema?.(requestId, {
          columns: result.columns,
          schemaVersion: result.schemaVersion,
        });
      }

      const rows = (result?.rows ?? []) as Row[];
      const startRow = request.startRow ?? 0;
      const totalRows = result?.totalRows ?? startRow + rows.length;
      this.setRows(rows, totalRows, startRow, replaceRows);
      this.listener.onRows(requestId, {
        reason: params.reason,
        rows: this.nodes,
        rowCount: this.rowCount,
        visibleStart: this.paginate ? Math.max(0, startRow - this.viewStartRow) : startRow,
        visibleEnd: this.paginate ? Math.max(0, startRow + rows.length - this.viewStartRow) : startRow + rows.length,
      });
      void this.reAggregate(requestId, "aggregateModel", params.aggregateReason ?? "rows");
      this.listener.onLoadingEnd(requestId);
      return true;
    } catch (err) {
      if (requestGeneration !== this.requestGeneration) return false;
      if (replaceRows && requestId !== this.activeRequestId) return false;
      this.listener.onError(requestId, err);
      this.listener.onLoadingEnd(requestId);
      return false;
    }
  }

  private createRequest(params: IRowModelRequestParams): IServerSideRequest {
    const loadRange = params.loadRange ?? params.range;
    return {
      filters: this.serializeFilters(params.filterModel),
      sorts: this.serializeSorts(params.sortModel),
      startRow: loadRange?.start,
      endRow: loadRange?.end,
    };
  }

  private serializeFilters(filterModel: IRowModelRequestParams["filterModel"]): IServerSideFilter[] {
    const filtersByKey = new Map<string, IServerSideFilter>();
    for (const item of filterModel.items) {
      filtersByKey.set(item.col.key, {
        key: item.col.key,
        filters: item.filters.map(filter => ({
          type: filter.type,
          values: filter.values,
        })),
        join: item.join,
      });
    }
    return Array.from(filtersByKey.values());
  }

  private serializeSorts(sortModel: IRowModelRequestParams["sortModel"]): IServerSideSort[] {
    const sortsByKey = new Map<string, IServerSideSort>();
    for (const item of sortModel.items) {
      sortsByKey.set(item.col.key, {
        key: item.col.key,
        dir: item.dir,
      });
    }
    return Array.from(sortsByKey.values());
  }

  private calculateLocalAggregates(): void {
    const rows = this.getAggregateRows();
    this.aggregateValues = this.aggregateCalculator.calculateAggregates(this.leafColumns, this.aggregates, rows);
  }

  private getAggregateRows(): IRowNode<Row>[] {
    if (this.aggregateScope === "all") return this.nodes.slice();
    const rows: IRowNode<Row>[] = [];
    for (let i = 0; i < this.getViewCount(); i++) {
      const node = this.getRowNodeAtViewIndex(i);
      if (node) rows.push(node);
    }
    return rows;
  }

  private async requestServerAggregates(requestSeq: number): Promise<void> {
    if (!this.serverAggregationSource) return;
    const aggregates = this.buildServerAggregateRequest();
    if (aggregates.length === 0) return;
    const params = this.lastRequestParams;

    try {
      const result = await new Promise<any>((resolve, reject) => {
        const maybePromise = this.serverAggregationSource!({
          request: {
            aggregates,
            aggregateScope: "all",
            filters: params ? this.serializeFilters(params.filterModel) : [],
            sorts: params ? this.serializeSorts(params.sortModel) : [],
            startRow: undefined,
            endRow: undefined,
          },
          success: resolve,
          error: reject,
        });
        Promise.resolve(maybePromise)
          .then((maybeResult) => {
            if (maybeResult && typeof maybeResult === "object") {
              resolve(maybeResult);
            }
          })
          .catch(reject);
      });

      if (requestSeq !== this.aggregateRequestSeq) return;
      const valuesObj = result?.values ?? result ?? {};
      for (const col of this.leafColumns) {
        const value = valuesObj?.[col.instanceID] ?? valuesObj?.[col.key];
        if (value != null) this.aggregateValues.set(col.instanceID, value);
      }
    } catch (err) {
      if (requestSeq !== this.aggregateRequestSeq) return;
      this.aggregateValues.clear();
      console.error("Failed to fetch server-side aggregates", err);
    }
  }

  private buildServerAggregateRequest(): AggregateModel[] {
    const aggregateMap = new Map(this.aggregates.map(a => [a.key, a.type]));
    const aggregates: AggregateModel[] = [];
    for (const col of this.leafColumns) {
      const type = aggregateMap.get(col.instanceID) ?? this.getDefaultAggregateOp(col);
      aggregates.push({ key: col.key, type });
    }
    return aggregates;
  }

  private getDefaultAggregateOp(col: { isComputableType(): boolean }): AggregateType {
    return this.aggregateCalculator.getDefaultAggregateOp(col);
  }

  private normalizeAggregateScope(scope: AggregateScope): AggregateScope {
    if (scope === "all" && !this.serverAggregationSource) return "page";
    return scope;
  }
}
