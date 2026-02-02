import { FilterDef } from "../interfaces/filter";
import { IRowModel } from "../interfaces/iRowModel";
import { Column } from "../column/column";
import { ClientSideRowModel } from "./rowModel/clientSide";
import { ServerSideDataSource } from "./rowModel/serverSide";
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
import { ColDef } from "@grid/interfaces/column";
import { ITextMeasurer, TextMeasureParams } from "@grid/interfaces/iTextMeasure";
import { ColumnModel } from "@grid/column/columnModel";
import { IColumnModel } from "@grid/interfaces/iColumnModel";
import { GridAction } from "@grid/events/action";

export class GridCore implements IGridCore {
  readonly id: string;

  readonly options: InternalGridOptions;

  private columnModel: ColumnModel;

  private rowModel: IRowModel = new ClientSideRowModel({});

  private _paginationEnabled: boolean = false;
  private _pageIdx: number = 0;
  private _pageSize: number = 100;
  private _totalPages: number = 1;

  private _filters: FilterDef[] = [];
  private _sorts: SortDef[] = [];

  private _aggregateScope: AggregateScope = "all";
  private _aggregates: AggregateModel[] = [];

  private _internalEventHandlers: Map<string, GridEventHandler<GridEventName>[]> = new Map();
  private _eventHandlers: Map<string, GridEventHandler<GridEventName>[]> = new Map();
  private _supressEventsUnless: string = "";
  private _textMeasureParams!: TextMeasureParams;

  constructor(private measureCtx: ITextMeasurer, options: GridOptions = {}) {
    this.options = this.initializeGridOptions(options);
    this.id = crypto.randomUUID();
    this.columnModel = new ColumnModel(this.options);
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
    this.columnModel.computeColumnWidths(this.measureCtx, this._textMeasureParams, allRows);
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
    this.columnModel.computeColumnWidth(col, this.measureCtx, this._textMeasureParams, allRows);
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

  async setFilterModel(filters: FilterDef[]) {
    this._filters = filters.slice();
    await this.rowModel.setFilters(this._filters);
  }

  async setSortModel(sorts: SortDef[]) {
    this._sorts = sorts.slice();
    await this.rowModel.setSorts(this._sorts);
    this.emit("sortsChanged", true, this._sorts.slice());
  }

  async toggleSort(col: Column) {
    let curr = this._sorts.find(s => s.col.instanceID === col.instanceID);
    const dir = curr ? (curr.dir === "asc" ? "desc" : null) : "asc";
    const overwrite = col.children.length > 0;

    const addSort = (col: Column, dir: "asc" | "desc" | null) => {
      const curr = this._sorts.find(s => s.col.instanceID === col.instanceID);
      if (curr) {
        dir = overwrite ? dir : (curr.dir === "asc" ? "desc" : null);
        if (dir) {
          curr.dir = dir;
        } else {
          // remove sort
          this._sorts = this._sorts.filter(s => s.col.instanceID !== col.instanceID);
        }
      } else if (dir) {
        this._sorts.push({ col, key: col.key, dir });
      }
    };

    const traverse = (col: Column) => {
      addSort(col, dir);
      for (const child of col.children || []) {
        traverse(child);
      }
    };

    traverse(col);
    await this.rowModel.setSorts(this._sorts);
    this.emit("sortsChanged", true, this._sorts.slice());
  }

  get isPaginationEnabled(): boolean {
    return this._paginationEnabled;
  }

  get currPage(): number {
    return this._pageIdx;
  }

  get totalPages(): number {
    return this._totalPages;
  }

  async applyPagination(paginationEnabled: boolean = this._paginationEnabled, pageSize: number = this._pageSize, pageIdx: number = this._pageIdx) {
    if (this._paginationEnabled == paginationEnabled && this._pageSize == pageSize && this._pageIdx == pageIdx) {
      const totalRows = this.rowModel.getRowCount();
      this._totalPages = paginationEnabled ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
      return;
    }
    let pageChanged = this._paginationEnabled !== paginationEnabled;
    this._paginationEnabled = paginationEnabled;
    pageSize = Math.max(1, pageSize);
    this._pageSize = paginationEnabled ? pageSize : this.rowModel.getRowCount();
    const totalRows = this.rowModel.getRowCount();
    this._totalPages = paginationEnabled ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
    const clampedPage = Math.min(Math.max(pageIdx, 0), this._totalPages - 1);
    pageChanged = pageChanged || clampedPage !== this._pageIdx;
    this._pageIdx = clampedPage;
    if (pageChanged) {
      await this.rowModel.setPagination(this._paginationEnabled, this._pageSize, this._pageIdx);
    }
    this.emit("paginationChanged", true, { paginationEnabled, pageChanged, pageIdx: clampedPage, pageSize: this._pageSize, totalPages: this._totalPages });
  }

  async goToPage(pageIdx: number) {
    if (!this._paginationEnabled) return false;
    const clampedPage = Math.min(Math.max(pageIdx, 0), this._totalPages - 1);
    if (clampedPage === this._pageIdx) return false;
    this._pageIdx = clampedPage;
    await this.rowModel.setPage(this._pageSize, this._pageIdx);
    this.emit("pageChanged", true, { pageChanged: true, pageIndex: this._pageIdx, pageSize: this._pageSize });
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
    if (this._aggregateScope === scope) return;
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
    return this._sorts.slice();
  }

  getFilterModel(): FilterDef[] {
    return this._filters.slice();
  }

  getAggregateModel(): AggregateModel[] {
    return this._aggregates.slice();
  }

  getAggregateScope(): AggregateScope {
    return this._aggregateScope;
  }

  // Event handling
  onInternal<E extends GridEventName>(event: E, handler: GridEventHandler<E>): Unsubscribe {
    if (!this._internalEventHandlers.has(event)) {
      this._internalEventHandlers.set(event, []);
    }
    this._internalEventHandlers.get(event)!.push(handler);
    return () => {
      this.off(event, handler);
    };
  }

  on<E extends GridEventName>(event: E, handler: GridEventHandler<E>): Unsubscribe {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, []);
    }
    this._eventHandlers.get(event)!.push(handler);
    return () => {
      this.off(event, handler);
    };
  }

  off(eventType: string, handler: Function) {
    if (!this._eventHandlers.has(eventType)) return;
    const handlers = this._eventHandlers.get(eventType)!;
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
        this._textMeasureParams = {headerFont: action.headerFont, cellFont: action.cellFont};
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
      default:
        console.warn(`Unhandled action type: ${action.type}`);
    }
  }

  emit<E extends GridEventName>(eventType: GridEventName, isInternal: boolean, args: GridEventMap[E]): void {
    if (this._supressEventsUnless !== "" && this._supressEventsUnless !== eventType) {
      return;
    }
    this._supressEventsUnless = "";
    return isInternal ? this.emitInternal(eventType, args) : this.emitExternal(eventType, args);
  }

  emitInternal<E extends GridEventName>(eventType: GridEventName, args: GridEventMap[E]) {
    if (!this._internalEventHandlers.has(eventType)) return;
    const handlers = this._internalEventHandlers.get(eventType)!;
    for (const handler of handlers) {
      this.rowModel.getViewCount();
      handler(args);
    }
  }

  emitExternal<E extends GridEventName>(eventType: GridEventName, args: GridEventMap[E]) {
    if (!this._eventHandlers.has(eventType)) return;
    const handlers = this._eventHandlers.get(eventType)!;
    for (const handler of handlers) {
      this.rowModel.getViewCount();
      handler(args);
    }
  }

  destroy(): void {
    // Clean up resources if needed
  }

}
