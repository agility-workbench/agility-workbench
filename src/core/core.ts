import { FilterModel } from "../interfaces/filter";
import { IRowModel } from "../interfaces/iRowModel";
import { Column } from "../column/column";
import { ClientSideRowModel } from "../csrm/clientSide";
import { ServerSideDataSource } from "../ssrm/serverSide";
import { SortModel } from "../interfaces/sort";
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
  private sorts: SortModel[] = [];

  private aggregateScope: AggregateScope = "all";
  private aggregates: AggregateModel[] = [];

  private eventHandlers: Map<string, GridEventHandler<GridEventName>[]> = new Map();
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
    this.emit("columnsChanged", { reason: "defs" });
  }

  private autosizeColumns(identifyComparators: boolean = true) {
    const allRows: IRowNode[] = [];
    this.rowModel.forEachNode((node: IRowNode) => {
      allRows.push(node);
    });
    this.columnModel.computeColumnWidths(this.measureCtx, this.textMeasureParams, allRows);
    this.columnModel.updateParentColumnWidthsForAll();
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
    this.emit("modelUpdated", { reason: "init", step: "all" });
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
    });
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
    this.emit("columnsChanged", { reason: "filter", changedColIds })
  }

  setSortModel(sorts: SortModel[]) {
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
    this.emit("columnsChanged", { reason: "sort", changedColIds: changedColIDs });
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
    let curr: SortModel | undefined;
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
    this.emit("columnsChanged", { reason: "sort", changedColIds: changedColIds });
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
    this.emit("serverSideDataSourceChanged", { dataSourceSet: !isNullOrUndefined(callback) });
  }

  async setServerSideAggregationSource(callback: ServerSideDataSource | null) {
    if (this.rowModel.getType() !== "serverSide") {
      console.warn("Setting server-side aggregation source on 'clientSide' row model has no effect.");
    }
    (this.rowModel as any).serverAggregationSource = callback;
    await this.rowModel.refreshData();
    this.emit("serverSideAggregationSourceChanged", { aggregationSourceSet: !isNullOrUndefined(callback) });
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

  getSortModel(): SortModel[] {
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
        this.emit("viewportChanged", {
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
        this.emit("overlayShow", { overlayType: action.overlayType });
        break;
      case "themeFontSet":
        console.log("Setting theme fonts", "Reason:", action.reason);
        this.textMeasureParams = { headerFont: action.headerFont, cellFont: action.cellFont };
        if (action.reason !== "visibility" && action.reason !== "pin") this.autosizeColumns(false);
        this.emit("columnsChanged", { reason: "resize" });
        break;
      case "rowDataSet":
        this.setRowData(action.rows);
        break;
      case "columnAutosize":
        const autosizedColIds = this.autosizeColumn(action.colId);
        if (autosizedColIds.length > 0) {
          this.emit("columnsChanged", { reason: "resize", changedColIds: autosizedColIds });
        }
        break;
      case "columnResize":
        const resizedColIds = this.columnModel.resizeColumn(action.colId, action.widthPx);
        if (resizedColIds.length > 0) {
          this.emit("columnsChanged", { reason: "resize", changedColIds: resizedColIds });
        }
        break;
      case "sortModelSet":
        this.setSortModel(action.sortModel);
        break;
      case "columnPin":
        this.columnModel.setPinneds(action.colIds, action.pinned);
        this.emit("columnsChanged", { reason: "pin", changedColIds: action.colIds });
        this.emit("rowsChanged", { reason: "pin", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "columnVisibility":
        this.columnModel.toggleVisibility(action.colIds, action.hidden);
        this.emit("columnsChanged", { reason: "visibility", changedColIds: action.colIds });
        this.emit("rowsChanged", { reason: "visibility", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "columnMove":
        this.columnModel.moveColumnTo(action.colId, action.toIndex, action.toSection);
        this.emit("columnsChanged", { reason: "order", changedColIds: [action.colId] });
        this.emit("rowsChanged", { reason: "order", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "paginationSet":
        this.applyPagination(action.pageIndex, action.pageSize);
        break;
      case "headerAction":
        const col = this.columnModel.getById(action.colId);
        if (!col) return;
        switch (action.action) {
          case "toggleSort":
            this.toggleSort(col);
            break;
          case "filterClick":
          case "menuClick":
            // Clear column selection on header action clicks to avoid confusion with shift+click multi-selection
            // this._clearColumnSelection();
            // Based on the action, render filter/menu UI (handled in renderer via events)
            break;
          case "click":
            // this._toggleColumnSelection(col.instanceID);
            break;
          case "toggleGroupExpand":
            if (this.columnModel.toggleGroupExpansion(col.instanceID)) {
              this.autosizeColumn(col.instanceID);
              this.emit("columnsChanged", { reason: "state", changedColIds: [col.instanceID] });
              this.emit("rowsChanged", { reason: "group", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
            }
            break;
        }
        break;
      default:
        console.warn(`Unhandled action type: ${action.type}`);
    }
  }

  emit<E extends GridEventName>(eventType: GridEventName, args: GridEventMap[E]): void {
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
    this.emit("overlayShow", { overlayType: "loading" });
  }

  onRows(id: number, params: IRowModelOnRowsParams) {
    if (this.requestIdCounter - id > 1) {
      // This means a newer request has already been made, so we can ignore these rows.
      return;
    }
    if (params.reason === "init" || params.reason === "refresh") {
      this.autosizeColumns();
      this.emit("columnsChanged", { reason: "state" });
    }
    this.emit("rowsChanged", {
      reason: params.reason,
      firstRowIndex: params.visibleStart,
      lastRowIndex: params.visibleEnd,
      rowCount: params.rowCount,
    });
    this.emit("paginationChanged", this.getPaginationInfo());
  }

  onLoadingEnd(id: number) {
    if (this.requestIdCounter - id > 1) {
      // This means a newer request has already been made, so we can ignore this loading end.
      return;
    }
    this.emit("overlayShow", { overlayType: "none" });
  }

  onError() { }

  destroy(): void {
    // Clean up resources if needed
  }

}
