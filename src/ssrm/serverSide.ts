import { IRowModel, IRowModelRequestParams, RowModelType } from "../interfaces/iRowModel";
import { createRowIdFactory, IRowNode } from "../interfaces/iRowNode";
import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import { GridOptions } from "../interfaces/gridOptions";
import { IRowModelListener } from "../interfaces/iRowModelListener";
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
    void this.requestRows(params);
  }

  setAggregateScope(scope: AggregateScope): void {
    console.warn("Setting server-side aggregation scope on 'serverSide' row model is not implemented yet.");
  }

  reAggregate(): void {
    console.warn("Re-aggregating server-side aggregation on 'serverSide' row model is not implemented yet.");
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
}
