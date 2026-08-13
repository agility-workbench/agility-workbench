import { RefObject } from "react";
import { AggregateType } from "../interfaces/aggregate";
import { GridAnnouncer } from "./announcer";
import { ActiveDescendantTracker } from "./aria";
import { RowPoolDef } from "./types";
import { isTrue } from "../misc";
import { ExportOptions } from "../export/export";
import { ServerSideAggregationSource } from "../ssrm/serverSide";
import { IServerSideDataSource } from "../interfaces/serverSide";
import { ServerSideRefreshOptions } from "../interfaces/iRowModel";
import { Column } from "../column/column";
import { div } from "./element";
import { GridCore } from "../core/core";
import { IGridAPI, RowScrollPosition } from "../interfaces/iGridAPI";
import { GridRendererCoreEventBinder } from "./coreEventBinder";
import { ExportRenderer } from "./exportRenderer";
import { GridIconMap } from "../theme/icons";
import type { GridTheme } from "../theme/theme";
import { injectGridStyles, resolveStyleTarget } from "../theme/inject";
import { GridModelChangeHandler } from "./modelChangeHandler";
import {
  GridEventAggregateChangedParams,
  GridEventCellsChangedParams,
  GridEventPaginationChangedParams,
  GridEventViewportChangedParams,
} from "../events/events";
import { MenuCoordinator } from "../menu/coordinator";
import { MenuRenderer } from "./menuRenderer";
import { FilterMenuCoordinator } from "../filter/filterMenuCoordinator";
import { AggregateCalculator } from "./aggregate/calculator";
import { AggregateModelController } from "./aggregate/modelController";
import { AggregateRowBuilder } from "./aggregate/rowBuilder";
import { AggregateRowRenderer } from "./aggregate/wrapper";
import { BodyCellRenderer } from "./body/cellRenderer";
import { CellRefreshReason } from "./renderer";
import { BodyPoolSizer } from "./body/poolSizer";
import { BodyRowHoverRenderer } from "./body/rowHover";
import { BodyColumnHoverRenderer } from "./body/columnHover";
import { FloatingAnchor } from "./floating/floatingAnchor";
import { BodyTooltipRenderer } from "./tooltip/bodyTooltipRenderer";
import { ActionFrameRenderer } from "./actionFrame/actionFrameRenderer";
import { resolveGridToolbarOptions, resolveTooltipOptions } from "../interfaces/gridOptions";
import type {
  ColumnPanelOptions,
  GridToolbarOptions,
  RuntimeGridOptions,
  TooltipOptions,
} from "../interfaces/gridOptions";
import type { SavedViewsOptions } from "../interfaces/gridView";
import { BodyRowPoolRenderer } from "./body/rowPool";
import { BodyViewportRenderer } from "./body/viewport";
import { BodyWindowRenderer } from "./body/window";
import { BodyMenuOpener } from "./bodyMenuOpener";
import { ColumnMenuOpener } from "./columnMenuOpener";
import { ColumnInteractionRenderer } from "./header/columnInteraction";
import { HeaderInteractionHandler } from "./header/interactionHandler";
import { HeaderRenderer } from "./header/renderer";
import { IconRenderer } from "./iconRenderer";
import { ThemeRenderer } from "./themeRenderer";
import { GridInteractionEventBinder } from "./interaction/eventBinder";
import { FilterUpdateHandler } from "./filterUpdateHandler";
import { ColumnLayoutRenderer } from "./layout/columnLayout";
import { PinnedSectionLayoutRenderer } from "./layout/pinnedSectionLayout";
import { FilterOverlayRenderer } from "./overlay/filter";
import { LoadingOverlayRenderer } from "./overlay/loading";
import { NoRowsOverlayRenderer } from "./overlay/noRows";
import { QuickFilterWidget } from "./quickFilter/quickFilterWidget";
import type { QuickFilterRestoreState } from "./quickFilter/quickFilterWidget";
import type { QuickFilterOptions } from "../interfaces/gridOptions";
import { PaginationRenderer } from "./pagination/renderer";
import { RootAttachmentRenderer } from "./rootAttachment";
import { HorizontalScrollRenderer } from "./scroll/horizontal";
import { GridScrollSyncRenderer } from "./scroll/sync";
import { SelectionRenderer } from "./selection/selectionRenderer";
import { CellEditRenderer } from "./editing/cellEditRenderer";
import { ClipboardRenderer } from "./clipboard/clipboardRenderer";
import { serializeNodesToTSV, serializeRowsToTSV } from "./clipboard/tsv";
import { ServerSideController } from "./serverSideController";
import { ColumnPanelRenderer } from "./columnPanel/columnPanelRenderer";
import { GridToolbarRenderer } from "./toolbar/gridToolbarRenderer";
import { PinnedRowsRenderer } from "./pinnedRows/pinnedRowsRenderer";

export class GridRenderer {
  _menuRenderer: MenuRenderer;
  _coreEventBinder: GridRendererCoreEventBinder;
  _modelChangeHandler: GridModelChangeHandler;
  _exportRenderer: ExportRenderer;
  _columnMenuOpener: ColumnMenuOpener;
  _bodyMenuOpener: BodyMenuOpener | null = null;
  _filterUpdateHandler: FilterUpdateHandler;
  _aggregateCalculator: AggregateCalculator;
  _aggregateModelController: AggregateModelController;
  _aggregateRowBuilder: AggregateRowBuilder;
  _aggregateRowRenderer: AggregateRowRenderer;
  _serverSideController: ServerSideController;
  _iconRenderer: IconRenderer;
  _themeRenderer: ThemeRenderer;
  _bodyCellRenderer: BodyCellRenderer;
  _bodyPoolSizer: BodyPoolSizer;
  _bodyRowHoverRenderer: BodyRowHoverRenderer;
  _bodyColumnHoverRenderer: BodyColumnHoverRenderer;
  _tooltipFloating: FloatingAnchor;
  _bodyTooltipRenderer: BodyTooltipRenderer;
  // Live tooltip config. Seeded from core options at construction; updated in place by
  // setTooltipOptions so the React wrapper can reconfigure tooltips without remounting the grid.
  _tooltipOptions: boolean | TooltipOptions | undefined;
  _actionFrameFloating: FloatingAnchor;
  _actionFrameRenderer: ActionFrameRenderer;
  _headerRenderer: HeaderRenderer;
  _paginationRenderer: PaginationRenderer;
  _bodyRowPoolRenderer: BodyRowPoolRenderer;
  _bodyViewportRenderer: BodyViewportRenderer;
  _bodyWindowRenderer: BodyWindowRenderer;
  _pinnedRowsRenderer: PinnedRowsRenderer;
  _columnInteractionRenderer: ColumnInteractionRenderer;
  _headerInteractionHandler: HeaderInteractionHandler;
  _columnLayoutRenderer: ColumnLayoutRenderer;
  _pinnedSectionLayoutRenderer: PinnedSectionLayoutRenderer;
  _interactionEventBinder: GridInteractionEventBinder;
  _filterOverlayRenderer: FilterOverlayRenderer;
  _loadingOverlayRenderer: LoadingOverlayRenderer;
  _noRowsOverlayRenderer: NoRowsOverlayRenderer;
  _quickFilterWidget?: QuickFilterWidget;
  private _quickFilterFloatingHost: HTMLDivElement;
  _columnPanelRenderer: ColumnPanelRenderer;
  _toolbarRenderer: GridToolbarRenderer;
  private _quickFilterOptions?: boolean | QuickFilterOptions;
  private _toolbarOptions?: GridToolbarOptions;
  // React can reconcile quick-filter options and toolbar placement in consecutive layout effects.
  // Keep the focus-transfer intent alive through that synchronous batch even if the browser briefly
  // falls back to <body> between the two widget rebuilds.
  private _quickFilterFocusRestorePending = false;
  _rootAttachmentRenderer: RootAttachmentRenderer;
  _horizontalScrollRenderer: HorizontalScrollRenderer;
  _scrollSyncRenderer: GridScrollSyncRenderer;
  _selectionRenderer: SelectionRenderer;
  _cellEditRenderer: CellEditRenderer;
  _clipboardRenderer: ClipboardRenderer;
  rowHeight: number = 43;
  height?: number;

  _maxDepth: number = 1;

  _measureCtx: CanvasRenderingContext2D | null;
  _columnWidths: Map<string, {
    width: number;
    minWidth?: number;
    maxWidth?: number;
    fixed?: boolean;
  }>;

  _leafColumns: Column[];
  _leafColumnLookup: Map<string, { section: "left" | "center" | "right"; globalIndex: number; localIndex: number }>;
  _leftLeafOrder: number[];
  _centerLeafOrder: number[];
  _rightLeafOrder: number[];

  // DOM elements
  root: HTMLDivElement;
  // Shared by every renderer that paints the active cell (body pool, pinned bands) — one tracker
  // per grid, because they arbitrate ownership of a single root attribute between themselves.
  _activeDescendant: ActiveDescendantTracker;
  /** sr-only live region for sort/selection/loading. Distinct from the visible toast below. */
  _announcer: GridAnnouncer;
  private _keyboardNavigationAnnouncer: HTMLDivElement;
  private _keyboardNavigationAnnouncementTimer?: ReturnType<typeof setTimeout>;
  _aggregateLeadingCells: HTMLDivElement[];
  _aggregateLeftCells: HTMLDivElement[];
  _aggregateCells: HTMLDivElement[];
  _aggregateRightCells: HTMLDivElement[];
  _aggregateVisible: boolean;

  _leadingLeafColumns: Column[] = [];
  _leftPinnedColumns: Column[] = [];
  _leftPinnedLeafColumns: Column[] = [];
  _rightPinnedColumns: Column[] = [];
  _rightPinnedLeafColumns: Column[] = [];
  _centerColumns: Column[] = [];
  _centerLeafColumns: Column[] = [];

  _poolSize: number = 0;
  _startIndex: number = 0;
  _rowPool: RowPoolDef[];
  private _serverSidePendingRangeKeys: Set<string> = new Set();

  private get rowModel() {
    return this.core.getRowModel();
  }

  _measureCache: Map<string, Map<string, number>>;

  constructor(
    private core: GridCore,
    private api: IGridAPI,
    menuCoordinator: MenuCoordinator,
    filterMenuCoordinator: FilterMenuCoordinator,
    createBodyMenuCoordinator?: (
      exporter: import("../menu/bodyMenuService").BodyMenuExportTarget,
      clipboard: import("../menu/bodyMenuService").BodyMenuClipboardTarget,
      pinning: import("../menu/bodyMenuService").BodyMenuPinningTarget,
    ) => import("../menu/bodyMenuCoordinator").BodyMenuCoordinator,
  ) {
    this._measureCtx = null;
    this._measureCache = new Map();
    this._columnWidths = new Map();

    // DOM skeleton
    this.root = div("pte-root");
    this.root.dataset.pteGridId = this.core.id;
    this.root.dataset.keyboardNavigationMode = this.core.getKeyboardNavigationMode();
    this.root.style.position = "relative";
    this.root.tabIndex = 0;
    // ARIA: the root is the single focusable element and therefore THE grid — so it
    // is also where aria-activedescendant names the active cell. Counts are refreshed by
    // _refreshAriaCounts whenever data or columns change.
    this.root.setAttribute("role", "grid");
    // A grid must have an accessible name, and only the application knows what this one is called.
    this._applyGridLabel();
    this._activeDescendant = new ActiveDescendantTracker(this.root);
    this._keyboardNavigationAnnouncer = div("pte-grid-announcer");
    this._keyboardNavigationAnnouncer.setAttribute("role", "status");
    this._keyboardNavigationAnnouncer.setAttribute("aria-live", "polite");
    this._keyboardNavigationAnnouncer.setAttribute("aria-atomic", "true");
    this.root.appendChild(this._keyboardNavigationAnnouncer);
    // The toast above is visible and hidden while idle, so AT never sees it. This second region is
    // sr-only and carries the grid's state announcements.
    this._announcer = new GridAnnouncer(this.root);
    // In "text" cell-selection mode, revert body cells to native browser text selection (like a
    // plain HTML table). A root class scopes the user-select/cursor override to this grid instance.
    if (this.core.options.cellSelection === "text") {
      this.root.classList.add("pte-text-selection");
    }
    // Reveal column header buttons only on header hover/focus (a root class scopes the CSS to this
    // grid instance). Off by default → buttons are always visible.
    if (this.core.options.showColumnButtonsOnHover) {
      this.root.classList.add("pte-column-buttons-on-hover");
    }
    this._rootAttachmentRenderer = new RootAttachmentRenderer(this.root);
    this._iconRenderer = new IconRenderer(this.root, this.core.id);
    this._themeRenderer = new ThemeRenderer(this.root);
    this.setTheme(this.core.getOptions().theme);
    this.setIcons(this.core.getOptions().icons);

    this._menuRenderer = new MenuRenderer(this.root);
    this._coreEventBinder = new GridRendererCoreEventBinder({
      core: this.core,
      setLoading: (isLoading) => this.setLoading(isLoading),
      setEmpty: (isEmpty) => this.setEmpty(isEmpty),
      buildPaginationControls: () => this.buildPaginationControls(),
      maybeUpdatePoolSize: (params) => this._maybeUpdatePoolSize(params),
      onColumnsChanged: (params) => {
        this._modelChangeHandler.onColumnsChanged(params);
        this._pinnedRowsRenderer?.render(undefined, true);
        if (params.reason === "sort") this._announceSort();
      },
      onColumnWidthsChanged: (params) => {
        this._modelChangeHandler.onColumnWidthsChanged(params);
        this._pinnedRowsRenderer?.render(undefined, true);
      },
      onDataChanged: (params) => {
        this._modelChangeHandler.onDataChanged(params);
        // Filter/sort/pagination changes move rows through the select-all scope.
        this._headerRenderer.refreshSelectAllCheckbox();
        this._pinnedRowsRenderer?.render(undefined, true);
        this._refreshAriaCounts();
      },
      onAggregateChanged: (params) => this._onAggregateChanged(params),
      updatePaginationControls: (params) => this._updatePaginationControls(params),
      renderAggregateRow: () => this._renderAggregateRow(),
      onSelectionChanged: () => {
        this._selectionRenderer.onSelectionChanged();
        this._pinnedRowsRenderer?.refreshSelectionStyles();
        this._headerRenderer.refreshSelectAllCheckbox();
        this._announceSelection();
      },
      onFocusChanged: (params) => {
        this._selectionRenderer.onFocusChanged(params.viewIdx, params.colIdx, params.rowPinned);
        this._pinnedRowsRenderer?.refreshSelectionStyles();
        if (params.viewIdx != null && params.colIdx != null && !params.rowPinned) {
          this._bodyTooltipRenderer.onFocusChanged(params.viewIdx, params.colIdx, params.reason);
        }
      },
      onHeaderFocusChanged: (params) => this._onHeaderFocusChanged(params.colIdx ?? null),
      onEditingChanged: (params) => this._cellEditRenderer.onEditingChanged(params),
      onCellsChanged: (params) => this._onCellsChanged(params),
      onKeyboardNavigationModeChanged: ({ mode }) => {
        this.root.dataset.keyboardNavigationMode = mode;
        this._keyboardNavigationAnnouncer.textContent =
          mode === "hierarchy" ? "Hierarchy navigation mode" : "Grid navigation mode";
        this._keyboardNavigationAnnouncer.classList.add("is-visible");
        if (this._keyboardNavigationAnnouncementTimer) {
          clearTimeout(this._keyboardNavigationAnnouncementTimer);
        }
        this._keyboardNavigationAnnouncementTimer = setTimeout(() => {
          this._keyboardNavigationAnnouncer.classList.remove("is-visible");
          this._keyboardNavigationAnnouncementTimer = undefined;
        }, 2000);
      },
    });
    this._modelChangeHandler = new GridModelChangeHandler({
      core: this.core,
      serverSidePendingRangeKeys: this._serverSidePendingRangeKeys,
      recomputeView: () => {
        this._bodyViewportRenderer.recomputeView();
        this.core.clampSelectionToView();
      },
      updateWindow: (forcePatch, scrollSrc, params) => this._bodyWindowRenderer.update(forcePatch, scrollSrc, params),
      resetScrollPosition: () => this._bodyViewportRenderer.resetScrollPosition(),
      updatePaginationControls: (params?: GridEventPaginationChangedParams) => this._updatePaginationControls(params),
      refreshSortIndicators: () => this._headerRenderer.refreshSortIndicators(),
      setFilterIndicators: () => this._headerRenderer.setFilterIndicators(),
      buildRowPool: () => this._buildRowPool(),
      buildHeaderDOM: (reason) => this._buildHeaderDOM(reason),
      updateColumnWidths: (colIDs) => this._columnLayoutRenderer.updateColumnWidths(colIDs),
      refreshCellsForColumns: (colIDs, reason) => this._refreshCellsForColumns(colIDs, reason),
      refreshSelectionStyles: () => this._selectionRenderer?.refreshSelectionStyles(),
    });
    this._clipboardRenderer = new ClipboardRenderer({
      core: this.core,
    });
    this._selectionRenderer = new SelectionRenderer({
      core: this.core,
      root: this.root,
      activeDescendant: this._activeDescendant,
      clipboard: () => this._clipboardRenderer,
      rowPool: () => this._rowPool,
      startIndex: () => this._startIndex,
      leafColumns: () => this._leafColumns,
      ensureCellVisible: (viewIdx, colIdx, rowPinned) =>
        this._ensureCellVisible(viewIdx, colIdx, rowPinned),
      viewportRows: () => {
        const h = this._bodyViewportRenderer.getRefs().body.clientHeight;
        return Math.max(1, Math.floor(h / this.rowHeight));
      },
    });
    this._cellEditRenderer = new CellEditRenderer({
      core: this.core,
      root: this.root,
      rowPool: () => this._rowPool,
      startIndex: () => this._startIndex,
      leafColumnLookup: () => this._leafColumnLookup,
      leafColumns: () => this._leafColumns,
      ensureCellVisible: (viewIdx, colIdx, rowPinned) => this._ensureCellVisible(viewIdx, colIdx, rowPinned),
      findPinnedCellEl: (position, rowIndex, colIdx) =>
        this._pinnedRowsRenderer?.findCellElement(position, rowIndex, colIdx) ?? null,
      repaintCell: (rowId, colId) => this._repaintCell(rowId, colId),
      api: () => null,
    });
    this._exportRenderer = new ExportRenderer({
      core: this.core,
      leafColumns: () => this._leafColumns,
      columnWidths: () => this._columnWidths,
      selectionRange: () => this.core.getSelectionRange(),
      selectedColumnIDs: () => this.core.getSelectedColumnIds(),
    });
    // Wire the column header menu's "Export as CSV/Excel" items to the exporter (built above).
    menuCoordinator.setExportTarget({
      exportColumnCSV: (colIDs) => this._exportRenderer.exportColumnCSV(colIDs),
      exportColumnXLSX: (colIDs) => this._exportRenderer.exportColumnXLSX(colIDs),
    });
    // Expose programmatic export on the public API (api.exportDataAsCsv / exportDataAsExcel). The
    // setExporter hook lives on the concrete GridAPI, not the IGridAPI interface (internal wiring),
    // so probe for it structurally to avoid a renderer→api import cycle.
    const apiWithExporter = this.api as unknown as {
      setExporter?: (e: {
        exportCSV: (p: ExportOptions) => void;
        exportExcel: (p: ExportOptions) => void;
        getDataAsCsv: (p: ExportOptions) => string | null;
        getDataAsExcel: (p: ExportOptions) => Promise<Uint8Array | null>;
      }) => void;
    };
    apiWithExporter.setExporter?.({
      exportCSV: (params) => this._exportRenderer.exportCSV(params),
      exportExcel: (params) => this._exportRenderer.exportExcel(params),
      getDataAsCsv: (params) => this._exportRenderer.getDataAsCsv(params),
      getDataAsExcel: (params) => this._exportRenderer.getDataAsExcel(params),
    });
    this._columnMenuOpener = new ColumnMenuOpener({
      core: this.core,
      menuCoordinator,
      filterMenuCoordinator,
      menuRenderer: this._menuRenderer,
      selectedColumnIDs: () => this.core.getSelectedColumnIds(),
    });
    if (createBodyMenuCoordinator) {
      const bodyMenuCoordinator = createBodyMenuCoordinator(
        {
          exportCSV: (opts) => this._exportRenderer.exportCSV(opts),
          exportExcel: (opts) => this._exportRenderer.exportExcel(opts),
        },
        {
          copySelection: ({ includeHeaders, ctx }) => this._copySelectionToClipboard({ includeHeaders, ctx }),
          cutSelection: () => this._clipboardRenderer.cut(),
          pasteSelection: () => void this._clipboardRenderer.paste(),
          hasEditableCells: () => this._clipboardRenderer.hasEditableCells(),
        },
        {
          // Deferred: _pinnedRowsRenderer is constructed after the menu wiring; menu clicks run
          // long after both exist.
          setRowPinned: (rowId, position) => this._pinnedRowsRenderer.setRowPinned(rowId, position),
        },
      );
      this._bodyMenuOpener = new BodyMenuOpener({
        core: this.core,
        root: this.root,
        bodyMenuCoordinator,
        menuRenderer: this._menuRenderer,
      });
    }
    this._filterUpdateHandler = new FilterUpdateHandler({
      core: this.core,
      setFilterIndicators: () => this._headerRenderer.setFilterIndicators(),
      recomputeView: () => this._bodyViewportRenderer.recomputeView(),
      updateWindow: (forcePatch, scrollSrc) => this._bodyWindowRenderer.update(forcePatch, scrollSrc),
    });
    this._aggregateCalculator = new AggregateCalculator();
    this._aggregateModelController = new AggregateModelController({
      core: this.core,
      leafColumns: () => this._leafColumns,
      selectedColumnIDs: () => this.core.getSelectedColumnIds(),
      markAggregatesDirty: () => this._markAggregatesDirty(),
      requestServerAggregates: () => undefined,
      renderAggregateRow: () => this._renderAggregateRow(),
    });
    this._serverSideController = new ServerSideController({
      core: this.core,
      markAggregatesDirty: () => this._markAggregatesDirty(),
      renderAggregateRow: () => this._renderAggregateRow(),
    });
    this._bodyCellRenderer = new BodyCellRenderer(this.api);

    this._headerRenderer = new HeaderRenderer({
      core: this.core,
      root: this.root,
      api: this.api,
      rowHeight: () => this.rowHeight,
      getBody: () => this._bodyViewportRenderer.getRefs().body,
      getContainerEl: () => this._rootAttachmentRenderer.getContainerEl(),
      openColumnMenu: (colID, anchorEl) => this._columnMenuOpener.openColumnMenu("columnMenuButton", colID, { anchorEl }),
      openColumnFilter: (colID, anchorEl) => this._columnMenuOpener.openFilterMenu(colID, anchorEl),
    });
    const headerRefs = this._headerRenderer.getRefs();

    this._bodyViewportRenderer = new BodyViewportRenderer({
      core: this.core,
      root: this.root,
      rowHeight: () => this.rowHeight,
      onVerticalScrollbarVisibilityChanged: (visible) => {
        this._columnLayoutRenderer?.setVerticalScrollbarVisible(visible);
        this._pinnedRowsRenderer?.setBodyVerticalScrollbarVisible(visible);
      },
    });
    const bodyWrapper = this._bodyViewportRenderer.getRefs();
    this._pinnedRowsRenderer = new PinnedRowsRenderer({
      core: this.core,
      api: this.api,
      root: this.root,
      activeDescendant: this._activeDescendant,
      body: bodyWrapper.body,
      rowHeight: () => this.rowHeight,
      bodyCellRenderer: this._bodyCellRenderer,
      onHeightChanged: () => {
        this._bodyViewportRenderer.recomputeView();
        requestAnimationFrame(() => this._maybeUpdatePoolSize());
      },
      onBodyPartitionChanged: () => {
        this._bodyWindowRenderer?.update(true, undefined);
        this._selectionRenderer?.refreshSelectionStyles();
      },
      forwardWheel: (deltaX, deltaY) => {
        bodyWrapper.centerScroller.scrollTop += deltaY;
        if (deltaX) bodyWrapper.centerSpacer.scrollLeft += deltaX;
      },
    });
    const apiWithPinnedRows = this.api as unknown as {
      setPinnedRowsController?: (controller: {
        setPinnedTopRowData: (rows: any[]) => void;
        setPinnedBottomRowData: (rows: any[]) => void;
        setRowPinned: (rowId: string, position: "top" | "bottom" | null) => void;
      }) => void;
    };
    apiWithPinnedRows.setPinnedRowsController?.(this._pinnedRowsRenderer);
    // Expose scrolling on the public API (api.ensureRowVisible / ensureColumnVisible /
    // ensureCellVisible): the core resolves a row id to a view slot, the renderer owns the scrollers.
    // Probed structurally to avoid a renderer→api import cycle, matching the exporter hook above.
    const apiWithScroll = this.api as unknown as {
      setScrollController?: (c: {
        ensureRowVisible: (
          viewIdx: number,
          rowPinned?: "top" | "bottom",
          position?: RowScrollPosition,
        ) => void;
        ensureColumnVisible: (colIdx: number) => void;
      }) => void;
    };
    apiWithScroll.setScrollController?.({
      ensureRowVisible: (viewIdx, rowPinned, position) =>
        this.ensureRowVisible(viewIdx, rowPinned, position),
      ensureColumnVisible: (colIdx) => this.ensureColumnVisible(colIdx),
    });
    this._bodyRowHoverRenderer = new BodyRowHoverRenderer(this.root);
    this._bodyColumnHoverRenderer = new BodyColumnHoverRenderer(bodyWrapper.body);
    // Tooltips sit below the menu band (menus use 9999+) so a column/context menu covers a tooltip.
    this._tooltipFloating = new FloatingAnchor(this.root, 9800);
    this._tooltipOptions = this.core.options.tooltip;
    this._bodyTooltipRenderer = new BodyTooltipRenderer({
      core: this.core,
      api: this.api,
      root: this.root,
      body: bodyWrapper.body,
      headerWrapper: headerRefs.wrapper,
      floating: this._tooltipFloating,
      leafColumns: () => this._leafColumns,
      getColumnById: (id) => this.core.getColumnModel().resolve(id),
      options: () => resolveTooltipOptions(this._tooltipOptions),
    });
    // Expose programmatic tooltip control on the public API (api.showTooltip / hideTooltip). Probe
    // structurally to avoid a renderer→api import cycle, matching the exporter hook above.
    const apiWithTooltip = this.api as unknown as {
      setTooltipController?: (c: {
        showBodyTooltip: (viewIdx: number, colIdx: number) => void;
        hideTooltip: () => void;
      }) => void;
    };
    apiWithTooltip.setTooltipController?.({
      showBodyTooltip: (viewIdx, colIdx) => this._bodyTooltipRenderer.showBodyTooltip(viewIdx, colIdx),
      hideTooltip: () => this._bodyTooltipRenderer.hideTooltip(),
    });
    // ActionFrame popover sits above tooltips (9800) but below menus (9999+) so a menu/filter opened
    // from within the frame still layers on top, and a hover tooltip on the same cell stays under it.
    this._actionFrameFloating = new FloatingAnchor(this.root, 9850);
    this._actionFrameRenderer = new ActionFrameRenderer({
      core: this.core,
      api: this.api,
      body: bodyWrapper.body,
      root: this.root,
      floating: this._actionFrameFloating,
      leafColumns: () => this._leafColumns,
      getColumnById: (id) => this.core.getColumnModel().resolve(id),
      ensureCellVisible: (viewIdx, colIdx) => this._ensureCellVisible(viewIdx, colIdx),
    });
    this._aggregateRowRenderer = new AggregateRowRenderer(this.root, this.rowHeight, (e) => {
      e.stopPropagation();
      this._aggregateModelController.setAggregateScope("none");
    }, (column, activeType, anchorEl) => {
      this._columnMenuOpener.openAggregateMenu(column.instanceID, activeType, anchorEl);
    });
    const aggregateRefs = this._aggregateRowRenderer.getRefs();
    this._aggregateLeadingCells = [];
    this._aggregateLeftCells = [];
    this._aggregateCells = [];
    this._aggregateRightCells = [];
    this._aggregateVisible = false;
    this._aggregateRowBuilder = new AggregateRowBuilder({
      rowHeight: () => this.rowHeight,
      leafColumnLookup: () => this._leafColumnLookup,
      aggregateRowRenderer: this._aggregateRowRenderer,
      leadingLeafColumns: () => this._leadingLeafColumns,
      leftPinnedLeafColumns: () => this._leftPinnedLeafColumns,
      centerLeafColumns: () => this._centerLeafColumns,
      rightPinnedLeafColumns: () => this._rightPinnedLeafColumns,
      ariaIdPrefix: () => this.core.id,
    });

    this._horizontalScrollRenderer = new HorizontalScrollRenderer(this.root);
    const horizontalScroll = this._horizontalScrollRenderer.getRefs();

    this._bodyRowPoolRenderer = new BodyRowPoolRenderer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      leadingViewport: bodyWrapper.leadingViewport,
      leftViewport: bodyWrapper.leftViewport,
      centerViewport: bodyWrapper.centerViewport,
      rightViewport: bodyWrapper.rightViewport,
    });
    this._columnInteractionRenderer = new ColumnInteractionRenderer({
      core: this.core,
      root: this.root,
      rowHeight: () => this.rowHeight,
      maxDepth: () => this._maxDepth,
      headerWrapper: headerRefs.wrapper,
      leftHeader: headerRefs.left,
      centerHeader: headerRefs.center,
      rightHeader: headerRefs.right,
      leftScroller: bodyWrapper.leftScroller,
      centerScroller: bodyWrapper.centerScroller,
      rightScroller: bodyWrapper.rightScroller,
      leafColumnLookup: () => this._leafColumnLookup,
    });
    this._headerInteractionHandler = new HeaderInteractionHandler({
      core: this.core,
      root: this.root,
      selectedColumnIDs: () => this.core.getSelectedColumnIds(),
      toggleColumnSelection: (colID, mode) => this.core.dispatch({ type: "columnSelectSet", colId: colID, mode }),
      openColumnMenu: (trigger, colID, anchor) => this._columnMenuOpener.openColumnMenu(trigger, colID, anchor),
      openColumnFilter: (colID, anchorEl) => this._columnMenuOpener.openFilterMenu(colID, anchorEl),
    });
    this._interactionEventBinder = new GridInteractionEventBinder({
      root: this.root,
      headerWrapper: headerRefs.wrapper,
      body: bodyWrapper.body,
      pinnedRowContainers: this._pinnedRowsRenderer.getInteractionRoots(),
      onHeaderMouseDown: (e) => this._columnInteractionRenderer.onHeaderMouseDown(e),
      onHeaderContextMenu: (e) => this._headerInteractionHandler.onHeaderContextMenu(e),
      onHeaderDoubleClick: (e) => this._columnInteractionRenderer.onHeaderDoubleClick(e),
      onCellMouseDown: (e) => this._selectionRenderer.onCellMouseDown(e),
      onCellClick: (e) => this._selectionRenderer.onCellClick(e),
      onCellDoubleClick: (e) => this._selectionRenderer.onCellDoubleClick(e),
      onBodyContextMenu: (e) => this._bodyMenuOpener?.onBodyContextMenu(e),
      onColumnResizeMouseMove: (e) => this._columnInteractionRenderer.onColumnResizeMouseMove(e),
      onColumnDragMouseMove: (e) => this._columnInteractionRenderer.onColumnDragMouseMove(e),
      onCellMouseMove: (e) => this._selectionRenderer.onCellMouseMove(e),
      onColumnResizeMouseUp: () => this._columnInteractionRenderer.onColumnResizeMouseUp(),
      onColumnDragMouseUp: () => this._columnInteractionRenderer.onColumnDragMouseUp(),
      onCellMouseUp: () => this._selectionRenderer.onCellMouseUp(),
      shouldSuppressClick: () => this._columnInteractionRenderer.consumeSuppressClick(),
      onClick: (e) => this._headerInteractionHandler.onDocumentClick(e),
      onKeyDown: (e) => this._onKeyDown(e),
      onRootFocus: () => this._onRootFocus(),
    });
    this._columnLayoutRenderer = new ColumnLayoutRenderer({
      core: this.core,
      root: this.root,
      body: bodyWrapper.body,
      rowPool: () => this._rowPool,
      leadingViewport: bodyWrapper.leadingViewport,
      leftViewport: bodyWrapper.leftViewport,
      centerViewport: bodyWrapper.centerViewport,
      rightViewport: bodyWrapper.rightViewport,
      leadingScroller: bodyWrapper.leadingScroller,
      leftScroller: bodyWrapper.leftScroller,
      rightScroller: bodyWrapper.rightScroller,
      leadingHeader: headerRefs.leading,
      leftHeader: headerRefs.left,
      centerHeader: headerRefs.center,
      rightHeader: headerRefs.right,
      headerWrapper: headerRefs.wrapper,
      hScrollContainer: horizontalScroll.container,
      hScrollLeadingParent: horizontalScroll.leadingParent,
      hScrollLeftParent: horizontalScroll.leftParent,
      hScrollParent: horizontalScroll.centerParent,
      hScrollRightParent: horizontalScroll.rightParent,
      hScrollerLeft: horizontalScroll.leftScroller,
      hScroller: horizontalScroll.centerScroller,
      hScrollerRight: horizontalScroll.rightScroller,
      aggregateLeading: aggregateRefs.leading,
      aggregateLeadingCells: () => this._aggregateLeadingCells,
      aggregateLeft: aggregateRefs.left,
      aggregateLeftCells: () => this._aggregateLeftCells,
      aggregateCenterRow: () => this._aggregateRowRenderer.getCenterRow(),
      aggregateCenterCells: () => this._aggregateCells,
      aggregateRight: aggregateRefs.right,
      aggregateRightCells: () => this._aggregateRightCells,
      updateVerticalScrollLayout: () => this._bodyViewportRenderer.recomputeView(),
      updatePinnedRowsLayout: () => this._pinnedRowsRenderer.updateLayout(),
    });
    this._pinnedSectionLayoutRenderer = new PinnedSectionLayoutRenderer({
      root: this.root,
      leftHeader: headerRefs.left,
      rightHeader: headerRefs.right,
      hScrollLeftParent: horizontalScroll.leftParent,
      hScrollRightParent: horizontalScroll.rightParent,
      leftScroller: bodyWrapper.leftScroller,
      rightScroller: bodyWrapper.rightScroller,
      aggregateLeft: aggregateRefs.left,
      aggregateRight: aggregateRefs.right,
      onResize: () => {
        this._bodyViewportRenderer.recomputeView();
        this._pinnedRowsRenderer.updateLayout();
      },
    });
    this._scrollSyncRenderer = new GridScrollSyncRenderer({
      leadingScroller: bodyWrapper.leadingScroller,
      leftScroller: bodyWrapper.leftScroller,
      centerScroller: bodyWrapper.centerScroller,
      rightScroller: bodyWrapper.rightScroller,
      vScroll: bodyWrapper.vScroll,
      leadingSpacer: bodyWrapper.leadingSpacer,
      leftSpacer: bodyWrapper.leftSpacer,
      centerSpacer: bodyWrapper.centerSpacer,
      rightSpacer: bodyWrapper.rightSpacer,
      hScrollLeft: horizontalScroll.leftSpacer,
      hScrollCenter: horizontalScroll.centerSpacer,
      hScrollRight: horizontalScroll.rightSpacer,
      leftHeader: headerRefs.left,
      centerHeader: headerRefs.center,
      rightHeader: headerRefs.right,
      aggregateLeft: aggregateRefs.left,
      aggregateCenter: aggregateRefs.center,
      aggregateRight: aggregateRefs.right,
      onHorizontalSync: (left, center, right) => {
        this._pinnedRowsRenderer.syncHorizontal(left, center, right);
      },
      onWindowUpdate: (scrollSrc) => {
        this._bodyWindowRenderer.update(false, scrollSrc);
        this._pinnedRowsRenderer.render(scrollSrc.scrollTop);
        this._pinnedRowsRenderer.syncHorizontal(
          bodyWrapper.leftSpacer.scrollLeft,
          bodyWrapper.centerSpacer.scrollLeft,
          bodyWrapper.rightSpacer.scrollLeft,
        );
        // Keep a persistent ActionFrame pinned to its (possibly recycled) cell across scroll.
        this._actionFrameRenderer.onWindowUpdate();
      },
    });
    this._bodyWindowRenderer = new BodyWindowRenderer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      rowPool: () => this._rowPool,
      leadingScroller: bodyWrapper.leadingScroller,
      leftScroller: bodyWrapper.leftScroller,
      centerScroller: bodyWrapper.centerScroller,
      rightScroller: bodyWrapper.rightScroller,
      vScroll: bodyWrapper.vScroll,
      leadingViewport: bodyWrapper.leadingViewport,
      leftViewport: bodyWrapper.leftViewport,
      centerViewport: bodyWrapper.centerViewport,
      rightViewport: bodyWrapper.rightViewport,
      serverSidePendingRangeKeys: this._serverSidePendingRangeKeys,
      beginScrollSync: (targets) => this._scrollSyncRenderer.beginScrollSync(targets),
      setStartIndex: (startIndex) => {
        this._startIndex = startIndex;
      },
      renderCell: (cell, row, col, cellRendererMap, viewIndex, rowNumber) => this._bodyCellRenderer.renderCell(cell, row, col, cellRendererMap, viewIndex, rowNumber),
      renderFullWidthCell: (slot, row, viewIndex, rowNumber) => this._bodyCellRenderer.renderFullWidthCell(slot.fullWidthCellEl, row, slot.cellRendererInstances, viewIndex, rowNumber),
      clearFullWidthCell: (slot) => this._bodyCellRenderer.clearFullWidthCell(slot.fullWidthCellEl, slot.cellRendererInstances),
      applySelectionToSlot: (slot, viewIndex) => this._selectionRenderer.applySelectionToSlot(slot, viewIndex),
    });

    this._paginationRenderer = new PaginationRenderer({
      core: this.core,
      root: this.root,
      resetScrollPosition: () => this._bodyViewportRenderer.resetScrollPosition(),
      setAggregateScope: (scope) => this._aggregateModelController.setAggregateScope(scope),
    });
    this._bodyPoolSizer = new BodyPoolSizer({
      core: this.core,
      rowHeight: () => this.rowHeight,
      height: () => this.height,
      getContainerEl: () => this._rootAttachmentRenderer.getContainerEl(),
      body: bodyWrapper.body,
      headerWrapper: headerRefs.wrapper,
      hScrollContainer: horizontalScroll.container,
      paginator: this._paginationRenderer.getElement(),
      getAggregateRowHeight: () => this._getAggregateRowHeight(),
    });
    // this.buildPaginationControls();

    this._leafColumns = [];
    this._leafColumnLookup = new Map();
    this._leftLeafOrder = [];
    this._centerLeafOrder = [];
    this._rightLeafOrder = [];

    // Overlays
    this._filterOverlayRenderer = new FilterOverlayRenderer();
    this._filterOverlayRenderer.bind();
    // The filter overlay portals to document.body, outside the root subtree, so it
    // must receive theme variables directly.
    this._themeRenderer.registerTarget(this._filterOverlayRenderer.overlay);
    this._loadingOverlayRenderer = new LoadingOverlayRenderer(this.root, this.core.options.loadingMessage);
    this._noRowsOverlayRenderer = new NoRowsOverlayRenderer(this.root);

    this._toolbarOptions = this.core.getOptions().toolbar;
    this._toolbarRenderer = new GridToolbarRenderer({
      core: this.core,
      api: this.api,
      root: this.root,
      menuRenderer: this._menuRenderer,
      options: this.core.getOptions().toolbar,
      savedViews: this.core.getOptions().savedViews,
      exportCSV: options => this._exportRenderer.exportCSV(options),
      exportExcel: options => this._exportRenderer.exportExcel(options),
    });
    // This zero-height host participates in the root's column flow immediately after the header.
    // Its absolutely-positioned child can overlay the rows below the header without measuring
    // detached DOM or being clipped by the header.
    this._quickFilterFloatingHost = div("pte-quick-filter-floating-host");
    headerRefs.wrapper.insertAdjacentElement("afterend", this._quickFilterFloatingHost);
    // Quick filter (global search). Only mounted when enabled and the model is client-side. The
    // toolbar is constructed first because it may provide the widget's alternative host.
    this._quickFilterOptions = this.core.getOptions().quickFilter;
    this._buildQuickFilterWidget();
    this._columnPanelRenderer = new ColumnPanelRenderer({
      core: this.core,
      root: this.root,
      options: this.core.getOptions().columnPanel,
      onLayoutChange: () => {
        // Opening changes the flex content width. Re-apply the current column boxes and viewport
        // window after the browser has resolved that docked width.
        requestAnimationFrame(() => {
          this._maybeUpdatePoolSize();
          this._columnLayoutRenderer?.updateColumnWidths();
          this._bodyWindowRenderer?.update(true, undefined);
        });
      },
      toolbar: this._toolbarRenderer,
    });
    menuCoordinator.setColumnPanelTarget({
      openColumnPanel: () => this._columnPanelRenderer.openPanel(),
    });

    // Create a pooled set of row nodes
    // this._poolSize = this._bodyPoolSizer.computePoolSize(...);
    this._rowPool = []; // [{ rowEl, cellEls[], rowIndexEl? }]
    // this._buildHeaderDOM();
    // this._buildRowPool();

    // Events
    this._pinnedSectionLayoutRenderer.bind();
    this._scrollSyncRenderer.bind();
    this._interactionEventBinder.bind();
    if (this.core.options.rowHover) this._bodyRowHoverRenderer.bind();
    if (this.core.options.columnHover) this._bodyColumnHoverRenderer.bind();
    if (resolveTooltipOptions(this._tooltipOptions).enabled) this._bodyTooltipRenderer.bind();
    this._actionFrameRenderer.bind();

    // initial
    // requestAnimationFrame(() => this._maybeUpdatePoolSize());
    // this._bodyViewportRenderer.recomputeView();
    // this._columnLayoutRenderer.updateColumnWidths();
    // this._bodyWindowRenderer.update(true, undefined);
    // if (this.rowModel.getType() === "serverSide" && this.rowModel.isValid()) {
    //   this._filterUpdateHandler.fetchServerSideRows("init");
    // }
    this._coreEventBinder.bind();
  }

  attach(container: RefObject<HTMLElement | null>) {
    this._rootAttachmentRenderer.attach(container);
    this._injectStyles();
  }

  /**
   * Deliver the base stylesheet to whichever root this grid ended up in. Runs
   * after attach so `getRootNode()` can see the real context — a shadow tree
   * needs its own copy, since document styles do not cross the boundary.
   */
  private _injectStyles() {
    const options = this.core.getOptions();
    if (options.suppressStyleInjection) return;
    const target = resolveStyleTarget(this.root);
    if (!target) return;
    injectGridStyles(target, { nonce: options.styleNonce });
  }

  detach() {
    this._rootAttachmentRenderer.detach();
  }

  _maybeUpdatePoolSize(params?: GridEventViewportChangedParams) {
    const rowHeightPx = params?.rowHeightPx ?? this.core.getOptions().rowHeight ?? this.rowHeight;
    const overscanRowCount = params?.overscanRowCount ?? this.core.getOptions().overscanRowCount ?? 0;
    this.rowHeight = rowHeightPx;
    const poolSize = this._bodyPoolSizer.computePoolSize(rowHeightPx, overscanRowCount);
    if (poolSize === this._poolSize) return;
    this._poolSize = poolSize;
    this._rebuildRowPool();
    this._columnLayoutRenderer.updateColumnWidths();
    this._bodyWindowRenderer.update(true, undefined);
    this.buildPaginationControls();
  }

  // ---------------- Public API ----------------
  togglePagination(pagination: boolean) {
    this._paginationRenderer.togglePagination(pagination);
  }

  // Build (or skip building) the quick-filter widget from the currently-stored options. A prior
  // widget, if any, must be destroyed by the caller first. `restore` carries live search state
  // across a rebuild. The widget is only mounted when enabled and the row model is client-side.
  private _buildQuickFilterWidget(restore?: QuickFilterRestoreState, restoreFocus = false): void {
    const inToolbar = resolveGridToolbarOptions(this._toolbarOptions).quickFilter;
    const widget = new QuickFilterWidget({
      core: this.core,
      focusGrid: () => this.root.focus(),
      root: inToolbar ? this._toolbarRenderer.getQuickFilterHost() : this._quickFilterFloatingHost,
      options: inToolbar && !this._quickFilterOptions ? true : this._quickFilterOptions,
      presentation: inToolbar ? "toolbar" : "floating",
      restore,
    });
    if (widget.isEnabled() && this.core.getRowModel().getType() !== "serverSide") {
      this._quickFilterWidget = widget;
      // A rebuild can happen before a pending debounce fires. Preserve the visible value as the
      // authoritative state instead of silently reverting the rows to the last committed query.
      if (restore && this.core.getQuickFilterText() !== restore.text) {
        this.core.dispatch({
          type: "quickFilterSet",
          text: restore.text,
          matchMode: restore.matchMode,
          caseSensitive: restore.caseSensitive,
        });
      }
      if (restoreFocus) widget.restoreFocus();
    } else {
      widget.destroy();
      this._quickFilterWidget = undefined;
      // No widget means no way to see or clear a filter — so a config that disables the quick filter
      // must not leave rows silently hidden by a previously-active search.
      if (this.core.getQuickFilterText() !== "") {
        this.core.dispatch({ type: "quickFilterSet", text: "" });
      }
      if (restoreFocus) this.root.focus();
    }
  }

  // Reconfigure the quick filter at runtime without remounting the grid. Because the widget builds
  // its DOM (popover, layout rows, indicator pill) and resolves its options once at construction,
  // a config change is applied by tearing the widget down and rebuilding it in place — carrying the
  // live search state over so an active filter isn't disturbed. This also handles the
  // enabled↔disabled and (via the build guard) client-side↔serverSide transitions.
  /** Reconfigure tooltips live (mode, interactivity, delays, enable/disable) without remounting.
   * Any visible tooltip is dismissed so the next hover picks up the new config. */
  setTooltipOptions(options: boolean | TooltipOptions | undefined) {
    this._tooltipOptions = options;
    // Keep the mirrored value on core.options in sync so anything reading it there agrees.
    (this.core.options as { tooltip: boolean | TooltipOptions | undefined }).tooltip = options;
    this._bodyTooltipRenderer.hideNow();
    if (resolveTooltipOptions(options).enabled) {
      this._bodyTooltipRenderer.bind();
    } else {
      this._bodyTooltipRenderer.unbind();
    }
  }

  setQuickFilterOptions(options: boolean | QuickFilterOptions | undefined) {
    this._quickFilterOptions = options;
    const restoreFocus = this._captureQuickFilterFocusIntent();
    const restore = this._quickFilterWidget?.captureState();
    this._quickFilterWidget?.destroy();
    this._quickFilterWidget = undefined;
    this._buildQuickFilterWidget(restore, restoreFocus);
  }

  setColumnPanelOptions(options: boolean | ColumnPanelOptions | undefined) {
    (this.core.options as { columnPanel: boolean | ColumnPanelOptions | undefined }).columnPanel = options;
    this._columnPanelRenderer.setOptions(options);
  }

  setToolbarOptions(options: GridToolbarOptions | undefined) {
    const wasInToolbar = resolveGridToolbarOptions(this._toolbarOptions).quickFilter;
    const willBeInToolbar = resolveGridToolbarOptions(options).quickFilter;
    const restore = wasInToolbar !== willBeInToolbar
      ? this._quickFilterWidget?.captureState()
      : undefined;
    const restoreFocus = wasInToolbar !== willBeInToolbar
      && this._captureQuickFilterFocusIntent();
    if (wasInToolbar !== willBeInToolbar) {
      this._quickFilterWidget?.destroy();
      this._quickFilterWidget = undefined;
    }
    this._toolbarOptions = options;
    (this.core.options as { toolbar: GridToolbarOptions }).toolbar = options ?? {};
    this._toolbarRenderer.setOptions(options);
    if (wasInToolbar !== willBeInToolbar) this._buildQuickFilterWidget(restore, restoreFocus);
  }

  private _captureQuickFilterFocusIntent(): boolean {
    const restoreFocus =
      this._quickFilterFocusRestorePending || (this._quickFilterWidget?.containsFocus() ?? false);
    if (restoreFocus && !this._quickFilterFocusRestorePending) {
      this._quickFilterFocusRestorePending = true;
      queueMicrotask(() => {
        this._quickFilterFocusRestorePending = false;
      });
    }
    return restoreFocus;
  }

  setSavedViewsOptions(options: SavedViewsOptions | undefined) {
    (this.core.options as { savedViews: SavedViewsOptions | undefined }).savedViews = options;
    this._toolbarRenderer.setSavedViewsOptions(options);
  }

  setPinnedRowOptions(options: {
    pinnedTopRowData?: any[];
    pinnedBottomRowData?: any[];
    isRowPinned?: import("../interfaces/gridOptions").GridOptions["isRowPinned"];
    groupRowsSticky?: boolean;
  }) {
    this._pinnedRowsRenderer.setOptions(options);
  }

  /** Reconfigure row selection and its utility column while retaining this renderer/core/API. */
  setRowSelectionOptions(options: import("../interfaces/gridOptions").GridOptions["rowSelection"]) {
    this.core.setRowSelectionOptions(options);
    this._refreshAriaCounts();
  }

  /** Apply the non-structural grid options that the React wrapper supports declaratively at runtime. */
  setRuntimeOptions(options: RuntimeGridOptions) {
    const previous = { ...this.core.options };
    this.core.setRuntimeOptions(options);

    if (previous.rowHover !== options.rowHover) {
      if (options.rowHover) this._bodyRowHoverRenderer.bind();
      else this._bodyRowHoverRenderer.destroy();
    }
    if (previous.columnHover !== options.columnHover) {
      if (options.columnHover) this._bodyColumnHoverRenderer.bind();
      else this._bodyColumnHoverRenderer.destroy();
    }

    this.root.classList.toggle("pte-text-selection", options.cellSelection === "text");
    this.root.classList.toggle("pte-column-buttons-on-hover", options.showColumnButtonsOnHover);

    if (previous.ariaLabel !== options.ariaLabel || previous.ariaLabelledBy !== options.ariaLabelledBy) {
      this._applyGridLabel();
    }
    // Column selection is one of the routes that makes the grid multi-selectable.
    if (previous.columnSelection !== options.columnSelection
      || previous.cellSelection !== options.cellSelection
      || previous.rangeSelection !== options.rangeSelection) {
      this._refreshAriaCounts();
    }

    const rowPaintChanged =
      previous.zebraRows !== options.zebraRows
      || previous.getRowClass !== options.getRowClass
      || previous.getRowStyle !== options.getRowStyle;
    if (rowPaintChanged) this._bodyWindowRenderer.update(true, undefined);

    if (previous.highlightActiveCell !== options.highlightActiveCell) {
      this._selectionRenderer.refreshSelectionStyles();
    }
    if (previous.bodyContextMenu !== options.bodyContextMenu && options.bodyContextMenu === false) {
      this._menuRenderer.close(0);
    }
  }

  // Grid-level keydown. The listener is bound to the grid root (see GridInteractionEventBinder), so
  // this only fires when focus is inside the grid — the same rule that lets selection preempt Ctrl+A.
  // Ctrl/Cmd+F is claimed here (preventing the browser's native find) to summon the quick filter,
  // then everything else falls through to selection/keyboard navigation.
  _onKeyDown(e: KeyboardEvent) {
    if (this._quickFilterWidget && (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      this._quickFilterWidget.show();
      return;
    }
    // The header cursor gets the keys first, and only while it holds the cursor. Routing by position
    // rather than by key keeps the body's meanings intact: the body handler treats Enter as "edit this
    // cell" and any printable character as type-to-edit, neither of which should happen on a header.
    //
    // Gated on the event originating at the root itself, where this cursor lives: DOM focus never leaves
    // the root in the activedescendant model, so a keydown from anywhere else came from a real control
    // inside the grid (a pagination button, the quick filter, a cell editor) and belongs to it.
    if (e.target === this.root && this._headerInteractionHandler.onKeyDown(e)) {
      e.preventDefault();
      return;
    }
    this._selectionRenderer.onKeyDown(e);
  }

  setLoading(isLoading: boolean) {
    const next = isTrue(isLoading);
    if (this._loadingOverlayRenderer.getLoading() === next) return;
    this._loadingOverlayRenderer.setLoading(next);
    // aria-busy tells AT the grid's content is in flux, so it can hold off describing rows that are
    // about to be replaced. Set on the root — the element carrying role="grid".
    if (next) this.root.setAttribute("aria-busy", "true");
    else this.root.removeAttribute("aria-busy");
    this._announcer.loadingChanged(next, this.core.getRowModel().getViewCount());
  }

  /**
   * Paint the header cursor and name it for AT. The tracker takes any element with an id and header
   * cells are keyed on the column's instanceID, so a columnheader can be the activedescendant exactly
   * as a gridcell can (verified in Chrome). `this` owns the claim rather than a pool slot: the header
   * has no recycling, so nothing else repaints over it.
   */
  private _onHeaderFocusChanged(colIdx: number | null) {
    const el = this._headerRenderer.setActiveHeader(colIdx);
    if (el) this._activeDescendant.claim(el, this);
    else this._activeDescendant.release(this);
    if (colIdx != null) this.ensureColumnVisible(colIdx);
  }

  /**
   * Where the keyboard cursor lands when focus enters the grid: back where it was, or the first column
   * header on a first visit. The surrounding chrome — toolbar, paginator, quick filter — is all
   * tab-reachable, so leaving and returning is routine and losing your place each time would be tiring.
   */
  private _onRootFocus() {
    if (this.core.getActiveCell() || this.core.getHeaderFocusColIdx() != null) return;
    if (this.core.getColumnModel().getLeaves().length === 0) return;
    this.core.setHeaderFocus(0, "keyboard");
  }

  /** Announce the sort model in reading order (primary first). */
  private _announceSort() {
    this._announcer.sortChanged(
      this.core.getSortModel().items.map(item => ({ label: item.col.label, dir: item.dir })),
    );
  }

  /**
   * Announce the size of the selection. Row and column selection are counted directly; a cell
   * range is reported by its dimensions, and a single-cell range says nothing at all because
   * aria-activedescendant already moves AT onto that cell.
   */
  private _announceSelection() {
    const range = this.core.getSelectionRange();
    this._announcer.selectionChanged({
      rows: this.core.getSelectedRowIds().size,
      columns: this.core.getSelectedColumnIds().size,
      range: range
        ? {
          rows: Math.abs(range.rowEnd - range.rowStart) + 1,
          columns: Math.abs(range.colEnd - range.colStart) + 1,
        }
        : null,
    });
  }

  setEmpty(isEmpty: boolean) {
    if (this._noRowsOverlayRenderer.getEmpty() === isEmpty) return;
    if (isEmpty) {
      // Tailor the message: an active search/filter reads differently from a genuinely empty dataset.
      const quick = this.core.getQuickFilterText().trim();
      const hasColumnFilter = this.core.getFilterModel().items.length > 0;
      if (quick !== "") {
        this._noRowsOverlayRenderer.setMessage(`No rows match "${quick}"`);
      } else if (hasColumnFilter) {
        this._noRowsOverlayRenderer.setMessage("No rows match the current filters");
      } else {
        this._noRowsOverlayRenderer.setMessage(this.core.options.noRowsMessage);
      }
    }
    this._noRowsOverlayRenderer.setEmpty(isEmpty);
  }

  setIcons(icons?: GridIconMap) {
    this._iconRenderer.setIcons(icons);
  }

  /** Apply only the theme's CSS variables (not its icons). Use when the caller
   * reconciles icons separately (e.g. the React wrapper merging live props). */
  setThemeVars(theme?: GridTheme) {
    this._themeRenderer.setTheme(theme);
  }

  /** Apply a theme's CSS variables and its icon overrides. Icons explicitly set via
   * `options.icons` take precedence over icons carried by the theme. */
  setTheme(theme?: GridTheme) {
    this.setThemeVars(theme);
    const icons = { ...theme?.getIcons(), ...this.core.getOptions().icons };
    if (Object.keys(icons).length > 0) this.setIcons(icons);
  }

  setServerSideDataSource(dataSource?: IServerSideDataSource) {
    this._serverSideController.setDataSource(dataSource);
  }

  setServerSideAggregation(aggregation?: ServerSideAggregationSource) {
    this._serverSideController.setAggregation(aggregation);
  }

  refreshServerSideData(options?: ServerSideRefreshOptions): Promise<boolean> {
    return this._serverSideController.refreshData(options);
  }

  exportCSV(options: ExportOptions = {}) {
    this._exportRenderer.exportCSV(options);
  }

  exportExcel(options: ExportOptions = {}) {
    this._exportRenderer.exportExcel(options);
  }

  destroy() {
    if (this._keyboardNavigationAnnouncementTimer) {
      clearTimeout(this._keyboardNavigationAnnouncementTimer);
      this._keyboardNavigationAnnouncementTimer = undefined;
    }
    this._announcer.destroy();
    this._coreEventBinder.destroy();
    this._cellEditRenderer.destroy();
    this._menuRenderer.close(0);
    this._filterOverlayRenderer.destroy();
    this._quickFilterWidget?.destroy();
    this._quickFilterFloatingHost.remove();
    this._columnPanelRenderer.destroy();
    this._toolbarRenderer.destroy();
    this._interactionEventBinder.destroy();
    this._bodyRowHoverRenderer.destroy();
    this._bodyColumnHoverRenderer.destroy();
    this._bodyTooltipRenderer.destroy();
    this._actionFrameRenderer.destroy();
    this._headerRenderer.destroy();
    this._destroyRowPool();
    this._pinnedRowsRenderer.destroy();
    this._pinnedSectionLayoutRenderer.destroy();
    this._rootAttachmentRenderer.destroy();
  }

  _aggregate(colID: string, aggType?: AggregateType) {
    this._aggregateModelController.aggregate(colID, aggType);
  }

  _aggregateSelectedColumns(aggType: AggregateType) {
    this._aggregateModelController.aggregateSelectedColumns(aggType);
  }

  _clearAggregates() {
    this._aggregateModelController.clearAggregates();
  }

  _markAggregatesDirty() {
    return;
  }

  _onAggregateChanged(params: GridEventAggregateChangedParams) {
    this._updatePaginationControls();
    this._paginationRenderer.updateAggregateControls(params);
    this._ensureAggregateRowBuilt();
    this._renderAggregateRow();
  }

  _renderAggregateRow() {
    this._syncLeafColumns();
    this._aggregateModelController.pruneAggregates();
    const aggregateMap = this._aggregateModelController.getAggregateMap();
    const aggregateScope = this.core.getAggregateScope();
    const shouldShow = aggregateScope !== "none" && aggregateMap.size > 0;
    const wasVisible = this._aggregateVisible;
    this._aggregateVisible = shouldShow;

    this._aggregateRowRenderer.setVisible(shouldShow);

    if (!shouldShow) {
      if (wasVisible !== shouldShow) {
        this._columnLayoutRenderer.updateColumnWidths();
        this._maybeUpdatePoolSize();
      }
      return;
    }

    const values = new Map<string, string>();
    const rawValues = this.rowModel.getAggregateValues();
    for (const col of this._leafColumns) {
      if (col.hidden) continue;
      const raw = rawValues.get(col.instanceID);
      const display = raw == null ? "" : this._aggregateCalculator.formatAggregateDisplay(col, raw);
      values.set(col.instanceID, display ?? "");
    }

    this._aggregateRowRenderer.renderCells(this._aggregateLeadingCells, this._leadingLeafColumns, aggregateMap, values);
    this._aggregateRowRenderer.renderCells(this._aggregateLeftCells, this._leftPinnedLeafColumns, aggregateMap, values);
    this._aggregateRowRenderer.renderCells(this._aggregateCells, this._centerLeafColumns, aggregateMap, values);
    this._aggregateRowRenderer.renderCells(this._aggregateRightCells, this._rightPinnedLeafColumns, aggregateMap, values);

    if (wasVisible !== shouldShow) {
      this._columnLayoutRenderer.updateColumnWidths();
      this._maybeUpdatePoolSize();
    }
  }

  _getAggregateRowHeight(): number {
    return this._aggregateVisible ? this.rowHeight : 0;
  }

  // ---------------- Internals: DOM build ----------------
  _buildHeaderDOM(reason: string) {
    this._syncLeafColumns();
    this._headerRenderer.buildDOM(reason);
    this.core.pruneColumnSelection();
    this._selectionRenderer.applyColumnSelectionStyles();
    this._pinnedRowsRenderer?.render(undefined, true);
    // The rebuild replaced every header cell, so the keyboard cursor's painted class and the
    // activedescendant id both point at detached elements.
    const el = this._headerRenderer.restoreActiveHeader();
    if (el) this._activeDescendant.claim(el, this);
    else this._activeDescendant.release(this);
  }

  private buildPaginationControls() {
    this._paginationRenderer.buildControls();
  }

  _updatePaginationControls(params?: GridEventPaginationChangedParams) {
    this._paginationRenderer.updateControls(params);
  }

  _buildAggregateRow() {
    this._syncLeafColumns();
    const result = this._aggregateRowBuilder.build();
    this._aggregateLeadingCells = result.leadingCells;
    this._aggregateLeftCells = result.leftCells;
    this._aggregateCells = result.centerCells;
    this._aggregateRightCells = result.rightCells;
    this._columnLayoutRenderer.updateColumnWidths();
    this._pinnedRowsRenderer.updateLayout();
    this._renderAggregateRow();
  }

  private _ensureAggregateRowBuilt() {
    this._syncLeafColumns();
    if (
      this._aggregateLeadingCells.length > 0
      || this._aggregateLeftCells.length > 0
      || this._aggregateCells.length > 0
      || this._aggregateRightCells.length > 0
      || this._leafColumns.length === 0
    ) {
      return;
    }
    this._buildAggregateRow();
  }

  private _syncLeafColumns() {
    const columnModel = this.core.getColumnModel();
    this._leafColumns = columnModel.getLeaves();
    this._leafColumnLookup = columnModel.leafColumnLookup;
    this._leadingLeafColumns = columnModel.getLeadingLeaves();
    this._leftPinnedLeafColumns = columnModel.getLeftLeaves();
    this._centerLeafColumns = columnModel.getCenterLeaves();
    this._rightPinnedLeafColumns = columnModel.getRightLeaves();
  }

  // Re-render a single cell's content in place from the current row data. Used to reflect a
  // committed edit and to restore a cell when its editor is torn down.
  _repaintCell(rowId: string, colId: string) {
    const viewIdx = this.core.getViewIndexForRowId(rowId);
    // Accept either id space (payloads carry the public colId; internal callers pass instance ids).
    const col = this.core.getColumnModel().resolve(colId);
    const lookup = col ? this._leafColumnLookup.get(col.instanceID) : undefined;
    // Pinned band rows (application data rows) have no body view index — rebuild the bands so the
    // edited/restored cell content re-renders there.
    if (viewIdx == null && this.core.getDisplayedPinnedRowRef(rowId)) {
      this._pinnedRowsRenderer?.render(undefined, true);
      return;
    }
    if (viewIdx == null || !lookup) return;
    const slot = this._rowPool[viewIdx - this._startIndex];
    if (!slot) return;
    const row = this.core.getRowModel().getRowNode(rowId);
    if (!col || !row) return;
    const cells = lookup.section === "left" ? slot.leftCellEls
      : lookup.section === "right" ? slot.rightCellEls
        : slot.cellEls;
    const cell = cells?.[lookup.localIndex];
    if (!cell) return;
    this._bodyCellRenderer.renderCell(cell, row, col, slot.cellRendererInstances, viewIdx);
  }

  _onCellsChanged(params: GridEventCellsChangedParams) {
    // A single-cell repaint can't re-resolve colSpan geometry (span width + covered-cell hiding
    // depend on the row's values and neighbours). When any column spans, repaint the whole window
    // once so patchCells recomputes spans for the changed rows.
    if (this.core.getColumnModel().getLeaves().some((col) => col.colSpan != null)) {
      this._bodyWindowRenderer.update(true, undefined);
      if (params.rowIds.some(rowId => this.core.getDisplayedPinnedRowRef(rowId))) {
        this._pinnedRowsRenderer?.render(undefined, true);
      }
      return;
    }
    for (const rowId of params.rowIds) {
      for (const colId of params.colInstanceIds) {
        this._repaintCell(rowId, colId);
      }
    }
  }

  // Re-invoke the cell renderer for every visible cell of the given columns, telling each renderer
  // *why* (e.g. "resize") so it can decide whether it needs to redraw. The grid is renderer-agnostic
  // — it can't know a resize is a no-op for plain text but matters to a pixel-drawing renderer like
  // the sparkline — so it just reports the reason and lets the renderer opt in.
  //
  // An empty `changedColIds` means "all columns" (matching the columnWidthsChanged convention), so
  // fall back to re-rendering every visible cell in that case.
  _refreshCellsForColumns(changedColIds: string[], reason: CellRefreshReason) {
    const changed = changedColIds.length > 0 ? new Set(changedColIds) : null;
    const columnModel = this.core.getColumnModel();
    const rowModel = this.core.getRowModel();

    // colSpan geometry is resolved per-row in patchCells and depends on column widths and cell
    // values — a targeted single-cell repaint can't recompute it. When any column spans, fall back
    // to a full window repaint so widths and covered-cell visibility stay consistent.
    if (columnModel.getLeaves().some((col) => col.colSpan != null)) {
      this._bodyWindowRenderer.update(true, undefined);
      return;
    }
    const sections: { leaves: Column[]; cells: (slot: RowPoolDef) => HTMLDivElement[] | undefined }[] = [
      { leaves: columnModel.getLeadingLeaves(), cells: (s) => s.leadingCellEls },
      { leaves: columnModel.getLeftLeaves(), cells: (s) => s.leftCellEls },
      { leaves: columnModel.getCenterLeaves(), cells: (s) => s.cellEls },
      { leaves: columnModel.getRightLeaves(), cells: (s) => s.rightCellEls },
    ];

    for (let i = 0; i < this._rowPool.length; i++) {
      const viewIdx = this._startIndex + i;
      const slot = this._rowPool[i];
      const row = rowModel.getRowNodeAtViewIndex(viewIdx);
      if (!row) continue;
      const rowNumber = this.core.getRowNumberForViewIndex(viewIdx);

      for (const section of sections) {
        const cells = section.cells(slot);
        if (!cells) continue;
        // Cell arrays only hold non-hidden leaves, in order — mirror that alignment.
        let c = 0;
        for (const col of section.leaves) {
          if (col.hidden) continue;
          const cell = cells[c++];
          if (!cell) continue;
          if (changed && !changed.has(col.instanceID)) continue;
          this._bodyCellRenderer.renderCell(cell, row, col, slot.cellRendererInstances, viewIdx, rowNumber, reason);
        }
      }

      // The row's data may have changed (e.g. a transaction update), so re-run row-level styling.
      this._bodyWindowRenderer.refreshRowStyling(slot, row, viewIdx);
    }
  }

  _ensureCellVisible(
    viewIdx: number,
    colIdx: number,
    rowPinned?: "top" | "bottom",
  ) {
    this.ensureRowVisible(viewIdx, rowPinned);
    this.ensureColumnVisible(colIdx);
  }

  /**
   * Scroll a row into view vertically. Split out of `_ensureCellVisible` for `api.ensureRowVisible`,
   * which has no column to move to. `position` is where the row should end up: "auto" scrolls the
   * minimum needed and leaves an already-visible row alone, the others place it deliberately even
   * when it is on screen already (a "jump to row" flow wants the row where the eye is).
   */
  ensureRowVisible(
    viewIdx: number,
    rowPinned?: "top" | "bottom",
    position: RowScrollPosition = "auto",
  ) {
    if (rowPinned) {
      this._pinnedRowsRenderer.ensureCellVisible(rowPinned, viewIdx);
      return;
    }

    const refs = this._bodyViewportRenderer.getRefs();
    // Body positions are compacted for application-pinned model rows, and the effective viewport top
    // is inset by the sticky ancestor chain that will dock above the row — otherwise the row would
    // technically be in view but sitting hidden underneath the overlay.
    const rowTop = (viewIdx - this.core.getBodyPinnedRowCountBefore(viewIdx)) * this.rowHeight;
    const clearance = this._pinnedRowsRenderer.stickyClearance(viewIdx);
    const viewH = refs.body.clientHeight;
    const st = refs.centerScroller.scrollTop;

    if (position === "auto") {
      if (rowTop - clearance < st) {
        refs.centerScroller.scrollTop = Math.max(0, rowTop - clearance);
      } else if (rowTop + this.rowHeight > st + viewH) {
        refs.centerScroller.scrollTop = rowTop + this.rowHeight - viewH;
      }
      return;
    }

    const desired = position === "top"
      ? rowTop
      : position === "bottom"
        ? rowTop + this.rowHeight - viewH
        : rowTop - (viewH - this.rowHeight) / 2;
    // `rowTop - clearance` is the largest scrollTop that still keeps the row clear of the sticky
    // overlay, so it caps every placement — in a viewport too short to honor the request, docking
    // just below the overlay beats sliding the row underneath it. The browser clamps the far end.
    refs.centerScroller.scrollTop = Math.max(0, Math.min(rowTop - clearance, desired));
  }

  /**
   * Scroll a column into view horizontally. Split out of `_ensureCellVisible` for the header cursor,
   * which moves along a row with no vertical dimension. Only center-section columns scroll; leading and
   * pinned columns are always visible.
   */
  ensureColumnVisible(colIdx: number) {
    const col = this._leafColumns[colIdx];
    if (!col) return;
    const meta = this._leafColumnLookup.get(col.instanceID);
    if (!meta || meta.section !== "center" || col.centralPosition == null) return;

    const refs = this._bodyViewportRenderer.getRefs();
    const centerLeaves = this.core.getColumnModel().getCenterLeaves();
    let colLeft = 0;
    for (let i = 0; i < col.centralPosition; i++) {
      colLeft += centerLeaves[i].computedWidth;
    }
    const colWidth = col.computedWidth;
    const viewW = refs.centerSpacer.clientWidth;
    const sl = refs.centerSpacer.scrollLeft;
    if (colLeft < sl) {
      refs.centerSpacer.scrollLeft = colLeft;
    } else if (colLeft + colWidth > sl + viewW) {
      refs.centerSpacer.scrollLeft = colLeft + colWidth - viewW;
    }
  }

  _buildRowPool() {
    this._syncLeafColumns();
    this._destroyRowPool();
    this._rowPool = this._bodyRowPoolRenderer.build(this._poolSize);

    this._buildAggregateRow();
    this._refreshAriaCounts();
  }

  // Dataset-scoped ARIA dimensions: rowcount = header + full view row count
  // (virtualization/pagination-independent); colcount = visible leaf columns. Band rows and
  // the aggregate row are unindexed (they show blank row numbers by design), so they are
  // not counted.
  private _refreshAriaCounts() {
    const rowModel = this.core.getRowModel();
    this.root.setAttribute("aria-colcount", String(this.core.getColumnModel().leafColumnLookup.size));
    // aria-rowcount is the size of the WHOLE set, not of what is currently rendered or paged to,
    // and `aria-rowindex` counts absolutely across pages (`getRowNumberForViewIndex` adds the page
    // offset). Using the page size here made page 2 of 10 report 11 rows with indices 12-21 — every
    // index past the declared count. Filtering does belong in the number, which is why this is
    // `getViewTotalCount()` and not `getRowCount()`.
    //
    // -1 means "count unknown" and is the honest answer while the server-side model's total is
    // still an estimate; publishing the estimate as exact tells AT the last row is reachable when
    // it may not be.
    const totalKnown = rowModel.isTotalRowCountKnown?.() ?? true;
    this.root.setAttribute(
      "aria-rowcount",
      totalKnown ? String(rowModel.getViewTotalCount() + 1) : "-1",
    );
    // More than one thing can be selected at once when cells can be dragged into a range, row
    // selection is in multiple mode, or columns can be selected (column selection accumulates, and
    // selecting a column marks all of its cells selected). Cell selection set to "text"/false
    // leaves the row/column routes.
    const multi = (this.core.options.cellSelection === true && !!this.core.options.rangeSelection)
      || (!!this.core.options.rowSelection && this.core.options.rowSelectionMode === "multiple")
      || !!this.core.options.columnSelection;
    this.root.setAttribute("aria-multiselectable", String(multi));
  }

  /**
   * The grid's accessible name. `aria-labelledby` wins when both are set, which is how the two
   * attributes resolve anyway; both are removed when unset so a cleared option does not leave a
   * stale name behind.
   */
  private _applyGridLabel() {
    const { ariaLabel, ariaLabelledBy } = this.core.options;
    if (ariaLabelledBy) this.root.setAttribute("aria-labelledby", ariaLabelledBy);
    else this.root.removeAttribute("aria-labelledby");
    if (ariaLabel && !ariaLabelledBy) this.root.setAttribute("aria-label", ariaLabel);
    else this.root.removeAttribute("aria-label");
  }

  _rebuildRowPool() {
    // If columns change frequently, you’d do smarter diffing.
    this._buildRowPool();
  }

  private _destroyRowPool(): void {
    for (const slot of this._rowPool) {
      for (const record of slot.cellRendererInstances.values()) record.runtime.destroy();
      slot.cellRendererInstances.clear();
    }
    this._rowPool = [];
  }

  private _copySelectionToClipboard({ includeHeaders, ctx }: {
    includeHeaders: boolean;
    ctx: import("../menu/bodyContext").BodyMenuContext;
  }) {
    const tsv = this._buildClipboardTSV(includeHeaders, ctx);
    if (!tsv) return;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(tsv).catch(err => {
        console.error("Failed to write to clipboard", err);
      });
      return;
    }

    const ta = document.createElement("textarea");
    ta.value = tsv;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (err) { console.error("Failed to copy to clipboard", err); }
    document.body.removeChild(ta);
  }

  private _buildClipboardTSV(includeHeaders: boolean, ctx: import("../menu/bodyContext").BodyMenuContext): string {
    const columnModel = this.core.getColumnModel();
    const allLeaves = columnModel.getLeaves().filter(c => !c.isInternal() && !c.hidden);
    const rowModel = this.core.getRowModel();

    let cols = allLeaves;
    let viewIdxRange: { start: number; end: number };

    if (ctx.selection.range) {
      const r = ctx.selection.range;
      cols = allLeaves.filter((_, idx) => {
        const globalIdx = columnModel.getLeaves().indexOf(allLeaves[idx]);
        return globalIdx >= r.colStart && globalIdx <= r.colEnd;
      });
      // Serialize in unified row order: pinned top segment, body rows, pinned bottom segment.
      const nodes: import("../interfaces/iRowNode").IRowNode[] = [];
      const pushPinned = (position: "top" | "bottom", segment?: { start: number; end: number }) => {
        if (!segment) return;
        for (let i = segment.start; i <= segment.end; i++) {
          const node = this.core.getDisplayedPinnedRow(position, i);
          if (node) nodes.push(node);
        }
      };
      pushPinned("top", r.pinnedTop);
      for (let i = r.rowStart; i <= r.rowEnd; i++) {
        const node = rowModel.getRowNodeAtViewIndex(i);
        if (node) nodes.push(node);
      }
      pushPinned("bottom", r.pinnedBottom);
      return serializeNodesToTSV(cols, nodes, includeHeaders);
    } else if (ctx.selection.rowIds.length > 0) {
      const rowIdSet = new Set(ctx.selection.rowIds);
      const viewIdxs: number[] = [];
      for (let i = 0; i < rowModel.getViewCount(); i++) {
        const id = this.core.getRowIdAtViewIndex(i);
        if (id && rowIdSet.has(id)) viewIdxs.push(i);
      }
      if (viewIdxs.length === 0) return "";
      return this.serializeRowsToTSV(cols, viewIdxs, includeHeaders);
    } else if (ctx.selection.colIds.length > 0) {
      cols = allLeaves.filter(c => ctx.selection.colIds.includes(c.instanceID));
      viewIdxRange = { start: 0, end: rowModel.getViewCount() - 1 };
    } else {
      cols = allLeaves.filter(c => c.instanceID === ctx.colId);
      viewIdxRange = { start: ctx.viewIdx, end: ctx.viewIdx };
    }

    const viewIdxs: number[] = [];
    for (let i = viewIdxRange.start; i <= viewIdxRange.end; i++) viewIdxs.push(i);
    return this.serializeRowsToTSV(cols, viewIdxs, includeHeaders);
  }

  private serializeRowsToTSV(cols: import("../column/column").Column[], viewIdxs: number[], includeHeaders: boolean): string {
    return serializeRowsToTSV(this.core.getRowModel(), cols, viewIdxs, includeHeaders);
  }

}
