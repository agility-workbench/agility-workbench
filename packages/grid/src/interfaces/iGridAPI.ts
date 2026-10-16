import {
  GridEventMap,
  GridEventName,
  GridEventPaginationChangedParams,
  Unsubscribe,
} from "../events/events";
import { ColumnState, GridId, IGridCore, RowData } from "./iGridCore";
import { ColDef } from "./column";
import { GridAction } from "../events/action";
import { CellRef, RowSelectionState, SelectionSnapshot } from "./selection";
import { IColumnModel } from "./iColumnModel";
import { IRowNode } from "./iRowNode";
import type { IBodyMenuAdapter } from "./iBodyMenuAdapter";
import type { IMenuAdapter } from "./iMenuAdapter";
import {
  GridOptions,
  QuickFilterBehavior,
  QuickFilterMatchMode,
  RowPinnedPosition,
  RuntimeGridOptions,
  TreeDataKeyboardNavigationMode,
  TreeDataKeyboardNavigationOptions,
  UpdatableGridOptions,
} from "./gridOptions";
import { GridViewColumnGroupState, GridViewFilterState, GridViewState } from "./gridView";
import { QuickFilterFindMatch, QuickFilterFindState } from "./find";
import { ColumnAggregate } from "./aggregate";
import { PivotResultColumnDescriptor } from "./pivot";
import { SetFilterMode } from "./filter";
import { SetFilterSelection } from "../filter/setFilterCore";
import { SetFilterTreeNode } from "../filter/setFilterTree";
import { RowTransaction, RowTransactionResult, ServerSideRefreshOptions } from "./iRowModel";
import { GridHistoryState } from "../core/historyModel";
import type { SortDir } from "./sort";
import type { KeyboardShortcutInfo } from "../renderer/interaction/keyboardRouter";
import type { GridShortcut } from "../renderer/interaction/shortcutPolicy";
import type { GridLocaleKey } from "./locale";
import type { Column } from "../column/column";

export type NavDir = "up" | "down" | "left" | "right";

/**
 * Where a row should end up when scrolled to. "auto" scrolls the least amount needed and leaves an
 * already-visible row where it is; the others place the row deliberately even when it is already on
 * screen. "top" means the top of the usable viewport — below any sticky group headers docked there.
 */
export type RowScrollPosition = "auto" | "top" | "middle" | "bottom";

/** Which rows/columns an export covers. */
export type {
  ExportScope,
  ExcelExportRowType,
  ExcelExportCellStyle,
  ExcelExportCellParams,
  ExcelExportCellResult,
  ExcelExportCellProcessor,
  ExportParams,
  CsvExportRowType,
  CsvExportCellParams,
  CsvExportCellProcessor,
  CsvExportHeaderParams,
  CsvExportHeaderProcessor,
  CsvExtraContent,
} from "./exportParams";
import type { ExportParams } from "./exportParams";

/**
 * One entry of the grid's sort model. The model is a list in priority order: entry 0 sorts first,
 * each later entry breaks the ties of the ones before it.
 */
export interface SortModelItem {
  /**
   * The sorted column's public `ColDef.colId`. The auto-group column and generated pivot columns
   * appear (and are addressed) by their own colIds.
   */
  colId: string;
  dir: SortDir;
}

/** What {@link IGridAPI.refreshCells} repaints, and how. */
export interface RefreshCellsParams {
  /** Rows to repaint, by row id. Omitted = every rendered row (body, frozen bands, sticky rows). */
  rowIds?: GridId[];
  /** Columns to repaint, by colId (instance id and key also resolve). Omitted = every column. */
  colIds?: string[];
  /**
   * Destroy and recreate each affected custom cell renderer instead of calling its `refresh()`.
   * The grid does no change detection when it repaints (every affected cell is re-run), so this
   * is only needed for a renderer whose `refresh()` would keep state it should not.
   */
  force?: boolean;
}

/** What {@link IGridAPI.redrawRows} rebuilds. */
export interface RedrawRowsParams {
  /** Rows to rebuild, by row id. Omitted = every rendered row. */
  rowIds?: GridId[];
}

/** What {@link IGridAPI.flashCells} highlights, and for how long. */
export interface FlashCellsParams {
  /** Rows to flash, by row id. Omitted = every rendered row. */
  rowIds?: GridId[];
  /** Columns to flash, by colId (instance id and key also resolve). Omitted = every column. */
  colIds?: string[];
  /**
   * How long the highlight holds before fading, in ms. Defaults to the `cellFlashDuration` grid
   * option, else 500.
   */
  flashDuration?: number;
  /** How long the fade takes, in ms. Defaults to the `cellFadeDuration` grid option, else 1000. */
  fadeDuration?: number;
}

/**
 * A partial pagination change for {@link IGridAPI.setPagination}. Fields left out keep their
 * current value, except that a new `pageSize` without a `pageIndex` returns to the first page (as
 * the footer's page-size selector does).
 */
export interface PaginationUpdate {
  /** Turn pagination on or off. Turning it off (or leaving it off) always lands on page 0. */
  enabled?: boolean;
  /** 0-based page to show, clamped to the known page range. */
  pageIndex?: number;
  /** Rows per page; a positive integer. Need not be one of `pageSizes` (the selector lists those). */
  pageSize?: number;
}

/** One entry of {@link IGridAPI.setColumnWidths}: the same shape as a `ColumnState` width. */
export interface ColumnWidthItem {
  colId: string;
  widthPx: number;
}

/**
 * {@link IGridAPI.scrollTo}'s target: absolute body scroll offsets in CSS pixels. An omitted axis
 * keeps its current offset.
 */
export interface GridScrollPosition {
  /** The body's vertical offset (0 = first row at the top). */
  topPx?: number;
  /** The centre section's horizontal offset (pinned sections never scroll). */
  leftPx?: number;
}

/** The parameters of {@link IGridAPI.addSparklineColumn}. */
export interface AddSparklineColumnParams {
  /** The leaf columns whose values make each row's series, in point order. Groups are skipped. */
  colIds: string[];
  sparklineType: "line" | "bar" | "area";
  /**
   * The column whose `valueFormatter` formats the tooltip's point values, ahead of the other
   * selected columns' (the column menu passes the column it was opened on). Defaults to the first
   * of `colIds`.
   */
  targetColId?: string;
  /** The new column's colId; a fresh `sparkline_<uuid>` when omitted. */
  colId?: string;
}

export interface GridApiConfigController {
  setToolbarOptions: (options: GridOptions["toolbar"]) => void;
  setQuickFilterOptions: (options: GridOptions["quickFilter"]) => void;
  setTooltipOptions: (options: GridOptions["tooltip"]) => void;
  setColumnPanelOptions: (options: GridOptions["columnPanel"]) => void;
  setSavedViewsOptions: (options: GridOptions["savedViews"]) => void;
  setSheetsOptions: (options: GridOptions["sheets"]) => void;
  setRowSelectionOptions: (options: GridOptions["rowSelection"]) => void;
  setPinnedRowOptions: (options: {
    pinnedTopRowData?: RowData[];
    pinnedBottomRowData?: RowData[];
    isRowPinned?: GridOptions["isRowPinned"];
    groupRowsSticky?: boolean;
  }) => void;
  togglePagination: (enabled: boolean) => void;
  setPaginationControls: (options: GridOptions["paginationControls"]) => void;
  setTheme: (theme: GridOptions["theme"]) => void;
  setHeaderHeights: (
    heights: Partial<Pick<GridOptions, "headerHeight" | "leafHeaderHeight" | "parentHeaderHeight">>,
  ) => void;
  setIcons: (icons: GridOptions["icons"]) => void;
  setRuntimeOptions: (options: RuntimeGridOptions) => void;
  setServerSideDataSource: (dataSource: GridOptions["serverSideDataSource"]) => void;
  setServerSideAggregation: (source: GridOptions["serverSideAggregationSource"]) => void;
}

/**
 * Keyboard-shortcut hooks provided by the renderer once it is attached (it owns the keyboard
 * router). Internal wiring for {@link IGridAPI.registerShortcut} and
 * {@link IGridAPI.getKeyboardShortcuts}: hosts call those, not this.
 */
export interface GridApiShortcutController {
  register: (shortcut: GridShortcut) => () => void;
  getShortcuts: () => readonly KeyboardShortcutInfo[];
}

/**
 * The grid's public API. `TData` is the row type (default `any`): it types the rows and row nodes
 * the API takes and returns (`setRowData`, `getSelectedRows`, `getRowNode`, `forEachNode*`,
 * `applyTransaction`, …), the column definitions (`ColDef<TData>`), `getGridOption`,
 * `updateGridOptions`, and the click payloads `on` hands its handlers. `createGrid<TData>` and the
 * framework bindings return / expose an `IGridAPI<TData>`.
 */
export interface IGridAPI<TData = any> {
  /** The underlying grid core (state + dispatch + event emission). */
  getCore(): IGridCore;

  /**
   * One of the grid's own user-visible strings, translated the way the grid translates it: the
   * `getLocaleText` option, else the `localeText` entry, else the English default
   * (`DEFAULT_LOCALE_TEXT`), with `{placeholder}`s filled from `variableValues`. For custom header
   * components, cell renderers and menu items that should read like the grid around them:
   *
   * ```ts
   * api.getLocaleText("sortAscending");                     // "Sort Ascending"
   * api.getLocaleText("pageOfTotal", { page: 2, total: 9 }); // "Page 2 of 9"
   * ```
   *
   * For a `…One` / `…Other` pair, pick the key from the count yourself and pass `{ count }`.
   */
  getLocaleText(key: GridLocaleKey, variableValues?: Record<string, string | number>): string;

  /**
   * Show the loading overlay (spinner + `loadingMessage`) until {@link hideOverlay} — the
   * imperative form of the wrappers' `loading` input. The no-rows overlay is held back meanwhile.
   */
  showLoadingOverlay(): void;

  /**
   * Show the no-rows overlay now, whatever the row count, with the message the grid would choose
   * (`noRowsMessage`, or the filtered-out wording while a filter or search is active). Hides the
   * loading overlay. The next data change re-decides it: the overlay stays only while the view is
   * really empty.
   */
  showNoRowsOverlay(): void;

  /**
   * Hide the loading overlay, and the no-rows overlay unless the view is actually empty (an empty
   * view always shows it).
   */
  hideOverlay(): void;

  /**
   * Reconfigure a mounted grid in place. Only the properties present in `options` change; a property
   * present with the value `undefined` is reset to the grid's default (that is how a callback such as
   * `getRowStyle` is removed). Object values replace wholesale — they are not deep-merged.
   *
   * This is the framework-neutral equivalent of changing a prop on the React or Angular wrapper, and
   * it preserves scroll position, selection, focus, and edit history:
   *
   * ```ts
   * api.updateGridOptions({ toolbar: { sorting: true }, zebraRows: false });
   * api.updateGridOptions({ getRowStyle: undefined });   // back to the default
   * ```
   *
   * Options that seed structure (`rowHeight`, `rowNumbers`, `rowModelType`, row identity) are not
   * updatable — see {@link UpdatableGridOptions}. Unknown keys are ignored with a warning.
   */
  updateGridOptions(options: UpdatableGridOptions<TData>): void;

  /**
   * The current value of one grid option: the value last supplied for it — to
   * {@link updateGridOptions} (which is what a wrapper prop change goes through), else at
   * creation — returned as given, the same reference, not copied or normalized (an object
   * `rowSelection` reads back as that object).
   *
   * No defaults are filled in: an option that was never set, or was last set to `undefined` (the
   * reset), reads `undefined`, and the grid applies the default its documentation states. So
   * `getGridOption("rowHeight")` is `undefined` unless the app chose a row height.
   *
   * The exceptions are `pivotMode` and `pivotColumns`, which seed model state the grid owns
   * afterwards (the user toggles pivot mode from the panel): they read the live state, as
   * {@link getPivotMode} and {@link getPivotColumns} do. Other state that starts from an option
   * and then moves on its own (the page size, a sort seeded by `initialSort`) has its own getter
   * and is not reflected here.
   *
   * ```ts
   * api.updateGridOptions({ zebraRows: true });
   * api.getGridOption("zebraRows"); // true
   * ```
   */
  getGridOption<K extends keyof GridOptions>(key: K): GridOptions<TData>[K];

  /**
   * Install (or, with `null`, remove) the column-menu adapter on a mounted grid — the deferred form
   * of `createGrid`'s `menuAdapter` option, for a host that does not know its adapter at creation
   * time. The adapter is consulted when a menu opens, so a swap needs no rebuild and takes effect on
   * the next open; a menu that is already open keeps the items and cleanup it was given.
   *
   * Most hosts should not need this. Application-owned items belong in `ColDef.columnMenu` (one
   * column) or `GridOptions.multiColumnMenu` (a selection), both of which run *before* the adapter.
   * An adapter earns its keep when items are rendered by a framework and must be torn down again —
   * that is what its `cleanup` return exists for, and why the React and Angular bindings use one.
   */
  registerMenuAdapter(adapter: IMenuAdapter | null): void;

  /**
   * Install (or, with `null`, remove) the body context-menu adapter on a mounted grid. Same timing
   * and same trade-off as {@link IGridAPI.registerMenuAdapter}: application-owned items belong in
   * `GridOptions.bodyContextMenu`, which is itself updatable via `updateGridOptions` and runs before
   * the adapter.
   */
  registerBodyMenuAdapter(adapter: IBodyMenuAdapter | null): void;

  /**
   * Register an application keyboard shortcut on this grid instance. It fires only while focus is
   * inside this grid (the listener lives on the grid root), below every built-in binding — or above
   * the non-blocking ones with `override: true`. Returns the disposer; registering is idempotent to
   * dispose twice, so framework cleanup (React StrictMode) is safe.
   *
   * Refused with a thrown error: reserved chords (Tab and Escape always; navigation keys while the
   * feature that claims them is on — see the error message for which switch frees the key),
   * `mod+alt+<printable>` chords (Windows AltGr), and a duplicate live `id` or duplicate
   * unconditional chord. A shortcut registered while a feature was off goes dormant if the feature
   * is later re-enabled, and wakes when it is disabled again.
   *
   * ```ts
   * const off = api.registerShortcut({
   *   id: "approve",
   *   chord: "mod+shift+y",
   *   label: "Approve the selected rows",
   *   run: () => approveRows(api.getSelection()),
   * });
   * ```
   */
  registerShortcut(shortcut: GridShortcut): () => void;

  /**
   * Every keyboard binding currently registered — built-ins and application shortcuts — innermost
   * scope first, as data for a shortcut-reference UI. Format each row's `chord` for the user with
   * `formatChord`. Pattern bindings (type-to-edit) appear without a `chord`.
   */
  getKeyboardShortcuts(): readonly KeyboardShortcutInfo[];

  /**
   * Dispatch an action to the core — the low-level door the typed methods go through. Prefer the
   * typed methods: every action an application has a use for has one (`setColumnWidth` for
   * `columnResize`, `moveColumns` for `columnMove`, `setGroupExpanded` for `groupToggleExpand`,
   * `applyTransaction` for `rowTransactionApply`, `addSparklineColumn`, …).
   *
   * The rest are renderer-internal and have no typed form on purpose: `init`, the header's click
   * and keyboard handling (`headerAction`, `headerFocusSet`, `headerNavigate`), tree keyboard
   * navigation (`treeNavigate`) and font measurement (`themeFontSet`). `scrollSet`,
   * `viewportResize`, `rowHeightSet`, `overscanSet` and `destroy` are not handled by the core at
   * all — dispatching one does nothing; use {@link scrollTo} and {@link destroy}.
   */
  dispatch(action: GridAction): void;

  /** Subscribe to core events. */
  on<E extends GridEventName>(event: E, handler: (ev: GridEventMap<TData>[E]) => void): Unsubscribe;

  /**
   * The current column state: one entry per non-internal leaf in display order, with its width,
   * pinning, visibility, order, and sort (`sort` is `null` and `sortIndex` is `null` for an
   * unsorted column; `sortIndex` is the column's index in {@link getSortModel}).
   */
  getColumnState(): ColumnState[];

  /**
   * Restore a previously-captured column layout (widths / pinning / visibility / order / sort). By
   * default merges over the current columns: unknown colIds are ignored and columns absent from
   * `state` keep their place. Pass `opts.defaultState` to apply a fallback to those absent columns
   * instead — e.g. `{ hidden: true }` for an exact restore that hides everything not in the saved
   * view (including columns added since it was captured).
   *
   * Sort is applied only from entries that carry a `sort` field: a direction sorts the column at
   * its `sortIndex` in the model (appended when it has none), `null` clears it, and columns whose
   * entry has no `sort` keep theirs. `defaultState: { sort: null }` clears every other sort (the
   * auto-group and pivot columns' included); a non-null `defaultState.sort` is ignored. The layout
   * applies first and the sort second, so a call that changes both emits `columnsChanged` twice
   * (`reason: "state"`, then `reason: "sort"`).
   */
  applyColumnState(state: ColumnState[], opts?: { defaultState?: Partial<ColumnState> }): void;

  /* ----- Sorting ----- */
  /**
   * The sort model: every sorted column with its direction, in priority order (entry 0 sorts
   * first). A copy — mutating it changes nothing. Empty when nothing is sorted.
   */
  getSortModel(): SortModelItem[];
  /**
   * Replace the whole sort model with `items`, in priority order. `[]` clears every sort. Entries
   * for unknown or non-sortable columns are skipped, as are repeats of a colId (the first wins) and
   * entries whose `dir` is `null`, so a toggle can pass its result straight through. A model equal
   * to the current one changes nothing and emits nothing; otherwise this behaves exactly like a
   * header-click sort: `columnsChanged` with `reason: "sort"`, `onSortChanged`, the page follows
   * `resetPageOn`, the cell range clears, and row selection follows `selectionPersistence`.
   *
   * ```ts
   * api.setSortModel([{ colId: "region", dir: "asc" }, { colId: "revenue", dir: "desc" }]);
   * ```
   */
  setSortModel(items: ReadonlyArray<SortModelItem | { colId: string; dir: null }>): void;

  /* ----- Column sizing ----- */
  /**
   * Fit the named columns to their content (header and cell values), dropping any width the user
   * dragged — what double-clicking a resize handle does. A column group sizes each of its visible
   * leaves. Unknown colIds are skipped. Emits ONE `columnWidthsChanged` (`final: true`) for the
   * whole batch, and none when no column resolves.
   */
  autoSizeColumns(colIds: string[]): void;
  /**
   * {@link autoSizeColumns} for every visible column except the row-number and selection-checkbox
   * columns (the auto-group column included).
   */
  autoSizeAllColumns(): void;
  /**
   * Set one column's width in pixels, as dragging its resize handle to that width would: clamped
   * to the column's `minWidth` / `maxWidth` (falling back to the grid's `minResizeWidth` /
   * `maxColumnWidth`, the floor applying either way), and kept across later
   * autosizes. A column group spreads the width over its visible leaves. The row-number column is
   * fixed. Emits one `columnWidthsChanged` (`final: true`) when the width changed.
   */
  setColumnWidth(colId: string, widthPx: number): void;
  /**
   * {@link setColumnWidth} for several columns in one pass: one `columnWidthsChanged` for the
   * batch, one relayout. Unknown colIds and non-finite widths are skipped.
   */
  setColumnWidths(widths: ColumnWidthItem[]): void;
  /**
   * Resize the centre (unpinned) section's visible columns so together they fill its viewport
   * exactly, keeping their relative widths. Pinned sections are left alone (they are width-clamped
   * and never scroll), as are columns with `resizable: false` and the row-number / selection-
   * checkbox columns; each fitted column stays within the bounds {@link setColumnWidth} applies, so
   * the fit can fall short (or overflow) when those bounds cannot reach the
   * viewport. The widths are recorded as user widths (they survive later autosizes) and applied in
   * one batch: one `columnWidthsChanged`. No-op before the grid is rendered and laid out.
   */
  sizeColumnsToFit(): void;

  /* ----- Column pinning, visibility and order ----- */
  /**
   * Pin one or more columns to the left or right section, or unpin them with `null` — what the
   * column menu's Pin items do. A group pins as a whole. Columns that cannot be pinned (the
   * row-number column, generated pivot columns, the selection-checkbox column unless
   * `rowSelectionCheckboxColumnPinnable`) are skipped. A column with `lockPosition` can be pinned
   * and lands at its edge of the new section. Emits `columnsChanged` with `reason: "pin"` and
   * `source: "api"`; nothing when no column resolves.
   */
  setColumnPinned(colIds: string | string[], pinned: "left" | "right" | null): void;
  /**
   * Show or hide columns — what the column menu's Hide item and the column panel's checkboxes do.
   * Hiding skips `hideable: false` columns (showing one always works) and the row-number /
   * selection-checkbox columns. Emits `columnsChanged` with `reason: "visibility"` and
   * `source: "api"`; nothing when no column is left to change.
   */
  setColumnsVisible(colIds: string[], visible: boolean): void;
  /** {@link setColumnsVisible} for one column. */
  setColumnVisible(colId: string, visible: boolean): void;
  /**
   * Move a column so it sits at `toIndex` of the order {@link getColumnState} returns — every
   * non-internal leaf, hidden ones included, left section then centre then right. A shorthand for
   * {@link moveColumns} with one column; the rules there apply.
   */
  moveColumn(colId: string, toIndex: number): void;
  /**
   * Move columns, in the order given, so they start at `toIndex` of the order
   * {@link getColumnState} returns (every non-internal leaf, hidden ones included: left section,
   * then centre, then right) — the API form of a header drag. Rules:
   * - A column stays in its section: `toIndex` is clamped to that section's range (an index past
   *   the centre section's end puts a centre column last in the centre). Pin with
   *   {@link setColumnPinned} to move between sections.
   * - Columns with their own `lockPosition`, `movable: false` columns, the row-number and selection
   *   columns and generated pivot columns are skipped. Locked columns keep their edge, so an index
   *   among them lands next to them.
   * - A column inside a group leaves the group (it is split, as a drag does) when the target is
   *   outside it; passing the group's colId moves the whole group.
   * - No-op while pivot mode displays generated columns.
   *
   * Emits one `columnsChanged` with `reason: "order"` and `source: "api"`; nothing when no column
   * moved.
   *
   * ```ts
   * api.moveColumns(["price", "qty"], 0); // first two centre columns (when nothing is pinned left)
   * ```
   */
  moveColumns(colIds: string[], toIndex: number): void;

  /**
   * Add a sparkline column — what the column menu's "Add sparkline" item does: one centre column,
   * appended last, whose cell draws each row's values of `colIds` as a line, bar or area chart (a
   * group row draws the columns' group values). The column is transient: it survives moves, hides
   * and resizes, but the next {@link setColumnDefs} that does not list it drops it.
   *
   * Returns the new column's colId, or `null` when none of `colIds` names a leaf column (nothing is
   * added). A `colId` that is already taken returns that existing column without adding one. Emits
   * `columnsChanged` with `reason: "add"` and `source: "api"`.
   *
   * ```ts
   * api.addSparklineColumn({ colIds: ["q1", "q2", "q3", "q4"], sparklineType: "line" });
   * ```
   */
  addSparklineColumn(params: AddSparklineColumnParams): string | null;

  /**
   * Every column group's expander state (open or closed) by the group's colId — nested groups
   * included, in header order. While pivoted this describes the user's own groups, as
   * `getColumnState` describes the source columns.
   */
  getColumnGroupState(): GridViewColumnGroupState[];

  /**
   * Open or close column groups by colId, in one rebuild — what the header expander does, with the
   * same follow-ups (the leaves a group reveals are sized to content). Groups absent from the list
   * keep their state; unknown colIds and leaves are skipped, and a group already in the requested
   * state is left alone, so a call that changes nothing rebuilds nothing. A single group is a
   * one-element list.
   */
  setColumnGroupState(groups: GridViewColumnGroupState[]): void;

  /** Read-only access to the column model (columns, leaves, lookups). */
  getColumnModel(): IColumnModel;

  /**
   * The application's column with this id — tolerant like every column-id input here (instance id,
   * then public colId, then `key`) — or `undefined` for an unknown id and for the grid's internal
   * columns (row numbers, selection checkbox, auto-group, generated pivot columns). While pivoted
   * it finds the source columns, as {@link getColumnState} describes them. The returned `Column`
   * is the grid's live object: read it, change columns through the API.
   */
  getColumn(colId: string): Column | undefined;
  /**
   * Every leaf column of the application's, hidden ones included, in display order (left section,
   * centre, right) — the columns {@link getColumnState} describes, in the same order. Internal
   * columns are left out (see {@link getColumn}); while pivoted these are the source columns. A
   * new array each call; the `Column`s are the grid's live objects.
   */
  getColumns(): Column[];

  /**
   * Set the column definitions — the imperative form of `updateGridOptions({ columnDefs })`, and
   * equivalent to it for a non-empty array: both apply the defs and claim caller ownership of the
   * schema, so a server-sent schema (an SSRM response's `columns`) no longer replaces them.
   *
   * The two doors differ only at the edges, on purpose. `setColumnDefs([])` is a complete
   * statement — it clears the columns *and* keeps ownership — while `updateGridOptions({
   * columnDefs: [] })` clears only when the caller already owned the schema (a transient empty
   * array during a framework render must not discard a server schema). And only the options door
   * can *release* ownership: `updateGridOptions({ columnDefs: undefined })` hands the schema back,
   * letting the next server response supply the columns again.
   */
  setColumnDefs(defs: ColDef<TData>[]): void;

  /**
   * The column definitions as the grid holds them now, round-trippable:
   * `api.setColumnDefs(api.getColumnDefs())` changes nothing, and `createGrid(el, { columnDefs:
   * api.getColumnDefs() })` rebuilds the same columns.
   *
   * A fresh tree in the current display order and structure (groups with their `children`; a group
   * a move split appears once per piece). Each entry is the column's own definition as last applied
   * — before `defaultColDef` is merged in; functions and objects in it are the same references — with
   * the current state written over it:
   * - `colId`: always set (the generated one for a definition that had neither `colId` nor `key`).
   * - `width`: a leaf's current width in pixels. A group keeps its definition's.
   * - `pinned`: a top-level column's current section, `"left"` / `"right"`; removed when unpinned.
   * - `hidden`: `true` when hidden; removed when shown (`false` when `defaultColDef` hides).
   * - `sort` / `sortIndex`: the direction and the index in {@link getSortModel}; removed when unsorted.
   * - `aggFunc`: for a column in the aggregate model, its first assignment's function; otherwise
   *   the definition's own (which is also the column's default function) is kept.
   * - `openByDefault`: a group with an expander's current open state.
   *
   * Not included: the internal columns (row numbers, selection checkbox, auto-group, generated
   * pivot columns — while pivoted the source columns are returned). Not representable in a
   * definition, and kept by `setColumnDefs` on this grid because it reconciles them by colId: the
   * row-grouping columns ({@link getRowGroupColumns}), a column's second and later aggregates, and
   * sorts on internal columns (the auto-group column). Capture those with {@link captureViewState}
   * to carry them to another grid. A column added by {@link addSparklineColumn} is included; its
   * definition reads this grid's columns, so it does not carry over to another grid.
   */
  getColumnDefs(): ColDef<TData>[];

  /** Set the row data. */
  setRowData(rows: TData[]): void;

  /**
   * Visit every node the row model holds, filtered out or collapsed included: every data row first
   * (in source order client-side; loaded rows in server order server-side), then every group / tree
   * group node (`getGroupNodes()` order). `idx` counts across both. Application-pinned band rows
   * are not in the row model and are not visited.
   */
  forEachNode(callback: (node: IRowNode<TData>, idx: number) => void): void;
  /**
   * Visit every data row — every node that is not a group node (`isGroup` false), filtered out or
   * collapsed included, in the order {@link forEachNode} visits them. A tree-data parent that
   * carries its own data is a data row and is visited.
   */
  forEachLeafNode(callback: (node: IRowNode<TData>, idx: number) => void): void;
  /** Visit every row node that remains after filtering, before client-side sorting. */
  forEachNodeAfterFilter(callback: (node: IRowNode<TData>, idx: number) => void): void;
  /** Visit every row node that remains after filtering in its final sorted order. */
  forEachNodeAfterFilterAndSort(callback: (node: IRowNode<TData>, idx: number) => void): void;

  /**
   * Server-side row model only: re-invoke the data source because the server's data changed —
   * distinct from a plain redraw. `groupKeys` scopes the refresh to one group subtree (that
   * parent's listing and everything below it); `rowId` does the same for one row's subtree under
   * server-side tree data (`treeData: { mode: "server" }`); omitted = the whole store. The two
   * scopes are mutually exclusive. `purge: true` drops the affected rows and counts immediately
   * (loading state); the default keeps current rows rendered while blocks in the current view
   * refetch and swap in place, and drops off-screen blocks to reload lazily on scroll. Expansion
   * state is kept either way. Resolves true if a refresh was issued — false when the named
   * subtree is not one the store holds (an unknown group path, or a row that has never been
   * expanded, so nothing below it is loaded).
   */
  refreshServerSideData(options?: ServerSideRefreshOptions): Promise<boolean>;

  /** Replace the application-owned rows in the frozen top band. */
  setPinnedTopRowData(rows: TData[]): void;
  /** Replace the application-owned rows in the frozen bottom band. */
  setPinnedBottomRowData(rows: TData[]): void;
  /**
   * Explicitly mirror a displayed row-model node in a frozen band. Generated group node ids are
   * supported; pass null to unpin. When an {@link GridOptions.isRowPinned} callback is configured,
   * null is remembered as an explicit unpin override for that row — it wins over the callback until
   * the row is pinned again. The original row remains in the hierarchy.
   */
  setRowPinned(rowId: GridId, position: RowPinnedPosition | null): void;

  /**
   * Apply a transaction (removals, then updates, then additions) to the row data. Returns what was
   * actually applied; ids that match nothing are skipped and not counted.
   *
   * Server-side row model: the transaction mirrors a change the application has ALREADY made on
   * the server into the loaded rows, without a refetch — the grid tells the server nothing, and
   * later block fetches must agree with the result. Only loaded rows can be updated or removed;
   * additions go into the loaded listing `tx.route` names (root when omitted) at `tx.addIndex`.
   * Group-row aggregates are the server's and are not recomputed. Block fetches still in flight
   * for a listing whose indices shifted are discarded and re-requested.
   */
  applyTransaction(tx: RowTransaction<TData>): RowTransactionResult;
  /**
   * Mutate rows immediately, then defer filter/sort/group/aggregate derivation and rendering so
   * nearby calls share one pass. Resolves after that pass with this call's own counts. Works on
   * both row models, with the server-side contract of {@link applyTransaction}.
   */
  applyTransactionAsync(tx: RowTransaction<TData>): Promise<RowTransactionResult>;
  /** Immediately finalize any pending asynchronous transactions. No-op when none are pending. */
  flushAsyncTransactions(): void;

  /**
   * Set the quick-filter (global search) text. Client-side row model only.
   *
   * `behavior` chooses what the text does: "filter" narrows the rows, "find" leaves every row in
   * place and highlights the matching cells instead (see {@link QuickFilterBehavior}). It defaults
   * to whatever is in force — the `quickFilter.behavior` option, or the end user's choice when the
   * widget offers the toggle — so passing text alone never changes behavior.
   */
  setQuickFilter(
    text: string,
    opts?: { matchMode?: QuickFilterMatchMode; caseSensitive?: boolean; behavior?: QuickFilterBehavior },
  ): void;
  /** Current quick-filter text ("" when inactive). */
  getQuickFilterText(): string;
  /** Whether the quick filter currently filters rows or highlights matches. */
  getQuickFilterBehavior(): QuickFilterBehavior;

  /* ----- Quick-filter find ----- */
  /**
   * The find behavior's live state: how many cells the search matches, which one is active, and the
   * text being searched for. Reports 0 matches while the behavior is "filter", on the server-side
   * row model, and while the pivot layout is displayed (there are no data-row cells to find in).
   */
  getFindState(): QuickFilterFindState;
  /**
   * Step to the next find match in display order, wrapping at the end, and reveal it: collapsed
   * ancestors are expanded, the grid pages to it when paginated, and it is scrolled into view.
   * Returns the match, or null when the search has none. The cell cursor is deliberately NOT moved
   * — stepping through matches is a search gesture, not a navigation one, so whatever had keyboard
   * focus (usually the search box) keeps it.
   */
  findNext(): QuickFilterFindMatch | null;
  /** Step to the previous find match, wrapping at the start. @see findNext */
  findPrevious(): QuickFilterFindMatch | null;

  /* ----- Filtering ----- */
  /** Current per-column filters in serializable form (`colId` is the public ColDef colId). */
  getFilterModel(): GridViewFilterState[];
  /** Replace all column filters. Unknown colIds drop out; an empty array clears every filter.
   * Pagination follows `resetPageOn` (the current page is kept by default), row selection follows
   * `selectionPersistence`, and cell-range selection is always cleared. */
  setFilterModel(filters: GridViewFilterState[]): void;
  /** Add or replace the filter for one column, keeping every other column's filter. */
  addFilterModel(filter: GridViewFilterState): void;
  /** Remove one column's filter. No-op (no page reset, no selection clear) when it has none. */
  removeFilterModel(colId: string): void;

  /* ----- Set filter (columns with `filter: "set"`) -----
   * Intent-level helpers: express WHICH values are checked/unchecked and the set filter manages
   * its own storage. Inputs are resolved against the column's value universe (so a string "5"
   * finds the numeric 5 the rows hold); null addresses the "(Blanks)" bucket. All methods are
   * async because a column's filter values may come from an async source; with the default
   * from-rows universe they resolve immediately. On non-set columns they warn and no-op. */
  /** The column's full value universe (distinct values as shown in the menu; null = blanks). */
  getSetFilterValues(colId: string): Promise<unknown[]>;
  /** Intent-level view of the column's active set filter, or null when it has none (all values
   * visible). `mode` says what happens to values that arrive after filtering: "exclude" shows
   * them, "include" hides them. */
  getSetFilterState(colId: string): Promise<SetFilterSelection | null>;
  /** Check one value (make rows with it visible). No-op if already checked. */
  checkSetFilterValue(colId: string, value: unknown): Promise<void>;
  /** Uncheck one value (hide rows with it). No-op if already unchecked. */
  uncheckSetFilterValue(colId: string, value: unknown): Promise<void>;
  /**
   * Replace the column's set filter wholesale. With `mode: "include"` (default) `values` is the
   * checked set — everything else, including values that arrive later, is hidden. With
   * `mode: "exclude"` `values` is the unchecked set — everything else, including later arrivals,
   * stays visible. An explicit mode is pinned: subsequent menu or helper toggles keep the
   * representation instead of optimizing it to the shorter list.
   */
  setSetFilterValues(colId: string, values: unknown[], opts?: { mode?: SetFilterMode }): Promise<void>;
  /**
   * Tree layout (`filter: "tree"`): the value tree as the menu shows it — groups with `children`,
   * leaves with their `value`, each with its label, count (when `showValueCounts` is on) and
   * checked state ("mixed" for a partly checked group) — or null for a column without the tree
   * layout. The blanks bucket is a root leaf with `value: null` and an empty path.
   */
  getSetFilterTree(colId: string): Promise<SetFilterTreeNode[] | null>;
  /**
   * Tree layout: check (show) every leaf under the group a path names, or the one leaf whose full
   * path it is. Segments compare by type and value as the tree built them — the built-in date path
   * uses numbers, `[2024, 1]` for January 2024. No-op when already checked; warns on an unknown path.
   */
  checkSetFilterPath(colId: string, path: unknown[]): Promise<void>;
  /** Tree layout: uncheck (hide) every leaf under the group a path names, or the leaf it names. */
  uncheckSetFilterPath(colId: string, path: unknown[]): Promise<void>;

  /** Current tree-data keyboard navigation mode. Non-tree grids always report "grid". */
  getKeyboardNavigationMode(): TreeDataKeyboardNavigationMode;
  /** Switch tree-data keyboard navigation immediately. No-op for "hierarchy" on non-tree grids. */
  setKeyboardNavigationMode(mode: TreeDataKeyboardNavigationMode): void;

  /**
   * Reconfigure the two `treeData` fields that are not structural: the navigation mode and whether
   * the fixed Ctrl/Cmd+Shift+Space switch is enabled. Presence decides what changes, as with
   * `updateGridOptions`, so either can be set alone:
   *
   * ```ts
   * api.setTreeDataKeyboardNavigationOptions({ enableKeyboardNavigationModeSwitch: true });
   * ```
   *
   * This is the configuration-driven counterpart of `setKeyboardNavigationMode`: a mode change made
   * here reports `source: "options"` on `keyboardNavigationModeChanged`, whereas
   * `setKeyboardNavigationMode` reports `source: "api"` for an imperative switch. The switch takes
   * effect on the next keystroke — no rebuild. The rest of `treeData` decides the row shape and
   * cannot change on a mounted grid; the whole call is a no-op on a grid without `treeData`.
   */
  setTreeDataKeyboardNavigationOptions(options: TreeDataKeyboardNavigationOptions): void;

  /** Expand or collapse every group/tree node in one pass — a single view rebuild and repaint,
   * unlike dispatching one groupToggleExpand per node. No-op when the grid is not grouped. */
  setAllGroupsExpanded(expanded: boolean): void;

  /**
   * Expand or collapse the named group/tree nodes in one pass — a single view rebuild and repaint
   * for the whole list, where `groupToggleExpand` costs one per node. Ids that name no group are
   * ignored; nothing is rebuilt when every named node is already in the requested state. No-op
   * when the grid is not grouped. Group ids come from `getGroupNodes()` / `getRowNode(id)`.
   */
  setGroupExpanded(groupIds: string | string[], expanded: boolean): void;

  /**
   * Every group / tree node currently in the model, at every level, in creation order. Empty when
   * the grid is not grouped. Group nodes are not visited by `forEachNodeAfterFilter*`, which walk
   * data rows; use this to address a group — for example to pin one with `setRowPinned`.
   */
  getGroupNodes(): IRowNode<TData>[];

  /**
   * The row model's node for `rowId`: a data row, a client-side group or tree node (its id is the
   * one `getGroupNodes()` reports), or an application-pinned band row. Server-side, a loaded leaf
   * or group row. `undefined` for an id the grid does not hold — including a
   * group id from before a regroup, which mints new group nodes.
   *
   * ```ts
   * const node = api.getRowNode("region:EMEA");
   * if (node?.isGroup) console.log(node.groupKey, node.level, node.children?.length);
   * ```
   */
  getRowNode(rowId: GridId): IRowNode<TData> | undefined;

  /**
   * The raw value a cell holds — unformatted. On a leaf row, the column's value for that row (its
   * `valueGetter`, else the data field). On a group row, the group cell value: the aggregate for
   * that column, else the group label on the group's label column, else the column's
   * `groupValueGetter` result, else `undefined`. The row resolves like `getRowNode` (application-
   * pinned band rows included). The column resolves by the instance id an emitted ref carries,
   * else by public colId, instance id or key, else the auto-group column by its colId; so a
   * `cellClicked` payload's ref reads back directly. `undefined` for a row or column the grid does
   * not hold. Mirrors `setCellValue`.
   *
   * ```ts
   * // In a cell renderer: read a sibling column's value on the same row — on a group row, its
   * // aggregate.
   * const revenue = params.api.getCellValue({ rowId: params.rowId, colId: "revenue" });
   * ```
   */
  getCellValue(cell: CellRef): unknown;

  /* ----- Pivot ----- */
  /**
   * Turn pivot mode on or off. On: rows display as the row-group tree (leaf rows never show) and
   * the header is generated from data — one nested column group per distinct value of each pivot
   * column, one value leaf per aggregated column; non-participating source columns are hidden.
   * Off restores the source columns exactly. Client-side row model only; mutually exclusive with
   * tree data.
   */
  setPivotMode(on: boolean): void;
  getPivotMode(): boolean;
  /**
   * Pivot mode is on but no row group, pivot column or value is configured yet — the grid
   * displays no columns and no rows, showing its blank-pivot message instead
   * (`pivotEmptyMessage`). Exposed so an app driving its own pivot UI can react to the same state
   * the grid's column panel does.
   */
  isPivotUnconfigured(): boolean;
  /**
   * Replace the set of columns pivoted on (order = pivot level), by colId. Stored even while
   * pivot mode is off; an empty array clears the pivot columns but leaves the mode alone (the
   * degenerate grouped-aggregate view). Non-pivotable and unknown colIds are skipped.
   */
  setPivotColumns(colIds: string[]): void;
  /** The pivot columns' colIds, in level order. */
  getPivotColumns(): string[];
  /** Descriptors of the current generated pivot value columns, in header order. */
  getPivotResultColumns(): PivotResultColumnDescriptor[];
  /**
   * Replace the manual arrangement of the generated pivot columns: the displayed leaf order, by
   * generated colId (`pivotColumnMoveMode: "free"` drags produce these; the split header tree is
   * derived from the order). Null restores the canonical discovery layout. Explicit role edits
   * (`setAggregates`, `setPivotColumns`) reset it; data- and filter-driven re-discoveries keep it.
   */
  setPivotColumnOrder(order: string[] | null): void;
  /** The manual arrangement of the generated pivot columns, or null when the layout is canonical. */
  getPivotColumnOrder(): string[] | null;

  /**
   * Replace the row-grouping columns (order = grouping level), by colId. An empty array clears
   * all grouping. Non-groupable and unknown colIds are skipped.
   */
  setRowGroupColumns(colIds: string[]): void;
  /** The row-grouping columns' colIds, in level order. */
  getRowGroupColumns(): string[];
  /**
   * Replace the aggregate assignments (grid footer totals, group-row totals, and pivot measures),
   * by colId. A column may appear several times with different types — each is a distinct
   * measure; entry order sets the generated pivot column order. An empty array clears all
   * aggregates (including the ones `ColDef.aggFunc` seeded). Unknown colIds are skipped.
   *
   * `type` is a built-in `AggregateType` (`"first"` / `"last"` included) or the name of a function
   * in `GridOptions.aggFuncs`; an unknown name warns once and the column's default function
   * (`ColDef.aggFunc`, else sum/count) is used instead. On the server-side row model any name is
   * accepted and travels to the server unchanged in the aggregate request — the server computes it.
   */
  setAggregates(aggregates: ColumnAggregate[]): void;
  /** The current aggregate assignments by colId, in model order (custom names as given). */
  getAggregates(): ColumnAggregate[];

  /** Capture serializable column, grouping, sorting, filtering, expansion, and page state. */
  captureViewState(): GridViewState;
  /** Apply a captured view through the grid's existing state actions. */
  applyViewState(state: GridViewState, opts?: { columns?: "exact" | "merge" }): void;

  /* ----- Selection ----- */
  /**
   * Make a cell the active cell (a 1×1 selection) and scroll it into view — what a click or an
   * arrow key does. Two forms:
   * - `setFocusedCell(cell)`: by {@link CellRef}, the pair of {@link getFocusedCell}; the only form
   *   that reaches a pinned top/bottom row (`cell.rowPinned`, which must name the band the row is
   *   in; a `pinnedTopRowData` / `pinnedBottomRowData` row goes by the band-scoped id the grid
   *   gives it, as `getFocusedCell` and `getRenderedNodes` report it). Columns resolve like every
   *   column-id input (`colInstanceId`, then `colId`, then `key`).
   * - `setFocusedCell(viewIdx, colIdx)`: by page-relative view index and index among the visible
   *   leaves (the leading row-number / selection columns included), body rows only.
   *
   * No-op for a row that has no slot on the current page (unknown, filtered out, under a collapsed
   * group, on another page) or a hidden or unknown column. Emits `selectionChanged` and
   * `focusChanged` with `reason: "api"`.
   */
  setFocusedCell(cell: CellRef): void;
  setFocusedCell(viewIdx: number, colIdx: number): void;
  /**
   * The active cell — the one a click, keyboard navigation or {@link setFocusedCell} last made the
   * cursor, the corner a range extends from — as a {@link CellRef} (`rowPinned` set for a pinned
   * band's row), or `null` when there is none: nothing selected, a column selection, the header
   * holding the keyboard cursor, or a row not loaded yet (server-side). On the row-number column
   * (row selection's keyboard stop) it names that column's colId. Independent of DOM focus: the
   * grid keeps its active cell while focus is elsewhere on the page.
   */
  getFocusedCell(): CellRef | null;
  /** Start a range selection at a cell (collapses to a single cell). */
  selectRange(viewIdx: number, colIdx: number): void;
  /** Extend the current range's active corner to a cell. */
  extendRangeTo(viewIdx: number, colIdx: number): void;
  /** Move the selection by keyboard-style navigation. */
  navigate(dir: NavDir, opts?: { extend?: boolean; jump?: "edge" | "block" | "page"; pageRows?: number }): void;
  /** Jump the active cell to a grid corner (Ctrl+Home / Ctrl+End). */
  navigateToCorner(corner: "topLeft" | "bottomRight", opts?: { extend?: boolean }): void;
  /** Select the entire grid. */
  selectAll(): void;
  /**
   * Select/toggle a row by view index. Under `groupSelectsChildren` a group row (or tree parent)
   * stands for its subtree: "toggle" fills it when any of it is unselected and clears it when all
   * is, "replace" makes the subtree the whole selection, and a "range" over it takes its subtree.
   */
  selectRow(viewIdx: number, mode?: "replace" | "toggle" | "range"): void;
  /** Select/toggle a column by colId. */
  selectColumn(colId: string, mode?: "replace" | "toggle"): void;
  /** Clear all or part of the selection. */
  clearSelection(what?: "all" | "range" | "rows" | "columns"): void;
  /** Read the current selection snapshot. */
  getSelection(): SelectionSnapshot;
  /**
   * Underlying data objects of the currently-selected rows. Under a server-side select-all these
   * are the LOADED selected rows only — use `getRowSelectionState()` for the whole selection.
   */
  getSelectedRows(): TData[];
  /**
   * Currently-selected row nodes (unloaded / no-longer-present rows are omitted). Group rows are
   * never included, even fully selected ones under `groupSelectsChildren` — the selection holds
   * data rows only, so this always matches `getSelectedRows()` and `getSelection().selectedRowIds`.
   * Under a server-side select-all: the loaded selected rows only.
   */
  getSelectedNodes(): IRowNode<TData>[];
  /** Select every selectable data row in the select-all scope — the whole filtered set by
   * default, or the current page under `selectAllScope: "page"`. Skips group rows (under
   * `groupSelectsChildren` a group on the page contributes its leaves, collapsed ones included).
   * On the server-side row model the filtered scope selects every row the server's current query
   * returns, loaded or not — a select-all state with no exclusions (see `getRowSelectionState`). */
  selectAllRows(): void;
  /** Clear the row selection (ends a server-side select-all too). */
  deselectAllRows(): void;
  /**
   * Whether every selectable data row in the select-all scope is currently selected. Under a
   * server-side select-all: true while nothing is excluded.
   */
  areAllRowsSelected(): boolean;
  /**
   * Programmatic row selection by stable row id — for an external selection owner driving the
   * grid. "set" (default) replaces the selection; "add"/"remove" adjust it. Unknown or
   * non-selectable ids are dropped (client-side row model); the server-side model keeps ids of
   * rows it has not loaded. Under a server-side select-all "add" takes ids out of the exclusions,
   * "remove" excludes them, and "set" ends select-all with exactly these ids selected. Emits
   * selectionChanged reason "api".
   */
  selectRowsById(rowIds: GridId[], mode?: "set" | "add" | "remove"): void;
  /**
   * The row selection as a select-all flag plus the rows toggled away from it — the form a
   * server-side bulk operation needs. `{ selectAll: true, toggledRowIds }` means every row of the
   * server's current query (its filter and quick filter) EXCEPT `toggledRowIds`; `selectAll:
   * false` means exactly `toggledRowIds`. Only the server-side row model reports `selectAll:
   * true` (after `selectAllRows()` / the header checkbox in the default filtered scope); the
   * client-side model always reports its explicit ids. Returns a copy.
   */
  getRowSelectionState(): RowSelectionState;
  /**
   * Replace the row selection with a `{ selectAll, toggledRowIds }` state — e.g. one saved from
   * `getRowSelectionState()`. On the server-side model (filtered scope, multiple selection)
   * `selectAll: true` is kept as a select-all; elsewhere it resolves at once to the select-all
   * scope's selectable rows minus `toggledRowIds`. Ids of loaded rows `isRowSelectable` refuses
   * are dropped. Emits selectionChanged reason "api".
   */
  setRowSelectionState(state: RowSelectionState): void;

  /* ----- Editing ----- */
  /** Begin editing a cell. No-op if the column is not editable or the cell doesn't exist. */
  startEditingCell(cell: CellRef): void;
  /** Commit the current edit with the given raw value (passed through the column's valueParser). */
  stopEditing(value: unknown): void;
  /** Cancel the current edit without changing the cell value. */
  cancelEditing(): void;
  /** The cell currently being edited, or null when not editing. */
  getEditingCell(): CellRef | null;
  /**
   * Set a cell's value directly, bypassing the inline editor but running the rest of the write
   * pipeline (`onBeforeCellCommit`, then — only if the stored value actually changes —
   * `cellValueChanged` and one undo step; writing the value already present emits nothing and
   * records nothing).
   *
   * A **string** `value` is treated as user-style input and passed through the column's
   * `valueParser` — or, when it has none, the built-in parser for its `type` — and any other type
   * is taken as the final stored value. So `setCellValue(cell, 99)` stores the number 99,
   * `setCellValue(cell, "99")` stores 99 on a number column too, and `setCellValue(cell, "abc")`
   * on a number column is refused and writes nothing.
   */
  setCellValue(cell: CellRef, value: unknown): void;

  /* ----- Pagination ----- */
  /**
   * The current pagination state — the same object the `paginationChanged` event carries:
   * `{ paginationEnabled, pageIndex (0-based), pageSize, totalRowCount, totalPageCount,
   * totalRowCountKnown, pageSizes }`. Counts are over the filtered view; `totalRowCountKnown` is
   * false while a server-side total is still provisional. Also valid with pagination off
   * (`paginationEnabled: false`).
   *
   * ```ts
   * const { pageIndex, totalPageCount } = api.getPaginationInfo();
   * label.textContent = `Page ${pageIndex + 1} of ${totalPageCount}`;
   * ```
   */
  getPaginationInfo(): GridEventPaginationChangedParams;
  /**
   * Change pagination: turn it on or off, go to a page, or change the page size — any mix, merged
   * over the current state (see {@link PaginationUpdate}). `pageIndex` is clamped to
   * `[0, totalPageCount - 1]` while the total is known; while a server-side total is still
   * provisional (`totalRowCountKnown: false`) any page past the last loaded one is accepted, and
   * the grid snaps back to the real last page once the count is pinned. A change that would leave
   * the state as it is does nothing; otherwise `paginationChanged` fires once and the body scrolls
   * back to the top. An invalid `pageSize` is refused with a warning.
   */
  setPagination(update: PaginationUpdate): void;
  /** Go to a 0-based page (clamped as {@link setPagination} describes). No-op with pagination off. */
  goToPage(pageIndex: number): void;
  /** Go to the next page; no-op on the last known page or with pagination off. */
  nextPage(): void;
  /** Go to the previous page; no-op on the first page or with pagination off. */
  previousPage(): void;
  /** Go to the first page. No-op with pagination off. */
  firstPage(): void;
  /**
   * Go to the last page — while a server-side total is provisional, the last page loaded so far.
   * No-op with pagination off.
   */
  lastPage(): void;
  /** Change the page size and return to the first page (same as `setPagination({ pageSize })`). */
  setPageSize(pageSize: number): void;

  /* ----- Displayed rows -----
   * Indexes here are PAGE-RELATIVE view indexes, the space `selectRow`, `setFocusedCell` and the
   * rendered rows use: 0 is the first row of the current page (of the whole view when pagination
   * is off), counting group rows and the leaves of expanded groups in display order. Add
   * `pageIndex * pageSize` from `getPaginationInfo()` for the position in the whole list. */
  /**
   * How many rows the current page displays (the whole filtered view with pagination off): group
   * rows and the leaves of expanded groups, not rows inside collapsed groups. Application-pinned
   * band rows are not counted. Server-side, unloaded rows of the page count too.
   */
  getDisplayedRowCount(): number;
  /**
   * The node displayed at a page-relative view index (see above), or `undefined` past the end —
   * and server-side for a row that is not loaded yet.
   */
  getDisplayedRowAtIndex(viewIdx: number): IRowNode<TData> | undefined;
  /**
   * The page-relative view index of the first body row the grid has rendered, overscan rows
   * included; -1 before the grid is rendered or when no row is rendered.
   */
  getFirstDisplayedRowIndex(): number;
  /** The page-relative view index of the last rendered body row (overscan included); -1 when none. */
  getLastDisplayedRowIndex(): number;
  /**
   * The nodes the grid has rendered right now, in display order: the frozen top band, the body's
   * rendered window (overscan rows included; rows not loaded yet are skipped), the frozen bottom
   * band. Empty before the grid is rendered.
   */
  getRenderedNodes(): IRowNode<TData>[];

  /* ----- Scrolling ----- */
  /**
   * Scroll a row into view, doing whatever it takes to give it a slot first: collapsed group/tree
   * ancestors are expanded, and under pagination the grid pages to the row (one page change, so
   * `paginationChanged` fires once). Returns whether the row ended up visible — false means it has
   * no slot at all: an unknown id, a row the current filter excludes, or, on the server-side row
   * model, a row that is not loaded (the server owns the row order, so the grid cannot work out
   * which page an unloaded row is on — reveal it by paging or refiltering to it instead).
   *
   * A row mirrored into a frozen top/bottom band is already on screen; the band scrolls if it is
   * itself taller than the space it has.
   */
  ensureRowVisible(rowId: GridId, opts?: { position?: RowScrollPosition }): boolean;
  /**
   * Scroll a column into view horizontally. Returns whether the column is visible afterwards —
   * false for an unknown colId or a hidden column (including one hidden by a collapsed column
   * group; this does not expand groups). Leading, left- and right-pinned columns are always in
   * view, so revealing one is a no-op that reports true.
   */
  ensureColumnVisible(colId: string): boolean;
  /**
   * Scroll a cell into view on both axes — {@link ensureRowVisible} plus
   * {@link ensureColumnVisible}. Returns true only when both halves succeeded; the successful half
   * still scrolls (a row that exists is revealed even if the colId is bogus).
   */
  ensureCellVisible(cell: CellRef, opts?: { position?: RowScrollPosition }): boolean;
  /**
   * Scroll the body to absolute pixel offsets: `topPx` vertically, `leftPx` across the centre
   * section (the pinned sections do not scroll). An omitted or non-finite axis is left where it
   * is; negative offsets clamp to 0, and the browser clamps past-the-end ones to the scroll range.
   * The header, the frozen bands and the rendered row window follow as they do a user scroll. To
   * reveal a particular row or column, {@link ensureRowVisible} and {@link ensureColumnVisible}
   * work out the offset for you. No-op, with a warning, before the grid is rendered.
   *
   * ```ts
   * api.scrollTo({ topPx: 0 });              // back to the top, keep the horizontal position
   * api.scrollTo({ topPx: 0, leftPx: 0 });   // home
   * ```
   */
  scrollTo(position: GridScrollPosition): void;

  /* ----- Tooltips ----- */
  /** Programmatically show the tooltip for a body cell (bypasses the hover delay). No-op if the
   * cell resolves nothing to show or the grid isn't rendered yet. */
  showTooltip(cell: CellRef): void;
  /** Hide any visible tooltip. */
  hideTooltip(): void;

  /**
   * Re-evaluate `getRowPresentation` for rendered body and pinned rows. Use after external state
   * captured by the callback changes; row-data transactions already repaint affected rows.
   */
  refreshRowPresentation(): void;

  /* ----- Repainting ----- */
  /**
   * Re-run the value getters, formatters, cell classes/styles and cell renderers of rendered cells
   * — after something they read outside the row data changed (a lookup table, a locale, a flag a
   * renderer closes over). The data is not touched and nothing is re-derived (no re-sort, no
   * re-filter); rows scrolled out of view repaint when they scroll back in anyway. A custom renderer
   * is handed new params through its `refresh()` (returning false rebuilds it); `force: true`
   * rebuilds it outright. Cells of rows that are not rendered are skipped. No-op before render.
   */
  refreshCells(params?: RefreshCellsParams): void;
  /**
   * Rebuild rendered rows from scratch: destroy every cell renderer instance of each row and paint
   * it anew, row styling included. Heavier than {@link refreshCells}; for when a renderer must start
   * over. Rows that are not rendered are skipped. No-op before render.
   */
  redrawRows(params?: RedrawRowsParams): void;
  /**
   * Briefly highlight rendered cells — the change-flash renderer's neutral flash, without a value
   * change (to draw the eye to rows a server push just touched, say). Cells that are not rendered
   * are skipped; flashing a cell again restarts its flash. No new CSS: the highlight is the
   * `pte-cell-flash-neutral` / `pte-cell-flash-fading` classes and their theme variables
   * (`--pte-cell-flash-neutral-bg-color`, `--pte-cell-flash-fade-duration`). No-op before render.
   */
  flashCells(params?: FlashCellsParams): void;

  /* ----- ActionFrame ----- */
  /** Open the persistent ActionFrame (frame + form popover) on a body cell. Closes any open editor
   * or previously-open frame (only one at a time). No-op on a missing cell, on a group row that is
   * not cell-selectable (`groupRowsSelectable` off and not in pivot mode), and on a full-width
   * group row (`groupDisplayType: "groupRows"`) for any column but the nominal one — the first
   * non-leading leaf, which that row's single cell stands in for. */
  openActionFrame(cell: CellRef): void;
  /** Close any open ActionFrame. */
  closeActionFrame(): void;
  /** The cell with an open ActionFrame, or null. */
  getActionFrameCell(): CellRef | null;

  /* ----- Clipboard ----- */
  /** Copy the current selection to the clipboard as TSV. */
  copySelection(): void;
  /** Copy the current selection as TSV, then clear its editable cells. */
  cutSelection(): void;
  /** Paste the clipboard's first cell into the active cell (runs the column's valueParser). */
  paste(): Promise<void>;

  /* ----- Fill ----- */
  /**
   * Copy the selection's first row into the rows below it — what `Ctrl/Cmd+D` does. A single
   * selected row takes the row above it instead. Always a copy, never a series; the selection
   * stays where it is. One undo step. Returns the number of editable cells the fill wrote to (the
   * count it announces) — 0 when the fill handle is off, nothing is selected, the selection is on
   * pinned rows, or no cell could take a value.
   */
  fillDown(): number;
  /**
   * Copy the selection's first column into the columns to its right — what `Ctrl/Cmd+R` does. A
   * single selected column takes the column to its left instead. Otherwise as {@link fillDown}.
   */
  fillRight(): number;
  /**
   * Whether {@link fillDown} has at least one cell to write — the test behind the body menu's
   * "Fill down", for a toolbar button's enabled state. Depends on the selection, the cell values,
   * and the fill options: re-read it on `selectionChanged` and `cellsChanged`. Runs
   * `fillOperation` without writing, so that callback must be pure.
   */
  canFillDown(): boolean;
  /** Whether {@link fillRight} has at least one cell to write; see {@link canFillDown}. */
  canFillRight(): boolean;

  /* ----- Undo / redo ----- */
  /** Undo the last cell-edit step (single edit, paste, or cut). */
  undo(): void;
  /** Redo the last undone step. */
  redo(): void;
  /** Whether there is a step to undo. */
  canUndo(): boolean;
  /** Whether there is a step to redo. */
  canRedo(): boolean;
  /**
   * Undo/redo stack snapshot — `canUndo`/`canRedo` plus the depth of each stack. The same payload
   * the `historyChanged` event carries, for reading the state on demand (initial toolbar render)
   * rather than reacting to it.
   */
  getHistoryState(): GridHistoryState;
  /** Clear the undo/redo history. */
  clearHistory(): void;
  /**
   * Write many cells in one step. Each value runs the full write pipeline for its own destination
   * (the column's `valueParser`, then `onBeforeCellCommit`, which can transform or veto that cell),
   * emits one `cellValueChanged {source:"edit"}` per cell whose stored value actually changed, and
   * the changed cells land as a **single** undo step — the programmatic counterpart to a
   * multi-cell paste. Vetoed and unchanged cells drop out of the undo step and the events; an
   * all-unchanged batch records nothing. Under `readOnlyEdit` nothing is written and nothing
   * enters history.
   *
   * Values follow the same string-vs-typed rule as {@link setCellValue}, per cell.
   */
  setCellValues(edits: { cell: CellRef; value: unknown }[]): void;
  /**
   * Run `fn` with every cell write inside it coalesced into a **single** undo step, so a bulk
   * programmatic update (a loop of `setCellValue` calls, or several batches) undoes as one user
   * action instead of N. Returns whatever `fn` returns.
   *
   * Synchronous only: writes made after `fn` returns — inside a promise, timer, or event handler it
   * schedules — fall outside the group and record normally. Nested scopes inherit the outermost
   * mode, so a `withUndoGroup` helper called inside `withoutUndoHistory` stays suppressed.
   */
  withUndoGroup<T>(fn: () => T): T;
  /**
   * Run `fn` with undo recording suppressed — writes apply and emit their normal events, but
   * nothing enters history and the user's undo stack is left exactly as it was. For applying
   * external changes the user did not make (op-protocol reconciliation, server pushes, recomputed
   * derived columns), which should not be undoable as if they were the user's own edits.
   *
   * `applyTransaction` never enters undo history and needs no scope; this is for the cell-write
   * paths (`setCellValue`, `setCellValues`) that do. Same synchronous/nesting rules as
   * {@link withUndoGroup}.
   */
  withoutUndoHistory<T>(fn: () => T): T;

  /* ----- Export ----- */
  /**
   * Download the grid as a CSV file. No-op until the grid is rendered (the exporter is wired by the
   * renderer on attach).
   */
  exportDataAsCsv(params?: ExportParams<TData>): void;
  /** Download the grid as an Excel (.xlsx) file. No-op until the grid is rendered. */
  exportDataAsExcel(params?: ExportParams<TData>): void;
  /**
   * Return the CSV text for the current state + params WITHOUT downloading — for programmatic export
   * (upload, custom filename dialog, further processing). "" before the grid is rendered or when
   * there's nothing to export.
   */
  getDataAsCsv(params?: ExportParams<TData>): string;
  /**
   * Return the raw .xlsx bytes (Uint8Array) for the current state + params WITHOUT downloading — so
   * the caller decides what to do (stream to a server, encrypt/password-protect, wrap in a Blob,
   * upload, etc.). Empty Uint8Array before the grid is rendered or when there's nothing to export.
   */
  getDataAsExcel(params?: ExportParams<TData>): Promise<Uint8Array>;

  /**
   * Tear the grid down. On the api `createGrid` returns — the one the React and Angular bindings
   * hold, and the one cell renderers receive — this detaches the renderer, destroys it and the
   * core, once (a second call does nothing). On the bare api of `initDomRenderer` it only marks the
   * api destroyed; detaching is the caller's job there.
   */
  destroy(): void;
  /**
   * Whether {@link destroy} has been called — true from the start of the teardown on, so a cell
   * renderer's or a framework component's own cleanup can tell the grid is going away. Calls on a
   * destroyed grid do not throw, but they reach a detached renderer: reads report the last state,
   * and writes change model state no one will see. Check this rather than relying on either.
   */
  isDestroyed(): boolean;
}
