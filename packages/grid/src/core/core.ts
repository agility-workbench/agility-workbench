import { FilterItem, FilterModel } from "../interfaces/filter";
import { IRowModel, IRowModelRequestParams, RowDataChangeReason, RowTransactionResult, ServerSideRefreshOptions } from "../interfaces/iRowModel";
import { Column } from "../column/column";
import { ClientSideRowModel } from "../csrm/clientSide";
import { ServerSideRowModel } from "../ssrm/serverSide";
import { nextSortDir, SortItem, SortItemUpdate, SortModel } from "../interfaces/sort";
import { AggregateModel, AggregateScope } from "../interfaces/aggregate";
import {
  CellCommitSource,
  GridOptions,
  GroupDisplayType,
  GroupSortMode,
  InternalGridOptions,
  QuickFilterMatchMode,
  REJECT,
  ResetPageTrigger,
  RowPinnedPosition,
  RuntimeGridOptions,
  TreeDataKeyboardNavigationMode,
  resolveQuickFilterOptions,
} from "../interfaces/gridOptions";
import { ColId, ColumnState, GridId, GridSnapshot, IGridCore, RowData } from "../interfaces/iGridCore";
import { IRowNode } from "../interfaces/iRowNode";
import {
  GridEventHandler,
  GridEventMap,
  GridEventName,
  GridEventPaginationChangedParams,
  Unsubscribe,
} from "../events/events";
import { isTrue, validatePageSizes } from "../misc";
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
import { SparklineParams, SparklineRenderer } from "../cellRenderers/sparklineRenderer";
import { getFormatterByType } from "../column/formatters";

type SchemaSource = "auto" | "props" | "server";

interface RangeColumnSnapshot {
  layout: Array<{ id: string; section: "left" | "center" | "right" }>;
}

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
  private keyboardNavigationMode: TreeDataKeyboardNavigationMode;
  /** Header keyboard cursor: index into visible leaf columns, or null when the body holds it. */
  private headerFocusColIdx: number | null = null;
  private displayedPinnedRows: Record<RowPinnedPosition, IRowNode[]> = { top: [], bottom: [] };
  private bodyPinnedRowIds = new Set<GridId>();
  private bodyPinnedViewIndices: number[] = [];
  // Set while undo/redo is applying edits so the recording path doesn't re-record its own writes.
  private applyingHistory = false;

  constructor(private measureCtx: ITextMeasurer, options: GridOptions = {}) {
    this.options = this.initializeGridOptions(options);
    this.keyboardNavigationMode = this.options.treeData?.keyboardNavigationMode ?? "grid";
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
      getPinnedRowCount: (position) => this.displayedPinnedRows[position].length,
      getPinnedRowNode: (position, rowIndex) =>
        this.displayedPinnedRows[position][rowIndex] ?? null,
    });
    this.bindOptionCallbacks();
  }

  // Bridge declarative on* option callbacks to core events. Every bridge is installed even when its
  // initial callback is absent so a framework wrapper can replace callbacks live.
  private bindOptionCallbacks() {
    const o = this.options;
    this.on("cellClicked", (ev) => o.onCellClicked?.(ev));
    this.on("rowClicked", (ev) => o.onRowClicked?.(ev));
    this.on("selectionChanged", (ev) => o.onSelectionChanged?.(ev));
    this.on("cellValueChanged", (ev) => {
      o.onCellValueChanged?.({
        rowId: ev.cell.rowId,
        colId: ev.cell.colId,
        colInstanceId: ev.cell.colInstanceId,
        value: ev.value,
        oldValue: ev.oldValue,
        source: ev.source,
      });
    });
    this.on("columnsChanged", (ev) => {
      if (ev.reason === "sort") {
        o.onSortChanged?.({
          changedColIds: ev.changedColIds,
          changedColInstanceIds: ev.changedColInstanceIds,
        });
      }
    });
    this.on("filterChanged", (ev) => o.onFilterChanged?.(ev));
  }

  private initializeGridOptions(options: GridOptions): InternalGridOptions {
    const pageSize = options.pageSize ?? 100;
    // Normalize pageSizes and make sure the configured pageSize is offered by the page-size
    // selector — a <select> assigned a value with no matching option renders blank, and the
    // configured size would become unreachable after the user's first change.
    const pageSizes = validatePageSizes(options.pageSizes ?? [25, 50, 100], [25, 50, 100]);
    if (!pageSizes.includes(pageSize)) {
      if (options.pageSizes != null) {
        console.warn(
          `pageSize ${pageSize} is not one of pageSizes [${pageSizes.join(", ")}]; adding it to the page-size options.`,
        );
      }
      pageSizes.push(pageSize);
      pageSizes.sort((a, b) => a - b);
    }
    return {
      headerHeight: options.headerHeight ?? 43,
      leafHeaderHeight: options.leafHeaderHeight ?? 43,
      parentHeaderHeight: options.parentHeaderHeight ?? 43,
      rowHeight: options.rowHeight ?? 43,
      pinnedTopRowData: options.pinnedTopRowData ?? [],
      pinnedBottomRowData: options.pinnedBottomRowData ?? [],
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
      onBeforeCellCommit: options.onBeforeCellCommit,
      onCellValueChanged: options.onCellValueChanged,
      onSelectionChanged: options.onSelectionChanged,
      onSortChanged: options.onSortChanged,
      onFilterChanged: options.onFilterChanged,
      ariaLabel: options.ariaLabel,
      ariaLabelledBy: options.ariaLabelledBy,
      highlightActiveCell: isTrue(options.highlightActiveCell),
      rowSelection: typeof options.rowSelection === "object" ? true : isTrue(options.rowSelection),
      rowSelectionCheckboxes: typeof options.rowSelection === "object"
        && isTrue(options.rowSelection.checkboxes),
      rowSelectionHeaderCheckbox: typeof options.rowSelection === "object"
        && isTrue(options.rowSelection.checkboxes)
        && (options.rowSelection.headerCheckbox ?? true),
      cellSelection: options.cellSelection ?? true, // true | false | "text"
      rangeSelection: options.rangeSelection ?? true,
      columnSelection: options.columnSelection ?? true,
      showColumnButtonsOnHover: isTrue(options.showColumnButtonsOnHover),
      bodyContextMenu: options.bodyContextMenu ?? true, // true | false | getter

      selectAllRowsOnHeaderClick: isTrue(options.selectAllRowsOnHeaderClick),
      selectAllScope: options.selectAllScope ?? "filtered",
      selectionPersistence: options.selectionPersistence ?? "clear",
      resetPageOn: options.resetPageOn ?? [],
      pageSize,
      pageSizes,
      serverSideBlockSize: options.serverSideBlockSize ?? options.pageSize ?? 100,
      getGroupChildCount: options.getGroupChildCount,
      paginationUnknownTotalTooltip: options.paginationUnknownTotalTooltip
        ?? "More rows may exist on the server; the total updates as they load",
      autosizeColumnsOnDataChange: options.autosizeColumnsOnDataChange ?? (options.rowModelType === "serverSide"),
      clearSelectionOnBodyClick: options.clearSelectionOnBodyClick ?? true,
      undoLimit: options.undoLimit != null && options.undoLimit >= 0 ? options.undoLimit : 100,
      editTrigger: options.editTrigger ?? "doubleClick",
      readOnlyEdit: isTrue(options.readOnlyEdit),
      pinnedRowsEditable: isTrue(options.pinnedRowsEditable),
      rowPinningMenu: isTrue(options.rowPinningMenu),
      suppressKeyboardEdit: isTrue(options.suppressKeyboardEdit),
      suppressTypeToEdit: isTrue(options.suppressTypeToEdit),
      moveAfterEdit: options.moveAfterEdit ?? true,
      commitOnBlur: options.commitOnBlur ?? true,
      multiSortKey: options.multiSortKey ?? "ctrl",
      showSortPriority: options.showSortPriority ?? "multi",
      initialSort: options.initialSort,
      reevaluateOnEdit: options.reevaluateOnEdit ?? true,
      groupDisplayType: options.groupDisplayType ?? "singleColumn",
      groupColumnDef: options.groupColumnDef,
      groupDefaultExpanded: options.groupDefaultExpanded ?? 0,
      groupSortMode: options.groupSortMode ?? "local",
      // Keep runtime keyboard-mode changes internal; never mutate the client's treeData object.
      treeData: options.rowModelType === "serverSide"
        ? undefined
        : options.treeData
          ? { ...options.treeData } as typeof options.treeData
          : undefined,
      groupRowsSelectable: options.groupRowsSelectable ?? false,
      isRowPinned: options.isRowPinned,
      groupRowsSticky: options.groupRowsSticky ?? false,
      isFullWidthRow: options.isFullWidthRow,
      fullWidthCellRenderer: options.fullWidthCellRenderer,
      defaultColDef: options.defaultColDef,
      tooltip: options.tooltip ?? true,
      quickFilter: options.quickFilter ?? false,
      columnPanel: options.columnPanel ?? false,
      toolbar: options.toolbar ?? {},
      savedViews: options.savedViews,
      loadingMessage: options.loadingMessage ?? "Loading data...",
      noRowsMessage: options.noRowsMessage ?? "No rows to show",
      filterDebounceMs: options.filterDebounceMs != null && options.filterDebounceMs >= 0 ? options.filterDebounceMs : 300,
      cellFlashDuration: options.cellFlashDuration != null && options.cellFlashDuration >= 0 ? options.cellFlashDuration : 500,
      cellFadeDuration: options.cellFadeDuration != null && options.cellFadeDuration >= 0 ? options.cellFadeDuration : 1000,
      icons: options.icons,
      theme: options.theme,
      suppressStyleInjection: options.suppressStyleInjection ?? false,
      styleNonce: options.styleNonce,
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
    const rangeSnapshot = this.captureRangeColumnSnapshot();
    const sortedComparatorSnapshot = new Map(
      this.sorts.items.map(item => [item.col.instanceID, item.col.userComparator]),
    );
    this.columnModel.setColumnDefs(colDefs);
    const seededSort = this.seedInitialSort();
    const changedSortColIds = this.reconcileSortModelColumns();
    const { changedColIds: changedFilterColIds, droppedCols: droppedFilterCols } = this.reconcileFilterModelColumns();
    this.reconcileAggregateModelColumns();
    this.reconcileGroupModelColumns();
    this.autosizeColumns();
    const activeComparatorChanged = this.sorts.items.some(
      item => sortedComparatorSnapshot.get(item.col.instanceID) !== item.col.userComparator,
    );
    // autosizeColumns() has now (re)identified comparators, so the seeded sort can be produced.
    if (seededSort || activeComparatorChanged) {
      this.rowModel.applyRequest(this.createRowModelRequest("sort", { start: this.pageStartIdx, end: this.pageEndIdx }, this.getInitialServerSideLoadRange()));
    }
    if (this.aggregates.length > 0) {
      this.applyAggregateRequest("aggregateModel", "columns");
    }
    this.reconcileSelectionAfterColumnDefs(rangeSnapshot, activeComparatorChanged);
    this.emit("columnsChanged", { reason: "defs" });
    if (changedFilterColIds.length > 0) {
      this.emit("columnsChanged", { reason: "filter", ...this.columnsChangedIds(changedFilterColIds) });
    }
    if (changedSortColIds.length > 0) {
      this.emit("columnsChanged", { reason: "sort", ...this.columnsChangedIds(changedSortColIds) });
    }
    // Canonical filter signal: only when the columnDefs update actually removed an active filter.
    // (The `columnsChanged {reason:"filter"}` emit above fires whenever any filter merely survives
    // a defs update, which would be spurious here.)
    if (droppedFilterCols.length > 0) {
      const pair = this.eventColIds(droppedFilterCols);
      this.emit("filterChanged", { source: "columns", changedColIds: pair.colIds, changedColInstanceIds: pair.colInstanceIds });
    }
  }

  // Restore a captured column layout (widths / pinning / visibility / order) from getColumnState().
  // By default the column model merges (unknown colIds ignored, columns absent from state keep their
  // place); pass `defaultState` to apply a fallback to those absent columns (e.g. { hidden: true }
  // for an exact restore). The renderer rebuilds the pool + header + widths for the "state" reason.
  private applyColumnState(state: ColumnState[], defaultState?: Partial<ColumnState>): void {
    this.columnModel.applyColumnState(state, { defaultState });
    this.clearSelectionForColumnChange();
    this.emit("columnsChanged", {
      reason: "state",
      ...(() => {
        const pair = this.eventColIds(state.map(s => this.columnModel.resolve(s.colId)));
        return { changedColIds: pair.colIds, changedColInstanceIds: pair.colInstanceIds };
      })(),
    });
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
      suppressColumnPanel: def.suppressColumnPanel,
      columnGroupShow: def.columnGroupShow,
      openByDefault: def.openByDefault,
      children: def.children ? normalize(def.children) : undefined,
    }));
    return JSON.stringify(normalize(colDefs));
  }

  private reconcileFilterModelColumns(): { changedColIds: string[]; droppedCols: Column[] } {
    const nextItems: FilterItem[] = [];
    const changedColIds: string[] = [];
    // Columns whose filter items are removed by this reconcile (column gone, or a duplicate item) —
    // captured as Column objects because a dropped column may no longer resolve through the model.
    const droppedCols: Column[] = [];
    const seenColIds = new Set<string>();
    let changed = false;

    for (const item of this.filters.items) {
      const col = this.resolveModelColumn(item);
      if (!col) {
        droppedCols.push(item.col);
        changed = true;
        continue;
      }

      if (seenColIds.has(col.instanceID)) {
        droppedCols.push(col);
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

    return { changedColIds, droppedCols };
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
    const resolved: Column[] = [];
    const seen = new Set<string>();
    for (const col of this.groupColumns) {
      const next = this.resolveModelColumn({ col });
      if (!next || !next.groupable || seen.has(next.instanceID)) continue;
      seen.add(next.instanceID);
      resolved.push(next);
    }
    this.groupColumns = resolved;
    this.columnModel.setRowGroupColumns(
      resolved,
      this.options.groupDisplayType,
      this.options.treeData != null,
    );
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
    const col = this.columnModel.resolve(colID);
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
    groupExpansion?: IRowModelRequestParams["groupExpansion"],
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
      groupSortMode: this.options.groupSortMode,
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

  applyTransaction(tx: { add?: RowData[]; update?: { rowId: GridId; row: RowData; }[]; remove?: GridId[]; }): RowTransactionResult {
    if (this.rowModel.getType() !== "clientSide") {
      console.warn("applyTransaction is only supported on the 'clientSide' row model; the server owns its data.");
      return { added: 0, updated: 0, removed: 0 };
    }

    // Unlike setRowData, a transaction preserves edit history — undo/redo entries reference rows by
    // id and remain valid for rows that still exist.
    const result = this.rowModel.applyTransaction(tx);
    if (result.added === 0 && result.updated === 0 && result.removed === 0) return result;

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
      const pair = this.eventColIds(this.columnModel.getLeaves().filter(c => !c.isInternal()));
      this.emit("cellsChanged", {
        reason: "data",
        rowIds: tx.update.map(u => u.rowId),
        colIds: pair.colIds,
        colInstanceIds: pair.colInstanceIds,
      });
    }
    return result;
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
    const changedColIds = new Set(this.filters.items.map(item => item.col.instanceID));
    const seenColIds = new Set<string>();
    for (const filter of filters) {
      const col = this.resolveModelColumn(filter);
      if (!col || seenColIds.has(col.instanceID)) continue;
      seenColIds.add(col.instanceID);
      changedColIds.add(col.instanceID);
      nextItems.push({ ...filter, col, key: col.key });
    }
    this.filters.setItems(nextItems);
    this.applyFilters([...changedColIds]);
  }

  private applyFilters(changedColIds: string[]) {
    const range = this.pageRangeFor("filter");
    this.rowModel.applyRequest(this.createRowModelRequest("filter", range, this.getInitialServerSideLoadRange()))
    if (this.rowModel.getType() !== "serverSide") this.clampPageToLastPage();
    this.selectionModel.clearRange();
    if (this.options.selectionPersistence !== "keep") this.selectionModel.clearRows();
    this.emitSelectionChanged("model");
    this.emit("columnsChanged", { reason: "filter", ...this.columnsChangedIds(changedColIds) })
    this.emit("filterChanged", { source: "filter", ...this.columnsChangedIds(changedColIds) });
  }

  /**
   * Set the quick-filter (global search) state. `text` is the raw search string; the optional
   * `matchMode` / `caseSensitive` override the resolved defaults (the widget passes them so the
   * user's popover choices take effect). Keeps the current page (clamped to the last page when the
   * result shrinks past it) unless "quickFilter" is in `resetPageOn`; clears the selection per
   * `selectionPersistence` (it may point at rows about to be hidden). No-op for the server-side
   * row model.
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
    const range = this.pageRangeFor("quickFilter");
    this.rowModel.applyRequest(this.createRowModelRequest("quickFilter", range, this.getInitialServerSideLoadRange()));
    this.clampPageToLastPage();
    this.selectionModel.clearRange();
    if (this.options.selectionPersistence !== "keep") this.selectionModel.clearRows();
    this.emitSelectionChanged("model");
    this.emit("modelUpdated", { reason: "filter", step: "all" });
    this.emit("filterChanged", { source: "quickFilter", changedColIds: [], changedColInstanceIds: [] });
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
    this.applySortRequest(changedColIDs);
  }

  // Shared tail of every user sort gesture (`setSortModel` and header-click `toggleSort`): apply
  // the re-sort with the `resetPageOn`-resolved page range, clear the (positionally stale) cell
  // range, honor `selectionPersistence` for row selection, and emit the sort signals. Sorting
  // never changes the row count, so the keep-page path needs no clamp.
  private applySortRequest(changedColIds: string[]): void {
    const range = this.pageRangeFor("sort");
    this.rowModel.applyRequest(this.createRowModelRequest("sort", range, this.getInitialServerSideLoadRange()));
    this.selectionModel.clearRange();
    if (this.options.selectionPersistence !== "keep") this.selectionModel.clearRows();
    this.emitSelectionChanged("model");
    this.emit("columnsChanged", { reason: "sort", ...this.columnsChangedIds(changedColIds) });
  }

  // Replace the set of columns rows are grouped by (order = grouping level). An empty list clears
  // grouping. Synthesizes/removes auto-group columns per the configured groupDisplayType,
  // re-derives the grouped view, and clears selection (view indices shift). On the server-side row
  // model this purges the block store and re-requests lazily per expanded group.
  setRowGroupModel(colIds: string[]): void {
    if (this.options.treeData) {
      console.warn("Column-value row grouping cannot be combined with tree data.");
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
    this.columnModel.setRowGroupColumns(resolved, this.options.groupDisplayType, false);
    // Rebuild the row pool / header for the new column set (adds/removes the auto-group column)
    // BEFORE the grouped view repaints, so the pool has a cell per leaf column when rows paint.
    this.clearSelectionForColumnChange();
    this.emit("columnsChanged", { reason: "group" });
    this.rowModel.applyRequest(this.createRowModelRequest("group", this.resetPageBlocks(), this.getInitialServerSideLoadRange()));
    // Autosize AFTER the group tree exists so columns fit their per-group aggregate values (which
    // live on the group nodes built during applyRequest).
    const changedColIds = this.autosizeColumns();
    if (changedColIds.length > 0) this.emit("columnWidthsChanged", this.widthsChangedPayload(changedColIds));
    this.emit("rowsChanged", { reason: "group", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
    this.emit("paginationChanged", this.getPaginationInfo());
  }

  // Expand or collapse a single group node, then re-flatten the grouped view (no filter/sort/tree
  // rebuild). When `expanded` is omitted the node's state is toggled.
  toggleGroupExpand(groupId: string, expanded?: boolean): void {
    this.applyGroupExpansion({ groupId, expanded });
  }

  // Expand/collapse many group nodes at the cost of a single toggle: one row-model re-flatten,
  // one selection reconcile, one repaint. `groupIds` omitted = every group node.
  setGroupsExpanded(expanded: boolean, groupIds?: string[]): void {
    this.applyGroupExpansion(groupIds ? { groupIds, expanded } : { all: true, expanded });
  }

  private applyGroupExpansion(groupExpansion: NonNullable<IRowModelRequestParams["groupExpansion"]>): void {
    if (this.groupColumns.length === 0 && !this.options.treeData) return;
    this.rowModel.applyRequest(this.createRowModelRequest(
      "group",
      { start: this.pageStartIdx, end: this.pageEndIdx },
      this.getInitialServerSideLoadRange(),
      this.paginationEnabled,
      undefined,
      groupExpansion,
    ));
    // Collapsing a hierarchy can remove enough display rows to invalidate the current page.
    this.clampPageToLastPage();
    this.clearSelectionForColumnChange();
    this.emit("rowsChanged", { reason: "group", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
    this.emit("paginationChanged", this.getPaginationInfo());
  }

  getRowGroupColumns(): Column[] {
    return this.groupColumns.slice();
  }

  // Switch the visual grouping layout in place. The grouped row tree itself is unchanged, which
  // preserves expansion state; only the synthesized/tagged columns and full-width-row treatment
  // need to be rebuilt by the renderer.
  setGroupDisplayType(groupDisplayType: GroupDisplayType): void {
    if (this.options.groupDisplayType === groupDisplayType) return;

    this.options.groupDisplayType = groupDisplayType;
    this.columnModel.setRowGroupColumns(
      this.groupColumns,
      groupDisplayType,
      this.options.treeData != null,
    );
    this.clearSelectionForColumnChange();
    this.emit("columnsChanged", { reason: "group" });

    const changedColIds = this.autosizeColumns();
    if (changedColIds.length > 0) this.emit("columnWidthsChanged", this.widthsChangedPayload(changedColIds));
  }

  setGroupSortMode(groupSortMode: GroupSortMode): void {
    if (this.options.groupSortMode === groupSortMode) return;
    this.options.groupSortMode = groupSortMode;
    if ((this.groupColumns.length === 0 && !this.options.treeData)
      || this.rowModel.getType() !== "clientSide") return;

    this.rowModel.applyRequest(this.createRowModelRequest(
      "sort",
      { start: this.pageStartIdx, end: this.pageEndIdx },
      this.getInitialServerSideLoadRange(),
    ));
    this.selectionModel.clearAll();
    this.emitSelectionChanged("model");
    this.emit("rowsChanged", {
      reason: "sort",
      firstRowIndex: 0,
      lastRowIndex: this.rowModel.getViewCount() - 1,
    });
    this.emit("paginationChanged", this.getPaginationInfo());
  }

  setGroupRowsSelectable(groupRowsSelectable: boolean): void {
    if (this.options.groupRowsSelectable === groupRowsSelectable) return;

    this.options.groupRowsSelectable = groupRowsSelectable;
    // A group row may already own a cell/range/row selection. Clear selection when disabling so
    // the grid does not retain a visibly selected row that is no longer a valid selection target.
    if (!groupRowsSelectable) {
      this.selectionModel.clearAll();
      this.emitSelectionChanged("model");
      this.emitFocusChanged(null, "api");
    }
  }

  getKeyboardNavigationMode(): TreeDataKeyboardNavigationMode {
    return this.options.treeData ? this.keyboardNavigationMode : "grid";
  }

  setKeyboardNavigationMode(
    mode: TreeDataKeyboardNavigationMode,
    source: "api" | "shortcut" | "options" = "api",
  ): void {
    const next = this.options.treeData ? mode : "grid";
    if (this.keyboardNavigationMode === next) return;
    const previousMode = this.keyboardNavigationMode;
    this.keyboardNavigationMode = next;
    if (this.options.treeData) this.options.treeData.keyboardNavigationMode = next;
    this.emit("keyboardNavigationModeChanged", { mode: next, previousMode, source });
  }

  setTreeDataKeyboardNavigationOptions(
    mode: TreeDataKeyboardNavigationMode = "grid",
    enableModeSwitch: boolean = false,
  ): void {
    if (!this.options.treeData) return;
    this.options.treeData.enableKeyboardNavigationModeSwitch = enableModeSwitch;
    this.setKeyboardNavigationMode(mode, "options");
  }

  private navigateTree(command: "expand" | "collapse" | "parent"): void {
    if (!this.options.treeData || this.keyboardNavigationMode !== "hierarchy") return;
    const active = this.selectionModel.getActiveCell();
    const hierarchy = this.columnModel.getHierarchyColumn();
    if (!active || !hierarchy) return;
    const activeColumn = this.columnModel.getLeaves()[active.colIdx];
    if (activeColumn?.instanceID !== hierarchy.instanceID) return;

    const node = active.rowPinned
      ? this.getDisplayedPinnedRow(active.rowPinned, active.row)
      : this.rowModel.getRowNodeAtViewIndex(active.row);
    if (!node) return;

    if (command === "expand" || (command === "collapse" && !!node.children?.length && node.isExpanded)) {
      const targetExpanded = command === "expand";
      if (!node.children?.length || node.isExpanded === targetExpanded) return;
      this.toggleGroupExpand(node.id, targetExpanded);

      // toggleGroupExpand reconciles selection because the visible row set changed. Restore focus
      // to the same hierarchy node, whose page-local index may have changed after page clamping.
      const updated = this.rowModel.getRowNode(node.id);
      const pinnedIndex = active.rowPinned
        ? this.displayedPinnedRows[active.rowPinned].findIndex(row => row.id === node.id)
        : -1;
      const localViewIndex = updated ? updated.viewIndex - this.getPageStartIdx() : -1;
      if (active.rowPinned && pinnedIndex >= 0) {
        this.selectionModel.selectSingleCell(pinnedIndex, active.colIdx, active.rowPinned);
        this.emitSelectionChanged("keyboard");
        this.emitFocusChanged(this.selectionModel.getActiveCell(), "keyboard");
      } else if (localViewIndex >= 0 && localViewIndex < this.rowModel.getViewCount()) {
        this.selectionModel.selectSingleCell(localViewIndex, active.colIdx);
        this.emitSelectionChanged("keyboard");
        this.emitFocusChanged(this.selectionModel.getActiveCell(), "keyboard");
      }
      return;
    }

    // Ctrl/Cmd+Left follows the tree-view fallback: collapse an expanded parent first, then move
    // to the direct parent when the current node is a leaf or is already collapsed.
    if (!node.parentId) return;
    const parent = this.rowModel.getRowNode(node.parentId);
    if (!parent || parent.viewIndex < 0) return;

    const pinnedParentIndex = active.rowPinned
      ? this.displayedPinnedRows[active.rowPinned].findIndex(row => row.id === parent.id)
      : -1;
    if (active.rowPinned && pinnedParentIndex >= 0) {
      this.selectionModel.selectSingleCell(pinnedParentIndex, active.colIdx, active.rowPinned);
      this.emitSelectionChanged("keyboard");
      this.emitFocusChanged(this.selectionModel.getActiveCell(), "keyboard");
      return;
    }

    if (this.paginationEnabled) {
      const pageSize = this.pageEndIdx - this.pageStartIdx;
      if (pageSize <= 0) return;
      const targetPage = Math.floor(parent.viewIndex / pageSize);
      const currentPage = Math.floor(this.pageStartIdx / pageSize);
      if (targetPage !== currentPage) this.applyPagination(targetPage, pageSize, true);
    }

    const localViewIndex = parent.viewIndex - this.getPageStartIdx();
    if (localViewIndex < 0 || localViewIndex >= this.rowModel.getViewCount()) return;
    this.selectionModel.selectSingleCell(localViewIndex, active.colIdx);
    this.emitSelectionChanged("keyboard");
    this.emitFocusChanged(this.selectionModel.getActiveCell(), "keyboard");
  }

  setPinnedRowOptions(options: {
    pinnedTopRowData?: any[];
    pinnedBottomRowData?: any[];
    isRowPinned?: GridOptions["isRowPinned"];
    groupRowsSticky?: boolean;
  }): void {
    if (options.pinnedTopRowData !== undefined) this.options.pinnedTopRowData = options.pinnedTopRowData;
    if (options.pinnedBottomRowData !== undefined) this.options.pinnedBottomRowData = options.pinnedBottomRowData;
    if ("isRowPinned" in options) this.options.isRowPinned = options.isRowPinned;
    if (options.groupRowsSticky !== undefined) this.options.groupRowsSticky = options.groupRowsSticky;
  }

  setRuntimeOptions(options: RuntimeGridOptions): void {
    const cellSelectionBecameDisabled =
      this.options.cellSelection === true && options.cellSelection !== true;
    const columnSelectionBecameDisabled =
      this.options.columnSelection && !options.columnSelection
      && this.selectionModel.getSelectedColumnIds().size > 0;

    Object.assign(this.options, options);

    if (cellSelectionBecameDisabled || columnSelectionBecameDisabled) {
      this.selectionModel.clearAll();
      this.emitSelectionChanged("model");
      this.emitFocusChanged(null, "api");
    }
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
    this.applySortRequest(changedColIds);
  }

  getPageStartIdx(): number {
    return this.paginationEnabled ? this.pageStartIdx : 0;
  }

  getPaginationInfo(): GridEventPaginationChangedParams {
    const pageSize = this.pageEndIdx - this.pageStartIdx;
    // getViewTotalCount, not getRowCount: pagination pages over the filtered view. On the
    // server-side model and while grouping the two are identical; on the client-side model
    // getRowCount ignores filtering and would overcount pages under an active filter.
    const totalRowCount = this.rowModel.getViewTotalCount();
    this.totalPages = pageSize > 0 ? Math.ceil(totalRowCount / pageSize) : 1;
    return {
      paginationEnabled: this.paginationEnabled,
      pageIndex: pageSize <= 0 ? 0 : this.pageStartIdx / pageSize,
      pageSize: pageSize,
      totalRowCount: totalRowCount,
      totalPageCount: this.totalPages,
      totalRowCountKnown: this.rowModel.isTotalRowCountKnown?.() ?? true,
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

  // Page range for a filter/sort/quickFilter model change: reset to page 1 when the trigger is in
  // `resetPageOn`, otherwise keep the current page (the caller clamps afterwards if the change
  // shrank the row count past it). Mutates the page indices — must run BEFORE
  // getInitialServerSideLoadRange(), which reads them.
  private pageRangeFor(trigger: ResetPageTrigger): { start: number; end: number } {
    if (!this.paginationEnabled || this.options.resetPageOn.includes(trigger)) {
      return this.resetPageBlocks();
    }
    return { start: this.pageStartIdx, end: this.pageEndIdx };
  }

  // A model change can remove enough rows to invalidate the current page. Keep the core page range
  // on the last valid page and rebuild the paginated slice so the viewport cannot remain empty with
  // a stale out-of-range offset. Client-side only at the filter call sites — the server-side row
  // count is provisional right after a purge, and its onRows snap-back already clamps once the
  // total pins down.
  private clampPageToLastPage(): void {
    if (!this.paginationEnabled) return;
    const pageSize = this.pageEndIdx - this.pageStartIdx;
    const lastPageIndex = pageSize > 0
      ? Math.max(Math.ceil(this.rowModel.getViewTotalCount() / pageSize) - 1, 0)
      : 0;
    const currentPageIndex = pageSize > 0 ? Math.floor(this.pageStartIdx / pageSize) : 0;
    if (currentPageIndex <= lastPageIndex) return;
    this.pageStartIdx = lastPageIndex * pageSize;
    this.pageEndIdx = this.pageStartIdx + pageSize;
    this.rowModel.applyRequest(this.createRowModelRequest(
      "pagination",
      { start: this.pageStartIdx, end: this.pageEndIdx },
      this.getInitialServerSideLoadRange(),
      true,
    ));
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

  // Re-invoke the server-side data source because the server's data changed — distinct from
  // refreshRows, which only re-derives/redraws. Optionally scoped to one group subtree; purge
  // drops affected rows immediately, otherwise current rows stay rendered while replacements load.
  async refreshServerSideData(options?: ServerSideRefreshOptions): Promise<boolean> {
    if (this.rowModel.getType() !== "serverSide" || !this.rowModel.refreshServerSideData) {
      console.warn("refreshServerSideData has no effect on the 'clientSide' row model.");
      return false;
    }
    return this.rowModel.refreshServerSideData(options, this.requestIdCounter++);
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
    const node = this.rowModel.getRowNodeAtViewIndex(viewIdx);
    return !node || this.isNodeSelectable(node);
  }

  private isNodeSelectable(node: IRowNode): boolean {
    if (this.isBodyRowPinned(node.id)) return false;
    if (this.options.groupRowsSelectable) return true;
    return !node.isGroup;
  }

  // Ids of every selectable data row in the whole filtered/sorted set (all pages). Group nodes
  // are not part of the flat client-side iteration; on the server-side model this covers loaded
  // rows only.
  private getFilteredSelectableRowIds(): string[] {
    const ids: string[] = [];
    this.rowModel.forEachNodeAfterFilterAndSort((node) => {
      if (node && !node.isGroup && this.isNodeSelectable(node)) ids.push(node.id);
    });
    return ids;
  }

  // Whether a row node renders as a full-width row: its content spans the whole body width instead
  // of per-column cells. True for group rows in "groupRows" display mode, or any node the
  // isFullWidthRow option opts in. Single source of truth for the renderer.
  isFullWidthNode(node: IRowNode | null | undefined): boolean {
    if (!node) return false;
    if (!this.options.treeData && node.isGroup && this.options.groupDisplayType === "groupRows") return true;
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

  /**
   * Index of the column header holding the keyboard cursor, or null when the cursor is in the body.
   * The header is row 0 of the grid for navigation, but its cursor lives here rather than in the
   * selection model: `active` is a *selection* cursor carrying a 1×1 range that feeds
   * copy/edit/ActionFrame, none of which a header position can do. Mutually exclusive with `active`.
   */
  getHeaderFocusColIdx(): number | null {
    return this.headerFocusColIdx;
  }

  /** The column under the header cursor, or null. */
  getHeaderFocusColumn(): Column | null {
    if (this.headerFocusColIdx == null) return null;
    return this.columnModel.getLeaves()[this.headerFocusColIdx] ?? null;
  }

  /**
   * Put the keyboard cursor on a header cell, or clear it with `null`. Entering the header clears the
   * *cell* selection — however it was entered, `"mouse"` included — or Ctrl+C would copy a range the
   * cursor is no longer in. The column selection survives, so arrow keys can keep building one.
   */
  setHeaderFocus(colIdx: number | null, reason: "keyboard" | "api" | "mouse" = "keyboard"): void {
    const leaves = this.columnModel.getLeaves();
    const next = colIdx == null ? null : (colIdx >= 0 && colIdx < leaves.length ? colIdx : null);
    if (next === this.headerFocusColIdx) return;
    this.headerFocusColIdx = next;
    if (next != null && this.selectionModel.getActiveCell()) {
      this.selectionModel.clearRange();
      this.emitSelectionChanged(reason);
      this.emitFocusChanged(null, reason);
    }
    this.emit("headerFocusChanged", {
      colIdx: next ?? undefined,
      colId: next == null ? undefined : leaves[next]?.colId,
      colInstanceId: next == null ? undefined : leaves[next]?.instanceID,
      reason,
    });
  }

  /**
   * ArrowUp from the topmost row hands the cursor to the header. Returns true when it took the key.
   * Only fires when there is genuinely no row above: with a pinned-top band present, ArrowUp from body
   * row 0 steps into the band first, and it takes one more press to reach the header.
   */
  tryEnterHeaderFromTop(): boolean {
    const active = this.selectionModel.getActiveCell();
    if (!active) return false;
    if (active.rowPinned === "bottom") return false;
    if (active.rowPinned === "top") {
      if (active.row !== 0) return false;
    } else {
      const first = this.selectionModel.firstRowPosition();
      if (!first || first.rowPinned || active.row !== first.row) return false;
      if (this.getDisplayedPinnedRowCount("top") > 0) return false;
    }
    this.setHeaderFocus(active.colIdx, "keyboard");
    return true;
  }

  /** Step the header cursor. `down` hands the cursor back to the body in the same column. */
  navigateHeader(dir: "left" | "right" | "down" | "home" | "end"): void {
    const leaves = this.columnModel.getLeaves();
    if (leaves.length === 0) return;
    const from = this.headerFocusColIdx ?? 0;
    if (dir === "down") {
      // Leaving the header: clear the cursor first so the selection change below is not undone by
      // setHeaderFocus's own "entering the header" branch.
      this.headerFocusColIdx = null;
      this.emit("headerFocusChanged", { reason: "keyboard" });
      // Down goes to the row directly below the header on screen — the pinned-top band when one is
      // displayed. `firstRowPosition()` prefers the body, answering a different question (where a jump
      // from inside the body lands).
      const first = this.getDisplayedPinnedRowCount("top") > 0
        ? { row: 0, rowPinned: "top" as const }
        : this.selectionModel.firstRowPosition();
      if (!first) return;
      this.selectionModel.selectSingleCell(first.row, from, first.rowPinned);
      this.emitSelectionChanged("keyboard");
      this.emitFocusChanged(this.selectionModel.getActiveCell(), "keyboard");
      return;
    }
    const next = dir === "left" ? from - 1
      : dir === "right" ? from + 1
        : dir === "home" ? 0
          : leaves.length - 1;
    // Clamp rather than wrap: the header is a row, and arrowing off the end of a row does nothing.
    this.setHeaderFocus(Math.max(0, Math.min(leaves.length - 1, next)));
  }

  setDisplayedPinnedRows(
    top: IRowNode[],
    bottom: IRowNode[],
    bodyPinnedRowIds?: ReadonlySet<GridId>,
  ): void {
    const active = this.selectionModel.getActiveCell();
    const activeNode = active?.rowPinned
      ? this.displayedPinnedRows[active.rowPinned][active.row] ?? null
      : active
        ? this.rowModel.getRowNodeAtViewIndex(active.row) ?? null
        : null;
    this.displayedPinnedRows = { top: top.slice(), bottom: bottom.slice() };
    this.bodyPinnedRowIds = bodyPinnedRowIds
      ? new Set(bodyPinnedRowIds)
      : new Set(
        [...top, ...bottom]
          .filter(row => row.viewIndex >= 0)
          .map(row => row.id),
      );
    this.bodyPinnedViewIndices = [...this.bodyPinnedRowIds]
      .map(rowId => this.rowModel.getRowNode(rowId)?.viewIndex ?? -1)
      .filter(viewIndex => viewIndex >= 0)
      .sort((left, right) => left - right);

    // Preserve the logical cell while its row crosses a section boundary. This is the row-axis
    // equivalent of retaining the active column while it moves between left/center/right.
    if (active && activeNode) {
      const topIndex = top.findIndex(row => row.id === activeNode.id);
      const bottomIndex = bottom.findIndex(row => row.id === activeNode.id);
      if (topIndex >= 0) {
        this.selectionModel.selectSingleCell(topIndex, active.colIdx, "top");
      } else if (bottomIndex >= 0) {
        this.selectionModel.selectSingleCell(bottomIndex, active.colIdx, "bottom");
      } else if (active.rowPinned) {
        const bodyNode = this.rowModel.getRowNode(activeNode.id);
        const bodyIndex = bodyNode ? bodyNode.viewIndex - this.getPageStartIdx() : -1;
        if (bodyIndex >= 0 && bodyIndex < this.rowModel.getViewCount()) {
          this.selectionModel.selectSingleCell(bodyIndex, active.colIdx);
        }
      }
    }
    this.selectionModel.clampToView();
  }

  getDisplayedPinnedRow(position: RowPinnedPosition, rowIndex: number): IRowNode | null {
    return this.displayedPinnedRows[position][rowIndex] ?? null;
  }

  getDisplayedPinnedRowCount(position: RowPinnedPosition): number {
    return this.displayedPinnedRows[position].length;
  }

  /** Locate a pinned band row by id, with its band position and band-local index. */
  getDisplayedPinnedRowRef(
    rowId: GridId,
  ): { node: IRowNode; position: RowPinnedPosition; rowIndex: number } | null {
    for (const position of ["top", "bottom"] as const) {
      const rowIndex = this.displayedPinnedRows[position].findIndex(node => node.id === rowId);
      if (rowIndex >= 0) {
        return { node: this.displayedPinnedRows[position][rowIndex], position, rowIndex };
      }
    }
    return null;
  }

  // Resolve the row a cell reference addresses: a model row, or — for application-pinned data
  // rows, which never enter the row model — the displayed band row.
  private resolveCellRow(cell: CellRef): IRowNode | null {
    return this.rowModel.getRowNode(cell.rowId)
      ?? this.getDisplayedPinnedRowRef(cell.rowId)?.node
      ?? null;
  }

  // A5: run the application's pre-commit hook for one proposed write. The hook sees the stored
  // (post-valueParser) form and may veto (REJECT → null), transform (any other value), or accept
  // (undefined) the write. `cell` must already be normalized (public colId + instance id).
  private beforeCellCommit(
    cell: CellRef,
    row: IRowNode,
    oldValue: unknown,
    value: unknown,
    source: CellCommitSource,
  ): { value: unknown } | null {
    const hook = this.options.onBeforeCellCommit;
    if (!hook) return { value };
    const result = hook({
      rowId: cell.rowId,
      colId: cell.colId,
      colInstanceId: cell.colInstanceId,
      data: row.data,
      value,
      oldValue,
      source,
    });
    if (result === REJECT) return null;
    return { value: result === undefined ? value : result };
  }

  // Write a cell value wherever the row lives: through the row model, or — for application-pinned
  // data rows — directly into the application-provided data object (mirroring setCellValue).
  private writeCellValue(cell: CellRef, key: string, value: unknown): boolean {
    if (this.rowModel.setCellValue(cell.rowId, key, value)) return true;
    const pinned = this.getDisplayedPinnedRowRef(cell.rowId);
    if (!pinned) return false;
    (pinned.node.data as any)[key] = value;
    return true;
  }

  /* ----- Column id normalization (public colId ⇄ internal instance id) -----
   * Inputs (actions, API arguments, CellRefs) are resolved tolerantly so callers may pass either
   * id space; outputs (event payloads) always carry the public colId with the internal instance
   * id alongside (`colInstanceId(s)`), because split/moved column duplicates can share a colId. */

  // Resolve the column a CellRef addresses: the instance id (if present) wins, then tolerant.
  private resolveCellColumn(cell: CellRef): Column | undefined {
    if (cell.colInstanceId) {
      const byInstance = this.columnModel.getById(cell.colInstanceId);
      if (byInstance) return byInstance;
    }
    return this.columnModel.resolve(cell.colId);
  }

  // Emit-side CellRef normalization: public colId + instance id, whatever the input carried.
  private normalizeCellRef(cell: CellRef, col?: Column): CellRef {
    const resolved = col ?? this.resolveCellColumn(cell);
    if (!resolved) return cell;
    const next: CellRef = { rowId: cell.rowId, colId: resolved.colId, colInstanceId: resolved.instanceID };
    if (cell.rowPinned) next.rowPinned = cell.rowPinned;
    return next;
  }

  // Both event id spaces for a set of columns (dedupes; unresolved entries drop out).
  private eventColIds(cols: Array<Column | undefined>): { colIds: string[]; colInstanceIds: string[] } {
    const colIds = new Set<string>();
    const colInstanceIds = new Set<string>();
    for (const col of cols) {
      if (!col) continue;
      colIds.add(col.colId);
      colInstanceIds.add(col.instanceID);
    }
    return { colIds: [...colIds], colInstanceIds: [...colInstanceIds] };
  }

  // columnWidthsChanged payload from instance ids (empty stays empty = "all visible columns").
  private widthsChangedPayload(instanceIds: string[]): GridEventMap["columnWidthsChanged"] {
    const pair = this.eventColIds(instanceIds.map(id => this.columnModel.getById(id)));
    return { changedColIds: pair.colIds, changedColInstanceIds: pair.colInstanceIds };
  }

  // columnsChanged payload fields from instance ids.
  private columnsChangedIds(instanceIds: Iterable<string>): { changedColIds: string[]; changedColInstanceIds: string[] } {
    const pair = this.eventColIds([...instanceIds].map(id => this.columnModel.getById(id)));
    return { changedColIds: pair.colIds, changedColInstanceIds: pair.colInstanceIds };
  }

  isBodyRowPinned(rowId: GridId): boolean {
    return this.bodyPinnedRowIds.has(rowId);
  }

  getBodyPinnedRowCountBefore(viewIndex: number): number {
    let low = 0;
    let high = this.bodyPinnedViewIndices.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.bodyPinnedViewIndices[middle] < viewIndex) low = middle + 1;
      else high = middle;
    }
    return low;
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

  /** Instance ids of the selected columns. Returns a COPY — mutating it never affects the grid. */
  getSelectedColumnIds(): Set<string> {
    return new Set(this.selectionModel.getSelectedColumnIds());
  }

  /** Stable ids of the selected rows. Returns a COPY — mutating it never affects the grid. */
  getSelectedRowIds(): Set<string> {
    return new Set(this.selectionModel.getSelectedRowIds());
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

  /** Whether every selectable data row in the select-all scope (filtered set or page) is selected. */
  areAllRowsSelected(): boolean {
    if (this.options.selectAllScope === "page") return this.selectionModel.areAllRowsSelected();
    const ids = this.getFilteredSelectableRowIds();
    if (ids.length === 0) return false;
    const selected = this.selectionModel.getSelectedRowIds();
    return ids.every(id => selected.has(id));
  }

  /** Select every selectable data row in the select-all scope (filtered set or page). */
  selectAllRows(): void {
    if (this.options.selectAllScope === "page") {
      this.selectionModel.selectAllRows();
    } else {
      this.selectionModel.setSelectedRowIds(this.getFilteredSelectableRowIds(), "set");
    }
    this.emitSelectionChanged("api");
  }

  /**
   * Programmatic row selection by stable row id. Unknown / non-selectable ids are dropped on the
   * client-side row model; the server-side model accepts ids verbatim (rows may not be loaded).
   */
  selectRowsById(rowIds: GridId[], mode: "set" | "add" | "remove" = "set"): void {
    const validated = this.rowModel.getType() === "serverSide"
      ? rowIds
      : rowIds.filter(id => {
        const node = this.rowModel.getRowNode(id);
        return node != null && this.isNodeSelectable(node);
      });
    this.selectionModel.setSelectedRowIds(validated, mode);
    this.emitSelectionChanged("api");
  }

  /** Clear the row selection. */
  deselectAllRows(): void {
    this.selectionModel.clearRows();
    this.emitSelectionChanged("api");
  }

  isCellInActiveSelection(viewIdx: number, colIdx: number, rowId: string, colId: string, rowPinned?: "top" | "bottom"): boolean {
    return this.selectionModel.isCellInActiveSelection(viewIdx, colIdx, rowId, colId, rowPinned);
  }

  getSelectionSnapshot(resolveIds = false): SelectionSnapshot {
    return this.selectionModel.getSnapshot(resolveIds);
  }

  /** Prune column selection to still-existing columns (called after column model rebuilds). */
  pruneColumnSelection() {
    this.selectionModel.pruneColumns();
    // The header cursor is a leaf index, so hiding, removing or reordering columns can leave it past
    // the end — or on a column the user never put it on. Clamped here rather than when the defs
    // change, because this runs after the new leaves are in place; doing it earlier compares against
    // the old column list and silently does nothing.
    if (this.headerFocusColIdx == null) return;
    const leafCount = this.columnModel.getLeaves().length;
    if (leafCount === 0) this.setHeaderFocus(null, "api");
    else if (this.headerFocusColIdx >= leafCount) this.setHeaderFocus(leafCount - 1, "api");
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
        this.emit("columnWidthsChanged", this.widthsChangedPayload(themeFontChangedColIds));
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
          this.emit("columnWidthsChanged", this.widthsChangedPayload(autosizedColIds));
        }
        break;
      case "columnResize":
        const resizedColIds = this.columnModel.resizeColumn(action.colId, action.widthPx);
        if (resizedColIds.length > 0) {
          this.emit("columnWidthsChanged", this.widthsChangedPayload(resizedColIds));
        }
        break;
      case "sortModelSet":
        this.setSortModel(action.sortItems);
        break;
      case "filterModelSet":
        this.setFilterModel(action.filterModel);
        break;
      case "quickFilterSet":
        this.setQuickFilter(action.text, { matchMode: action.matchMode, caseSensitive: action.caseSensitive });
        break;
      case "columnPin":
        this.columnModel.setPinneds(action.colIds, action.pinned);
        {
          const pair = this.eventColIds(action.colIds.map(id => this.columnModel.resolve(id)));
          this.emit("columnsChanged", { reason: "pin", changedColIds: pair.colIds, changedColInstanceIds: pair.colInstanceIds });
        }
        this.emit("rowsChanged", { reason: "pin", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "columnVisibility":
        this.columnModel.toggleVisibility(action.colIds, action.hidden);
        this.clearSelectionForColumnChange();
        {
          const pair = this.eventColIds(action.colIds.map(id => this.columnModel.resolve(id)));
          this.emit("columnsChanged", { reason: "visibility", changedColIds: pair.colIds, changedColInstanceIds: pair.colInstanceIds });
        }
        this.emit("rowsChanged", { reason: "visibility", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "columnMove":
        this.columnModel.moveColumnTo(action.colId, action.toIndex, action.toSection);
        this.clearSelectionForColumnChange();
        {
          const pair = this.eventColIds([this.columnModel.resolve(action.colId)]);
          this.emit("columnsChanged", { reason: "order", changedColIds: pair.colIds, changedColInstanceIds: pair.colInstanceIds });
        }
        this.emit("rowsChanged", { reason: "order", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
        break;
      case "addSparklineColumn": {
        const colId = action.newColId || `sparkline_${crypto.randomUUID()}`;
        const selectedColumns = action.colIds
          .map(id =>
            this.columnModel.getById(id) ??
            this.columnModel.getByColId(id) ??
            this.columnModel.getByKey(id),
          )
          .filter((col): col is Column => !!col && col.children.length === 0);
        if (selectedColumns.length === 0) break;

        const targetColumn =
          this.columnModel.getById(action.targetColId) ??
          this.columnModel.getByColId(action.targetColId) ??
          this.columnModel.getByKey(action.targetColId) ??
          selectedColumns[0];

        // Formatter precedence is deliberately based on explicitly-declared formatters. Runtime
        // Column.valueFormatter may already contain a datatype default, which must not outrank an
        // explicit formatter on another selected column.
        const explicitFormatterSource = targetColumn.col.valueFormatter
          ? targetColumn
          : selectedColumns.find(col => !!col.col.valueFormatter);
        const formatterSource = explicitFormatterSource ?? targetColumn;
        const pointFormatter =
          explicitFormatterSource?.col.valueFormatter ??
          getFormatterByType(targetColumn.type);

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
          valueGetter: row =>
            selectedColumns.map(col => [col.label, col.getValue(row)] as const),
          cellRenderer: SparklineRenderer,
          cellRendererParams: {
            type: action.sparklineType,
            showPoints: true,
            ...(pointFormatter
              ? {
                  tooltipValueFormatter: ({
                    xValue,
                    yValue,
                    rowNode,
                  }: {
                    xValue: unknown;
                    yValue: number;
                    rowNode: IRowNode;
                  }) =>
                    `${String(xValue)}: ${pointFormatter({
                      value: yValue,
                      row: rowNode,
                      col: formatterSource,
                    })}`,
                }
              : {}),
          } as SparklineParams,
        };
        const allRows: IRowNode[] = [];
        this.rowModel.forEachNode((node: IRowNode) => allRows.push(node));
        const instanceID = this.columnModel.addColumnDef(colDef, "center", this.measureCtx, this.textMeasureParams, allRows);
        this.emit("columnsChanged", { reason: "add", ...this.columnsChangedIds([instanceID]) });
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
      case "groupSetExpanded":
        this.setGroupsExpanded(action.expanded, action.groupIds);
        break;
      case "keyboardNavigationModeSet":
        this.setKeyboardNavigationMode(action.mode, action.source);
        break;
      case "treeNavigate":
        this.navigateTree(action.command);
        break;
      case "headerAction":
        const col = this.columnModel.resolve(action.colId);
        // The auto-group column supports header actions like a regular column (toggleSort gates on
        // col.sortable); only the row-number column stays inert.
        if (!col || col.isRowNumberColumn()) return;
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
              this.emit("columnsChanged", { reason: "state", changedColIds: [col.colId], changedColInstanceIds: [col.instanceID] });
              this.emit("rowsChanged", { reason: "group", firstRowIndex: 0, lastRowIndex: this.rowModel.getViewCount() - 1 });
            }
            break;
        }
        break;
      case "headerFocusSet":
        this.setHeaderFocus(action.colIdx, action.reason ?? "api");
        break;
      case "headerNavigate":
        this.navigateHeader(action.dir);
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
        const ok = this.selectionModel.selectSingleCell(
          action.viewIdx,
          action.colIdx,
          action.rowPinned,
        );
        if (ok) {
          this.emitSelectionChanged(action.reason ?? "api");
          this.emitFocusChanged(this.selectionModel.getActiveCell(), action.reason ?? "api");
        }
        break;
      }
      case "rangeSelectSet": {
        if (action.mode === "extend") {
          this.selectionModel.updateRange(action.viewIdx, action.colIdx, action.rowPinned);
        } else {
          this.selectionModel.startFromCell({
            viewIdx: action.viewIdx,
            colIdx: action.colIdx,
            rowPinned: action.rowPinned,
          });
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
      case "rowSelectByIds":
        this.selectRowsById(action.rowIds, action.mode ?? "set");
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
        const col = this.resolveCellColumn(action.cell);
        const row = this.resolveCellRow(action.cell);
        if (!col || !row || row.isGroup || !col.isCellEditable(row)) break;
        // Pinned cells are editable only when opted in. Synthetic group headers stay blocked by
        // the isGroup guard above; pinned tree parents and application data rows pass through.
        if (action.cell.rowPinned && !this.options.pinnedRowsEditable) break;
        // Editing and ActionFrame are mutually exclusive: opening the editor closes any open frame.
        this.closeActionFrameIfOpen();
        const cell = this.normalizeCellRef(action.cell, col);
        this.editingCell = cell;
        this.emit("editingChanged", { state: "started", cell, charPress: action.charPress });
        break;
      }
      case "actionFrameOpen": {
        const col = this.resolveCellColumn(action.cell);
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
        this.actionFrameCell = this.normalizeCellRef(action.cell, col);
        this.emit("actionFrameChanged", { state: "opened", cell: this.actionFrameCell });
        break;
      }
      case "actionFrameClose": {
        this.closeActionFrameIfOpen();
        break;
      }
      case "editCommit": {
        const col = this.resolveCellColumn(action.cell);
        const row = this.resolveCellRow(action.cell);
        this.editingCell = null;
        if (!col || !row) {
          this.emit("editingChanged", { state: "stopped", cell: action.cell });
          break;
        }
        const cell = this.normalizeCellRef(action.cell, col);
        const oldValue = col.getValue(row);
        const proposed = action.parsed
          ? action.value
          : col.parseValue(String(action.value ?? ""), row, oldValue);
        const hooked = this.beforeCellCommit(cell, row, oldValue, proposed, "edit");
        if (!hooked) {
          // Vetoed: the editor still tears down (and the cell repaints with its old value), but
          // nothing is written, recorded, or reported as a value change.
          this.emit("editingChanged", { state: "rejected", cell, value: proposed, oldValue });
          break;
        }
        const newValue = hooked.value;
        // B7 readOnlyEdit: the application owns the write — run the full pipeline and report the
        // accepted value (editingChanged + cellValueChanged), but leave the row object untouched
        // and keep the step out of undo history (there is nothing of ours to undo).
        const readOnly = this.options.readOnlyEdit;
        if (!readOnly) {
          this.writeCellValue(cell, col.key, newValue);
          if (!this.applyingHistory) {
            this.history.push({ label: "edit", edits: [{ cell, oldValue, newValue }] });
          }
        }
        // Emit editingChanged first so the editor tears down (and returns focus to the grid root)
        // while its input still holds focus. cellsChanged repaints the cell afterwards; doing it
        // first would detach the focused input and drop keyboard focus to <body>.
        this.emit("editingChanged", { state: "committed", cell, value: newValue, oldValue });
        this.emit("cellValueChanged", { cell, oldValue, value: newValue, source: "edit" });
        if (!readOnly) {
          this.emit("cellsChanged", {
            reason: "editCommit",
            rowIds: [cell.rowId],
            colIds: [col.colId],
            colInstanceIds: [col.instanceID],
          });
          if (!this.applyingHistory) this.reevaluateAfterEdit(new Set([col.instanceID]));
        }
        break;
      }
      case "editCancel": {
        this.editingCell = null;
        this.emit("editingChanged", { state: "cancelled", cell: this.normalizeCellRef(action.cell) });
        break;
      }
      case "cellsCommit": {
        const changedRowIds = new Set<string>();
        const changedColIds = new Set<string>();
        const recorded: CellEdit[] = [];
        const source: CellCommitSource = action.reason === "cut" ? "cut"
          : action.reason === "clear" ? "clear"
            : action.reason === "api" ? "edit"
              : "paste";
        for (const edit of action.edits) {
          const col = this.resolveCellColumn(edit.cell);
          const row = this.resolveCellRow(edit.cell);
          if (!col || !row) continue;
          const cell = this.normalizeCellRef(edit.cell, col);
          const oldValue = col.getValue(row);
          const proposed = col.parseValue(String(edit.value ?? ""), row, oldValue);
          // Vetoed cells drop out of the batch: not written, not recorded, no event.
          const hooked = this.beforeCellCommit(cell, row, oldValue, proposed, source);
          if (!hooked) continue;
          // B7 readOnlyEdit: report every accepted cell but write none (see editCommit).
          if (this.options.readOnlyEdit || this.writeCellValue(edit.cell, col.key, hooked.value)) {
            changedRowIds.add(edit.cell.rowId);
            changedColIds.add(col.instanceID);
            recorded.push({ cell, oldValue, newValue: hooked.value });
          }
        }
        if (!this.options.readOnlyEdit && !this.applyingHistory && recorded.length > 0) {
          const label = action.reason === "cut" ? "cut"
            : action.reason === "clear" ? "clear"
              : "paste";
          this.history.push({ label, edits: recorded });
        }
        if (changedRowIds.size > 0) {
          for (const edit of recorded) {
            this.emit("cellValueChanged", { cell: edit.cell, oldValue: edit.oldValue, value: edit.newValue, source });
          }
          if (!this.options.readOnlyEdit) {
            const pair = this.columnsChangedIds(changedColIds);
            this.emit("cellsChanged", {
              reason: "editCommit",
              rowIds: [...changedRowIds],
              colIds: pair.changedColIds,
              colInstanceIds: pair.changedColInstanceIds,
            });
            if (!this.applyingHistory) this.reevaluateAfterEdit(changedColIds);
          }
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
    const applied: CellEdit[] = [];
    try {
      for (const edit of edits) {
        const col = this.resolveCellColumn(edit.cell);
        if (!col) continue;
        const value = dir === "undo" ? edit.oldValue : edit.newValue;
        if (this.writeCellValue(edit.cell, col.key, value)) {
          changedRowIds.add(edit.cell.rowId);
          changedColIds.add(col.instanceID);
          applied.push({ ...edit, cell: this.normalizeCellRef(edit.cell, col) });
        }
      }
    } finally {
      this.applyingHistory = false;
    }
    if (changedRowIds.size === 0) return;

    // Report each write in the direction it happened: an undo takes the cell from newValue back
    // to oldValue, so oldValue/value are swapped relative to the recorded edit.
    for (const edit of applied) {
      this.emit("cellValueChanged", {
        cell: edit.cell,
        oldValue: dir === "undo" ? edit.newValue : edit.oldValue,
        value: dir === "undo" ? edit.oldValue : edit.newValue,
        source: dir,
      });
    }
    const pair = this.columnsChangedIds(changedColIds);
    this.emit("cellsChanged", {
      reason: "editCommit",
      rowIds: [...changedRowIds],
      colIds: pair.changedColIds,
      colInstanceIds: pair.changedColInstanceIds,
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
      const editCol = this.resolveCellColumn(edit.cell);
      const colIdx = editCol ? leaves.findIndex(c => c.instanceID === editCol.instanceID) : -1;
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

  private captureRangeColumnSnapshot(): RangeColumnSnapshot | null {
    const range = this.selectionModel.getSelectionRange();
    const anchor = this.selectionModel.getAnchor();
    const active = this.selectionModel.getActiveCell();
    if (!range || !anchor || !active) return null;

    const leaves = this.columnModel.getLeaves();
    const lookup = this.columnModel.leafColumnLookup;
    return {
      layout: leaves.map(col => ({
        // Synthesized columns may be recreated during reconciliation; their stable internal colId
        // identifies the same logical column. User columns retain their instance IDs by colId/key.
        id: col.isInternal() ? col.colId : col.instanceID,
        section: lookup.get(col.instanceID)?.section ?? "center",
      })),
    };
  }

  /**
   * Preserve a cell range across a colDef refresh only when the entire visible column layout is
   * unchanged. Any insertion/removal/hide, sequence change, or pin-region change clears the range,
   * guaranteeing that a range can never be reinterpreted or split into discontiguous pieces.
   */
  private reconcileSelectionAfterColumnDefs(
    snapshot: RangeColumnSnapshot | null,
    rowOrderChanged: boolean,
  ): void {
    let changed = false;

    if (snapshot) {
      if (rowOrderChanged) {
        this.selectionModel.clearRange();
        changed = true;
      } else {
        const lookup = this.columnModel.leafColumnLookup;
        const nextLayout = this.columnModel.getLeaves().map(col => ({
          id: col.isInternal() ? col.colId : col.instanceID,
          section: lookup.get(col.instanceID)?.section ?? "center",
        }));
        const layoutUnchanged = nextLayout.length === snapshot.layout.length
          && nextLayout.every((entry, idx) =>
            entry.id === snapshot.layout[idx].id
            && entry.section === snapshot.layout[idx].section);

        if (!layoutUnchanged) {
          this.selectionModel.clearRange();
          changed = true;
        }
      }
    }

    const visibleColumnIds = new Set<string>();
    for (const id of this.selectionModel.getSelectedColumnIds()) {
      const col = this.columnModel.getById(id);
      if (col && !col.hidden && col.getVisibleLeaves().length > 0) visibleColumnIds.add(id);
    }
    changed = this.selectionModel.retainSelectedColumns(visibleColumnIds) || changed;
    if (changed) this.emitSelectionChanged("model");
  }

  /**
   * The body cursor and the header cursor are mutually exclusive. Enforced at this funnel, which every
   * body-cursor path already goes through, rather than at each call site: relying on call sites to know
   * about the header cursor is what left the ring painted after a click (`rangeSelectSet`) while arrow
   * keys carried on walking the header.
   */
  private clearHeaderFocusForBodyCursor(reason: "mouse" | "keyboard" | "api"): void {
    if (this.headerFocusColIdx == null) return;
    this.headerFocusColIdx = null;
    this.emit("headerFocusChanged", { reason });
  }

  private emitFocusChanged(active: CellPos | null, reason: "mouse" | "keyboard" | "api"): void {
    if (active) this.clearHeaderFocusForBodyCursor(reason);
    const params: GridEventFocusChangedParams = { reason };
    if (active) {
      params.viewIdx = active.row;
      params.colIdx = active.colIdx;
      params.rowPinned = active.rowPinned;
      const rowId = active.rowPinned
        ? this.getDisplayedPinnedRow(active.rowPinned, active.row)?.id ?? null
        : this.getRowIdAtViewIndex(active.row);
      const col = this.columnModel.getLeaves()[active.colIdx];
      if (rowId && col) {
        params.next = { rowId, colId: col.colId, colInstanceId: col.instanceID, rowPinned: active.rowPinned };
      }
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
    // Provisional "next page" navigation can land beyond the true end: once a server-side count
    // pins and the current page start falls past it, snap back to the last real page.
    if (this.paginationEnabled
      && this.rowModel.getType() === "serverSide"
      && (this.rowModel.isTotalRowCountKnown?.() ?? true)) {
      const rowCount = this.rowModel.getRowCount();
      const pageSize = this.pageEndIdx - this.pageStartIdx;
      if (rowCount > 0 && pageSize > 0 && this.pageStartIdx >= rowCount) {
        const lastPageIndex = Math.max(Math.ceil(rowCount / pageSize) - 1, 0);
        this.applyPagination(lastPageIndex, pageSize, true);
        return;
      }
    }
    if (params.reason === "init" || params.reason === "refresh") {
      const isFirstRefresh = params.reason === "init" || !this.firstRefreshSeen;
      if (params.reason === "refresh") this.firstRefreshSeen = true;
      const shouldAutosize = isFirstRefresh || this.options.autosizeColumnsOnDataChange;
      if (shouldAutosize) {
        const changedColIds = this.autosizeColumns();
        if (changedColIds.length > 0) {
          this.emit("columnWidthsChanged", this.widthsChangedPayload(changedColIds));
        }
      }
    } else if (params.reason === "aggregateModel" && this.groupColumns.length > 0) {
      // Aggregate model changed while grouping: re-fit columns to the new per-group totals.
      const changedColIds = this.autosizeColumns();
      if (changedColIds.length > 0) {
        this.emit("columnWidthsChanged", this.widthsChangedPayload(changedColIds));
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
