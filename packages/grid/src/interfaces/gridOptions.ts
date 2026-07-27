import { RowModelType } from "./iRowModel";
import { IServerSideDataSource } from "./serverSide";
import { GridIconMap } from "../theme/icons";
import type { GridTheme } from "../theme/theme";
import type { MenuItem } from "./menuItem";
import type { BodyMenuContext } from "../menu/bodyContext";
import type { IRowNode } from "./iRowNode";
import type { CellRenderer } from "../renderer/renderer";
import type { HeaderComponent } from "../renderer/header/headerComponent";
import type { TooltipComponent } from "../renderer/tooltip/tooltipComponent";
import type { TooltipComponentParams } from "../renderer/tooltip/tooltipComponent";
import type { ActionFrameComponent } from "../renderer/actionFrame/actionFrameComponent";
import type {
  GridEventCellClickedParams,
  GridEventRowClickedParams,
  GridEventSelectionChangedParams,
} from "../events/events";

/** Payload for the `onCellValueChanged` option: a cell edit was committed. */
export interface CellValueChangedParams {
  rowId: string;
  colId: string;
  /** The newly committed value. */
  value: unknown;
}

/** Payload for the `onSortChanged` option. */
export interface SortChangedParams {
  /** Column ids whose sort state changed (when known). */
  changedColIds?: string[];
}

/** Context passed to the row-level styling callbacks (`getRowClass` / `getRowStyle`). */
export interface RowClassParams {
  /** The row's underlying data object. */
  data: any;
  /** The row's stable id. */
  rowId: string;
  /** The row's current view index. */
  rowIndex: number;
  /** Whether this is a group (summary) row. */
  isGroup: boolean;
  /** The full row node. */
  node: IRowNode;
}

/**
 * Returns extra CSS class name(s) to apply to a row. May return a single class, a space-separated
 * string, an array of classes, or a falsy value for none. Recomputed as rows scroll into view.
 */
export type GetRowClass = (params: RowClassParams) => string | string[] | null | undefined;

/**
 * Returns inline styles to apply to a row (camelCase CSS properties), or a falsy value for none.
 * Recomputed as rows scroll into view. Only properties returned are managed by the grid; a property
 * that stops being returned is cleared on the next repaint.
 */
export type GetRowStyle = (params: RowClassParams) => Partial<CSSStyleDeclaration> | null | undefined;

/**
 * Customizes the body (right-click) context menu. Receives the menu context and the default items
 * the grid built for it; returns the items to actually show. Return `[]` to show no menu for this
 * context (the grid still owns the gesture — the browser's native menu stays suppressed). To let
 * the native browser menu through instead, set `bodyContextMenu` to `false`.
 */
export type BodyContextMenuGetter = (params: { ctx: BodyMenuContext; items: MenuItem[] }) => MenuItem[];

/**
 * How grouped rows are displayed:
 * - "singleColumn": one auto-generated group column holds the expand/collapse chevron and the
 *   indented group label for every grouping level.
 * - "multipleColumns": one auto-generated group column per grouped field; each shows its label
 *   only on the group rows at its own level.
 * - "groupRows": no auto-group column — the group label spans the row (sticky to the left edge).
 */
export type GroupDisplayType = "singleColumn" | "multipleColumns" | "groupRows";

/** How the quick-filter search string is matched against each row. */
export type QuickFilterMatchMode = "substring" | "multiTerm";

/** One entry of a grid-level initial sort: a column id and its direction, in priority order. */
export interface InitialSortItem {
  colId: string;
  dir: "asc" | "desc";
}

/**
 * The cycle a column steps through on successive sort clicks. Each click advances to the next entry
 * (wrapping at the end); `null` is the unsorted state. Defaults to `["asc", "desc", null]`. Drop
 * `null` (e.g. `["asc", "desc"]`) to keep a column always sorted, or lead with `"desc"` for
 * descending-first columns.
 */
export type SortingOrder = ("asc" | "desc" | null)[];

/**
 * Modifier key that makes a sort-icon click additive (adds the column to a multi-column sort instead
 * of replacing it): "ctrl" (also matches ⌘ / metaKey) or "shift". Defaults to "ctrl", consistent
 * with additive column selection.
 */
export type MultiSortKey = "ctrl" | "shift";

/**
 * When the multi-column sort priority number is shown on the sort icon:
 * - "multi" (default): only when 2+ columns are sorted.
 * - "always": whenever a column is sorted (even a single one).
 * - "never": never shown.
 */
export type ShowSortPriority = "multi" | "always" | "never";

/**
 * When the sort icon is shown on a sortable column:
 * - "hover" (default): revealed on header hover / keyboard focus (a column with an active sort always
 *   shows its direction arrow regardless).
 * - "always": the (neutral) icon is shown at rest too, making the column visibly sortable.
 * - "never": no sort icon is rendered, even when the column is actively sorted. The column stays
 *   sortable via the column menu, Shift+click on the header, and the API — only the icon affordance
 *   is suppressed (use this when a custom sort UI drives sorting).
 */
export type SortIconVisibility = "hover" | "always" | "never";

/**
 * How a mouse gesture starts editing an editable cell:
 * - "doubleClick" (default): double-click opens the editor.
 * - "singleClick": a single click selects the cell and opens the editor together.
 * - "none": no mouse gesture starts editing (editing is API-only unless keyboard triggers are on).
 * Keyboard triggers (F2/Enter, type-to-edit) are governed separately by `suppressKeyboardEdit`.
 */
export type EditTrigger = "doubleClick" | "singleClick" | "none";

/**
 * How the mouse interacts with body cells:
 * - `true`: grid cell selection (default).
 * - `false`: cells inert; nothing selectable.
 * - `"text"`: native browser text selection, like a plain HTML table.
 */
export type CellSelectionMode = boolean | "text";

/**
 * Quick filter (global search) configuration.
 * - `mode`: "onDemand" (default) hides the widget until summoned with Ctrl/Cmd+F; "always" keeps it
 *   pinned open under the header.
 * - `matchMode`: "multiTerm" (default) splits the search on whitespace and requires every token to
 *   match somewhere in the row; "substring" matches the whole string as one contiguous run.
 * - `caseSensitive`: false by default.
 * - `debounceMs`: delay before a keystroke triggers a refilter. Defaults to 150.
 * - `showOptions`: whether the widget exposes the match-mode / match-case popover to end users.
 *   Defaults to true. When false the configured defaults are fixed.
 * - `showLayoutOptions`: whether the widget's options popover also exposes end-user controls for the
 *   anchor (left/right) and keep-filter-on-close behavior. Defaults to false. End-user changes are
 *   sticky for the session (not written back to grid options), like the other popover controls.
 * - `clearOnClose`: whether dismissing the widget also clears the active search. Defaults to true
 *   (a dismissed search stops filtering). When false the filter persists after close and an
 *   active-filter indicator is shown on the header so the filtering is never silent.
 * - `position`: where the floating widget sits relative to the grid (see `QuickFilterPositionOptions`).
 * These are the *initial* defaults; end-user changes made in the widget popover are sticky for the
 * session (they are not written back to grid options). Client-side row model only.
 */
export interface QuickFilterOptions {
  mode?: "always" | "onDemand";
  matchMode?: QuickFilterMatchMode;
  caseSensitive?: boolean;
  debounceMs?: number;
  showOptions?: boolean;
  showLayoutOptions?: boolean;
  clearOnClose?: boolean;
  position?: QuickFilterPositionOptions;
}

/**
 * Placement of the floating quick-filter widget within the grid root.
 * - `anchor`: which horizontal edge the widget is pinned to. "right" (default) preserves the
 *   historical placement; "left" pins it to the left edge instead.
 * - `offsetX`: inset in px from the anchored edge. Defaults to 8. On the right edge this is added
 *   on top of the scrollbar gutter so the widget never overlaps the scrollbar thumb.
 * - `offsetTop`: gap in px between the bottom of the header and the top of the widget. Defaults to 6.
 */
export interface QuickFilterPositionOptions {
  anchor?: "left" | "right";
  offsetX?: number;
  offsetTop?: number;
}

/** Fully-resolved quick-filter configuration (all defaults applied). `enabled` is false when the
 * `quickFilter` option was omitted or set to false. */
export interface ResolvedQuickFilterOptions {
  enabled: boolean;
  mode: "always" | "onDemand";
  matchMode: QuickFilterMatchMode;
  caseSensitive: boolean;
  debounceMs: number;
  showOptions: boolean;
  showLayoutOptions: boolean;
  clearOnClose: boolean;
  position: Required<QuickFilterPositionOptions>;
}

export function resolveQuickFilterOptions(
  opt: boolean | QuickFilterOptions | undefined,
): ResolvedQuickFilterOptions {
  const o = typeof opt === "object" && opt !== null ? opt : {};
  const pos = o.position ?? {};
  return {
    enabled: opt === true || (typeof opt === "object" && opt !== null),
    mode: o.mode ?? "onDemand",
    matchMode: o.matchMode ?? "multiTerm",
    caseSensitive: o.caseSensitive ?? false,
    debounceMs: o.debounceMs != null && o.debounceMs >= 0 ? o.debounceMs : 150,
    showOptions: o.showOptions ?? true,
    showLayoutOptions: o.showLayoutOptions ?? false,
    clearOnClose: o.clearOnClose ?? true,
    position: {
      anchor: pos.anchor ?? "right",
      offsetX: Number.isFinite(pos.offsetX) && (pos.offsetX as number) >= 0 ? (pos.offsetX as number) : 8,
      offsetTop: Number.isFinite(pos.offsetTop) && (pos.offsetTop as number) >= 0 ? (pos.offsetTop as number) : 6,
    },
  };
}

/** How a tooltip is positioned. `anchored` pins to the cell (supports interactive content);
 * `follow` tracks the pointer (display-only). See {@link ResolvedTooltipOptions}. */
export type TooltipMode = "anchored" | "follow";

/** Where an anchored tooltip prefers to sit relative to the cell. `auto` picks the first side with
 * room (bottom → top → right → left). */
export type TooltipPlacement = "top" | "bottom" | "left" | "right" | "auto";

/** Grid-level tooltip configuration (the object form of the `tooltip` option). */
export interface TooltipOptions {
  /** Delay in ms before a hover tooltip appears. Default 400. */
  showDelay?: number;
  /** Delay in ms before a tooltip hides after the pointer leaves. Default 100. */
  hideDelay?: number;
  /** Allow the pointer to enter the tooltip and interact with its content (buttons/inputs). Forces
   * `anchored` mode when set (you can't click a tooltip that follows the pointer). Default false. */
  interactive?: boolean;
  /** Preferred placement for anchored tooltips. Default "auto". */
  placement?: TooltipPlacement;
  /** Positioning mode. Default "anchored". Ignored (forced to "anchored") when `interactive`. */
  mode?: TooltipMode;
  /** Mount the tooltip in `document.body` instead of the grid root, to escape `.pte-root`
   * overflow clipping near the grid edge. Default false. */
  escapeRootClip?: boolean;
  /** Disable the built-in auto-truncation tooltip (full value shown when a cell is clipped).
   * Default false (auto-truncation is on). */
  suppressAutoTooltip?: boolean;
}

/**
 * Per-column tooltip presentation overrides (see {@link ColDef.tooltipOptions}). A column may
 * override how its tooltip is positioned and behaves; anything omitted falls back to the grid-level
 * {@link TooltipOptions}. Timing (`showDelay`/`hideDelay`) and the master enable switch stay
 * grid-level and are intentionally not overridable here.
 */
export interface TooltipColumnOptions {
  /** Positioning mode for this column. Ignored (forced to "anchored") when `interactive`. */
  mode?: TooltipMode;
  /** Preferred placement for this column's anchored tooltip. */
  placement?: TooltipPlacement;
  /** Whether this column's tooltip is interactive. Forces `anchored` mode. */
  interactive?: boolean;
  /** Mount this column's tooltip in `document.body` to escape `.pte-root` overflow clipping. */
  escapeRootClip?: boolean;
}

/** The fully-resolved tooltip config the renderer consumes. */
export interface ResolvedTooltipOptions {
  enabled: boolean;
  showDelay: number;
  hideDelay: number;
  interactive: boolean;
  placement: TooltipPlacement;
  mode: TooltipMode;
  escapeRootClip: boolean;
  suppressAutoTooltip: boolean;
}

export function resolveTooltipOptions(
  opt: boolean | TooltipOptions | undefined,
): ResolvedTooltipOptions {
  // Default ON: only an explicit `false` disables tooltips entirely.
  const enabled = opt !== false;
  const o = typeof opt === "object" && opt !== null ? opt : {};
  const interactive = o.interactive ?? false;
  // Interactive tooltips must be anchored — a follow-mouse tooltip can't be clicked.
  const mode: TooltipMode = interactive ? "anchored" : (o.mode ?? "anchored");
  return {
    enabled,
    showDelay: o.showDelay != null && o.showDelay >= 0 ? o.showDelay : 400,
    hideDelay: o.hideDelay != null && o.hideDelay >= 0 ? o.hideDelay : 100,
    interactive,
    placement: o.placement ?? "auto",
    mode,
    escapeRootClip: o.escapeRootClip ?? false,
    suppressAutoTooltip: o.suppressAutoTooltip ?? false,
  };
}

/**
 * Layer a column's presentation overrides on top of the grid-level resolved config. Only the
 * presentation fields ({@link TooltipColumnOptions}) can be overridden; `enabled`, delays, and
 * `suppressAutoTooltip` come from the grid level. The interactive⇒anchored rule is re-applied after
 * merging so a column that turns on `interactive` can't be left in `follow` mode.
 */
export function resolveColumnTooltipOptions(
  base: ResolvedTooltipOptions,
  colOpts: TooltipColumnOptions | undefined,
): ResolvedTooltipOptions {
  if (!colOpts) return base;
  const interactive = colOpts.interactive ?? base.interactive;
  const requestedMode = colOpts.mode ?? base.mode;
  return {
    ...base,
    interactive,
    // Interactive tooltips must be anchored — a follow-mouse tooltip can't be clicked.
    mode: interactive ? "anchored" : requestedMode,
    placement: colOpts.placement ?? base.placement,
    escapeRootClip: colOpts.escapeRootClip ?? base.escapeRootClip,
  };
}

/** Where the ActionFrame popover prefers to sit relative to its cell. `auto` picks the first side
 * with room (bottom → top → right → left), flipping when the preferred side is clipped. */
export type ActionFramePlacement = "top" | "bottom" | "left" | "right" | "auto";

/** ActionFrame presentation config. Usable per column (`ColDef.actionFrameOptions`) and grid-wide
 * (`GridOptions.actionFrameOptions`); the column value overrides the grid default field-by-field. */
export interface ActionFrameOptions {
  /** Preferred popover placement. Default "auto". */
  placement?: ActionFramePlacement;
  /** Gap in px between the cell and the popover. Default 8. */
  offset?: number;
  /** Mount the popover in `document.body` to escape `.pte-root` overflow clipping near the grid
   * edge. Default false. */
  escapeRootClip?: boolean;
}

/** Fully-resolved ActionFrame presentation config consumed by the renderer. */
export interface ResolvedActionFrameOptions {
  placement: ActionFramePlacement;
  offset: number;
  escapeRootClip: boolean;
}

/** Resolve the grid-level ActionFrame options, then layer a column's overrides on top. */
export function resolveActionFrameOptions(
  gridOpts: ActionFrameOptions | undefined,
  colOpts: ActionFrameOptions | undefined,
): ResolvedActionFrameOptions {
  const g = gridOpts ?? {};
  const c = colOpts ?? {};
  return {
    placement: c.placement ?? g.placement ?? "auto",
    offset: c.offset ?? g.offset ?? 8,
    escapeRootClip: c.escapeRootClip ?? g.escapeRootClip ?? false,
  };
}

export interface GridOptions {
  headerHeight?: number;
  leafHeaderHeight?: number;
  parentHeaderHeight?: number;
  rowHeight?: number;
  getRowId?: (row: object) => string;
  rowIdKey?: string;
  overscanRowCount?: number;
  /**
   * Minimum width (px) a column can be dragged down to with the resize handle. Also the floor for
   * content-based auto-sizing. Defaults to 75.
   */
  minResizeWidth?: number;
  /**
   * Maximum width (px) content-based auto-sizing will grow a column to (an explicit `width` /
   * user resize can still exceed it). Defaults to 420.
   */
  maxColumnWidth?: number;
  allowExportAsCSV?: boolean;
  allowExportAsExcel?: boolean;
  pagination?: boolean;
  rowNumbers?: boolean;
  /**
   * When true, the row under the pointer is highlighted (background `--pte-hover-bg-color`).
   * Defaults to true. Set to false to disable row-hover highlighting entirely.
   */
  rowHover?: boolean;
  /**
   * When true, hovering a body cell highlights every cell in that column (background
   * `--pte-column-hover-bg-color`). Defaults to false.
   */
  columnHover?: boolean;
  /**
   * When true, alternating (odd) data rows get a distinct background
   * (`--pte-row-alt-bg-color`) for zebra striping. Defaults to false.
   */
  zebraRows?: boolean;
  /**
   * Conditional per-row CSS class(es). Called for each rendered row; return a class name, a
   * space-separated string, an array, or nothing. Applied on top of the grid's own row classes and
   * recomputed as rows scroll into view. Use for state-driven styling (e.g. flag error rows).
   */
  getRowClass?: GetRowClass;
  /**
   * Conditional per-row inline styles (camelCase CSS properties). Called for each rendered row;
   * return a style object or nothing. Recomputed as rows scroll into view.
   */
  getRowStyle?: GetRowStyle;
  /**
   * Called when a body cell is clicked (left button). Convenience wrapper over the `cellClicked`
   * event; equivalent to `api.on("cellClicked", …)`. Does not fire for the row-number cell.
   */
  onCellClicked?: (params: GridEventCellClickedParams) => void;
  /**
   * Called when a body row is clicked (left button), including group rows. Convenience wrapper over
   * the `rowClicked` event.
   */
  onRowClicked?: (params: GridEventRowClickedParams) => void;
  /**
   * Called when a cell edit is committed with a new value. Convenience wrapper over the
   * `editingChanged` event (state "committed").
   */
  onCellValueChanged?: (params: CellValueChangedParams) => void;
  /**
   * Called when the selection changes. Convenience wrapper over the `selectionChanged` event.
   */
  onSelectionChanged?: (params: GridEventSelectionChangedParams) => void;
  /**
   * Called when the sort changes (a column is sorted, re-sorted, or cleared). Convenience wrapper
   * over the `columnsChanged` event with reason "sort".
   */
  onSortChanged?: (params: SortChangedParams) => void;
  /**
   * When true, the active (focused) cell is drawn with a distinct outline
   * (`--pte-active-cell-border-color`) so it stands out inside a larger range selection.
   * Defaults to false.
   */
  highlightActiveCell?: boolean;
  /**
   * When true, clicking a row's row-number cell selects that row (Ctrl/Cmd+click toggles,
   * Shift+click extends a range). Requires the row-number column (`rowNumbers`). Defaults to false.
   */
  rowSelection?: boolean;
  /**
   * Controls how the mouse interacts with body cells:
   * - `true` (default): clicking a cell selects/focuses it (grid selection); enables range
   *   selection, keyboard navigation, and double-click editing.
   * - `false`: cells are inert — clicks neither select nor focus a cell, and double-click editing
   *   is disabled. Native text selection stays suppressed (nothing is selectable).
   * - `"text"`: reverts to plain-HTML-table behavior — grid cell selection is off, but the browser's
   *   native text selection is enabled so users can select and copy cell text with the mouse.
   */
  cellSelection?: CellSelectionMode;
  /**
   * When true, a cell range can be extended by dragging the mouse or with Shift+Arrow / Shift+click.
   * When false, selection stays a single cell (mouse drag and keyboard/mouse range-extension are
   * ignored); plain click and arrow navigation still work. Requires `cellSelection`. Defaults to true.
   */
  rangeSelection?: boolean;
  /**
   * When true, clicking a column header selects that column (Ctrl/Cmd+click toggles). When false,
   * header clicks no longer select the column; sorting (Shift+click / sort affordances), the column
   * menu, and filtering are unaffected. Defaults to true.
   */
  columnSelection?: boolean;
  /**
   * When true, the column header buttons (menu ⋮ and filter) stay hidden until the pointer hovers
   * (or keyboard-focuses) the header cell, then fade in — keeping headers clean until needed. When
   * false (default), the buttons are always visible. An active filter's button stays visible
   * regardless, so a filtered column is never silently hidden.
   */
  showColumnButtonsOnHover?: boolean;
  /**
   * Controls the body (right-click) context menu:
   * - `true` / omitted (default): show the grid's default body menu (Copy, Export, …).
   * - `false`: the grid does not open a menu and does not intercept the event, so the browser's
   *   native context menu appears.
   * - a function: called with the menu context and the default items; return the items to show
   *   (return `[]` to show nothing while still suppressing the native menu).
   */
  bodyContextMenu?: boolean | BodyContextMenuGetter;
  /**
   * When true, clicking the row-number column header toggles selection of all rows in the current
   * view (consistent with clicking any other header cell). Requires the row-number column
   * (`rowNumbers`). Independent of `rowSelection`. Defaults to false.
   */
  selectAllRowsOnHeaderClick?: boolean;
  pageSize?: number;
  pageSizes?: number[];
  serverSideBlockSize?: number;
  rowModelType?: RowModelType;
  serverSideDataSource?: IServerSideDataSource;
  serverSideAggregationSource?: IServerSideDataSource["getAggregates"];
  /**
   * When true, every data refresh (after the first) recomputes column widths
   * from the new data and updates affected widths in place. When false, column
   * widths are computed only on the first data load and stay fixed thereafter.
   * Defaults to true for server-side row models, false for client-side.
   */
  autosizeColumnsOnDataChange?: boolean;
  /**
   * When true, clicking inside the grid body but outside any row clears the
   * current selection (cell range, row selection, and column selection).
   * Defaults to true.
   */
  clearSelectionOnBodyClick?: boolean;
  /**
   * Maximum number of undoable edit steps kept in history (one step = one edit / paste / cut).
   * Older steps are dropped once the limit is exceeded. Defaults to 100. Set to 0 to disable
   * undo/redo entirely. Negative or undefined falls back to the default.
   */
  undoLimit?: number;
  /**
   * How a mouse gesture starts editing an editable cell: "doubleClick" (default), "singleClick"
   * (select + edit on one click), or "none" (no mouse edit trigger). Keyboard triggers are governed
   * by `suppressKeyboardEdit`. Non-editable columns and group rows never enter edit regardless.
   */
  editTrigger?: EditTrigger;
  /**
   * Initial sort applied once when the grid first sets up its columns — an ordered list of
   * `{ colId, dir }` (first = primary sort). Per-column `ColDef.sort` / `sortIndex` take precedence:
   * a column with its own `sort` keeps that, and `initialSort` only fills columns not covered that
   * way. Not kept in sync with later user sorting. Client-side row model.
   */
  initialSort?: InitialSortItem[];
  /**
   * The cycle a column steps through on successive sort-icon clicks — an ordered list of directions
   * where `null` is the unsorted state. Each click advances to the next entry, wrapping at the end.
   * Defaults to `["asc", "desc", null]`. Set `["asc", "desc"]` to keep sorted columns always sorted,
   * or `["desc", "asc", null]` for descending-first. Overridable per column via `ColDef.sortingOrder`.
   */
  sortingOrder?: SortingOrder;
  /**
   * When the sort icon is shown on sortable columns: "hover" (default) reveals it on header hover /
   * keyboard focus; "always" shows the neutral icon at rest too, making the column visibly sortable;
   * "never" renders no icon at all (the column stays sortable via the menu, Shift+click, and the API).
   * Except under "never", a column with an active sort always shows its direction arrow. Overridable
   * per column via `ColDef.sortIconVisibility`.
   */
  sortIconVisibility?: SortIconVisibility;
  /**
   * Modifier key that makes a sort-icon click additive — adding the column to a multi-column sort
   * rather than replacing the current sort. "ctrl" (default, also matches ⌘) or "shift". A plain
   * (unmodified) icon click always replaces the sort with just that column.
   */
  multiSortKey?: MultiSortKey;
  /**
   * When the multi-column sort priority number is shown on the sort icon: "multi" (default — only
   * when 2+ columns are sorted), "always" (whenever a column is sorted), or "never".
   */
  showSortPriority?: ShowSortPriority;
  /**
   * When true, the keyboard edit triggers (F2 / Enter to edit the focused cell, and type-to-edit on
   * a printable key) are disabled. Navigation and clipboard shortcuts are unaffected. Combine with
   * `editTrigger: "none"` for fully API-only editing. Defaults to false.
   */
  suppressKeyboardEdit?: boolean;
  /**
   * When true, only type-to-edit (opening the editor by typing a printable character on the focused
   * cell) is disabled; F2 / Enter still start editing. Useful to prevent accidental edits from stray
   * keystrokes while keeping an explicit keyboard trigger. Implied by `suppressKeyboardEdit`.
   * Defaults to false.
   */
  suppressTypeToEdit?: boolean;
  /**
   * When true (default), committing an edit with Enter or Tab moves the active cell to the next cell
   * and keeps navigating from there: Enter → down (Shift+Enter → up), Tab → right (Shift+Tab →
   * left). When false, Enter/Tab commit in place without moving. (Multiline/textarea editors keep
   * Enter for newlines; Ctrl/Cmd+Enter commits.)
   */
  moveAfterEdit?: boolean;
  /**
   * When true (default), an open cell editor commits its value when it loses focus (e.g. clicking
   * elsewhere). When false, losing focus is ignored and the editor stays open until an explicit
   * commit (Enter/Tab) or cancel (Escape).
   */
  commitOnBlur?: boolean;
  /**
   * When true (default), committing a cell edit re-runs the active sort and/or filter if the
   * edited column participates in them — so an edited row moves to its correct sorted position or
   * drops out of a filtered view. Set to false to keep edited rows in place until the next
   * explicit sort/filter. Client-side row model only (no-op for server-side).
   */
  reevaluateOnEdit?: boolean;
  /**
   * How grouped rows are laid out. Defaults to "singleColumn". Client-side row model only.
   */
  groupDisplayType?: GroupDisplayType;
  /**
   * Depth to which groups start expanded when a grouping is first applied. 0 (default) leaves all
   * groups collapsed; a value of N expands the first N levels; -1 expands all levels. Per-group
   * expansion state set by the user afterwards takes precedence.
   */
  groupDefaultExpanded?: number;
  /**
   * Whether group (summary) rows participate in cell selection, keyboard navigation, and clipboard
   * copy/cut. When false (default), group rows are skipped: clicking a group cell selects nothing,
   * arrow/block navigation jumps over group rows to the nearest leaf, and copy/cut omits group
   * rows. When true, group cells behave like ordinary cells for selection/nav/clipboard (editing is
   * always blocked on group rows regardless). Client-side row model only.
   */
  groupRowsSelectable?: boolean;
  /**
   * Marks a row as "full-width": its content spans the entire body width across all column sections
   * (pinned to the left of the viewport, staying fixed as the body scrolls horizontally) instead of
   * rendering per-column cells. Return true for the row nodes that should render full width. Group
   * rows in `groupDisplayType: "groupRows"` are treated as full-width automatically regardless of
   * this callback. Row height is unchanged. Client-side row model only.
   */
  isFullWidthRow?: (node: IRowNode) => boolean;
  /**
   * Renderer for a full-width row's content. Receives the standard {@link CellRendererParams} (with
   * the row node's data). When omitted, a group full-width row falls back to the default
   * chevron + label; a non-group full-width row renders empty. Only consulted for rows that
   * {@link isFullWidthRow} (or the `groupRows` display type) marks as full-width.
   */
  fullWidthCellRenderer?: CellRenderer;
  /**
   * Grid-level fallback for a column's header *content* component (Level 1). Applied to every column
   * that does not set its own `headerComponent`. See {@link ColDef.headerComponent}.
   */
  defaultHeaderComponent?: HeaderComponent;
  /**
   * Grid-level fallback for a column's whole-cell header component (Level 2). Applied to every
   * column that does not set its own `headerCellComponent`, and takes precedence over any Level 1
   * component. See {@link ColDef.headerCellComponent}.
   */
  defaultHeaderCellComponent?: HeaderComponent;
  /**
   * Tooltips. Pass `true` (or omit) to enable with defaults, an options object to customise, or
   * `false` to disable all tooltips (including the built-in auto-truncation tooltip). Enabled by
   * default. See {@link TooltipOptions}.
   */
  tooltip?: boolean | TooltipOptions;
  /**
   * Grid-level fallback tooltip component, applied to every column that does not resolve its own
   * tooltip content. See {@link ColDef.tooltipComponent}.
   */
  defaultTooltipComponent?: TooltipComponent;
  /**
   * Grid-level fallback tooltip value getter (returns tooltip text for a cell). Lower precedence
   * than a column's own tooltip config, higher than auto-truncation. See
   * {@link ColDef.tooltipValueGetter}.
   */
  defaultTooltipValueGetter?: (params: TooltipComponentParams) => string | null | undefined;
  /**
   * Grid-level fallback ActionFrame form-body component, applied to every column that does not set
   * its own `actionFrameComponent`. See {@link ColDef.actionFrameComponent}.
   */
  defaultActionFrameComponent?: ActionFrameComponent;
  /**
   * Grid-level ActionFrame presentation defaults (popover placement / offset / clip escape). A
   * column's `actionFrameOptions` overrides these field-by-field. See {@link ActionFrameOptions}.
   */
  actionFrameOptions?: ActionFrameOptions;
  /**
   * Quick filter (global search across all visible columns). Pass `true` to enable with defaults,
   * or an options object to customise. Omitted/false disables the feature. Client-side row model
   * only (server-side ignores it).
   */
  quickFilter?: boolean | QuickFilterOptions;
  /**
   * Text shown in the loading overlay (while the `loading` flag is set). Defaults to
   * "Loading data...".
   */
  loadingMessage?: string;
  /**
   * Text shown in the no-rows overlay when the grid is genuinely empty (no data). Defaults to
   * "No rows to show". Note: when rows exist but are all filtered out, a filter-specific message is
   * shown instead and this option does not apply.
   */
  noRowsMessage?: string;
  /**
   * Grid-wide default debounce (ms) for column filters — the delay between a filter input change
   * and the view refresh. A column's `filterParams.debounceMs` overrides this per column. Defaults
   * to 300.
   */
  filterDebounceMs?: number;
  /**
   * Grid-wide default duration (ms) a changed cell stays fully highlighted before fading, used by
   * the change-flash cell renderer. A column's `cellRendererParams.cellFlashDuration` overrides it.
   * Defaults to 500.
   */
  cellFlashDuration?: number;
  /**
   * Grid-wide default duration (ms) of the change-flash fade-out. A column's
   * `cellRendererParams.cellFadeDuration` overrides it. Defaults to 1000.
   */
  cellFadeDuration?: number;
  /**
   * Named icon overrides. Values may be a URL, data URI, CSS image value
   * like `url(...)`, or inline SVG markup. Merged over any icons carried by
   * `theme`, taking precedence.
   */
  icons?: GridIconMap;
  /**
   * Visual theme. A {@link GridTheme} resolves to CSS custom properties applied
   * inline on this grid instance (and its popups), so grids can be themed
   * independently. Build one from a preset, e.g.
   * `themeDark.withParams({ accentColor: "#e11", rowHeight: 40 })`. Omitted =
   * the stylesheet's default light theme.
   */
  theme?: GridTheme;
}

export interface InternalGridOptions extends GridOptions {
  headerHeight: number;
  leafHeaderHeight: number;
  parentHeaderHeight: number;
  rowHeight: number;
  overscanRowCount: number;
  minResizeWidth: number;
  maxColumnWidth: number;
  allowExportAsCSV: boolean;
  allowExportAsExcel: boolean;
  pagination: boolean;
  rowNumbers: boolean;
  rowHover: boolean;
  columnHover: boolean;
  zebraRows: boolean;
  highlightActiveCell: boolean;
  rowSelection: boolean;
  cellSelection: CellSelectionMode;
  rangeSelection: boolean;
  columnSelection: boolean;
  showColumnButtonsOnHover: boolean;
  bodyContextMenu: boolean | BodyContextMenuGetter;
  selectAllRowsOnHeaderClick: boolean;
  pageSize: number;
  pageSizes: number[];
  serverSideBlockSize: number;
  autosizeColumnsOnDataChange: boolean;
  clearSelectionOnBodyClick: boolean;
  undoLimit: number;
  editTrigger: EditTrigger;
  suppressKeyboardEdit: boolean;
  suppressTypeToEdit: boolean;
  moveAfterEdit: boolean;
  commitOnBlur: boolean;
  sortingOrder: SortingOrder;
  sortIconVisibility: SortIconVisibility;
  multiSortKey: MultiSortKey;
  showSortPriority: ShowSortPriority;
  reevaluateOnEdit: boolean;
  groupDisplayType: GroupDisplayType;
  groupDefaultExpanded: number;
  groupRowsSelectable: boolean;
  isFullWidthRow?: (node: IRowNode) => boolean;
  fullWidthCellRenderer?: CellRenderer;
  defaultHeaderComponent?: HeaderComponent;
  defaultHeaderCellComponent?: HeaderComponent;
  tooltip: boolean | TooltipOptions;
  defaultTooltipComponent?: TooltipComponent;
  defaultTooltipValueGetter?: (params: TooltipComponentParams) => string | null | undefined;
  defaultActionFrameComponent?: ActionFrameComponent;
  actionFrameOptions?: ActionFrameOptions;
  quickFilter: boolean | QuickFilterOptions;
  loadingMessage: string;
  noRowsMessage: string;
  filterDebounceMs: number;
  cellFlashDuration: number;
  cellFadeDuration: number;
  icons?: GridIconMap;
}
