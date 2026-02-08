import { FilterModel } from "../interfaces/filter";
import { IRowModel } from "../interfaces/iRowModel";
import { Column } from "../column/column";
import { ClientSideRowModel } from "../csrm/clientSide";
import { ServerSideDataSource } from "../ssrm/serverSide";
import { SortDef } from "../interfaces/sort";
import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import { GridOptions, InternalGridOptions } from "../interfaces/gridOptions";
import { ColId, GridId, GridSnapshot, IGridCore, RowData } from "../interfaces/iGridCore";
import { IRowNode } from "../interfaces/iRowNode";
import {
  GridEventHandler,
  GridEventMap,
  GridEventName,
  Unsubscribe,
} from "../events/events";
import { isNullOrUndefined } from "../misc";
import { ColDef } from "../interfaces/column";
import { ITextMeasurer, TextMeasureParams } from "../interfaces/iTextMeasure";
import { ColumnModel } from "../column/columnModel";
import { IColumnModel } from "../interfaces/iColumnModel";
import { GridAction } from "../events/action";

export class GridCore implements IGridCore {
  readonly id: string;

  readonly options: InternalGridOptions;

  private columnModel: ColumnModel;

  private rowModel: IRowModel;

  private paginationEnabled: boolean = false;
  private pageIdx: number = 0;
  private pageSize: number = 100;
  private totalPages: number = 1;

  private filters: FilterModel[] = [];
  private sorts: SortDef[] = [];

  private aggregateScope: AggregateScope = "all";
  private aggregates: AggregateModel[] = [];

  private internalEventHandlers: Map<string, GridEventHandler<GridEventName>[]> = new Map();
  private eventHandlers: Map<string, GridEventHandler<GridEventName>[]> = new Map();
  private supressEventsUnless: string = "";
  private textMeasureParams!: TextMeasureParams;

  constructor(private measureCtx: ITextMeasurer, options: GridOptions = {}) {
    this.options = this.initializeGridOptions(options);
    this.id = crypto.randomUUID();
    this.columnModel = new ColumnModel(this.options);
    this.rowModel = new ClientSideRowModel(options);
  }

  private initializeGridOptions(options: GridOptions): InternalGridOptions {
    return {
      headerHeight: options.headerHeight ?? 43,
      leafHeaderHeight: options.leafHeaderHeight ?? 43,
      parentHeaderHeight: options.parentHeaderHeight ?? 43,
      rowHeight: options.rowHeight ?? 43,
      getRowId: options.getRowId,
      rowIdKey: options.rowIdKey,
      overscanRowCount: options.overscanRowCount ?? 10,
      minResizeWidth: 75,
      maxColumnWidth: 420,
      allowExportAsCSV: options.allowExportAsCSV ?? true,
      allowExportAsExcel: options.allowExportAsExcel ?? true,
    };
  }

  getOptions(): Readonly<GridOptions> {
    return this.options;
  }

  getSnapshot(): GridSnapshot {
    return {
      viewport: {
        scrollLeftPx: 0,
        scrollTopPx: 0,
        rowHeightPx: this.options.rowHeight,
        overscanRowCount: this.options.overscanRowCount,
      },
      displayedRowCount: this.rowModel.getViewCount(),
      visibleLeafColIds: this.columnModel.getLeaves().filter(c => !c.hidden).map(c => c.instanceID),
    };
  }

  setColumnDefs(colDefs: ColDef[]) {
    this.columnModel.setColumnDefs(colDefs);
    this.refreshColumns();
    this.emit("columnsChanged", true, { reason: "defs" });
  }

  private refreshColumns(identifyComparators: boolean = true) {
    const allRows: IRowNode[] = [];
    this.rowModel.forEachNode((node: IRowNode) => {
      allRows.push(node);
    });
    this.columnModel.computeColumnWidths(this.measureCtx, this.textMeasureParams, allRows);
    if (identifyComparators) {
      this.columnModel.identifyComparators(allRows);
    }
  }

  private refreshColumn(colID: string): string[] {
    const col = this.columnModel.getById(colID);
    if (!col) return [];
    const allRows: IRowNode[] = [];
    this.rowModel.forEachNode((node: IRowNode) => {
      allRows.push(node);
    });
    this.columnModel.computeColumnWidth(col, this.measureCtx, this.textMeasureParams, allRows);
    this.columnModel.updateParentColumnWidth(col);
    return this.columnModel.getAncestors(colID).map(c => c.instanceID);
  }

  getColumnModel(): IColumnModel {
    return this.columnModel;
  }

  getRowModel(): IRowModel {
    return this.rowModel;
  }

  async setRowModel(rowModel: IRowModel): Promise<void> {
    this.rowModel = rowModel;
    await this.rowModel.refreshData();
    this.emit<"modelUpdated">("modelUpdated", true, { reason: "init", step: "all" });
  }

  setRowData(rows: RowData[]): void {
    this.rowModel.setRows(rows);
    this.applyPagination();
    this.refreshColumns();
    this.emit<"columnsChanged">("columnsChanged", true, { reason: "state" });
    this.emit<"rowsChanged">("rowsChanged", true, { reason: "rowData", firstRowIndex: 0, lastRowIndex: 100 });
  }

  applyTransaction(tx: { add?: RowData[]; update?: { rowId: GridId; row: RowData; }[]; remove?: GridId[]; }): void {
    throw new Error("Method not implemented.");
  }

  async addFilterModel(filter: FilterModel) {
    const idx = this.filters.findIndex(f => f.key === filter.key);
    if (idx >= 0) {
      this.filters[idx] = filter;
    } else {
      this.filters.push(filter);
    }
    await this.applyFilters([filter.col.instanceID]);
  }

  async removeFilterModel(col: Column) {
    const idx = this.filters.findIndex(f => f.col.instanceID === col.instanceID);
    if (idx >= 0) {
      this.filters.splice(idx, 1);
    }
    await this.applyFilters([col.instanceID]);
  }

  async setFilterModel(filters: FilterModel[]) {
    this.filters = filters;
    await this.applyFilters(filters.map(f => f.col.instanceID));
  }

  private async applyFilters(changedColIds: string[]) {
    await this.rowModel.applyFilters(this.filters);
    await this.rowModel.setSorts(this.sorts);
    this.emit("rowsChanged", true, { reason: "filter", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
    this.emit("columnsChanged", true, { reason: "filter", changedColIds })
  }

  async setSortModel(sorts: SortDef[]) {
    sorts = sorts.slice();
    const changedColIDs: string[] = [];
    for (const sort of sorts) {
      const col = this.columnModel.getById(sort.key);
      if (!col) continue;
      sort.col = col;
      const existing = this.sorts.find(s => s.key === sort.key);
      if (sort.dir === null) {
        if (existing) {
          this.sorts = this.sorts.filter(s => s.key !== sort.key);
          changedColIDs.push(col.instanceID);
        }
        continue;
      } else {
        if (!existing) {
          this.sorts.push({ key: sort.key, col, dir: sort.dir });
          changedColIDs.push(col.instanceID);
        } else if (existing.dir !== sort.dir) {
          existing.dir = sort.dir;
          changedColIDs.push(col.instanceID);
        }
      }
    }
    if (changedColIDs.length === 0) return;
    await this.rowModel.setSorts(this.sorts);
    this.emit("rowsChanged", true, { reason: "sort", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
    this.emit("columnsChanged", true, { reason: "sort", changedColIds: changedColIDs });
  }

  async toggleSort(col: Column) {
    let curr = this.sorts.find(s => s.col.instanceID === col.instanceID);
    const dir = curr ? (curr.dir === "asc" ? "desc" : null) : "asc";
    const overwrite = col.children.length > 0;

    const addSort = (col: Column, dir: "asc" | "desc" | null) => {
      const curr = this.sorts.find(s => s.col.instanceID === col.instanceID);
      if (curr) {
        dir = overwrite ? dir : (curr.dir === "asc" ? "desc" : null);
        if (dir) {
          curr.dir = dir;
        } else {
          // remove sort
          this.sorts = this.sorts.filter(s => s.col.instanceID !== col.instanceID);
        }
      } else if (dir) {
        this.sorts.push({ col, key: col.key, dir });
      }
    };

    const traverse = (column: Column) => {
      addSort(column, dir);
      for (const child of column.getVisibleLeaves()) {
        traverse(child);
      }
    };

    traverse(col);
    const changedColIds = col.children.length > 0 ? col.getVisibleLeaves().map(c => c.instanceID) : [col.instanceID];
    await this.rowModel.setSorts(this.sorts);
    this.emit("rowsChanged", true, { reason: "sort", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
    this.emit("columnsChanged", true, { reason: "sort", changedColIds: changedColIds });
  }

  get isPaginationEnabled(): boolean {
    return this.paginationEnabled;
  }

  get currPage(): number {
    return this.pageIdx;
  }

  async applyPagination(paginationEnabled: boolean = this.paginationEnabled, pageSize: number = this.pageSize, pageIdx: number = this.pageIdx) {
    if (this.paginationEnabled == paginationEnabled && this.pageSize == pageSize && this.pageIdx == pageIdx) {
      const totalRows = this.rowModel.getRowCount();
      this.totalPages = paginationEnabled ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
      return;
    }
    let pageChanged = this.paginationEnabled !== paginationEnabled;
    this.paginationEnabled = paginationEnabled;
    pageSize = Math.max(1, pageSize);
    this.pageSize = paginationEnabled ? pageSize : this.rowModel.getRowCount();
    const totalRows = this.rowModel.getRowCount();
    this.totalPages = paginationEnabled ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
    const clampedPage = Math.min(Math.max(pageIdx, 0), this.totalPages - 1);
    pageChanged = pageChanged || clampedPage !== this.pageIdx;
    this.pageIdx = clampedPage;
    if (pageChanged) {
      await this.rowModel.setPagination(this.paginationEnabled, this.pageSize, this.pageIdx);
    }
    this.emit("paginationChanged", true, {
      paginationEnabled,
      pageIndex: clampedPage,
      pageSize: this.pageSize,
      totalRowCount: 0,
      totalPageCount: this.totalPages,
      pageSizes: [25, 50, 100, 250, 500, 1000],
    });
  }

  async goToPage(pageIdx: number) {
    if (!this.paginationEnabled) return false;
    const clampedPage = Math.min(Math.max(pageIdx, 0), this.totalPages - 1);
    if (clampedPage === this.pageIdx) return false;
    this.pageIdx = clampedPage;
    await this.rowModel.setPage(this.pageSize, this.pageIdx);
    this.emit("rowsChanged", true, { reason: "rowData", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
  }

  async setServerSideDataSource(callback: ServerSideDataSource | null) {
    if (this.rowModel.getType() !== "serverSide") {
      console.warn("Setting server-side data source on 'clientSide' row model has no effect.");
    }
    (this.rowModel as any).serverDataSource = callback;
    await this.rowModel.refreshData();
    this.emit("serverSideDataSourceChanged", true, { dataSourceSet: !isNullOrUndefined(callback) });
  }

  async setServerSideAggregationSource(callback: ServerSideDataSource | null) {
    if (this.rowModel.getType() !== "serverSide") {
      console.warn("Setting server-side aggregation source on 'clientSide' row model has no effect.");
    }
    (this.rowModel as any).serverAggregationSource = callback;
    await this.rowModel.refreshData();
    this.emit("serverSideAggregationSourceChanged", true, { aggregationSourceSet: !isNullOrUndefined(callback) });
  }

  async setAggregateScope(scope: AggregateScope) {
    if (this.aggregateScope === scope) return;
    this.rowModel.setAggregateScope(scope);
    await this.rowModel.reAggregate();
  }

  getRowIdAtViewIndex(displayedIndex: number): GridId | null {
    return this.rowModel.getRowNodeAtViewIndex(displayedIndex)?.id || null;
  }

  getViewIndexForRowId(rowId: GridId): number | null {
    return this.rowModel.getRowNode(rowId)?.viewIndex || null;
  }

  getCellValue(rowId: GridId, colId: ColId): unknown {
    const row = this.rowModel.getRowNode(rowId);
    if (!row) return null;
    return this.columnModel.getByKey(colId)?.getValue(row) || null;
  }

  getCellDisplayValue(rowId: GridId, colId: ColId): string {
    const col = this.columnModel.getByKey(colId);
    if (!col) return "";
    const row = this.rowModel.getRowNode(rowId);
    if (!row) return "";
    const value = col.getValue(row);
    return col.formatValue(value, row);
  }

  getSortModel(): SortDef[] {
    return this.sorts.slice();
  }

  getFilterModel(): FilterModel[] {
    return this.filters.slice();
  }

  getAggregateModel(): AggregateModel[] {
    return this.aggregates.slice();
  }

  getAggregateScope(): AggregateScope {
    return this.aggregateScope;
  }

  // Event handling
  onInternal<E extends GridEventName>(event: E, handler: GridEventHandler<E>): Unsubscribe {
    if (!this.internalEventHandlers.has(event)) {
      this.internalEventHandlers.set(event, []);
    }
    this.internalEventHandlers.get(event)!.push(handler);
    return () => {
      this.off(event, handler);
    };
  }

  on<E extends GridEventName>(event: E, handler: GridEventHandler<E>): Unsubscribe {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
    return () => {
      this.off(event, handler);
    };
  }

  off(eventType: string, handler: Function) {
    if (!this.eventHandlers.has(eventType)) return;
    const handlers = this.eventHandlers.get(eventType)!;
    const idx = handlers.indexOf(handler);
    if (idx >= 0) {
      handlers.splice(idx, 1);
    }
  }

  dispatch(action: GridAction): void {
    switch (action.type) {
      case "init":
        this.emit("viewportChanged", true, {
          scrollTopPx: 0,
          scrollLeftPx: 0,
          rowHeightPx: this.options.rowHeight,
          overscanRowCount: this.options.overscanRowCount,
          viewportWidthPx: 0,
          viewportHeightPx: 0,
          firstRowIndex: 0,
          lastRowIndex: 0,
        });
        break;
      case "columnDefsSet":
        this.setColumnDefs(action.defs);
        break;
      // Handle other action types as needed
      case "overlayShow":
        this.emit("overlayShow", true, { overlayType: action.overlayType });
        break;
      case "themeFontSet":
        this.textMeasureParams = {headerFont: action.headerFont, cellFont: action.cellFont};
        this.refreshColumns(false);
        this.emit("columnsChanged", true, { reason: "resize" });
        break;
      case "rowDataSet":
        this.setRowData(action.rows);
        break;
      case "columnAutosize":
        const autosizedColIds = this.refreshColumn(action.colId);
        if (autosizedColIds.length > 0) {
          this.emit("columnsChanged", true, { reason: "resize", changedColIds: autosizedColIds });
        }
        break;
      case "columnResize":
        const resizedColIds = this.columnModel.resizeColumn(action.colId, action.widthPx);
        if (resizedColIds.length > 0) {
          this.emit("columnsChanged", true, { reason: "resize", changedColIds: resizedColIds });
        }
        break;
      case "sortModelSet":
        this.setSortModel(action.sortModel);
        break;
      default:
        console.warn(`Unhandled action type: ${action.type}`);
    }
  }

  emit<E extends GridEventName>(eventType: GridEventName, isInternal: boolean, args: GridEventMap[E]): void {
    if (this.supressEventsUnless !== "" && this.supressEventsUnless !== eventType) {
      return;
    }
    this.supressEventsUnless = "";
    return isInternal ? this.emitInternal(eventType, args) : this.emitExternal(eventType, args);
  }

  emitInternal<E extends GridEventName>(eventType: GridEventName, args: GridEventMap[E]) {
    if (!this.internalEventHandlers.has(eventType)) return;
    const handlers = this.internalEventHandlers.get(eventType)!;
    for (const handler of handlers) {
      this.rowModel.getViewCount();
      handler(args);
    }
  }

  emitExternal<E extends GridEventName>(eventType: GridEventName, args: GridEventMap[E]) {
    if (!this.eventHandlers.has(eventType)) return;
    const handlers = this.eventHandlers.get(eventType)!;
    for (const handler of handlers) {
      this.rowModel.getViewCount();
      handler(args);
    }
  }

  destroy(): void {
    // Clean up resources if needed
  }

}
