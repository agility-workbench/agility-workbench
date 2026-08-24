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
  output,
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
  ColumnMenuContext,
  GridEventCellClickedParams,
  GridEventFilterChangedParams,
  GridEventHistoryChangedParams,
  GridEventRowClickedParams,
  GridEventSelectionChangedParams,
  SortChangedParams,
} from "@agility-workbench/grid";
import { NgAdapters } from "./adapters";
import { getGridOptions } from "./factory";
import type {
  NgColDef,
  NgComponent,
  NgDefaultColDef,
  NgGetRowPresentation,
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
 */
@Component({
  selector: "awb-grid",
  standalone: true,
  exportAs: "awbGrid",
  template: "",
  styles: [":host { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; }"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AwbGrid implements OnDestroy {
  // --- data ---
  readonly rowData = input<unknown[] | undefined>();
  readonly columnDefs = input<NgColDef[] | ColDef[] | null | undefined>();
  readonly defaultColDef = input<NgDefaultColDef | undefined>();

  // --- layout / sizing ---
  readonly headerHeight = input<GridOptions["headerHeight"]>();
  readonly leafHeaderHeight = input<GridOptions["leafHeaderHeight"]>();
  readonly parentHeaderHeight = input<GridOptions["parentHeaderHeight"]>();
  readonly rowHeight = input<GridOptions["rowHeight"]>();
  readonly overscanRowCount = input<GridOptions["overscanRowCount"]>();
  readonly minResizeWidth = input<GridOptions["minResizeWidth"]>();
  readonly maxColumnWidth = input<GridOptions["maxColumnWidth"]>();
  readonly autosizeColumnsOnDataChange = input<GridOptions["autosizeColumnsOnDataChange"]>();

  // --- row identity ---
  readonly getRowId = input<GridOptions["getRowId"]>();
  readonly rowIdKey = input<GridOptions["rowIdKey"]>();
  readonly rowDataMode = input<GridOptions["rowDataMode"]>();
  readonly asyncTransactionWaitMs = input<GridOptions["asyncTransactionWaitMs"]>();

  // --- appearance / interaction ---
  readonly rowHover = input<GridOptions["rowHover"]>();
  readonly columnHover = input<GridOptions["columnHover"]>();
  readonly zebraRows = input<GridOptions["zebraRows"]>();
  readonly getRowClass = input<GridOptions["getRowClass"]>();
  readonly getRowStyle = input<GridOptions["getRowStyle"]>();
  readonly getRowPresentation = input<NgGetRowPresentation>();
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
  readonly isRowSelectable = input<GridOptions["isRowSelectable"]>();
  readonly cellSelection = input<GridOptions["cellSelection"]>();
  readonly rangeSelection = input<GridOptions["rangeSelection"]>();
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
  readonly onBeforeCellCommit = input<GridOptions["onBeforeCellCommit"]>();
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
  readonly groupColumnDef = input<GridOptions["groupColumnDef"]>();
  readonly groupDefaultExpanded = input<GridOptions["groupDefaultExpanded"]>();
  readonly groupSortMode = input<GridOptions["groupSortMode"]>();
  readonly groupRowsSelectable = input<GridOptions["groupRowsSelectable"]>();
  readonly groupRowsSticky = input<GridOptions["groupRowsSticky"]>();
  readonly getGroupChildCount = input<GridOptions["getGroupChildCount"]>();
  readonly treeData = input<GridOptions["treeData"]>();

  // --- pinned rows ---
  readonly pinnedTopRowData = input<GridOptions["pinnedTopRowData"]>();
  readonly pinnedBottomRowData = input<GridOptions["pinnedBottomRowData"]>();
  readonly isRowPinned = input<GridOptions["isRowPinned"]>();
  readonly rowPinningMenu = input<GridOptions["rowPinningMenu"]>();
  readonly rowInsertionMenu = input<GridOptions["rowInsertionMenu"]>();

  // --- full-width rows ---
  readonly isFullWidthRow = input<GridOptions["isFullWidthRow"]>();
  readonly fullWidthCellRenderer = input<GridOptions["fullWidthCellRenderer"] | NgComponent>();

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

  // --- widgets / chrome ---
  readonly tooltip = input<GridOptions["tooltip"]>();
  readonly columnPanel = input<GridOptions["columnPanel"]>();
  readonly toolbar = input<GridOptions["toolbar"]>();
  readonly savedViews = input<GridOptions["savedViews"]>();
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

  // --- outputs ---
  readonly gridReady = output<IGridAPI>();
  readonly cellClicked = output<GridEventCellClickedParams>();
  readonly rowClicked = output<GridEventRowClickedParams>();
  readonly cellValueChanged = output<CellValueChangedParams>();
  readonly selectionChanged = output<GridEventSelectionChangedParams>();
  readonly sortChanged = output<SortChangedParams>();
  readonly filterChanged = output<GridEventFilterChangedParams>();
  readonly historyChanged = output<GridEventHistoryChangedParams>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly appRef = inject(ApplicationRef);
  private readonly adapters = new NgAdapters(this.appRef, inject(EnvironmentInjector), this.zone);

  private instance: GridInstance | null = null;

  /** The imperative grid API; available from `gridReady` onward (null before first render). */
  get api(): IGridAPI | null {
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

  private create(): void {
    const instance = this.zone.runOutsideAngular(() => {
      const options = getGridOptions(this, this.adapters);
      // Stable bridges keep the core subscriptions intact while emitting through Angular outputs
      // (re-entering the zone so listeners see a consistent change-detection world).
      options.onCellClicked = (ev) => this.zone.run(() => this.cellClicked.emit(ev));
      options.onRowClicked = (ev) => this.zone.run(() => this.rowClicked.emit(ev));
      options.onCellValueChanged = (ev) => this.zone.run(() => this.cellValueChanged.emit(ev));
      options.onSelectionChanged = (ev) => this.zone.run(() => this.selectionChanged.emit(ev));
      options.onSortChanged = (ev) => this.zone.run(() => this.sortChanged.emit(ev));
      options.onFilterChanged = (ev) => this.zone.run(() => this.filterChanged.emit(ev));
      options.onHistoryChanged = (ev) => this.zone.run(() => this.historyChanged.emit(ev));
      // Value-returning hook, read through the signal so it stays reactive to input changes.
      // zone.run propagates the return value, so veto/transform results reach the grid.
      options.onBeforeCellCommit = (params) => {
        const hook = this.onBeforeCellCommit();
        return hook ? this.zone.run(() => hook(params)) : undefined;
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
      };
      return () => api.updateGridOptions(opts);
    });

    this.syncEffect(() => {
      const source = this.serverSideDataSource();
      if (this.rowModelType() !== "serverSide" || !source) return null;
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
