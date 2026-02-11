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
  GridEventPaginationChangedParams,
  Unsubscribe,
} from "../events/events";
import { isNullOrUndefined, isTrue } from "../misc";
import { ColDef } from "../interfaces/column";
import { ITextMeasurer, TextMeasureParams } from "../interfaces/iTextMeasure";
import { ColumnModel } from "../column/columnModel";
import { IColumnModel } from "../interfaces/iColumnModel";
import { GridAction } from "../events/action";
import { IRowModelOnRowsParams } from "@grid/interfaces/iRowModelListener";

export class GridCore implements IGridCore {
  readonly id: string;

  readonly options: InternalGridOptions;

  private columnModel: ColumnModel;

  private rowModel: IRowModel;
  private requestIdCounter: number = 0;

  private paginationEnabled: boolean = false;
  private pageStartIdx: number = 0;
  private pageEndIdx: number = 100;
  private totalPages: number = 1;
  private pageSizes: number[] = [25, 50, 100];

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
    this.rowModel = new ClientSideRowModel(options, this);
    this.paginationEnabled = this.options.pagination;
    this.pageEndIdx = this.options.pageSize;
    this.pageSizes = this.options.pageSizes;
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
      pagination: isTrue(options.pagination),
      pageSize: options.pageSize ?? 100,
      pageSizes: options.pageSizes ?? [25, 50, 100],
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
    this.autosizeColumns();
    this.emit("columnsChanged", true, { reason: "defs" });
  }

  private autosizeColumns(identifyComparators: boolean = true) {
    const allRows: IRowNode[] = [];
    this.rowModel.forEachNode((node: IRowNode) => {
      allRows.push(node);
    });
    this.columnModel.computeColumnWidths(this.measureCtx, this.textMeasureParams, allRows);
    if (identifyComparators) {
      this.columnModel.identifyComparators(allRows);
    }
  }

  private autosizeParentColumn(column: Column) {
    const allRows: IRowNode[] = [];
    this.rowModel.forEachNode((node: IRowNode) => {
      allRows.push(node);
    });
    for (const child of column.getVisibleLeaves()) {
      this.columnModel.computeColumnWidth(child, this.measureCtx, this.textMeasureParams, allRows);
    }
    this.columnModel.updateParentColumnWidth(column);
  }

  private autosizeColumn(colID: string): string[] {
    const col = this.columnModel.getById(colID);
    if (!col) return [];
    if (col.children.length > 0) {
      this.autosizeParentColumn(col);
      return col.getVisibleLeaves().map(c => c.instanceID);
    }
    const allRows: IRowNode[] = [];
    this.rowModel.forEachNode((node: IRowNode) => {
      allRows.push(node);
    });
    this.columnModel.computeColumnWidth(col, this.measureCtx, this.textMeasureParams, allRows);
    this.columnModel.updateParentColumnWidth(this.columnModel.getAncestors(colID)[0]);
    return col.getVisibleLeaves().map(c => c.instanceID);
  }

  getColumnModel(): IColumnModel {
    return this.columnModel;
  }

  getRowModel(): IRowModel {
    return this.rowModel;
  }

  setRowModel(rowModel: IRowModel) {
    this.rowModel = rowModel;
    this.rowModel.applyRequest({
      id: this.requestIdCounter++,
      reason: "init",
      sortModels: this.sorts,
      filterModels: this.filters,
      paginate: this.paginationEnabled,
      range: this.resetPageBlocks(),
      aggregateScope: this.aggregateScope,
    });
    this.emit<"modelUpdated">("modelUpdated", true, { reason: "init", step: "all" });
  }

  setRowData(rows: RowData[]): void {
    this.rowModel.setRows(rows);
    this.rowModel.applyRequest({
      id: this.requestIdCounter++,
      reason: "refresh",
      sortModels: this.sorts,
      filterModels: this.filters,
      paginate: this.paginationEnabled,
      range: this.resetPageBlocks(),
      aggregateScope: this.aggregateScope,
    })
    this.autosizeColumns();
    this.emit<"columnsChanged">("columnsChanged", true, { reason: "state" });
  }

  applyTransaction(tx: { add?: RowData[]; update?: { rowId: GridId; row: RowData; }[]; remove?: GridId[]; }): void {
    throw new Error("Method not implemented.");
  }

  addFilterModel(filter: FilterModel) {
    const idx = this.filters.findIndex(f => f.key === filter.key);
    if (idx >= 0) {
      this.filters[idx] = filter;
    } else {
      this.filters.push(filter);
    }
    this.applyFilters([filter.col.instanceID]);
  }

  removeFilterModel(col: Column) {
    const idx = this.filters.findIndex(f => f.col.instanceID === col.instanceID);
    if (idx >= 0) {
      this.filters.splice(idx, 1);
    }
    this.applyFilters([col.instanceID]);
  }

  setFilterModel(filters: FilterModel[]) {
    this.filters = filters;
    this.applyFilters(filters.map(f => f.col.instanceID));
  }

  private applyFilters(changedColIds: string[]) {
    this.rowModel.applyRequest({
      id: this.requestIdCounter++,
      reason: "filter",
      sortModels: this.sorts,
      filterModels: this.filters,
      paginate: this.paginationEnabled,
      range: this.resetPageBlocks(),
      aggregateScope: this.aggregateScope,
    })
    this.emit("columnsChanged", true, { reason: "filter", changedColIds })
  }

  setSortModel(sorts: SortDef[]) {
    sorts = sorts.slice();
    const changedColIDs: string[] = [];
    for (const sort of sorts) {
      const col = this.columnModel.getById(sort.key);
      if (!col) continue;
      if (!col.sortable) continue;
      this.setSortModelForCol(col, sort.dir);
      changedColIDs.push(...col.getVisibleLeaves().map(c => c.instanceID));
    }
    if (changedColIDs.length === 0) return;
    this.rowModel.applyRequest({
      id: this.requestIdCounter++,
      reason: "sort",
      sortModels: this.sorts,
      filterModels: this.filters,
      paginate: this.paginationEnabled,
      range: { start: this.pageStartIdx, end: this.pageEndIdx },
      aggregateScope: this.aggregateScope,
    });
    this.emit("columnsChanged", true, { reason: "sort", changedColIds: changedColIDs });
  }

  private setSortModelForCol(col: Column, dir: "asc" | "desc" | null = "asc") {
    const addSort = (col: Column, dir: "asc" | "desc" | null) => {
      if (!col.sortable) return;
      const curr = this.sorts.find(s => s.col.instanceID === col.instanceID);
      if (curr) {
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
      if (column.children.length === 0) return;
      for (const child of column.getVisibleLeaves()) {
        traverse(child);
      }
    };

    traverse(col);

    // Clean up any parent columns that are present in the sort model but shouldn't be since their children are now sorted individually
    const parentCols = new Set<string>();
    for (const sort of this.sorts) {
      if (sort.col.children.length > 0) {
        parentCols.add(sort.col.instanceID);
      }
    }
    this.sorts = this.sorts.filter(s => !parentCols.has(s.col.instanceID));
  }

  toggleSort(col: Column) {
    if (!col.sortable) return;
    let curr: SortDef | undefined;
    if (col.children.length > 0) {
      // Find the first child that has a sort applied on and use its dir as reference.
      const children = col.getVisibleLeaves();
      for (const child of children) {
        for (const sort of this.sorts) {
          if (sort.col.instanceID === child.instanceID) {
            curr = sort;
            break;
          }
        }
        if (curr) break;
      }
    } else {
      curr = this.sorts.find(s => s.col.instanceID === col.instanceID);
    }

    this.setSortModelForCol(col, curr ? (curr.dir === "asc" ? "desc" : null) : "asc");
    const changedColIds = col.children.length > 0 ? col.getVisibleLeaves().map(c => c.instanceID) : [col.instanceID];
    this.rowModel.applyRequest({
      id: this.requestIdCounter++,
      reason: "sort",
      sortModels: this.sorts,
      filterModels: this.filters,
      paginate: this.paginationEnabled,
      range: { start: this.pageStartIdx, end: this.pageEndIdx },
      aggregateScope: this.aggregateScope,
    });
    this.emit("columnsChanged", true, { reason: "sort", changedColIds: changedColIds });
  }

  getPaginationInfo(): GridEventPaginationChangedParams {
    const pageSize = this.pageEndIdx - this.pageStartIdx;
    const totalRowCount = this.rowModel.getRowCount();
    this.totalPages = pageSize > 0 ? Math.ceil(totalRowCount / pageSize) : 1;
    return {
      paginationEnabled: this.paginationEnabled,
      pageIndex: pageSize <= 0 ? 0 : this.pageStartIdx / pageSize,
      pageSize: pageSize,
      totalRowCount: totalRowCount,
      totalPageCount: this.totalPages,
      pageSizes: this.pageSizes,
    };
  }

  private resetPageBlocks(): { start: number, end: number } {
    const pageSize = this.pageEndIdx - this.pageStartIdx;
    this.pageStartIdx = 0;
    this.pageEndIdx = this.pageStartIdx + pageSize;
    return { start: this.pageStartIdx, end: this.pageEndIdx };
  }

  applyPagination(pageIdx: number, pageSize: number) {
    this.pageStartIdx = pageIdx * pageSize;
    this.pageEndIdx = this.pageStartIdx + pageSize;
    this.rowModel.applyRequest({
      id: this.requestIdCounter++,
      reason: "pagination",
      sortModels: this.sorts,
      filterModels: this.filters,
      paginate: this.paginationEnabled,
      range: { start: this.pageStartIdx, end: this.pageEndIdx },
      aggregateScope: this.aggregateScope,
    });
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
        console.log("Setting theme fonts", "Reason:", action.reason);
        this.textMeasureParams = { headerFont: action.headerFont, cellFont: action.cellFont };
        if (action.reason !== "visibility" && action.reason !== "pin") this.autosizeColumns(false);
        this.emit("columnsChanged", true, { reason: "resize" });
        break;
      case "rowDataSet":
        this.setRowData(action.rows);
        break;
      case "columnAutosize":
        const autosizedColIds = this.autosizeColumn(action.colId);
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
      case "columnPin":
        this.columnModel.setPinneds(action.colIds, action.pinned);
        this.emit("columnsChanged", true, { reason: "pin", changedColIds: action.colIds });
        this.emit("rowsChanged", true, { reason: "pin", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "columnVisibility":
        this.columnModel.toggleVisibility(action.colIds, action.hidden);
        this.columnModel.updateParentColumnWidthsForAll();
        this.emit("columnsChanged", true, { reason: "visibility", changedColIds: action.colIds });
        this.emit("rowsChanged", true, { reason: "visibility", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "columnMove":
        this.columnModel.moveColumnTo(action.colId, action.toIndex, action.toSection);
        this.emit("columnsChanged", true, { reason: "order", changedColIds: [action.colId] });
        this.emit("rowsChanged", true, { reason: "order", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "paginationSet":
        this.applyPagination(action.pageIndex, action.pageSize);
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

  onLoadingStart(id: number) {
    if (this.requestIdCounter - id > 1) {
      // This means a newer request has already been made, so we can ignore this loading start.
      return;
    }
    this.emit("overlayShow", true, { overlayType: "loading" });
  }

  onRows(id: number, params: IRowModelOnRowsParams) {
    if (this.requestIdCounter - id > 1) {
      // This means a newer request has already been made, so we can ignore these rows.
      return;
    }
    this.emit("rowsChanged", true, {
      reason: params.reason,
      firstRowIndex: params.visibleStart,
      lastRowIndex: params.visibleEnd,
      rowCount: params.rowCount,
    });
    this.emit("paginationChanged", true, this.getPaginationInfo());
  }

  onLoadingEnd(id: number) {
    if (this.requestIdCounter - id > 1) {
      // This means a newer request has already been made, so we can ignore this loading end.
      return;
    }
    this.emit("overlayShow", true, { overlayType: "none" });
  }

  onError() { }

  destroy(): void {
    // Clean up resources if needed
  }

}
