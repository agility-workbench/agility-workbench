import { FilterItem, FilterModel } from "../interfaces/filter";
import { IRowModel, IRowModelRequestParams, RowDataChangeReason } from "../interfaces/iRowModel";
import { Column } from "../column/column";
import { ClientSideRowModel } from "../csrm/clientSide";
import { ServerSideRowModel } from "../ssrm/serverSide";
import { nextSortDir, SortItem, SortItemUpdate, SortModel } from "../interfaces/sort";
import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import { GridOptions, InternalGridOptions, QuickFilterMatchMode, resolveQuickFilterOptions } from "../interfaces/gridOptions";
import { ColId, ColumnState, GridId, GridSnapshot, IGridCore, RowData } from "../interfaces/iGridCore";
import { IRowNode } from "../interfaces/iRowNode";
import {
  GridEventHandler,
  GridEventMap,
  GridEventName,
  GridEventPaginationChangedParams,
  Unsubscribe,
} from "../events/events";
import { isTrue } from "../misc";
import { ColDef } from "../interfaces/column";
import { ITextMeasurer, TextMeasureParams } from "../interfaces/iTextMeasure";
import { ColumnModel } from "../column/columnModel";
import { IColumnModel } from "../interfaces/iColumnModel";
import { GridAction } from "../events/action";
import { IRowModelOnAggregatesParams, IRowModelOnRowsParams } from "@grid/interfaces/iRowModelListener";
import { IServerSideDataSource } from "../interfaces/serverSide";
import { SelectionModel } from "./selectionModel";
import { CellEdit, HistoryModel } from "./historyModel";
import { CellPos, CellRef, SelectionRange, SelectionSnapshot } from "../interfaces/selection";
import { GridEventFocusChangedParams } from "../events/events";
import { SparklineRenderer } from "../cellRenderers/sparklineRenderer";

type SchemaSource = "auto" | "props" | "server";

export class GridCore implements IGridCore {
  readonly id: string;

  readonly options: InternalGridOptions;

  private columnModel: ColumnModel;

  private rowModel: IRowModel;
  private requestIdCounter: number = 0;
  private firstRefreshSeen: boolean = false;

  private paginationEnabled: boolean = false;
  private pageStartIdx: number = 0;
  private pageEndIdx: number = 100;
  private totalPages: number = 1;
  private pageSizes: number[] = [25, 50, 100];

  private filters: FilterModel = new FilterModel();
  private sorts: SortModel = new SortModel();
  // Guards one-time seeding of the initial sort (ColDef sort/sortIndex + grid initialSort) so later
  // columnDefs updates don't clobber the user's manual sorting.
  private initialSortSeeded = false;

  // Quick-filter (global search) state. Resolved match-mode / case-sensitivity default from the
  // quickFilter grid option; the widget may override them at runtime. Client-side row model only.
  private quickFilterText = "";
  private quickFilterMatchMode: QuickFilterMatchMode;
  private quickFilterCaseSensitive: boolean;

  private aggregateScope: AggregateScope = "none";
  private aggregates: AggregateModel[] = [];
  // Columns the rows are grouped by, in grouping-level order. Empty = no grouping. Client-side only.
  private groupColumns: Column[] = [];
  private schemaSource: SchemaSource = "auto";
  private serverSchemaVersion: string | undefined;
  private serverSchemaSignature: string | undefined;

  private eventHandlers: Map<string, GridEventHandler<GridEventName>[]> = new Map();
  private textMeasureParams!: TextMeasureParams;

  private selectionModel: SelectionModel;
  private history: HistoryModel;

  // The cell currently being edited (inline editor open), or null when not editing.
  private editingCell: CellRef | null = null;
  // The cell with an open ActionFrame (persistent frame + form popover), or null. Only one at a
  // time (like editing); opening the editor closes it.
  private actionFrameCell: CellRef | null = null;
  // Set while undo/redo is applying edits so the recording path doesn't re-record its own writes.
  private applyingHistory = false;

  constructor(private measureCtx: ITextMeasurer, options: GridOptions = {}) {
    this.options = this.initializeGridOptions(options);
    this.history = new HistoryModel(this.options.undoLimit);
    this.id = crypto.randomUUID();
    this.columnModel = new ColumnModel(this.options);
    this.rowModel = options.rowModelType === "serverSide"
      ? new ServerSideRowModel(options, this, options.serverSideDataSource, options.serverSideAggregationSource)
      : new ClientSideRowModel(options, this);
    this.paginationEnabled = this.options.pagination;
    this.pageEndIdx = this.options.pageSize;
    this.pageSizes = this.options.pageSizes;
    const qf = resolveQuickFilterOptions(this.options.quickFilter);
    this.quickFilterMatchMode = qf.matchMode;
    this.quickFilterCaseSensitive = qf.caseSensitive;
    this.selectionModel = new SelectionModel({
      getRowModel: () => this.rowModel,
      getColumnModel: () => this.columnModel,
      getRowIdAtViewIndex: (viewIdx) => this.getRowIdAtViewIndex(viewIdx),
      getPageStartIdx: () => this.getPageStartIdx(),
      isRowSelectable: (viewIdx) => this.isViewRowSelectable(viewIdx),
    });
    this.bindOptionCallbacks();
  }

  // Bridge the declarative on* option callbacks to the underlying core events, so consumers can use
  // either api.on(...) or the GridOptions callbacks interchangeably. Framework-agnostic — works for
  // vanilla and React alike. Callbacks are read from resolved options at construction.
  private bindOptionCallbacks() {
    const o = this.options;
    if (o.onCellClicked) this.on("cellClicked", (ev) => o.onCellClicked!(ev));
    if (o.onRowClicked) this.on("rowClicked", (ev) => o.onRowClicked!(ev));
    if (o.onSelectionChanged) this.on("selectionChanged", (ev) => o.onSelectionChanged!(ev));
    if (o.onCellValueChanged) {
      this.on("editingChanged", (ev) => {
        if (ev.state === "committed" && ev.cell) {
          o.onCellValueChanged!({ rowId: ev.cell.rowId, colId: ev.cell.colId, value: ev.value });
        }
      });
    }
    if (o.onSortChanged) {
      this.on("columnsChanged", (ev) => {
        if (ev.reason === "sort") o.onSortChanged!({ changedColIds: ev.changedColIds });
      });
    }
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
      minResizeWidth: options.minResizeWidth != null && options.minResizeWidth > 0 ? options.minResizeWidth : 75,
      maxColumnWidth: options.maxColumnWidth != null && options.maxColumnWidth > 0 ? options.maxColumnWidth : 420,
      allowExportAsCSV: options.allowExportAsCSV ?? true,
      allowExportAsExcel: options.allowExportAsExcel ?? true,
      pagination: isTrue(options.pagination),
      rowNumbers: isTrue(options.rowNumbers),
      rowHover: options.rowHover ?? true,
      columnHover: isTrue(options.columnHover),
      zebraRows: isTrue(options.zebraRows),
      getRowClass: options.getRowClass,
      getRowStyle: options.getRowStyle,
      onCellClicked: options.onCellClicked,
      onRowClicked: options.onRowClicked,
      onCellValueChanged: options.onCellValueChanged,
      onSelectionChanged: options.onSelectionChanged,
      onSortChanged: options.onSortChanged,
      highlightActiveCell: isTrue(options.highlightActiveCell),
      rowSelection: isTrue(options.rowSelection),
      cellSelection: options.cellSelection ?? true, // true | false | "text"
      rangeSelection: options.rangeSelection ?? true,
      columnSelection: options.columnSelection ?? true,
      showColumnButtonsOnHover: isTrue(options.showColumnButtonsOnHover),
      bodyContextMenu: options.bodyContextMenu ?? true, // true | false | getter

      selectAllRowsOnHeaderClick: isTrue(options.selectAllRowsOnHeaderClick),
      pageSize: options.pageSize ?? 100,
      pageSizes: options.pageSizes ?? [25, 50, 100],
      serverSideBlockSize: options.serverSideBlockSize ?? options.pageSize ?? 100,
      autosizeColumnsOnDataChange: options.autosizeColumnsOnDataChange ?? (options.rowModelType === "serverSide"),
      clearSelectionOnBodyClick: options.clearSelectionOnBodyClick ?? true,
      undoLimit: options.undoLimit != null && options.undoLimit >= 0 ? options.undoLimit : 100,
      editTrigger: options.editTrigger ?? "doubleClick",
      suppressKeyboardEdit: isTrue(options.suppressKeyboardEdit),
      suppressTypeToEdit: isTrue(options.suppressTypeToEdit),
      moveAfterEdit: options.moveAfterEdit ?? true,
      commitOnBlur: options.commitOnBlur ?? true,
      multiSortKey: options.multiSortKey ?? "ctrl",
      showSortPriority: options.showSortPriority ?? "multi",
      initialSort: options.initialSort,
      reevaluateOnEdit: options.reevaluateOnEdit ?? true,
      groupDisplayType: options.groupDisplayType ?? "singleColumn",
      groupDefaultExpanded: options.groupDefaultExpanded ?? 0,
      groupRowsSelectable: options.groupRowsSelectable ?? false,
      isFullWidthRow: options.isFullWidthRow,
      fullWidthCellRenderer: options.fullWidthCellRenderer,
      defaultColDef: options.defaultColDef,
      tooltip: options.tooltip ?? true,
      quickFilter: options.quickFilter ?? false,
      loadingMessage: options.loadingMessage ?? "Loading data...",
      noRowsMessage: options.noRowsMessage ?? "No rows to show",
      filterDebounceMs: options.filterDebounceMs != null && options.filterDebounceMs >= 0 ? options.filterDebounceMs : 300,
      cellFlashDuration: options.cellFlashDuration != null && options.cellFlashDuration >= 0 ? options.cellFlashDuration : 500,
      cellFadeDuration: options.cellFadeDuration != null && options.cellFadeDuration >= 0 ? options.cellFadeDuration : 1000,
      icons: options.icons,
      theme: options.theme,
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
      visibleLeafColIds: this.columnModel.getLeaves().filter(c => !c.hidden && !c.isInternal()).map(c => c.instanceID),
    };
  }

  setColumnDefsFromProps(colDefs?: ColDef[] | null): void {
    if (colDefs == null) {
      if (this.schemaSource === "props") {
        this.schemaSource = "auto";
      }
      return;
    }

    if (colDefs.length > 0) {
      this.schemaSource = "props";
      this.serverSchemaVersion = undefined;
      this.serverSchemaSignature = undefined;
      this.setColumnDefs(colDefs);
      return;
    }

    if (this.schemaSource === "props") {
      this.setColumnDefs([]);
    }
  }

  private setColumnDefs(colDefs: ColDef[]) {
    this.columnModel.setColumnDefs(colDefs);
    const seededSort = this.seedInitialSort();
    const changedSortColIds = this.reconcileSortModelColumns();
    const changedFilterColIds = this.reconcileFilterModelColumns();
    this.reconcileAggregateModelColumns();
    this.reconcileGroupModelColumns();
    this.autosizeColumns();
    // autosizeColumns() has now (re)identified comparators, so the seeded sort can be produced.
    if (seededSort) {
      this.rowModel.applyRequest(this.createRowModelRequest("sort", { start: this.pageStartIdx, end: this.pageEndIdx }, this.getInitialServerSideLoadRange()));
    }
    if (this.aggregates.length > 0) {
      this.applyAggregateRequest("aggregateModel", "columns");
    }
    this.clearSelectionForColumnChange();
    this.emit("columnsChanged", { reason: "defs" });
    if (changedFilterColIds.length > 0) {
      this.emit("columnsChanged", { reason: "filter", changedColIds: changedFilterColIds });
    }
    if (changedSortColIds.length > 0) {
      this.emit("columnsChanged", { reason: "sort", changedColIds: changedSortColIds });
    }
  }

  // Restore a captured column layout (widths / pinning / visibility / order) from getColumnState().
  // By default the column model merges (unknown colIds ignored, columns absent from state keep their
  // place); pass `defaultState` to apply a fallback to those absent columns (e.g. { hidden: true }
  // for an exact restore). The renderer rebuilds the pool + header + widths for the "state" reason.
  private applyColumnState(state: ColumnState[], defaultState?: Partial<ColumnState>): void {
    this.columnModel.applyColumnState(state, { defaultState });
    this.clearSelectionForColumnChange();
    this.emit("columnsChanged", { reason: "state", changedColIds: state.map(s => s.colId) });
    this.emit("rowsChanged", { reason: "state", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
  }

  private applyServerSideColumnDefs(colDefs: ColDef[], schemaVersion?: string): void {
    if (colDefs.length === 0 || this.schemaSource === "props") return;

    const schemaSignature = this.createSchemaSignature(colDefs);
    if (this.schemaSource === "server") {
      if (schemaVersion && schemaVersion === this.serverSchemaVersion) return;
      if (!schemaVersion && schemaSignature === this.serverSchemaSignature) return;
    }

    this.schemaSource = "server";
    this.serverSchemaVersion = schemaVersion;
    this.serverSchemaSignature = schemaSignature;
    this.setColumnDefs(colDefs);
  }

  private createSchemaSignature(colDefs: ColDef[]): string {
    const normalize = (defs: ColDef[]): unknown[] => defs.map(def => ({
      colId: def.colId,
      key: def.key,
      label: def.label,
      type: def.type,
      hidden: def.hidden,
      pinned: def.pinned,
      sortable: def.sortable,
      filter: typeof def.filter === "function" ? "function" : def.filter,
      groupable: def.groupable,
      resizable: def.resizable,
      movable: def.movable,
      hideable: def.hideable,
      columnGroupShow: def.columnGroupShow,
      openByDefault: def.openByDefault,
      children: def.children ? normalize(def.children) : undefined,
    }));
    return JSON.stringify(normalize(colDefs));
  }

  private reconcileFilterModelColumns(): string[] {
    const nextItems: FilterItem[] = [];
    const changedColIds: string[] = [];
    const seenColIds = new Set<string>();
    let changed = false;

    for (const item of this.filters.items) {
      const col = this.resolveModelColumn(item);
      if (!col) {
        changed = true;
        continue;
      }

      if (seenColIds.has(col.instanceID)) {
        changed = true;
        continue;
      }

      seenColIds.add(col.instanceID);
      changedColIds.push(col.instanceID);
      if (item.col !== col || item.key !== col.key) changed = true;
      nextItems.push({ ...item, col, key: col.key });
    }

    if (changed) {
      this.filters.setItems(nextItems);
    }

    return changedColIds;
  }

  /**
   * Seed the initial sort model ONCE, on the first column setup. Precedence: per-column
   * `ColDef.sort` (ordered by `sortIndex`, then leaf order) is applied first; grid `initialSort`
   * then fills only columns not already covered. Runs before the sorted view is first produced (the
   * next applyRequest reads this.sorts), so it applies without an extra reflow. Later columnDefs
   * updates are skipped so user sorting is preserved.
   */
  private seedInitialSort(): boolean {
    if (this.initialSortSeeded) return false;
    this.initialSortSeeded = true;

    const leaves = this.columnModel.getLeaves().filter(c => !c.isInternal());

    // 1) Per-column ColDef sort, ordered by sortIndex (undefined last, stable by leaf order).
    const colDefSorted = leaves
      .filter(c => c.initialSort && c.sortable)
      .map((c, i) => ({ c, order: c.initialSortIndex ?? Number.MAX_SAFE_INTEGER, tie: i }))
      .sort((a, b) => (a.order - b.order) || (a.tie - b.tie));

    const covered = new Set<string>();
    for (const { c } of colDefSorted) {
      this.sorts.updateItem(c, c.initialSort!);
      covered.add(c.instanceID);
    }

    // 2) Grid-level initialSort fills columns not covered by a ColDef sort.
    for (const item of this.options.initialSort ?? []) {
      const col = this.resolveSortColumn({ key: item.colId });
      if (!col || !col.sortable || covered.has(col.instanceID)) continue;
      this.sorts.updateItem(col, item.dir);
      covered.add(col.instanceID);
    }

    return covered.size > 0;
  }

  private reconcileSortModelColumns(): string[] {
    const nextItems: SortItem[] = [];
    const changedColIds: string[] = [];
    const seenColIds = new Set<string>();
    let changed = false;

    for (const item of this.sorts.items) {
      const col = this.resolveSortColumn(item);
      if (!col || !col.sortable) {
        changed = true;
        continue;
      }

      if (seenColIds.has(col.instanceID)) {
        changed = true;
        continue;
      }

      seenColIds.add(col.instanceID);
      changedColIds.push(col.instanceID);
      if (item.col !== col || item.key !== col.key) changed = true;
      nextItems.push({ col, key: col.key, dir: item.dir });
    }

    if (changed) {
      this.sorts = new SortModel(nextItems);
    }

    return changedColIds;
  }

  private reconcileAggregateModelColumns(): void {
    if (this.aggregates.length === 0) return;
    this.aggregates = this.resolveAggregateModels(this.aggregates);
  }

  // Re-resolve grouped columns against the rebuilt column set (colDef replacement creates new
  // Column instances) and re-synthesize the auto-group columns so grouping survives a colDef swap.
  private reconcileGroupModelColumns(): void {
    if (this.groupColumns.length === 0) return;
    const resolved: Column[] = [];
    const seen = new Set<string>();
    for (const col of this.groupColumns) {
      const next = this.resolveModelColumn({ col });
      if (!next || !next.groupable || seen.has(next.instanceID)) continue;
      seen.add(next.instanceID);
      resolved.push(next);
    }
    this.groupColumns = resolved;
    this.columnModel.setRowGroupColumns(resolved, this.options.groupDisplayType);
  }

  private resolveSortColumn(sort: Partial<SortItemUpdate>): Column | undefined {
    return this.resolveModelColumn(sort);
  }

  private resolveModelColumn(item: { col?: Column; key?: string }): Column | undefined {
    if (item.col) {
      const colById = this.columnModel.getById(item.col.instanceID);
      if (colById) return colById;
      const colByColId = this.columnModel.getByColId(item.col.colId);
      if (colByColId) return colByColId;
      const colByKey = this.columnModel.getByKey(item.col.key);
      if (colByKey) return colByKey;
    }

    if (!item.key) return undefined;
    return this.columnModel.getById(item.key)
      ?? this.columnModel.getByColId(item.key)
      ?? this.columnModel.getByKey(item.key);
  }

  private resolveAggregateModels(aggregates: AggregateModel[]): AggregateModel[] {
    const next: AggregateModel[] = [];
    const seenColIds = new Set<string>();

    for (const aggregate of aggregates) {
      const col = this.columnModel.getById(aggregate.key)
        ?? this.columnModel.getByColId(aggregate.key)
        ?? this.columnModel.getByKey(aggregate.key);
      if (!col) continue;

      const leaves = col.children.length > 0 ? col.getVisibleLeaves() : [col];
      for (const leaf of leaves) {
        if (seenColIds.has(leaf.instanceID)) continue;
        seenColIds.add(leaf.instanceID);
        next.push({ key: leaf.instanceID, type: aggregate.type });
      }
    }

    return next;
  }

  private autosizeColumns(identifyComparators: boolean = true): string[] {
    const allRows: IRowNode[] = [];
    this.rowModel.forEachNode((node: IRowNode) => {
      allRows.push(node);
    });
    // Include group nodes so columns are sized to fit their per-group aggregate values too.
    allRows.push(...this.rowModel.getGroupNodes());
    const previousWidths = new Map<string, number>();
    this.columnModel.walkColumns((col) => {
      previousWidths.set(col.instanceID, col.computedWidth);
    });
    this.columnModel.computeColumnWidths(this.measureCtx, this.textMeasureParams, allRows);
    this.columnModel.updateParentColumnWidthsForAll();
    if (identifyComparators) {
      this.columnModel.identifyComparators(allRows);
    }
    const changedColIds: string[] = [];
    this.columnModel.walkColumns((col) => {
      if (previousWidths.get(col.instanceID) !== col.computedWidth) {
        changedColIds.push(col.instanceID);
      }
    });
    return changedColIds;
  }

  private autosizeParentColumn(column: Column) {
    const allRows: IRowNode[] = [];
    this.rowModel.forEachNode((node: IRowNode) => {
      allRows.push(node);
    });
    for (const child of column.getVisibleLeaves()) {
      // Explicit fit-to-content: drop any prior manual width so measurement takes over.
      child.resizedWidth = undefined;
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
    // Explicit fit-to-content: drop any prior manual width so measurement takes over.
    col.resizedWidth = undefined;
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

  private createRowModelRequest(
    reason: RowDataChangeReason,
    range: { start: number; end: number },
    loadRange?: { start: number; end: number },
    paginate: boolean = this.paginationEnabled,
    aggregateReason?: IRowModelOnAggregatesParams["reason"],
    groupExpansion?: { groupId: string; expanded?: boolean },
  ): IRowModelRequestParams {
    const aggregateScope = this.normalizeAggregateScope(this.aggregateScope);
    if (aggregateScope !== this.aggregateScope) {
      this.aggregateScope = aggregateScope;
      this.rowModel.setAggregateScope(aggregateScope);
    }
    return {
      id: this.requestIdCounter++,
      reason,
      sortModel: this.sorts,
      filterModel: this.filters,
      paginate,
      range,
      loadRange,
      aggregateScope,
      aggregates: this.aggregates,
      aggregateReason,
      leafColumns: this.columnModel.getLeaves().filter(col => !col.isInternal()),
      groupColumns: this.groupColumns.slice(),
      groupExpansion,
      quickFilter: {
        text: this.quickFilterText,
        matchMode: this.quickFilterMatchMode,
        caseSensitive: this.quickFilterCaseSensitive,
      },
    };
  }

  setRowModel(rowModel: IRowModel) {
    this.rowModel = rowModel;
    this.firstRefreshSeen = false;
    const range = this.resetPageBlocks();
    this.rowModel.applyRequest(this.createRowModelRequest("init", range, this.getInitialServerSideLoadRange()));
    this.emit("modelUpdated", { reason: "init", step: "all" });
  }

  setRowData(rows: RowData[]): void {
    // The dataset is being replaced — undo/redo entries reference rows by id that may no longer
    // exist, so discard the edit history.
    this.history.clear();
    this.rowModel.setRows(rows);
    // Resolve comparators now that data exists, BEFORE the refresh below applies any active sort
    // (e.g. an initial sort seeded when columns were set — before any rows were present). Otherwise
    // the first sort runs with unresolved comparators and is silently skipped. Client-side only;
    // comparators are derived from sample values.
    this.identifyComparatorsFromCurrentRows();
    const range = this.resetPageBlocks();
    this.rowModel.applyRequest(this.createRowModelRequest("refresh", range, this.getInitialServerSideLoadRange()));
  }

  // Re-derive every leaf column's sort comparator from the current row nodes. Cheap no-op when there
  // are no rows (comparators stay null and any active sort is skipped until data arrives).
  private identifyComparatorsFromCurrentRows(): void {
    const nodes: IRowNode[] = [];
    this.rowModel.forEachNode((node: IRowNode) => nodes.push(node));
    if (nodes.length === 0) return;
    this.columnModel.identifyComparators(nodes);
  }

  applyTransaction(tx: { add?: RowData[]; update?: { rowId: GridId; row: RowData; }[]; remove?: GridId[]; }): void {
    if (this.rowModel.getType() !== "clientSide") {
      console.warn("applyTransaction is only supported on the 'clientSide' row model; the server owns its data.");
      return;
    }

    // Unlike setRowData, a transaction preserves edit history — undo/redo entries reference rows by
    // id and remain valid for rows that still exist.
    const result = this.rowModel.applyTransaction(tx);
    if (result.added === 0 && result.updated === 0 && result.removed === 0) return;

    const structural = result.added > 0 || result.removed > 0;
    // Structural changes always reflow the view (membership + position). Pure updates only reorder
    // when reevaluateOnEdit is set; otherwise values change in place and rows keep their positions.
    const reevaluate = structural || this.options.reevaluateOnEdit;

    if (reevaluate) {
      this.rowModel.applyRequest(this.createRowModelRequest(
        "transaction",
        { start: this.pageStartIdx, end: this.pageEndIdx },
        this.getInitialServerSideLoadRange(),
      ));
      this.emit("rowsChanged", { reason: "transaction" });
      this.emit("paginationChanged", this.getPaginationInfo());
    } else if (tx.update?.length) {
      // Repaint the updated rows in place (renderer refresh → change-flash) without moving them.
      const colIds = this.columnModel.getLeaves().filter(c => !c.isInternal()).map(c => c.instanceID);
      this.emit("cellsChanged", {
        reason: "data",
        rowIds: tx.update.map(u => u.rowId),
        colIds,
      });
    }
  }

  addFilterModel(filter: FilterItem) {
    const col = this.resolveModelColumn(filter);
    if (!col) return;
    this.filters.addItem({ ...filter, col, key: col.key });
    this.applyFilters([col.instanceID]);
  }

  removeFilterModel(col: Column) {
    if (!this.filters.removeItem(col)) return;
    this.applyFilters([col.instanceID]);
  }

  setFilterModel(filters: FilterItem[]) {
    const nextItems: FilterItem[] = [];
    const changedColIds: string[] = [];
    const seenColIds = new Set<string>();
    for (const filter of filters) {
      const col = this.resolveModelColumn(filter);
      if (!col || seenColIds.has(col.instanceID)) continue;
      seenColIds.add(col.instanceID);
      changedColIds.push(col.instanceID);
      nextItems.push({ ...filter, col, key: col.key });
    }
    this.filters.setItems(nextItems);
    this.applyFilters(changedColIds);
  }

  private applyFilters(changedColIds: string[]) {
    const range = this.resetPageBlocks();
    this.rowModel.applyRequest(this.createRowModelRequest("filter", range, this.getInitialServerSideLoadRange()))
    this.selectionModel.clearRange();
    this.selectionModel.clearRows();
    this.emitSelectionChanged("model");
    this.emit("columnsChanged", { reason: "filter", changedColIds })
  }

  /**
   * Set the quick-filter (global search) state. `text` is the raw search string; the optional
   * `matchMode` / `caseSensitive` override the resolved defaults (the widget passes them so the
   * user's popover choices take effect). Resets to page 1 and clears the selection (which may point
   * at rows about to be hidden). No-op for the server-side row model.
   */
  setQuickFilter(text: string, opts?: { matchMode?: QuickFilterMatchMode; caseSensitive?: boolean }): void {
    if (this.rowModel.getType() === "serverSide") return;
    const nextMode = opts?.matchMode ?? this.quickFilterMatchMode;
    const nextCase = opts?.caseSensitive ?? this.quickFilterCaseSensitive;
    if (text === this.quickFilterText && nextMode === this.quickFilterMatchMode && nextCase === this.quickFilterCaseSensitive) {
      return;
    }
    this.quickFilterText = text;
    this.quickFilterMatchMode = nextMode;
    this.quickFilterCaseSensitive = nextCase;
    const range = this.resetPageBlocks();
    this.rowModel.applyRequest(this.createRowModelRequest("quickFilter", range, this.getInitialServerSideLoadRange()));
    this.selectionModel.clearRange();
    this.selectionModel.clearRows();
    this.emitSelectionChanged("model");
    this.emit("modelUpdated", { reason: "filter", step: "all" });
  }

  getQuickFilterText(): string {
    return this.quickFilterText;
  }

  setSortModel(sorts: SortItemUpdate[]) {
    sorts = sorts.slice();
    const changedColIDs: string[] = [];
    for (const sort of sorts) {
      const col = this.resolveSortColumn(sort);
      if (!col || !col.sortable) continue;
      if (this.setSortModelForCol(col, sort.dir)) {
        changedColIDs.push(...col.getVisibleLeaves().map(c => c.instanceID));
      }
    }
    if (changedColIDs.length === 0) return;
    this.rowModel.applyRequest(this.createRowModelRequest("sort", { start: this.pageStartIdx, end: this.pageEndIdx }, this.getInitialServerSideLoadRange()));
    this.selectionModel.clearRange();
    this.selectionModel.clearRows();
    this.emitSelectionChanged("model");
    this.emit("columnsChanged", { reason: "sort", changedColIds: changedColIDs });
  }

  // Replace the set of columns rows are grouped by (order = grouping level). An empty list clears
  // grouping. Client-side row model only. Synthesizes/removes auto-group columns per the configured
  // groupDisplayType, re-derives the grouped view, and clears selection (view indices shift).
  setRowGroupModel(colIds: string[]): void {
    if (this.rowModel.getType() !== "clientSide") {
      console.warn("Row grouping is only supported on the 'clientSide' row model.");
      return;
    }
    const resolved: Column[] = [];
    const seen = new Set<string>();
    for (const colId of colIds) {
      const col = this.resolveModelColumn({ key: colId });
      if (!col || !col.groupable || col.isInternal()) continue;
      if (seen.has(col.instanceID)) continue;
      seen.add(col.instanceID);
      resolved.push(col);
    }
    this.groupColumns = resolved;
    this.columnModel.setRowGroupColumns(resolved, this.options.groupDisplayType);
    // Rebuild the row pool / header for the new column set (adds/removes the auto-group column)
    // BEFORE the grouped view repaints, so the pool has a cell per leaf column when rows paint.
    this.clearSelectionForColumnChange();
    this.emit("columnsChanged", { reason: "defs" });
    this.rowModel.applyRequest(this.createRowModelRequest("group", this.resetPageBlocks(), this.getInitialServerSideLoadRange()));
    // Autosize AFTER the group tree exists so columns fit their per-group aggregate values (which
    // live on the group nodes built during applyRequest).
    const changedColIds = this.autosizeColumns();
    if (changedColIds.length > 0) this.emit("columnWidthsChanged", { changedColIds });
    this.emit("rowsChanged", { reason: "group", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
    this.emit("paginationChanged", this.getPaginationInfo());
  }

  // Expand or collapse a single group node, then re-flatten the grouped view (no filter/sort/tree
  // rebuild). When `expanded` is omitted the node's state is toggled.
  toggleGroupExpand(groupId: string, expanded?: boolean): void {
    if (this.groupColumns.length === 0) return;
    this.rowModel.applyRequest(this.createRowModelRequest(
      "group",
      { start: this.pageStartIdx, end: this.pageEndIdx },
      this.getInitialServerSideLoadRange(),
      this.paginationEnabled,
      undefined,
      { groupId, expanded },
    ));
    this.clearSelectionForColumnChange();
    this.emit("rowsChanged", { reason: "group", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
    this.emit("paginationChanged", this.getPaginationInfo());
  }

  getRowGroupColumns(): Column[] {
    return this.groupColumns.slice();
  }

  private setSortModelForCol(col: Column, dir: "asc" | "desc" | null = "asc"): boolean {
    const currSortID = this.sorts.id;
    const traverse = (column: Column) => {
      if (column.sortable) this.sorts.updateItem(column, dir);
      if (column.children.length === 0) return;
      for (const child of column.getVisibleLeaves()) {
        traverse(child);
      }
    };

    traverse(col);

    // Clean up any parent columns that are present in the sort model but shouldn't be since their children are now sorted individually
    const parentCols = new Set<Column>();
    for (const sort of this.sorts.items) {
      if (sort.col.children.length > 0) {
        parentCols.add(sort.col);
      }
    }
    this.sorts.bulkUpdate([...parentCols], null);
    return this.sorts.id !== currSortID;
  }

  toggleSort(col: Column, additive: boolean = false) {
    if (!col.sortable) return;
    let curr: SortItem | undefined;
    if (col.children.length > 0) {
      // Find the first child that has a sort applied on and use its dir as reference.
      const children = col.getVisibleLeaves();
      for (const child of children) {
        for (const sort of this.sorts.items) {
          if (sort.col.instanceID === child.instanceID) {
            curr = sort;
            break;
          }
        }
        if (curr) break;
      }
    } else {
      curr = this.sorts.items.find(s => s.col.instanceID === col.instanceID);
    }

    // Advance through the configured sort cycle: a column's order (its own, or inherited from
    // `defaultColDef`) wins, falling back to the built-in default.
    const order = col.sortingOrder ?? ["asc", "desc", null];
    const nextDir = nextSortDir(curr?.dir ?? null, order);

    // A non-additive (plain) sort replaces the whole sort model: clear every other sorted column
    // first, then apply this one. Additive sorts (Ctrl/⌘ icon-click, or the Shift+click shortcut)
    // leave the existing sort model in place and just update this column.
    let clearedIds: string[] = [];
    if (!additive) {
      const keep = new Set(col.getLeaves().map(c => c.instanceID));
      const others = this.sorts.items.map(s => s.col).filter(c => !keep.has(c.instanceID));
      if (others.length > 0) {
        clearedIds = others.flatMap(c => c.getVisibleLeaves().map(l => l.instanceID));
        this.sorts.bulkUpdate(others, null);
      }
    }

    const applied = this.setSortModelForCol(col, nextDir);
    if (!applied && clearedIds.length === 0) return;

    const changedColIds = [
      ...clearedIds,
      ...(col.children.length > 0 ? col.getVisibleLeaves().map(c => c.instanceID) : [col.instanceID]),
    ];
    this.rowModel.applyRequest(this.createRowModelRequest("sort", { start: this.pageStartIdx, end: this.pageEndIdx }, this.getInitialServerSideLoadRange()));
    this.emit("columnsChanged", { reason: "sort", changedColIds: changedColIds });
  }

  getPageStartIdx(): number {
    return this.paginationEnabled ? this.pageStartIdx : 0;
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

  getRowNumberForViewIndex(viewIndex: number): number {
    return (this.paginationEnabled ? this.pageStartIdx : 0) + viewIndex + 1;
  }

  private resetPageBlocks(): { start: number, end: number } {
    const pageSize = this.pageEndIdx - this.pageStartIdx;
    this.pageStartIdx = 0;
    this.pageEndIdx = this.pageStartIdx + pageSize;
    return { start: this.pageStartIdx, end: this.pageEndIdx };
  }

  applyPagination(pageIdx: number, pageSize: number, enabled: boolean = this.paginationEnabled) {
    this.paginationEnabled = enabled;
    this.pageStartIdx = pageIdx * pageSize;
    this.pageEndIdx = this.pageStartIdx + pageSize;
    const loadRange = this.getInitialServerSideLoadRange();
    this.rowModel.applyRequest(this.createRowModelRequest("pagination", { start: this.pageStartIdx, end: this.pageEndIdx }, loadRange, enabled));
  }

  refreshRows(reason: RowDataChangeReason = "refresh", range: { start: number; end: number } = { start: this.pageStartIdx, end: this.pageEndIdx }) {
    const requestRange = this.paginationEnabled && reason === "viewport"
      ? { start: this.pageStartIdx + range.start, end: this.pageStartIdx + range.end }
      : range;
    const loadRange = reason === "viewport"
      ? this.getServerSideBlockRange(requestRange)
      : this.getInitialServerSideLoadRange();
    this.rowModel.applyRequest(this.createRowModelRequest(reason, requestRange, loadRange));
  }

  private getInitialServerSideLoadRange(): { start: number; end: number } | undefined {
    if (this.rowModel.getType() !== "serverSide") return undefined;
    if (!this.paginationEnabled) return undefined;
    const blockSize = Math.max(1, this.options.serverSideBlockSize);
    return {
      start: this.pageStartIdx,
      end: Math.min(this.pageEndIdx, this.pageStartIdx + blockSize),
    };
  }

  private getServerSideBlockRange(range: { start: number; end: number }): { start: number; end: number } | undefined {
    if (this.rowModel.getType() !== "serverSide") return undefined;
    const blockSize = Math.max(1, this.options.serverSideBlockSize);
    if (!this.paginationEnabled) {
      const blockStart = Math.floor(range.start / blockSize) * blockSize;
      const blockEnd = Math.ceil(Math.max(range.end, blockStart + 1) / blockSize) * blockSize;
      return { start: blockStart, end: blockEnd };
    }

    const pageOffset = Math.max(0, range.start - this.pageStartIdx);
    const blockStart = this.pageStartIdx + Math.floor(pageOffset / blockSize) * blockSize;
    const blockEnd = this.pageStartIdx + Math.ceil(
      Math.max(range.end - this.pageStartIdx, pageOffset + 1) / blockSize
    ) * blockSize;
    return {
      start: blockStart,
      end: Math.min(this.pageEndIdx, blockEnd),
    };
  }

  setServerSideDataSource(callback: IServerSideDataSource | null) {
    if (this.rowModel.getType() !== "serverSide") {
      console.warn("Setting server-side data source on 'clientSide' row model has no effect.");
      return;
    }
    (this.rowModel as any).serverDataSource = callback;
    this.refreshRows("refresh");
    this.emit("modelUpdated", { reason: "api", step: "all" });
  }

  setServerSideAggregationSource(callback: IServerSideDataSource["getAggregates"] | null) {
    if (this.rowModel.getType() !== "serverSide") {
      console.warn("Setting server-side aggregation source on 'clientSide' row model has no effect.");
      return;
    }
    (this.rowModel as any).serverAggregationSource = callback;
    if (!callback && this.aggregateScope === "all") {
      this.aggregateScope = "page";
      this.rowModel.setAggregateScope(this.aggregateScope);
    }
    this.applyAggregateRequest("aggregateModel", "dataSource");
  }

  setAggregateScope(scope: AggregateScope) {
    scope = this.normalizeAggregateScope(scope);
    if (this.aggregateScope === scope) return;
    this.aggregateScope = scope;
    this.rowModel.setAggregateScope(scope);
    this.applyAggregateRequest("aggregateScope", "scope");
    this.emit("modelUpdated", { reason: "api", step: "all" });
  }

  setAggregateModel(aggregates: AggregateModel[]) {
    this.aggregates = this.resolveAggregateModels(aggregates);
    if (this.aggregates.length > 0 && this.aggregateScope === "none") {
      this.aggregateScope = this.normalizeAggregateScope("page");
      this.rowModel.setAggregateScope(this.aggregateScope);
    }
    this.applyAggregateRequest("aggregateModel", "model");
  }

  private applyAggregateRequest(
    reason: "aggregateScope" | "aggregateModel",
    aggregateReason?: IRowModelOnAggregatesParams["reason"],
  ): void {
    const normalizedScope = this.normalizeAggregateScope(this.aggregateScope);
    if (normalizedScope !== this.aggregateScope) {
      this.aggregateScope = normalizedScope;
      this.rowModel.setAggregateScope(normalizedScope);
    }
    this.rowModel.applyRequest(this.createRowModelRequest(
      reason,
      { start: this.pageStartIdx, end: this.pageEndIdx },
      undefined,
      this.paginationEnabled,
      aggregateReason,
    ));
  }

  isAggregateScopeLockedToPage(): boolean {
    return this.rowModel.getType() === "serverSide" && !(this.rowModel as any).serverAggregationSource;
  }

  private normalizeAggregateScope(scope: AggregateScope): AggregateScope {
    if (scope === "all" && this.isAggregateScopeLockedToPage()) return "page";
    return scope;
  }

  getRowIdAtViewIndex(displayedIndex: number): GridId | null {
    return this.rowModel.getRowNodeAtViewIndex(displayedIndex)?.id || null;
  }

  // Whether the row at a view index can hold a cell selection / be a navigation target. Group rows
  // are skipped unless groupRowsSelectable is enabled; all leaf rows are selectable.
  private isViewRowSelectable(viewIdx: number): boolean {
    if (this.options.groupRowsSelectable) return true;
    const node = this.rowModel.getRowNodeAtViewIndex(viewIdx);
    return !node || !node.isGroup;
  }

  // Whether a row node renders as a full-width row: its content spans the whole body width instead
  // of per-column cells. True for group rows in "groupRows" display mode, or any node the
  // isFullWidthRow option opts in. Single source of truth for the renderer.
  isFullWidthNode(node: IRowNode | null | undefined): boolean {
    if (!node) return false;
    if (node.isGroup && this.options.groupDisplayType === "groupRows") return true;
    return !!this.options.isFullWidthRow?.(node);
  }

  getViewIndexForRowId(rowId: GridId): number | null {
    return this.rowModel.getRowNode(rowId)?.viewIndex ?? null;
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

  getSortModel(): SortModel {
    return this.sorts;
  }

  getFilterModel(): FilterModel {
    return this.filters;
  }

  getAggregateModel(): AggregateModel[] {
    return this.aggregates.slice();
  }

  getAggregateScope(): AggregateScope {
    return this.aggregateScope;
  }

  // ---------------- Selection reads ----------------
  getSelectionRange(): SelectionRange | null {
    return this.selectionModel.getSelectionRange();
  }

  getSelectionAnchor(): CellPos | null {
    return this.selectionModel.getAnchor();
  }

  getActiveCell(): CellPos | null {
    return this.selectionModel.getActiveCell();
  }

  getEditingCell(): CellRef | null {
    return this.editingCell;
  }

  getActionFrameCell(): CellRef | null {
    return this.actionFrameCell;
  }

  /** Close any open ActionFrame and emit the close event. No-op when none is open. */
  private closeActionFrameIfOpen(): void {
    if (!this.actionFrameCell) return;
    const cell = this.actionFrameCell;
    this.actionFrameCell = null;
    this.emit("actionFrameChanged", { state: "closed", cell });
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  clearHistory(): void {
    this.history.clear();
  }

  getSelectedColumnIds(): Set<string> {
    return this.selectionModel.getSelectedColumnIds();
  }

  getSelectedRowIds(): Set<string> {
    return this.selectionModel.getSelectedRowIds();
  }

  /** Currently-selected row nodes (unloaded / no-longer-present ids are omitted). */
  getSelectedNodes(): IRowNode[] {
    const nodes: IRowNode[] = [];
    for (const id of this.selectionModel.getSelectedRowIds()) {
      const node = this.rowModel.getRowNode(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /** Underlying data objects of the currently-selected rows. */
  getSelectedRows(): unknown[] {
    return this.getSelectedNodes().map(n => n.data);
  }

  /** Whether every selectable data row in the current view is selected. */
  areAllRowsSelected(): boolean {
    return this.selectionModel.areAllRowsSelected();
  }

  /** Select every selectable data row in the current view. */
  selectAllRows(): void {
    this.selectionModel.selectAllRows();
    this.emitSelectionChanged("api");
  }

  /** Clear the row selection. */
  deselectAllRows(): void {
    this.selectionModel.clearRows();
    this.emitSelectionChanged("api");
  }

  isCellInActiveSelection(viewIdx: number, colIdx: number, rowId: string, colId: string): boolean {
    return this.selectionModel.isCellInActiveSelection(viewIdx, colIdx, rowId, colId);
  }

  getSelectionSnapshot(resolveIds = false): SelectionSnapshot {
    return this.selectionModel.getSnapshot(resolveIds);
  }

  /** Prune column selection to still-existing columns (called after column model rebuilds). */
  pruneColumnSelection() {
    this.selectionModel.pruneColumns();
  }

  /** Clamp the active range/anchor to the current view bounds (called after view recompute). */
  clampSelectionToView() {
    this.selectionModel.clampToView();
  }

  // Event handling
  on<E extends GridEventName>(event: E, handler: GridEventHandler<E>): Unsubscribe {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler as GridEventHandler<GridEventName>);
    return () => {
      this.off(event, handler);
    };
  }

  off<E extends GridEventName>(eventType: E, handler: GridEventHandler<E>) {
    if (!this.eventHandlers.has(eventType)) return;
    const handlers = this.eventHandlers.get(eventType)!;
    const idx = handlers.indexOf(handler as GridEventHandler<GridEventName>);
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
      case "columnStateSet":
        this.applyColumnState(action.state, action.defaultState);
        break;
      // Handle other action types as needed
      case "overlayShow":
        this.emit("overlayShow", { overlayType: action.overlayType });
        break;
      case "themeFontSet":
        console.log("Setting theme fonts", "Reason:", action.reason);
        this.textMeasureParams = { headerFont: action.headerFont, cellFont: action.cellFont };
        let themeFontChangedColIds: string[] = [];
        if (action.reason !== "visibility" && action.reason !== "pin") {
          themeFontChangedColIds = this.autosizeColumns(false);
        }
        this.emit("columnWidthsChanged", { changedColIds: themeFontChangedColIds });
        break;
      case "rowDataSet":
        this.setRowData(action.rows);
        break;
      case "rowTransactionApply":
        this.applyTransaction({
          add: action.add as RowData[] | undefined,
          update: action.update as { rowId: GridId; row: RowData }[] | undefined,
          remove: action.remove as GridId[] | undefined,
        });
        break;
      case "columnAutosize":
        const autosizedColIds = this.autosizeColumn(action.colId);
        if (autosizedColIds.length > 0) {
          this.emit("columnWidthsChanged", { changedColIds: autosizedColIds });
        }
        break;
      case "columnResize":
        const resizedColIds = this.columnModel.resizeColumn(action.colId, action.widthPx);
        if (resizedColIds.length > 0) {
          this.emit("columnWidthsChanged", { changedColIds: resizedColIds });
        }
        break;
      case "sortModelSet":
        this.setSortModel(action.sortItems);
        break;
      case "quickFilterSet":
        this.setQuickFilter(action.text, { matchMode: action.matchMode, caseSensitive: action.caseSensitive });
        break;
      case "columnPin":
        this.columnModel.setPinneds(action.colIds, action.pinned);
        this.emit("columnsChanged", { reason: "pin", changedColIds: action.colIds });
        this.emit("rowsChanged", { reason: "pin", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "columnVisibility":
        this.columnModel.toggleVisibility(action.colIds, action.hidden);
        this.clearSelectionForColumnChange();
        this.emit("columnsChanged", { reason: "visibility", changedColIds: action.colIds });
        this.emit("rowsChanged", { reason: "visibility", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "columnMove":
        this.columnModel.moveColumnTo(action.colId, action.toIndex, action.toSection);
        this.clearSelectionForColumnChange();
        this.emit("columnsChanged", { reason: "order", changedColIds: [action.colId] });
        this.emit("rowsChanged", { reason: "order", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "addSparklineColumn": {
        const colId = action.newColId || `sparkline_${crypto.randomUUID()}`;
        const colDef: ColDef = {
          colId,
          label: "Sparkline",
          width: 120,
          sortable: false,
          filter: false,
          groupable: false,
          resizable: true,
          movable: true,
          hideable: true,
          cellRenderer: SparklineRenderer,
          cellRendererParams: { colIds: action.colIds, type: action.sparklineType },
        };
        const allRows: IRowNode[] = [];
        this.rowModel.forEachNode((node: IRowNode) => allRows.push(node));
        const instanceID = this.columnModel.addColumnDef(colDef, "center", this.measureCtx, this.textMeasureParams, allRows);
        this.emit("columnsChanged", { reason: "add", changedColIds: [instanceID] });
        this.emit("rowsChanged", { reason: "add", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      }
      case "paginationSet":
        this.applyPagination(action.pageIndex, action.pageSize, action.enabled);
        break;
      case "aggregateModelSet":
        this.setAggregateModel(action.aggregateModels);
        break;
      case "rowGroupSet":
        this.setRowGroupModel(action.colIds);
        break;
      case "groupToggleExpand":
        this.toggleGroupExpand(action.groupId, action.expanded);
        break;
      case "headerAction":
        const col = this.columnModel.getById(action.colId);
        if (!col || col.isInternal()) return;
        switch (action.action) {
          case "toggleSort":
            this.toggleSort(col, action.additive ?? false);
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
              const allRows: IRowNode[] = [];
              this.rowModel.forEachNode((node: IRowNode) => {
                allRows.push(node);
              });
              this.columnModel.identifyComparatorsFor([col], allRows);
              if (this.aggregates.length > 0) {
                this.applyAggregateRequest("aggregateModel", "columns");
              }
              this.clearSelectionForColumnChange();
              this.emit("columnsChanged", { reason: "state", changedColIds: [col.instanceID] });
              this.emit("rowsChanged", { reason: "group", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
            }
            break;
        }
        break;
      case "navigate": {
        const active = this.selectionModel.navigate(action.dir, {
          extend: !!action.extend,
          jump: action.jump,
          pageRows: action.pageRows,
        });
        this.emitSelectionChanged("keyboard");
        this.emitFocusChanged(active, "keyboard");
        break;
      }
      case "navigateCorner": {
        const active = this.selectionModel.navigateToCorner(action.corner, !!action.extend);
        this.emitSelectionChanged("keyboard");
        this.emitFocusChanged(active, "keyboard");
        break;
      }
      case "selectAll": {
        const active = this.selectionModel.selectAll();
        this.emitSelectionChanged("keyboard");
        this.emitFocusChanged(active, "keyboard");
        break;
      }
      case "focusSet": {
        const ok = this.selectionModel.selectSingleCell(action.viewIdx, action.colIdx);
        if (ok) {
          this.emitSelectionChanged(action.reason ?? "api");
          this.emitFocusChanged(this.selectionModel.getActiveCell(), action.reason ?? "api");
        }
        break;
      }
      case "rangeSelectSet": {
        if (action.mode === "extend") {
          this.selectionModel.updateRange(action.viewIdx, action.colIdx);
        } else {
          this.selectionModel.startFromCell({ viewIdx: action.viewIdx, colIdx: action.colIdx });
        }
        this.emitSelectionChanged("mouse");
        this.emitFocusChanged(this.selectionModel.getActiveCell(), "mouse");
        break;
      }
      case "rowSelectSet":
        this.selectionModel.toggleRow(action.viewIdx, action.mode);
        this.emitSelectionChanged("mouse");
        break;
      case "rowSelectAll":
        if (action.selected) this.selectAllRows();
        else this.deselectAllRows();
        break;
      case "columnSelectSet":
        this.selectionModel.toggleColumn(action.colId, action.mode ?? "toggle");
        this.emitSelectionChanged("mouse");
        break;
      case "selectionClear":
        switch (action.what ?? "all") {
          case "range": this.selectionModel.clearRange(); break;
          case "rows": this.selectionModel.clearRows(); break;
          case "columns": this.selectionModel.clearColumns(); break;
          default: this.selectionModel.clearAll(); break;
        }
        this.emitSelectionChanged("api");
        break;
      case "editStart": {
        const col = this.columnModel.getById(action.cell.colId);
        const row = this.rowModel.getRowNode(action.cell.rowId);
        if (!col || !row || row.isGroup || !col.isCellEditable(row)) break;
        // Editing and ActionFrame are mutually exclusive: opening the editor closes any open frame.
        this.closeActionFrameIfOpen();
        this.editingCell = action.cell;
        this.emit("editingChanged", { state: "started", cell: action.cell, charPress: action.charPress });
        break;
      }
      case "actionFrameOpen": {
        const col = this.columnModel.getById(action.cell.colId);
        const row = this.rowModel.getRowNode(action.cell.rowId);
        if (!col || !row || row.isGroup) break;
        // No frame to show if the column has no form component (a `defaultColDef` value, if any,
        // has already been merged onto the column).
        if (!col.actionFrameComponent) break;
        // A frame and an inline edit can't be open on the grid at once — cancel any active edit.
        if (this.editingCell) {
          const editing = this.editingCell;
          this.editingCell = null;
          this.emit("editingChanged", { state: "cancelled", cell: editing });
        }
        this.actionFrameCell = action.cell;
        this.emit("actionFrameChanged", { state: "opened", cell: action.cell });
        break;
      }
      case "actionFrameClose": {
        this.closeActionFrameIfOpen();
        break;
      }
      case "editCommit": {
        const col = this.columnModel.getById(action.cell.colId);
        const row = this.rowModel.getRowNode(action.cell.rowId);
        this.editingCell = null;
        if (!col || !row) {
          this.emit("editingChanged", { state: "stopped", cell: action.cell });
          break;
        }
        const oldValue = col.getValue(row);
        const newValue = action.parsed
          ? action.value
          : col.parseValue(String(action.value ?? ""), row, oldValue);
        this.rowModel.setCellValue(action.cell.rowId, col.key, newValue);
        if (!this.applyingHistory) {
          this.history.push({ label: "edit", edits: [{ cell: action.cell, oldValue, newValue }] });
        }
        // Emit editingChanged first so the editor tears down (and returns focus to the grid root)
        // while its input still holds focus. cellsChanged repaints the cell afterwards; doing it
        // first would detach the focused input and drop keyboard focus to <body>.
        this.emit("editingChanged", { state: "committed", cell: action.cell, value: newValue });
        this.emit("cellsChanged", {
          reason: "editCommit",
          rowIds: [action.cell.rowId],
          colIds: [col.instanceID],
        });
        if (!this.applyingHistory) this.reevaluateAfterEdit(new Set([col.instanceID]));
        break;
      }
      case "editCancel": {
        this.editingCell = null;
        this.emit("editingChanged", { state: "cancelled", cell: action.cell });
        break;
      }
      case "cellsCommit": {
        const changedRowIds = new Set<string>();
        const changedColIds = new Set<string>();
        const recorded: CellEdit[] = [];
        for (const edit of action.edits) {
          const col = this.columnModel.getById(edit.cell.colId);
          const row = this.rowModel.getRowNode(edit.cell.rowId);
          if (!col || !row) continue;
          const oldValue = col.getValue(row);
          const newValue = col.parseValue(String(edit.value ?? ""), row, oldValue);
          if (this.rowModel.setCellValue(edit.cell.rowId, col.key, newValue)) {
            changedRowIds.add(edit.cell.rowId);
            changedColIds.add(col.instanceID);
            recorded.push({ cell: edit.cell, oldValue, newValue });
          }
        }
        if (!this.applyingHistory && recorded.length > 0) {
          const label = action.reason === "cut" ? "cut"
            : action.reason === "clear" ? "clear"
              : "paste";
          this.history.push({ label, edits: recorded });
        }
        if (changedRowIds.size > 0) {
          this.emit("cellsChanged", {
            reason: "editCommit",
            rowIds: [...changedRowIds],
            colIds: [...changedColIds],
          });
          if (!this.applyingHistory) this.reevaluateAfterEdit(changedColIds);
        }
        break;
      }
      case "undo": {
        const entry = this.history.popUndo();
        if (entry) this.applyHistoryEdits(entry.edits, "undo");
        break;
      }
      case "redo": {
        const entry = this.history.popRedo();
        if (entry) this.applyHistoryEdits(entry.edits, "redo");
        break;
      }
      default:
        console.warn(`Unhandled action type: ${action.type}`);
    }
  }

  // Apply an undo (write oldValue) or redo (write newValue) step: write each cell directly (no
  // re-parse — the recorded values are already the stored form), emit one cellsChanged, and select
  // the affected cells so the change is visible. Guarded so these writes aren't re-recorded.
  private applyHistoryEdits(edits: CellEdit[], dir: "undo" | "redo"): void {
    this.applyingHistory = true;
    const changedRowIds = new Set<string>();
    const changedColIds = new Set<string>();
    try {
      for (const edit of edits) {
        const col = this.columnModel.getById(edit.cell.colId);
        if (!col) continue;
        const value = dir === "undo" ? edit.oldValue : edit.newValue;
        if (this.rowModel.setCellValue(edit.cell.rowId, col.key, value)) {
          changedRowIds.add(edit.cell.rowId);
          changedColIds.add(col.instanceID);
        }
      }
    } finally {
      this.applyingHistory = false;
    }
    if (changedRowIds.size === 0) return;

    this.emit("cellsChanged", {
      reason: "editCommit",
      rowIds: [...changedRowIds],
      colIds: [...changedColIds],
    });
    // Re-sort/re-filter first (rows may move), then place selection using the new view indices.
    this.reevaluateAfterEdit(changedColIds, false);
    this.selectHistoryCells(edits);
  }

  // Select the bounding rectangle of the affected cells (single cell → a 1×1 selection) so an
  // undo/redo scrolls into view and is visibly highlighted. Cells not currently in view (filtered
  // out / unloaded) are skipped; if none are resolvable, selection is left unchanged.
  private selectHistoryCells(edits: CellEdit[]): void {
    const leaves = this.columnModel.getLeaves();
    let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
    for (const edit of edits) {
      const viewIdx = this.getViewIndexForRowId(edit.cell.rowId);
      const colIdx = leaves.findIndex(c => c.instanceID === edit.cell.colId);
      if (viewIdx == null || colIdx < 0) continue;
      minRow = Math.min(minRow, viewIdx); maxRow = Math.max(maxRow, viewIdx);
      minCol = Math.min(minCol, colIdx); maxCol = Math.max(maxCol, colIdx);
    }
    if (!Number.isFinite(minRow)) return;

    this.selectionModel.startFromCell({ viewIdx: minRow, colIdx: minCol });
    if (maxRow > minRow || maxCol > minCol) {
      this.selectionModel.updateRange(maxRow, maxCol);
    }
    this.emitSelectionChanged("api");
    this.emitFocusChanged(this.selectionModel.getActiveCell(), "api");
  }

  /**
   * After a cell edit commits, re-run the active sort and/or filter if any edited column
   * participates in them, so an edited row moves to its correct sorted position or drops out of a
   * filtered view. Gated by the reevaluateOnEdit option and client-side row model only.
   *
   * Selection follows the active cell's row: its view index is re-resolved after the re-eval and
   * the active cell is re-selected (scrolls into view). If that row was filtered out, the range is
   * cleared instead.
   */
  private reevaluateAfterEdit(changedColIds: Set<string>, followSelection = true): boolean {
    if (!this.options.reevaluateOnEdit) return false;
    if (this.rowModel.getType() !== "clientSide") return false;

    const inFilter = this.filters.items.some(i => changedColIds.has(i.col.instanceID));
    const inSort = this.sorts.items.some(i => changedColIds.has(i.col.instanceID));
    if (!inFilter && !inSort) return false;

    // Remember which row the active cell is on so we can follow it to its new position.
    const active = followSelection ? this.selectionModel.getActiveCell() : null;
    const activeColIdx = active?.colIdx ?? null;
    const activeRowId = active ? this.getRowIdAtViewIndex(active.row) : null;

    // "filter" re-runs both filter and sort; "sort" re-runs sort only.
    const reason = inFilter ? "filter" : "sort";
    this.rowModel.applyRequest(this.createRowModelRequest(
      reason,
      { start: this.pageStartIdx, end: this.pageEndIdx },
      this.getInitialServerSideLoadRange(),
    ));
    this.emit("rowsChanged", { reason });

    // Re-place selection on the edited row's new view index, or clear it if the row left the view.
    // Skipped when followSelection is false (undo/redo restores its own multi-cell selection after).
    if (followSelection && activeRowId != null && activeColIdx != null) {
      const newViewIdx = this.getViewIndexForRowId(activeRowId);
      if (newViewIdx != null) {
        this.selectionModel.selectSingleCell(newViewIdx, activeColIdx);
        this.emitSelectionChanged("model");
        this.emitFocusChanged(this.selectionModel.getActiveCell(), "api");
      } else {
        this.selectionModel.clearRange();
        this.emitSelectionChanged("model");
      }
    }
    return true;
  }

  private emitSelectionChanged(reason: "mouse" | "keyboard" | "api" | "model"): void {
    this.emit("selectionChanged", {
      snapshot: this.selectionModel.getSnapshot(),
      reason,
    });
  }

  private clearSelectionForColumnChange(): void {
    this.selectionModel.clearRange();
    this.selectionModel.clearColumns();
    this.emitSelectionChanged("model");
  }

  private emitFocusChanged(active: CellPos | null, reason: "mouse" | "keyboard" | "api"): void {
    const params: GridEventFocusChangedParams = { reason };
    if (active) {
      params.viewIdx = active.row;
      params.colIdx = active.colIdx;
      const rowId = this.getRowIdAtViewIndex(active.row);
      const col = this.columnModel.getLeaves()[active.colIdx];
      if (rowId && col) params.next = { rowId, colId: col.instanceID };
    }
    this.emit("focusChanged", params);
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

  onServerSideSchema(id: number, params: { columns: ColDef[]; schemaVersion?: string }) {
    if (this.requestIdCounter - id > 1) {
      return;
    }
    this.applyServerSideColumnDefs(params.columns, params.schemaVersion);
  }

  onRows(id: number, params: IRowModelOnRowsParams) {
    if (params.reason !== "viewport" && this.requestIdCounter - id > 1) {
      // This means a newer request has already been made, so we can ignore these rows.
      return;
    }
    if (params.reason === "init" || params.reason === "refresh") {
      const isFirstRefresh = params.reason === "init" || !this.firstRefreshSeen;
      if (params.reason === "refresh") this.firstRefreshSeen = true;
      const shouldAutosize = isFirstRefresh || this.options.autosizeColumnsOnDataChange;
      if (shouldAutosize) {
        const changedColIds = this.autosizeColumns();
        if (changedColIds.length > 0) {
          this.emit("columnWidthsChanged", { changedColIds });
        }
      }
    } else if (params.reason === "aggregateModel" && this.groupColumns.length > 0) {
      // Aggregate model changed while grouping: re-fit columns to the new per-group totals.
      const changedColIds = this.autosizeColumns();
      if (changedColIds.length > 0) {
        this.emit("columnWidthsChanged", { changedColIds });
      }
    }
    this.emit("rowsChanged", {
      reason: params.reason,
      firstRowIndex: params.visibleStart,
      lastRowIndex: params.visibleEnd,
      rowCount: params.rowCount,
    });
    this.emit("paginationChanged", this.getPaginationInfo());
  }

  onAggregates(_id: number, params: IRowModelOnAggregatesParams) {
    this.emit("aggregateChanged", {
      reason: params.reason,
      scope: params.scope,
      aggregateModel: params.aggregateModel,
      valuesAvailable: params.valuesAvailable,
    });
  }

  onLoadingEnd(id: number) {
    if (this.requestIdCounter - id > 1) {
      // This means a newer request has already been made, so we can ignore this loading end.
      return;
    }
    this.emit("overlayShow", { overlayType: "none" });
  }

  onError(id: number, err: unknown) {
    if (this.requestIdCounter - id > 1) {
      return;
    }
    this.emit("overlayShow", { overlayType: "none" });
    this.emit("error", {
      code: "row_model_error",
      message: err instanceof Error ? err.message : "Row model request failed.",
      details: err,
    });
  }

  destroy(): void {
    // Clean up resources if needed
  }

}
