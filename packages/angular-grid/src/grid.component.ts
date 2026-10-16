import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EnvironmentInjector,
  Injector,
  NgZone,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  isDevMode,
  isSignal,
  output,
  type OutputEmitterRef,
  untracked,
} from "@angular/core";
import {
  createGrid,
  GridOptions,
  IGridAPI,
} from "@agility-workbench/grid";
import type {
  BodyMenuContext,
  CellValueChangedParams,
  ColDef,
  Column,
  ColumnMenuContext,
  GridEventCellClickedParams,
  GridEventCellDoubleClickedParams,
  GridEventColumnsChangedParams,
  GridEventErrorParams,
  GridEventFilterChangedParams,
  GridEventPaginationChangedParams,
  GridEventQuickFilterFindChangedParams,
  GridEventHistoryChangedParams,
  GridEventRowClickedParams,
  GridEventRowDoubleClickedParams,
  GridEventSelectionChangedParams,
  GridEventActionFrameParams,
  GridEventAggregateChangedParams,
  GridEventBodyScrollParams,
  GridEventCellsChangedParams,
  GridEventColumnGroupOpenedParams,
  GridEventColumnWidthsChangedParams,
  GridEventEditingChangedParams,
  GridEventFirstDataRenderedParams,
  GridEventFocusChangedParams,
  GridEventHeaderFocusChangedParams,
  GridEventKeyboardNavigationModeChangedParams,
  GridEventModelUpdatedParams,
  GridEventOverlayShowParams,
  GridEventPivotChangedParams,
  GridEventPivotColumnLimitReachedParams,
  GridEventRowDataUpdatedParams,
  GridEventRowGroupOpenedParams,
  GridEventRowsChangedParams,
  GridEventTooltipParams,
  GridEventViewportChangedParams,
  SortChangedParams,
} from "@agility-workbench/grid";
import { NgAdapters } from "./adapters";
import {
  CREATION_ONLY_INPUT_CANDIDATES,
  UNCOMPARABLE,
  creationOnlyWarning,
  inputFingerprint,
} from "./creation-only";
import { getGridOptions } from "./factory";
import type {
  NgColDef,
  NgComponent,
  NgDefaultColDef,
  NgGetRowPresentation,
  NgPartialColDef,
} from "./interface";
import type { NgMenuItem } from "./menu";
import { NgBodyMenuAdapter, NgMenuAdapter } from "./menuAdapters";

type GridInstance = {
  api: IGridAPI;
  destroyed: boolean;
};

function destroyInstance(instance: GridInstance): void {
  if (instance.destroyed) return;
  instance.destroyed = true;

  // createGrid's api.destroy() performs the whole guarded teardown (detach → renderer.destroy →
  // core.destroy → api cleanup) in that order, exactly once. The flag above keeps this wrapper
  // idempotent too, since teardown can be reached twice.
  try {
    instance.api.destroy();
  } catch { }
}

/**
 * Angular host for the framework-agnostic grid. The core owns all DOM inside the host element;
 * Angular's job is lifecycle (create on first render, destroy with the component), forwarding
 * input changes to core/renderer setters, bridging core events to Angular outputs, and adapting
 * Angular components (renderers, editors, tooltips, ActionFrames, menu templates) into the core's
 * class-component contracts.
 *
 * The grid is created outside the Angular zone so its internal scroll/pointer listeners never
 * trigger app-wide change detection; outputs re-enter the zone when they emit.
 *
 * `TData` is the row type (default `any`). Angular infers it in templates from a `[columnDefs]`
 * binding typed `NgColDef<Trade>[]` (never from `[rowData]`, so an empty array cannot pin it);
 * it then types the row-carrying inputs, the click outputs, `gridReady` and `api`.
 */
@Component({
  selector: "awb-grid",
  standalone: true,
  exportAs: "awbGrid",
  template: "",
  styles: [":host { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; }"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AwbGrid<TData = any> implements OnDestroy {
  // --- data ---
  readonly rowData = input<NoInfer<TData>[] | undefined>();
  readonly columnDefs = input<NgColDef<TData>[] | ColDef<TData>[] | null | undefined>();
  readonly defaultColDef = input<NgDefaultColDef<TData> | undefined>();

  // --- layout / sizing ---
  readonly headerHeight = input<GridOptions["headerHeight"]>();
  readonly leafHeaderHeight = input<GridOptions["leafHeaderHeight"]>();
  readonly parentHeaderHeight = input<GridOptions["parentHeaderHeight"]>();
  readonly rowHeight = input<GridOptions["rowHeight"]>();
  readonly overscanRowCount = input<GridOptions["overscanRowCount"]>();
  readonly minResizeWidth = input<GridOptions["minResizeWidth"]>();
  readonly maxColumnWidth = input<GridOptions["maxColumnWidth"]>();
  readonly pivotMode = input<GridOptions["pivotMode"]>();
  readonly pivotColumns = input<GridOptions["pivotColumns"]>();
  readonly pivotResultColumnDef = input<NgPartialColDef<TData> | undefined>();
  readonly maxPivotColumns = input<GridOptions["maxPivotColumns"]>();
  readonly pivotColumnMoveMode = input<GridOptions["pivotColumnMoveMode"]>();
  readonly autosizeColumnsOnDataChange = input<GridOptions["autosizeColumnsOnDataChange"]>();

  // --- row identity ---
  readonly getRowId = input<GridOptions<TData>["getRowId"]>();
  readonly rowIdKey = input<GridOptions["rowIdKey"]>();
  readonly rowDataMode = input<GridOptions["rowDataMode"]>();
  readonly asyncTransactionWaitMs = input<GridOptions["asyncTransactionWaitMs"]>();

  // --- appearance / interaction ---
  readonly rowHover = input<GridOptions["rowHover"]>();
  readonly columnHover = input<GridOptions["columnHover"]>();
  readonly zebraRows = input<GridOptions["zebraRows"]>();
  readonly getRowClass = input<GridOptions<TData>["getRowClass"]>();
  readonly getRowStyle = input<GridOptions<TData>["getRowStyle"]>();
  readonly getRowPresentation = input<NgGetRowPresentation<TData>>();
  readonly ariaLabel = input<GridOptions["ariaLabel"]>();
  readonly ariaLabelledBy = input<GridOptions["ariaLabelledBy"]>();
  readonly highlightActiveCell = input<GridOptions["highlightActiveCell"]>();
  readonly rowNumbers = input<GridOptions["rowNumbers"]>();
  readonly showColumnButtonsOnHover = input<GridOptions["showColumnButtonsOnHover"]>();
  readonly theme = input<GridOptions["theme"]>();
  readonly icons = input<GridOptions["icons"]>();
  // The renderer delivers the base stylesheet on attach, to whichever root the grid lands in.
  // Suppress it when the application ships the CSS itself; `styleNonce` covers CSP `style-src`.
  readonly suppressStyleInjection = input<GridOptions["suppressStyleInjection"]>();
  readonly styleNonce = input<GridOptions["styleNonce"]>();

  // --- selection ---
  readonly rowSelection = input<GridOptions["rowSelection"]>();
  readonly isRowSelectable = input<GridOptions<TData>["isRowSelectable"]>();
  readonly cellSelection = input<GridOptions["cellSelection"]>();
  readonly rangeSelection = input<GridOptions["rangeSelection"]>();
  readonly fillHandle = input<GridOptions["fillHandle"]>();
  readonly columnSelection = input<GridOptions["columnSelection"]>();
  readonly headerKeyboardNavigation = input<GridOptions["headerKeyboardNavigation"]>();
  readonly selectAllRowsOnHeaderClick = input<GridOptions["selectAllRowsOnHeaderClick"]>();
  readonly selectAllScope = input<GridOptions["selectAllScope"]>();
  readonly selectionPersistence = input<GridOptions["selectionPersistence"]>();
  readonly clearSelectionOnBodyClick = input<GridOptions["clearSelectionOnBodyClick"]>();

  // --- editing ---
  readonly editTrigger = input<GridOptions["editTrigger"]>();
  // Value-returning pre-commit hook (A5). An input rather than an output because outputs cannot
  // return the veto/transform result to the grid.
  readonly onBeforeCellCommit = input<GridOptions<TData>["onBeforeCellCommit"]>();
  readonly fillOperation = input<GridOptions<TData>["fillOperation"]>();
  readonly readOnlyEdit = input<GridOptions["readOnlyEdit"]>();
  readonly pinnedRowsEditable = input<GridOptions["pinnedRowsEditable"]>();
  readonly suppressKeyboardEdit = input<GridOptions["suppressKeyboardEdit"]>();
  readonly suppressTypeToEdit = input<GridOptions["suppressTypeToEdit"]>();
  readonly moveAfterEdit = input<GridOptions["moveAfterEdit"]>();
  readonly commitOnBlur = input<GridOptions["commitOnBlur"]>();
  readonly reevaluateOnEdit = input<GridOptions["reevaluateOnEdit"]>();
  readonly undoLimit = input<GridOptions["undoLimit"]>();

  // --- sorting ---
  readonly initialSort = input<GridOptions["initialSort"]>();
  readonly showSortPriority = input<GridOptions["showSortPriority"]>();

  // --- filtering ---
  readonly quickFilter = input<GridOptions["quickFilter"]>();
  readonly filterDebounceMs = input<GridOptions["filterDebounceMs"]>();

  // --- grouping / tree ---
  readonly groupDisplayType = input<GridOptions["groupDisplayType"]>();
  readonly groupColumnDef = input<NgPartialColDef<TData> | undefined>();
  readonly groupDefaultExpanded = input<GridOptions["groupDefaultExpanded"]>();
  readonly groupSortMode = input<GridOptions["groupSortMode"]>();
  readonly groupRowsSelectable = input<GridOptions["groupRowsSelectable"]>();
  readonly groupSelectsChildren = input<GridOptions["groupSelectsChildren"]>();
  readonly aggFuncs = input<GridOptions<TData>["aggFuncs"]>();
  readonly groupRowsSticky = input<GridOptions["groupRowsSticky"]>();
  readonly getGroupChildCount = input<GridOptions["getGroupChildCount"]>();
  readonly groupChildCount = input<GridOptions<TData>["groupChildCount"]>();
  readonly groupTotalRow = input<GridOptions["groupTotalRow"]>();
  readonly grandTotalRow = input<GridOptions["grandTotalRow"]>();
  readonly groupTotalRowLabel = input<GridOptions<TData>["groupTotalRowLabel"]>();
  readonly treeData = input<GridOptions<TData>["treeData"]>();

  // --- pinned rows ---
  readonly pinnedTopRowData = input<GridOptions<TData>["pinnedTopRowData"]>();
  readonly pinnedBottomRowData = input<GridOptions<TData>["pinnedBottomRowData"]>();
  readonly isRowPinned = input<GridOptions<TData>["isRowPinned"]>();
  readonly rowPinningMenu = input<GridOptions["rowPinningMenu"]>();
  readonly rowInsertionMenu = input<GridOptions<TData>["rowInsertionMenu"]>();

  // --- full-width rows ---
  readonly isFullWidthRow = input<GridOptions<TData>["isFullWidthRow"]>();
  readonly fullWidthCellRenderer = input<GridOptions<TData>["fullWidthCellRenderer"] | NgComponent>();

  // --- pagination ---
  readonly pagination = input<GridOptions["pagination"]>();
  readonly paginationControls = input<GridOptions["paginationControls"]>();
  readonly pageSize = input<GridOptions["pageSize"]>();
  readonly pageSizes = input<GridOptions["pageSizes"]>();
  readonly resetPageOn = input<GridOptions["resetPageOn"]>();
  readonly paginationUnknownTotalTooltip = input<GridOptions["paginationUnknownTotalTooltip"]>();

  // --- server-side row model ---
  readonly rowModelType = input<GridOptions["rowModelType"]>();
  readonly serverSideDataSource = input<GridOptions["serverSideDataSource"]>();
  readonly serverSideAggregationSource = input<GridOptions["serverSideAggregationSource"]>();
  readonly serverSideBlockSize = input<GridOptions["serverSideBlockSize"]>();
  readonly serverSideMaxBlocks = input<GridOptions["serverSideMaxBlocks"]>();

  // --- widgets / chrome ---
  readonly tooltip = input<GridOptions["tooltip"]>();
  readonly columnPanel = input<GridOptions["columnPanel"]>();
  readonly toolbar = input<GridOptions["toolbar"]>();
  readonly savedViews = input<GridOptions["savedViews"]>();
  readonly sheets = input<GridOptions["sheets"]>();
  readonly allowExportAsCSV = input<GridOptions["allowExportAsCSV"]>();
  readonly allowExportAsExcel = input<GridOptions["allowExportAsExcel"]>();

  // --- cell change flashing ---
  readonly cellFlashDuration = input<GridOptions["cellFlashDuration"]>();
  readonly cellFadeDuration = input<GridOptions["cellFadeDuration"]>();

  // --- overlays ---
  /** If true, shows the loading overlay. */
  readonly loading = input<boolean | undefined>();
  readonly loadingMessage = input<GridOptions["loadingMessage"]>();
  readonly noRowsMessage = input<GridOptions["noRowsMessage"]>();
  readonly pivotNoValuesMessage = input<GridOptions["pivotNoValuesMessage"]>();
  readonly pivotEmptyMessage = input<GridOptions["pivotEmptyMessage"]>();

  // --- localization (creation-only) ---
  /** Translations for the grid's own strings; see `GridOptions.localeText`. */
  readonly localeText = input<GridOptions["localeText"]>();
  /** Translate any grid string in code; see `GridOptions.getLocaleText`. */
  readonly getLocaleText = input<GridOptions["getLocaleText"]>();

  // --- menus ---
  /** Hook to customize column menu items (slots may be `TemplateRef`s). */
  readonly getColumnMenuItems = input<
    ((p: { ctx: ColumnMenuContext; items: NgMenuItem[] }) => NgMenuItem[]) | undefined
  >();
  /**
   * Controls the body (right-click) context menu:
   * - `true` / omitted (default): the grid's default body menu (Copy, Export, …).
   * - `false`: no grid menu — the browser's native context menu appears instead.
   * - a function: called with the menu context and the default items; return the items to show
   *   (slots may be `TemplateRef`s). Return `[]` to show nothing while still suppressing the
   *   native menu.
   */
  readonly bodyContextMenu = input<
    boolean | ((p: { ctx: BodyMenuContext; items: NgMenuItem[] }) => NgMenuItem[]) | undefined
  >();
  /**
   * Customizes the column menu opened for several selected columns at once (see the core
   * `multiColumnMenu`):
   * - omitted (default): the grid's built-in multi-column items.
   * - a function: called with the built-in items and the columns they act on (target first);
   *   return the items to show (slots may be `TemplateRef`s), or `[]` for no menu. The current
   *   input value is read on every open. `getColumnMenuItems` still runs afterwards.
   * - `false` at creation: no multi-column menu, and `getColumnMenuItems` does not run for one
   *   either. Switching to `false` later behaves like a function returning `[]`.
   */
  readonly multiColumnMenu = input<
    | false
    | ((p: { ctx: ColumnMenuContext; columns: Column[]; items: NgMenuItem[] }) => NgMenuItem[])
    | undefined
  >();

  // --- outputs ---
  readonly gridReady = output<IGridAPI<TData>>();
  readonly cellClicked = output<GridEventCellClickedParams<TData>>();
  readonly rowClicked = output<GridEventRowClickedParams<TData>>();
  readonly cellDoubleClicked = output<GridEventCellDoubleClickedParams<TData>>();
  readonly rowDoubleClicked = output<GridEventRowDoubleClickedParams<TData>>();
  readonly cellValueChanged = output<CellValueChangedParams>();
  readonly selectionChanged = output<GridEventSelectionChangedParams>();
  readonly sortChanged = output<SortChangedParams>();
  /** Every column layout/model change (core `columnsChanged`); `source` tells UI from API changes. */
  readonly columnsChanged = output<GridEventColumnsChangedParams>();
  /** Page, page size or total changes (core `paginationChanged`), with `getPaginationInfo()`. */
  readonly paginationChanged = output<GridEventPaginationChangedParams>();
  /**
   * A failed row-model request (core `error`). Not named `error`: Angular binds `(error)` on the
   * host as a native DOM listener as well as to the output, so any `error` event dispatched on
   * `<awb-grid>` would reach the handler too, as a plain `Event`.
   */
  readonly gridError = output<GridEventErrorParams>();
  readonly filterChanged = output<GridEventFilterChangedParams>();
  readonly quickFilterFindChanged = output<GridEventQuickFilterFindChangedParams>();
  readonly historyChanged = output<GridEventHistoryChangedParams>();
  // One output per remaining core event, named like the event (none of these names is a native DOM
  // event, so unlike `gridError` none needs renaming to keep host DOM events out).
  readonly columnWidthsChanged = output<GridEventColumnWidthsChangedParams>();
  readonly editingChanged = output<GridEventEditingChangedParams>();
  readonly focusChanged = output<GridEventFocusChangedParams>();
  readonly headerFocusChanged = output<GridEventHeaderFocusChangedParams>();
  readonly rowsChanged = output<GridEventRowsChangedParams>();
  readonly pivotChanged = output<GridEventPivotChangedParams>();
  readonly pivotColumnLimitReached = output<GridEventPivotColumnLimitReachedParams>();
  readonly modelUpdated = output<GridEventModelUpdatedParams>();
  readonly viewportChanged = output<GridEventViewportChangedParams>();
  readonly cellsChanged = output<GridEventCellsChangedParams>();
  readonly aggregateChanged = output<GridEventAggregateChangedParams>();
  readonly overlayShow = output<GridEventOverlayShowParams>();
  readonly tooltipShow = output<GridEventTooltipParams>();
  readonly tooltipHide = output<GridEventTooltipParams>();
  readonly actionFrameChanged = output<GridEventActionFrameParams>();
  readonly keyboardNavigationModeChanged = output<GridEventKeyboardNavigationModeChangedParams>();
  readonly rowGroupOpened = output<GridEventRowGroupOpenedParams>();
  readonly columnGroupOpened = output<GridEventColumnGroupOpenedParams>();
  readonly firstDataRendered = output<GridEventFirstDataRenderedParams>();
  readonly rowDataUpdated = output<GridEventRowDataUpdatedParams>();
  readonly bodyScroll = output<GridEventBodyScrollParams>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly appRef = inject(ApplicationRef);
  private readonly adapters = new NgAdapters(this.appRef, inject(EnvironmentInjector), this.zone);

  private instance: GridInstance | null = null;

  /** The imperative grid API; available from `gridReady` onward (null before first render). */
  get api(): IGridAPI<TData> | null {
    return this.instance?.api ?? null;
  }

  constructor() {
    // afterNextRender only runs in the browser, which doubles as the SSR guard: on the server the
    // grid is never created and the host renders as an empty element.
    afterNextRender(() => this.create());
  }

  ngOnDestroy(): void {
    const instance = this.instance;
    this.instance = null;
    if (instance) destroyInstance(instance);
  }

  /**
   * Emit through `ref` inside the zone, but only when something is bound to it: the grid runs
   * outside Angular so scrolling and repaints do not trigger change detection, and re-entering the
   * zone for an output nobody listens to would undo that. Reads the emitter's listener list, which
   * Angular keeps private; if that shape ever changes the check fails open and every emit enters
   * the zone, as the original outputs do.
   */
  private emitObserved<T>(ref: OutputEmitterRef<T>, ev: T): void {
    const listeners = (ref as unknown as { listeners?: unknown[] | null }).listeners;
    if (listeners === null || (Array.isArray(listeners) && listeners.length === 0)) return;
    this.zone.run(() => ref.emit(ev));
  }

  private create(): void {
    const instance = this.zone.runOutsideAngular(() => {
      const options = getGridOptions(this, this.adapters);
      // Stable bridges keep the core subscriptions intact while emitting through Angular outputs
      // (re-entering the zone so listeners see a consistent change-detection world).
      options.onCellClicked = (ev) => this.zone.run(() => this.cellClicked.emit(ev));
      options.onRowClicked = (ev) => this.zone.run(() => this.rowClicked.emit(ev));
      options.onCellDoubleClicked = (ev) => this.zone.run(() => this.cellDoubleClicked.emit(ev));
      options.onRowDoubleClicked = (ev) => this.zone.run(() => this.rowDoubleClicked.emit(ev));
      options.onCellValueChanged = (ev) => this.zone.run(() => this.cellValueChanged.emit(ev));
      options.onSelectionChanged = (ev) => this.zone.run(() => this.selectionChanged.emit(ev));
      options.onSortChanged = (ev) => this.zone.run(() => this.sortChanged.emit(ev));
      options.onColumnsChanged = (ev) => this.zone.run(() => this.columnsChanged.emit(ev));
      options.onPaginationChanged = (ev) => this.zone.run(() => this.paginationChanged.emit(ev));
      options.onError = (ev) => this.zone.run(() => this.gridError.emit(ev));
      options.onFilterChanged = (ev) => this.zone.run(() => this.filterChanged.emit(ev));
      options.onQuickFilterFindChanged = (ev) =>
        this.zone.run(() => this.quickFilterFindChanged.emit(ev));
      options.onHistoryChanged = (ev) => this.zone.run(() => this.historyChanged.emit(ev));
      // The rest go through emitObserved: several fire per scroll tick, drag move or repaint, and
      // entering the zone runs application-wide change detection even when nothing listens.
      options.onColumnWidthsChanged = (ev) => this.emitObserved(this.columnWidthsChanged, ev);
      options.onEditingChanged = (ev) => this.emitObserved(this.editingChanged, ev);
      options.onFocusChanged = (ev) => this.emitObserved(this.focusChanged, ev);
      options.onHeaderFocusChanged = (ev) => this.emitObserved(this.headerFocusChanged, ev);
      options.onRowsChanged = (ev) => this.emitObserved(this.rowsChanged, ev);
      options.onPivotChanged = (ev) => this.emitObserved(this.pivotChanged, ev);
      options.onPivotColumnLimitReached = (ev) =>
        this.emitObserved(this.pivotColumnLimitReached, ev);
      options.onModelUpdated = (ev) => this.emitObserved(this.modelUpdated, ev);
      options.onViewportChanged = (ev) => this.emitObserved(this.viewportChanged, ev);
      options.onCellsChanged = (ev) => this.emitObserved(this.cellsChanged, ev);
      options.onAggregateChanged = (ev) => this.emitObserved(this.aggregateChanged, ev);
      options.onOverlayShow = (ev) => this.emitObserved(this.overlayShow, ev);
      options.onTooltipShow = (ev) => this.emitObserved(this.tooltipShow, ev);
      options.onTooltipHide = (ev) => this.emitObserved(this.tooltipHide, ev);
      options.onActionFrameChanged = (ev) => this.emitObserved(this.actionFrameChanged, ev);
      options.onKeyboardNavigationModeChanged = (ev) =>
        this.emitObserved(this.keyboardNavigationModeChanged, ev);
      options.onRowGroupOpened = (ev) => this.emitObserved(this.rowGroupOpened, ev);
      options.onColumnGroupOpened = (ev) => this.emitObserved(this.columnGroupOpened, ev);
      options.onFirstDataRendered = (ev) => this.emitObserved(this.firstDataRendered, ev);
      options.onRowDataUpdated = (ev) => this.emitObserved(this.rowDataUpdated, ev);
      options.onBodyScroll = (ev) => this.emitObserved(this.bodyScroll, ev);
      // Value-returning hook, read through the signal so it stays reactive to input changes.
      // zone.run propagates the return value, so veto/transform results reach the grid.
      options.onBeforeCellCommit = (params) => {
        const hook = this.onBeforeCellCommit();
        return hook ? this.zone.run(() => hook(params)) : undefined;
      };
      options.fillOperation = (params) => {
        const operation = this.fillOperation();
        return operation ? this.zone.run(() => operation(params)) : undefined;
      };

      // createGrid applies columnDefs and rowData right after init, in the same synchronous
      // sequence this component used to perform by hand (init → columnDefs → rowData). The sync
      // effects' creation-time snapshots (lastDefs / lastRows) keep them from re-applying these.
      const api = createGrid(this.host.nativeElement, {
        ...options,
        columnDefs: this.adapters.adaptColumnDefs(this.columnDefs()) ?? undefined,
        // Client-side grids always get an initial rowDataSet (empty included); server-side grids
        // must not, so their slot stays undefined and createGrid skips it.
        rowData: this.rowModelType() !== "serverSide" ? this.rowData() ?? [] : undefined,
        menuAdapter: new NgMenuAdapter(this.appRef, this.zone, {
          getColumnMenuItems: () => this.getColumnMenuItems(),
        }),
        bodyMenuAdapter: new NgBodyMenuAdapter(this.appRef, this.zone, {
          // Only the function arm customizes items here; boolean modes (default / native menu) are
          // forwarded to core by getGridOptions. Read through the signal so the callback stays
          // reactive to input changes without recreating the grid instance.
          getBodyMenuItems: () => {
            const opt = this.bodyContextMenu();
            return typeof opt === "function" ? opt : undefined;
          },
        }),
      });
      const created: GridInstance = { api, destroyed: false };
      return created;
    });

    this.instance = instance;
    if (isDevMode()) this.startCreationOnlyWarnings();
    this.startSyncEffects(instance);
    this.gridReady.emit(instance.api);
  }

  /**
   * One effect per reconcilable option group, mirroring the React wrapper's per-prop layout
   * effects. Effects are created after the grid instance exists; each one's first run re-applies
   * the value the instance was just created with, which is harmless for these idempotent setters
   * (the React wrapper's mount-run effects do the same). The four widget configs that would
   * rebuild UI on re-application skip their first run via `keyedEffect`.
   */
  private startSyncEffects(instance: GridInstance): void {
    const { api } = instance;

    // columnDefs/rowData were already applied synchronously by create(); these effects compare
    // against that creation-time snapshot so startup applies them exactly once.
    let lastDefs = untracked(() => this.columnDefs());
    this.syncEffect(() => {
      const defs = this.columnDefs();
      if (defs === lastDefs) return null;
      lastDefs = defs;
      // Presence-based: an undefined input still carries the key, releasing caller ownership of
      // the schema exactly as setColumnDefsFromProps(undefined) did.
      return () => api.updateGridOptions({ columnDefs: this.adapters.adaptColumnDefs(defs) });
    });

    let lastRows = untracked(() => this.rowData());
    this.syncEffect(() => {
      const rows = this.rowData();
      if (rows === lastRows || this.rowModelType() === "serverSide") return null;
      lastRows = rows;
      return () => api.setRowData(rows ?? []);
    });

    this.syncEffect(() => {
      const v = this.groupDisplayType();
      return () => api.updateGridOptions({ groupDisplayType: v });
    });

    this.syncEffect(() => {
      const v = this.groupSortMode();
      return () => api.updateGridOptions({ groupSortMode: v });
    });

    this.syncEffect(() => {
      const v = this.groupRowsSelectable();
      return () => api.updateGridOptions({ groupRowsSelectable: v });
    });

    this.syncEffect(() => {
      const v = this.groupChildCount();
      return () => api.updateGridOptions({ groupChildCount: v });
    });

    // Both footer options are restated together: the core rebuilds the group tree once.
    this.syncEffect(() => {
      const groupTotalRow = this.groupTotalRow();
      const grandTotalRow = this.grandTotalRow();
      return () => api.updateGridOptions({ groupTotalRow, grandTotalRow });
    });

    this.syncEffect(() => {
      const v = this.groupTotalRowLabel();
      return () => api.updateGridOptions({ groupTotalRowLabel: v });
    });

    // Header heights resolve against each other (an unset level height follows headerHeight), so
    // all three are restated together; an undefined input falls back. Unchanged heights are a no-op.
    this.syncEffect(() => {
      const opts = {
        headerHeight: this.headerHeight(),
        leafHeaderHeight: this.leafHeaderHeight(),
        parentHeaderHeight: this.parentHeaderHeight(),
      };
      return () => api.updateGridOptions(opts);
    });

    this.syncEffect(() => {
      const v = this.pivotColumnMoveMode();
      return () => api.updateGridOptions({ pivotColumnMoveMode: v });
    });

    // pivotMode / pivotColumns are live inputs, but they are NOT updateGridOptions keys: core seeds
    // them once from the creation options and owns them as model state afterwards, so later input
    // changes go through the API setters. keyedEffect compares against the value the grid was
    // created with, so the creation-time application is never repeated — which also keeps these
    // from overwriting roles an app assigned in its gridReady handler.
    this.keyedEffect(
      () => this.pivotMode(),
      (value) => { if (value != null) api.setPivotMode(value); },
    );

    this.keyedEffect(
      () => this.pivotColumns(),
      (value) => { if (value != null) api.setPivotColumns(value); },
    );

    this.syncEffect(() => {
      const v = this.isRowSelectable();
      return () => api.updateGridOptions({ isRowSelectable: v });
    });

    this.keyedEffect(
      () => this.rowSelection(),
      (value) => api.updateGridOptions({ rowSelection: value }),
    );

    this.syncEffect(() => {
      const treeData = this.treeData();
      // Both keys are always supplied so each restates its current value rather than being read
      // back off the core (the API's presence-based contract).
      return () =>
        api.setTreeDataKeyboardNavigationOptions({
          keyboardNavigationMode: treeData?.keyboardNavigationMode,
          enableKeyboardNavigationModeSwitch: treeData?.enableKeyboardNavigationModeSwitch ?? false,
        });
    });

    this.syncEffect(() => {
      const opts = {
        pinnedTopRowData: this.pinnedTopRowData(),
        pinnedBottomRowData: this.pinnedBottomRowData(),
        isRowPinned: this.isRowPinned(),
        groupRowsSticky: this.groupRowsSticky(),
      };
      return () => api.updateGridOptions(opts);
    });

    this.syncEffect(() => {
      const opts = {
        rowHover: this.rowHover() ?? true,
        columnHover: this.columnHover() ?? false,
        zebraRows: this.zebraRows() ?? false,
        getRowClass: this.getRowClass(),
        getRowStyle: this.getRowStyle(),
        getRowPresentation: this.adapters.adaptGetRowPresentation(this.getRowPresentation()),
        ariaLabel: this.ariaLabel(),
        ariaLabelledBy: this.ariaLabelledBy(),
        highlightActiveCell: this.highlightActiveCell() ?? false,
        cellSelection: this.cellSelection() ?? true,
        rangeSelection: this.rangeSelection() ?? true,
        fillHandle: this.fillHandle() ?? true,
        columnSelection: this.columnSelection() ?? true,
        headerKeyboardNavigation: this.headerKeyboardNavigation() ?? true,
        showColumnButtonsOnHover: this.showColumnButtonsOnHover() ?? false,
        // Function-valued customization is resolved through the body-menu adapter. Core only owns
        // whether the browser-native mode disables the grid menu entirely.
        bodyContextMenu: this.bodyContextMenu() === false ? (false as const) : (true as const),
        editTrigger: this.editTrigger() ?? "doubleClick",
        readOnlyEdit: this.readOnlyEdit() ?? false,
        pinnedRowsEditable: this.pinnedRowsEditable() ?? false,
        rowPinningMenu: this.rowPinningMenu() ?? false,
        rowInsertionMenu: this.rowInsertionMenu(),
        suppressKeyboardEdit: this.suppressKeyboardEdit() ?? false,
        suppressTypeToEdit: this.suppressTypeToEdit() ?? false,
        moveAfterEdit: this.moveAfterEdit() ?? true,
        commitOnBlur: this.commitOnBlur() ?? true,
        asyncTransactionWaitMs: this.asyncTransactionWaitMs() ?? 16,
        loadingMessage: this.loadingMessage(),
        noRowsMessage: this.noRowsMessage(),
      };
      return () => api.updateGridOptions(opts);
    });

    // createGrid already asked the server for the first block with the creation-time source, and
    // re-applying the same object would purge the store and fetch it again — so, like columnDefs
    // and rowData above, startup compares against the creation-time snapshot and only a changed
    // input goes through updateGridOptions (which refetches, as a new source must).
    let lastSource = untracked(() => this.serverSideDataSource());
    this.syncEffect(() => {
      const source = this.serverSideDataSource();
      if (this.rowModelType() !== "serverSide" || !source || source === lastSource) return null;
      lastSource = source;
      return () => api.updateGridOptions({ serverSideDataSource: source });
    });

    this.syncEffect(() => {
      const source = this.serverSideAggregationSource();
      if (this.rowModelType() !== "serverSide" || !source) return null;
      return () => api.updateGridOptions({ serverSideAggregationSource: source });
    });

    this.syncEffect(() => {
      const loading = this.loading();
      return () => api.dispatch({ type: "overlayShow", overlayType: loading ? "loading" : "none" });
    });

    this.syncEffect(() => {
      const pagination = this.pagination();
      return () => api.updateGridOptions({ pagination });
    });

    this.keyedEffect(
      () => this.paginationControls(),
      (options) => api.updateGridOptions({ paginationControls: options }),
    );

    // Widget configs reconcile live without remounting the grid, but a rebuild on first run would
    // be disruptive (the create path already applied them), so these compare serialized contents
    // and skip the initial application — the Angular translation of the React wrapper's
    // JSON.stringify keys + mounted refs.
    this.keyedEffect(() => this.quickFilter(), (v) => api.updateGridOptions({ quickFilter: v }));
    this.keyedEffect(() => this.tooltip(), (v) => api.updateGridOptions({ tooltip: v }));
    this.keyedEffect(() => this.columnPanel(), (v) => api.updateGridOptions({ columnPanel: v }));
    this.keyedEffect(() => this.toolbar(), (v) => api.updateGridOptions({ toolbar: v }));

    // Saved views are application-owned. Reconcile a new list/callback object in place so a
    // persistence update immediately refreshes the Views menu without remounting the grid.
    this.syncEffect(() => {
      const savedViews = this.savedViews();
      return () => api.updateGridOptions({ savedViews });
    });

    // Sheet tabs are application-owned the same way: a new list/callback object re-syncs the tab
    // strip in place (no view state is applied by a sync — see SheetsOptions).
    this.syncEffect(() => {
      const sheets = this.sheets();
      return () => api.updateGridOptions({ sheets });
    });

    // Theme vars and icons are reconciled together: `icons` overrides any icons carried by
    // `theme`, so recompute the merged set whenever either changes. The merge is done here (not
    // left to the API's theme/icon resolution) because that resolution reads creation-time icons
    // off the core's options, not the current input.
    this.syncEffect(() => {
      const theme = this.theme();
      const icons = this.icons();
      return () => api.updateGridOptions({ theme, icons: { ...theme?.getIcons(), ...icons } });
    });
  }

  /**
   * Development only. Creation-only inputs are read once, by createGrid; a later change to one is
   * ignored. Instead of letting that change vanish silently, warn once per input (per grid
   * instance), comparing against the value the grid was created with. The input list is core's
   * creation-only key list, intersected with the inputs this component declares.
   */
  private startCreationOnlyWarnings(): void {
    const self = this as unknown as Record<string, unknown>;
    const inputs = CREATION_ONLY_INPUT_CANDIDATES.flatMap((key) => {
      const candidate = self[key];
      return isSignal(candidate) ? [{ key, read: candidate as () => unknown }] : [];
    });
    const created = new Map(
      inputs.map(({ key, read }) => {
        const value = untracked(read);
        return [key, { value, fingerprint: inputFingerprint(key, value) }] as const;
      }),
    );
    const warned = new Set<string>();
    effect(
      () => {
        for (const { key, read } of inputs) {
          const value = read();
          if (warned.has(key)) continue;
          const initial = created.get(key)!;
          if (Object.is(value, initial.value)) continue;
          const fingerprint = inputFingerprint(key, value);
          if (fingerprint !== UNCOMPARABLE && fingerprint === initial.fingerprint) continue;
          warned.add(key);
          console.warn(creationOnlyWarning(key));
        }
      },
      { injector: this.injector },
    );
  }

  /**
   * Effect helper: `read` runs tracked (signal reads register dependencies) and returns the core
   * call to make, or null to skip; the call itself runs outside the Angular zone so core-side
   * listener churn never schedules change detection.
   */
  private syncEffect(read: () => (() => void) | null): void {
    effect(
      () => {
        const apply = read();
        if (!apply || !this.instance) return;
        this.zone.runOutsideAngular(apply);
      },
      { injector: this.injector },
    );
  }

  /**
   * Like syncEffect, but compares serialized contents against the value the grid was created with,
   * so an inline-object input doesn't rebuild the widget unless its contents actually changed —
   * and the creation-time application is never repeated. (The effect's first run is NOT guaranteed
   * to happen at mount: with OnPush it can be deferred to the first input change, so "skip the
   * first run" would swallow a real change — compare values, not run counts.)
   */
  private keyedEffect<T>(read: () => T, apply: (value: T) => void): void {
    let lastKey = JSON.stringify(untracked(read) ?? null);
    effect(
      () => {
        const value = read();
        const key = JSON.stringify(value ?? null);
        if (key === lastKey || !this.instance) return;
        lastKey = key;
        this.zone.runOutsideAngular(() => apply(value));
      },
      { injector: this.injector },
    );
  }
}
