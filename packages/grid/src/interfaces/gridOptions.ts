import { RowModelType } from "./iRowModel";
import { IServerSideDataSource } from "./serverSide";
import { GridIconMap } from "../theme/icons";
import type { GridTheme } from "../theme/theme";
import type { MenuItem } from "./menuItem";
import type { BodyMenuContext } from "../menu/bodyContext";
import type { ColumnMenuContext } from "../menu/context";
import type { Column } from "../column/column";
import type { IRowNode } from "./iRowNode";
import type { CellRenderer } from "../renderer/renderer";
import type { TooltipComponent } from "../renderer/tooltip/tooltipComponent";
import type { ColDef, DefaultColDef } from "./column";
import type {
  CellValueChangeSource,
  GridEventCellClickedParams,
  GridEventFilterChangedParams,
  GridEventHistoryChangedParams,
  GridEventRowClickedParams,
  GridEventSelectionChangedParams,
} from "../events/events";
import type { SavedViewsOptions, SheetsOptions } from "./gridView";

/**
 * Payload for the `onCellValueChanged` option: a cell's stored value changed. Covers every write
 * path — editor commits, `setCellValue`, paste/cut/clear batches, and undo/redo — but fires only
 * when the stored value actually changes (SameValueZero, `Date`s by instant — see
 * {@link valuesAreSame}); committing the value a cell already holds emits nothing. Two exceptions:
 * under `readOnlyEdit` the grid writes nothing and cannot compare, so every accepted value is
 * reported; and undo/redo report the recorded transition, which can be a no-op if the row data
 * was mutated externally (e.g. `applyTransaction`) after the step was recorded.
 */
export interface CellValueChangedParams {
  rowId: string;
  /** The column's public `ColDef.colId`. */
  colId: string;
  /** The column's internal instance id. */
  colInstanceId?: string;
  /** The newly committed (parsed) value. */
  value: unknown;
  /** The cell's stored value before the write. */
  oldValue: unknown;
  /** What wrote the cell: "edit" (editor commit / setCellValue), clipboard batch, or undo/redo. */
  source: CellValueChangeSource;
}

/**
 * Sentinel returned from {@link GridOptions.onBeforeCellCommit} to veto a write: the cell keeps its
 * old value, nothing enters undo history, and no `cellValueChanged` fires.
 */
export const REJECT: unique symbol = Symbol("agility-workbench-grid/reject-commit");

/** Write paths that run the pre-commit hook. Undo/redo replay already-accepted values and skip it. */
export type CellCommitSource = Exclude<CellValueChangeSource, "undo" | "redo">;

/** Payload for the `onBeforeCellCommit` option. Mirrors {@link CellValueChangedParams}. */
export interface BeforeCellCommitParams {
  rowId: string;
  /** The column's public `ColDef.colId`. */
  colId: string;
  /** The column's internal instance id. */
  colInstanceId?: string;
  /** The row's underlying data object (not yet mutated). */
  data: unknown;
  /** The proposed value in its stored form — the column's `valueParser` has already run. */
  value: unknown;
  /** The cell's current stored value. */
  oldValue: unknown;
  /** What is writing the cell: "edit" (editor commit / `setCellValue`) or a clipboard batch. */
  source: CellCommitSource;
}

/** Model changes that snap pagination back to the first page. See {@link GridOptions.resetPageOn}. */
export type ResetPageTrigger = "filter" | "sort" | "quickFilter";

/** How a replacement `rowData` array is applied. See {@link GridOptions.rowDataMode}. */
export type RowDataMode = "auto" | "reset" | "diff";

/** Payload for the `onSortChanged` option. */
export interface SortChangedParams {
  /** Public ColDef colIds whose sort state changed (when known). */
  changedColIds?: string[];
  /** Internal instance ids of those columns. */
  changedColInstanceIds?: string[];
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

/** Tooltip defaults supplied by {@link RowPresentation} for every cell in one row. */
export interface RowTooltipPresentation {
  /** Default scalar content. Explicit column tooltip content overrides it. */
  content?: string | number | null;
  /** Default renderer. An explicit column `tooltipComponent` overrides it. */
  component?: TooltipComponent;
  /** Extra params for the row tooltip component. Column component params override matching keys. */
  componentParams?: Record<string, unknown>;
  /** Row-specific positioning/interaction defaults. Explicit column options override each field. */
  options?: TooltipColumnOptions;
}

/** Accessibility semantics attached to the row rather than inferred from visual styling. */
export interface RowAccessibilityPresentation {
  /** Additional row description, exposed through `aria-describedby`. */
  description?: string | null;
  /** Whether work associated with the row is in progress (`aria-busy`). */
  busy?: boolean;
}

/**
 * Presentation defaults for one logical row. Row container class/style complement the legacy
 * `getRowClass` / `getRowStyle` callbacks. Cell class/style are applied to every cell, then composed
 * with its column's `cellClass` / `cellStyle`. Tooltip fields form the default for every cell and
 * can be overridden (or suppressed) by its column. `editable: false` is a row-level veto over
 * editable columns unless a column explicitly opts out of inheriting it.
 */
export interface RowPresentation {
  rowClass?: string | string[] | null;
  rowStyle?: Partial<CSSStyleDeclaration> | null;
  cellClass?: string | string[] | null;
  cellStyle?: Partial<CSSStyleDeclaration> | null;
  /**
   * Row-level editability gate. `false` prevents user editing in every inheriting column. `true`
   * only permits columns that are themselves editable; it never makes a non-editable column
   * editable. A column can ignore this gate with `inheritRowPresentation.editable: false`.
   */
  editable?: boolean;
  /** `false` explicitly disables the row tooltip default. */
  tooltip?: RowTooltipPresentation | false | null;
  accessibility?: RowAccessibilityPresentation | null;
  /** Opaque application state forwarded to cell renderers, styling callbacks, and tooltips. */
  metadata?: Record<string, unknown>;
}

export interface RowPresentationParams extends RowClassParams {
  /** Set for application-pinned rows; sticky group mirrors remain ordinary body rows. */
  rowPinned?: RowPinnedPosition;
}

export type GetRowPresentation = (
  params: RowPresentationParams,
) => RowPresentation | null | undefined;

/**
 * Customizes the body (right-click) context menu. Receives the menu context and the default items
 * the grid built for it; returns the items to actually show. Return `[]` to show no menu for this
 * context (the grid still owns the gesture — the browser's native menu stays suppressed). To let
 * the native browser menu through instead, set `bodyContextMenu` to `false`.
 */
export type BodyContextMenuGetter = (params: { ctx: BodyMenuContext; items: MenuItem[] }) => MenuItem[];

/**
 * Customizes the column menu opened for *several* selected columns at once, where the built-in
 * items act on the whole set and no single column's `ColDef.columnMenu` governs it.
 *
 * - `items` — the built-in items for the set; return the items to show. Return `[]` for no menu.
 * - `columns` — the columns the menu acts on, target first. Identify them by `column.colId`;
 *   `ctx.colIds` carries internal instance ids. Selecting a column group expands it to its leaves,
 *   so a group header's menu passes the group followed by its leaf columns — the same set the
 *   built-in items operate on. Discriminate with `column.children.length`.
 *
 * Order is the *selection sequence*, not display order: target first, then the order the columns
 * were added — so an application can rely on it (a keyboard `Shift+Arrow` range arrives in display
 * order because that is the order it was built in). Anything that needs display order should read it
 * from the column model; export already does, so exported column order is unaffected either way.
 */
export type MultiColumnMenuItemsGetter = (
  params: { ctx: ColumnMenuContext; columns: Column[]; items: MenuItem[] },
) => MenuItem[];

/** Context used to decide or create a row inserted from a row-number context menu. */
export interface RowInsertionMenuParams {
  position: "above" | "below";
  rowId: string;
  data: any;
  node: IRowNode;
  /** Page-local/displayed index of the row whose number was right-clicked. */
  viewIndex: number;
  /** Index of that row in the client-side model's underlying source order. */
  sourceIndex: number;
  /** Source-order index at which the returned row will be inserted. */
  addIndex: number;
}

/**
 * Opt-in row-number context-menu insertion. The application creates the new row so required
 * fields and stable row IDs remain under application control.
 */
export interface RowInsertionMenuOptions {
  /** Return the row to insert, or null/undefined to cancel the command. */
  createRow: (params: RowInsertionMenuParams) => any | null | undefined;
  /** Omit an individual direction for rows where insertion is not allowed. Defaults to true. */
  canInsert?: (params: RowInsertionMenuParams) => boolean;
}

/**
 * How grouped rows are displayed:
 * - "singleColumn": one auto-generated group column holds the expand/collapse chevron and the
 *   indented group label for every grouping level.
 * - "multipleColumns": one auto-generated group column per grouped field; each shows its label
 *   only on the group rows at its own level.
 * - "groupRows": no auto-group column — the group label spans the row (sticky to the left edge).
 */
export type GroupDisplayType = "singleColumn" | "multipleColumns" | "groupRows";

/**
 * How sorting non-grouped columns affects a grouped view:
 * - "local" (default): group buckets retain their group-key order; sorting applies within each
 *   group. An explicit sort on a grouped column still controls that group level.
 * - "hierarchy": sorting a grouped column also reorders its ancestor group levels; non-grouped
 *   column sorts remain local to each group.
 * - "global": group buckets follow the first occurrence in the globally sorted leaf rows, so a
 *   non-grouped sort can reorder the groups as well as their local rows.
 */
export type GroupSortMode = "local" | "hierarchy" | "global";

/** Keyboard behavior for Ctrl/Cmd+Arrow while the generated tree-data column is active. */
export type TreeDataKeyboardNavigationMode = "grid" | "hierarchy";

/** Common presentation hooks shared by every client-side tree-data relationship mode. */
export interface TreeDataCommonOptions<Row = any> {
  /**
   * Label shown in the generated tree column. Path mode defaults to the final path segment; the
   * other modes fall back to `row.name`, `row.label`, and finally the stable row id.
   */
  getLabel?: (row: Row) => unknown;
  /**
   * Definition for the generated hierarchy column. It is a regular movable column: label, width,
   * pinning, sorting, filtering, visibility, menu flags, and other ordinary column options apply.
   * Defaults to an unpinned column labelled "Hierarchy".
   */
  columnDef?: Partial<ColDef>;
  /**
   * "grid" preserves the ordinary Ctrl/Cmd+Arrow data-block jumps. In "hierarchy" mode,
   * Ctrl/Cmd+Right expands; Ctrl/Cmd+Left collapses an expanded parent or focuses the direct parent
   * from a leaf/already-collapsed parent; Ctrl/Cmd+Up always focuses the direct parent while the
   * generated hierarchy column is active. Defaults to "grid".
   */
  keyboardNavigationMode?: TreeDataKeyboardNavigationMode;
  /**
   * Enables the fixed Ctrl/Cmd+Shift+Space shortcut for switching between grid and hierarchy
   * navigation at runtime. The shortcut itself is deliberately not configurable, and works wherever
   * the keyboard cursor is. Defaults to false.
   */
  enableKeyboardNavigationModeSwitch?: boolean;
}

/**
 * The part of `treeData` that can change on a mounted grid, for
 * {@link IGridAPI.setTreeDataKeyboardNavigationOptions}. Derived from the option itself so the two
 * cannot drift; the rest of `treeData` (the relationship mode and its accessors) determines the row
 * shape and is therefore fixed at creation.
 */
export type TreeDataKeyboardNavigationOptions = Pick<
  TreeDataCommonOptions,
  "keyboardNavigationMode" | "enableKeyboardNavigationModeSwitch"
>;

/** A flat row set where each row supplies its complete root-to-node path. */
export interface TreeDataPathOptions<Row = any> extends TreeDataCommonOptions<Row> {
  mode: "path";
  getPath: (row: Row) => readonly (string | number)[];
}

/** A flat row set where each row refers to its parent's stable row id. */
export interface TreeDataParentOptions<Row = any> extends TreeDataCommonOptions<Row> {
  mode: "parent";
  getParentId: (row: Row) => string | number | null | undefined;
}

/** A nested row set where `rowData` contains roots and this callback returns direct children. */
export interface TreeDataChildrenOptions<Row = any> extends TreeDataCommonOptions<Row> {
  mode: "children";
  getChildren: (row: Row) => readonly Row[] | null | undefined;
}

/**
 * Describes how client-side rows relate to one another. Relationship modes are deliberately
 * explicit and mutually exclusive; all three normalize to the same runtime tree.
 */
export type TreeDataOptions<Row = any> =
  | TreeDataPathOptions<Row>
  | TreeDataParentOptions<Row>
  | TreeDataChildrenOptions<Row>;

/** Frozen row band occupied by a row. `null` means the row is not explicitly pinned. */
export type RowPinnedPosition = "top" | "bottom";

/** Context passed to {@link GridOptions.isRowPinned}. */
export interface IsRowPinnedParams {
  node: IRowNode;
  data: any;
  rowId: string;
  rowIndex: number;
  isGroup: boolean;
}

/**
 * Object form of `rowSelection`: enables row selection AND configures the selection checkbox
 * column. `rowSelection: true` stays valid (row selection via the row-number cells, no
 * checkboxes).
 */
export interface RowSelectionOptions {
  /** Whether row selection holds one row or many. Defaults to "multiple". In single mode the
   * checkbox-column header checkbox is hidden and additive/range gestures replace the selection. */
  mode?: "single" | "multiple";
  /** Show a dedicated checkbox column: click toggles the row, Shift+click selects a range, and
   * right-click checks the row before opening the body menu (so its items act on that row). It is
   * independent of `rowNumbers`, defaults to pinned left, and can be pinned right or unpinned from
   * its header menu. Defaults to false. */
  checkboxes?: boolean;
  /** Tri-state select-all checkbox in the checkbox column's header, covering the select-all
   * scope (`selectAllScope`). Defaults to true when `checkboxes` is on. */
  headerCheckbox?: boolean;
  /** Whether the checkbox column can be moved between left-pinned, unpinned, and right-pinned
   * sections after creation. Defaults to true. */
  checkboxColumnPinnable?: boolean;
  /** Initial pin position of the checkbox column. `null` leaves it unpinned. Defaults to "left".
   * This is independent of `checkboxColumnPinnable`, so a column can start in a chosen section and
   * be locked there. */
  checkboxColumnPinned?: "left" | "right" | null;
}

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

/** A configurable control in the pagination footer. The array order is the visual/tab order. */
export type PaginationControl =
  | "pageSize"
  | "firstPage"
  | "previousPage"
  | "pageSelector"
  | "nextPage"
  | "lastPage";

export type PaginationPageSelection = "select" | "buttons";

/**
 * Presentation and composition of the pagination controls.
 * - `pageSelection`: render the page picker as the historical select (default) or numbered buttons.
 * - `showPageLabel`: show the visible "Page" label beside the page picker. Defaults to true.
 * - `controls`: controls to render, in visual and keyboard order. Omit for the historical order.
 * - `maxPageButtons`: maximum numbered page buttons (ellipsis markers do not count). Defaults to 7.
 */
export interface PaginationControlsOptions {
  pageSelection?: PaginationPageSelection;
  showPageLabel?: boolean;
  controls?: readonly PaginationControl[];
  maxPageButtons?: number;
  /** How the footer copes with a width its controls do not fit. Defaults to `"collapse"`. */
  responsive?: BarResponsiveMode;
}

export interface ResolvedPaginationControlsOptions {
  pageSelection: PaginationPageSelection;
  showPageLabel: boolean;
  controls: PaginationControl[];
  maxPageButtons: number;
  responsive: BarResponsiveMode;
}

export const DEFAULT_PAGINATION_CONTROLS: readonly PaginationControl[] = [
  "pageSize",
  "firstPage",
  "previousPage",
  "pageSelector",
  "nextPage",
  "lastPage",
];

const PAGINATION_CONTROL_SET = new Set<PaginationControl>(DEFAULT_PAGINATION_CONTROLS);

export function resolvePaginationControlsOptions(
  options?: PaginationControlsOptions,
): ResolvedPaginationControlsOptions {
  const controls: PaginationControl[] = [];
  const seen = new Set<PaginationControl>();
  for (const control of options?.controls ?? DEFAULT_PAGINATION_CONTROLS) {
    if (!PAGINATION_CONTROL_SET.has(control) || seen.has(control)) continue;
    seen.add(control);
    controls.push(control);
  }
  const requestedMax = options?.maxPageButtons;
  const maxPageButtons = Number.isFinite(requestedMax)
    ? Math.max(3, Math.floor(requestedMax as number))
    : 7;
  return {
    pageSelection: options?.pageSelection === "buttons" ? "buttons" : "select",
    showPageLabel: options?.showPageLabel ?? true,
    responsive: resolveBarResponsiveMode(options?.responsive),
    controls,
    maxPageButtons,
  };
}

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
 * Per-column tooltip presentation overrides (see {@link ColDef["tooltipOptions"]}). A column may
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

/** ActionFrame presentation config. Usable per column (`ColDef.actionFrameOptions`) and as a
 * column default (`GridOptions.defaultColDef.actionFrameOptions`); the column value overrides the
 * default field-by-field. */
export interface ActionFrameOptions {
  /** Preferred popover placement. Default "auto". */
  placement?: ActionFramePlacement;
  /** Gap in px between the cell and the popover. Default 8. */
  offset?: number;
  /**
   * Mount the popover in `document.body` to escape `.pte-root` overflow clipping near the grid
   * edge. Default false.
   *
   * Trade-off: a body-mounted popover sits outside the grid root, and theme params are delivered as
   * inline `--pte-*` properties **on that root**. So none of the `actionFramePopover*` theme params
   * (`actionFramePopoverWidth`, `…BackgroundColor`, `…Radius`, `…Shadow`, …) reach it — it picks up
   * the stylesheet's `:root` defaults instead (e.g. a 300px width). Style an escaped popover by
   * setting the `--pte-action-frame-popover-*` variables at document scope, or leave this off.
   */
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

/**
 * Built-in column-management panel.
 *
 * The panel is opt-in (`columnPanel: true`) and docks to the right side of the grid. Changes are
 * applied immediately. `defaultOpen` controls only the initial state; the user's open/closed choice
 * is preserved across live option updates. `width` is clamped to 240–480px.
 */
export interface ColumnPanelOptions {
  defaultOpen?: boolean;
  width?: number;
  /**
   * Where the drawer toggle is exposed:
   * - `rail` (default): full-height collapsed rail on the right.
   * - `header`: full-height empty right gutter with the toggle in its header corner.
   * - `menu`: "Manage columns…" in both the column-menu button and header context menu.
   * - `footer`: full-height empty right gutter with the toggle in its footer corner.
   * - `toolbar`: grid-level toolbar above the header, with the toggle at the extreme right.
   */
  trigger?: ColumnPanelTrigger;
}

export type ColumnPanelTrigger = "rail" | "header" | "menu" | "footer" | "toolbar";

export interface ResolvedColumnPanelOptions {
  enabled: boolean;
  defaultOpen: boolean;
  width: number;
  trigger: ColumnPanelTrigger;
}

export function resolveColumnPanelOptions(
  opt: boolean | ColumnPanelOptions | undefined,
): ResolvedColumnPanelOptions {
  const o = typeof opt === "object" && opt !== null ? opt : {};
  const width = Number.isFinite(o.width) ? Math.min(480, Math.max(240, o.width as number)) : 304;
  return {
    enabled: opt === true || (typeof opt === "object" && opt !== null),
    defaultOpen: o.defaultOpen ?? false,
    width,
    trigger: o.trigger ?? "rail",
  };
}

/**
 * Opt-in sections for the grid toolbar. The toolbar has no separate visibility flag: it is mounted
 * when at least one section is enabled (or when the column panel uses its toolbar trigger).
 */
/**
 * What a bar does when it is too narrow for its controls.
 *
 * - `"collapse"` (default) — a fixed ladder: captions give way first, then chip lists fold into a
 *   `+N`, then whole regions become summary buttons, then the least important controls move into
 *   the bar's overflow menu. Nothing overlaps, and nothing becomes unreachable — a bar that runs
 *   out of ladder scrolls.
 * - `"scroll"` — no control ever changes presentation; the bar scrolls horizontally as soon as its
 *   controls do not fit. Simplest to reason about, at the cost of controls sitting off-screen
 *   behind a scroll the user has to discover.
 * - `false` — lay the bar out and let it clip, for an application that guarantees its own width.
 *
 * An application that wants a different order of sacrifice configures *fewer controls* rather than
 * re-ordering the ladder: every ordering is a degradation path that has to hold up at every width.
 */
export type BarResponsiveMode = "collapse" | "scroll" | false;

export interface GridToolbarOptions {
  /** Row-grouping picker, ordered chips, and drop zone. */
  grouping?: boolean;
  /** Multi-column sorting picker, ordered chips, and drop zone. */
  sorting?: boolean;
  /**
   * Hosts the existing quick filter in the toolbar. This enables quick filtering when no separate
   * `quickFilter` option is supplied; when one is supplied, its search-behavior options are reused.
   * Floating-only layout options are ignored while the toolbar host is active.
   */
  quickFilter?: boolean;
  /** Saved-view picker and management menu. Configure its data through `savedViews`. */
  views?: boolean;
  /** CSV/Excel export menu. */
  export?: boolean;
  /** Pivot-mode indicator + toggle. Client-side row model only. */
  pivot?: boolean;
  /** How the toolbar copes with a width its controls do not fit. Defaults to `"collapse"`. */
  responsive?: BarResponsiveMode;
}

export interface ResolvedGridToolbarOptions {
  grouping: boolean;
  sorting: boolean;
  quickFilter: boolean;
  views: boolean;
  export: boolean;
  pivot: boolean;
  responsive: BarResponsiveMode;
}

export function resolveGridToolbarOptions(
  options: GridToolbarOptions | undefined,
): ResolvedGridToolbarOptions {
  return {
    grouping: options?.grouping === true,
    sorting: options?.sorting === true,
    quickFilter: options?.quickFilter === true,
    views: options?.views === true,
    export: options?.export === true,
    pivot: options?.pivot === true,
    responsive: resolveBarResponsiveMode(options?.responsive),
  };
}

/** `"collapse"` unless the application asked for one of the other two. */
export function resolveBarResponsiveMode(mode: BarResponsiveMode | undefined): BarResponsiveMode {
  if (mode === false || mode === "scroll") return mode;
  return "collapse";
}

export interface GridOptions {
  headerHeight?: number;
  leafHeaderHeight?: number;
  parentHeaderHeight?: number;
  rowHeight?: number;
  /**
   * Application-owned rows rendered in a frozen band immediately below the header. These rows are
   * outside sorting, filtering, grouping, pagination, selection, and the virtualized row count.
   */
  pinnedTopRowData?: any[];
  /**
   * Application-owned rows rendered in a frozen band below the scrollable body. These rows are
   * outside sorting, filtering, grouping, pagination, selection, and the virtualized row count.
   */
  pinnedBottomRowData?: any[];
  getRowId?: (row: object) => string;
  rowIdKey?: string;
  /**
   * How a replacement `rowData` array is applied. The React and Angular bindings compare `rowData`
   * by reference, so immutable-update patterns hand the grid a new array on every change.
   *
   * - `"diff"` — diff the incoming array against the current rows by id and apply the result as a
   *   transaction: row nodes keep their identity, and undo/redo history and the page index survive.
   *   A row counts as changed only when its **object reference** differs, so this assumes changed
   *   rows are replaced rather than mutated in place.
   * - `"reset"` — re-ingest the whole data set: history is discarded and the grid returns to page 1.
   *   Sort, filter, column state, selection and group expansion survive either way. Use this when
   *   the application mutates row objects in place and passes a new array wrapper, since reference
   *   comparison cannot see those edits.
   * - `"auto"` (default) — `"diff"` when it is available (client-side row model, `getRowId` or
   *   `rowIdKey` set, no tree data), `"reset"` otherwise.
   *
   * Applies to `api.setRowData` as well as to the bindings. Set at construction only.
   */
  rowDataMode?: RowDataMode;
  /**
   * Maximum time in milliseconds before `applyTransactionAsync()` finalizes queued row mutations
   * into one model/render pass. The window starts with the first transaction and is not restarted by
   * later calls. Defaults to 16. Set to 0 to flush on the next macrotask.
   */
  asyncTransactionWaitMs?: number;
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
  paginationControls?: PaginationControlsOptions;
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
   * Row-scoped presentation defaults for row/cell styling, tooltips, accessibility, editability,
   * and opaque metadata. Evaluated while rendering and when row behavior is queried. Keep the
   * callback pure and synchronous. Call `api.refreshRowPresentation()` after changing external
   * state used by this callback.
   */
  getRowPresentation?: GetRowPresentation;
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
   * Pre-commit hook run synchronously before any user-initiated cell write — editor commits,
   * `setCellValue`, and paste/cut/clear batches (per cell). It runs *after* the column's
   * `valueParser`, so `params.value` is the proposed stored form. Return:
   *   - {@link REJECT} to veto the write — the cell keeps its old value, nothing enters undo
   *     history, no `cellValueChanged` fires (an editor commit emits
   *     `editingChanged {state: "rejected"}` instead);
   *   - a value to store it in place of the proposed one (coerce/clamp);
   *   - `undefined` to accept the proposed value unchanged (store an empty value by returning
   *     `null` instead).
   * Undo/redo replay already-accepted values and do not run the hook.
   */
  onBeforeCellCommit?: (params: BeforeCellCommitParams) => unknown;
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
   * Called when the effective row filter changes — column-filter model edits, quick-filter
   * changes, and columnDefs updates that drop an active filter. Convenience wrapper over the
   * canonical `filterChanged` event.
   */
  onFilterChanged?: (params: GridEventFilterChangedParams) => void;
  /**
   * Called when the undo/redo stacks move — a step recorded, undone, redone, or the history
   * cleared. Convenience wrapper over the `historyChanged` event; the payload carries
   * `canUndo`/`canRedo`/`undoDepth`/`redoDepth`, so undo/redo toolbar buttons can bind to it
   * instead of polling `api.canUndo()`.
   */
  onHistoryChanged?: (params: GridEventHistoryChangedParams) => void;
  /**
   * Accessible name for the grid, applied as `aria-label` on the element carrying `role="grid"`.
   *
   * A grid is required to have an accessible name, and the host page cannot supply one from
   * outside: the element with `role="grid"` is created by the renderer *inside* the container the
   * application owns, so labelling the container does not name the grid. Something short and
   * distinguishing is what a screen-reader user hears on entering it ("Open invoices").
   *
   * Prefer `ariaLabelledBy` when a visible heading already names the grid.
   */
  ariaLabel?: string;
  /**
   * Accessible name for the grid taken from other elements' text, applied as `aria-labelledby` on
   * the element carrying `role="grid"`. Space-separated ids, which must exist in the same document
   * (typically a visible heading above the grid). Takes precedence over `ariaLabel` when both are
   * set, matching how the two attributes resolve in ARIA.
   */
  ariaLabelledBy?: string;
  /**
   * When true, the active (focused) cell is drawn with a distinct outline
   * (`--pte-active-cell-border-color`) so it stands out inside a larger range selection.
   * Defaults to false.
   */
  highlightActiveCell?: boolean;
  /**
   * When true, clicking a row's row-number cell selects that row (Ctrl/Cmd+click toggles,
   * Shift+click extends a range). Requires the row-number column (`rowNumbers`). Defaults to false.
   *
   * Keyboard row selection (Enter/Space on a row-number or checkbox cell) rides on the body
   * keyboard cursor, so it additionally requires `cellSelection: true`; with cell selection off,
   * row selection is mouse-only.
   */
  rowSelection?: boolean | RowSelectionOptions;
  /**
   * Per-row gate on row selection. Called with the row node; return `false` to make that row
   * unselectable through every route — checkbox click, Enter/Space, Shift ranges (the row is
   * skipped inside the range), row-number gestures, select-all, and `api.selectRowsById`. The grid
   * paints the row's selection checkbox disabled (`pte-checkbox-cell-disabled`, `aria-disabled`),
   * and right-clicking the disabled checkbox cell no longer opens the grid's body menu (the
   * gesture exists to check the row and act on it) — the browser's native menu appears instead;
   * the row's other cells keep their menus. Styling the rest of the row is the application's job.
   *
   * Selection only: the row remains a fully live data row — the keyboard cursor still lands on it
   * and its cells stay selectable, editable, and copyable. Rows already selected when the predicate
   * starts returning `false` (a data update, or swapping the predicate via `updateGridOptions`)
   * are deselected. On the server-side row model, rows not yet loaded cannot be evaluated and are
   * treated as selectable until they load.
   */
  isRowSelectable?: (node: IRowNode) => boolean;
  /**
   * Controls how body cells can be interacted with — by mouse and keyboard alike:
   * - `true` (default): clicking a cell selects/focuses it (grid selection); enables range
   *   selection, keyboard navigation, and double-click editing.
   * - `false`: cells are inert — clicks neither select nor focus a cell, the keyboard cursor cannot
   *   enter the body (which also disables keyboard editing, clipboard shortcuts, and keyboard row
   *   selection), and double-click editing is off. Native text selection stays suppressed (nothing
   *   is selectable).
   * - `"text"`: reverts to plain-HTML-table behavior — grid cell selection is off exactly as with
   *   `false`, but the browser's native text selection is enabled so users can select and copy cell
   *   text with the mouse.
   *
   * Header interactions are unaffected: sorting, column menus, and the header keyboard cursor stay
   * on (see `headerKeyboardNavigation`).
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
   * When true (default), the column header row takes part in keyboard navigation: focus entering
   * the grid seeds the header cursor, ArrowUp from the top row moves into the header, and clicking
   * a header cell places the cursor there. When false, the header keyboard cursor is disabled
   * entirely, making header actions (sort, column selection, menu, filter) mouse-only — which also
   * makes them unreachable for keyboard and assistive-technology users, so leave this on unless the
   * grid is deliberately inert. With this false and `cellSelection` not `true`, the grid claims no
   * navigation keys at all, freeing them for application shortcuts.
   */
  headerKeyboardNavigation?: boolean;
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
   * Controls the column menu when it targets several selected columns at once, where the built-in
   * items act on the whole set and no single column's `ColDef.columnMenu` applies:
   * - omitted (default): the grid's built-in multi-column items.
   * - a function: called with the built-in items and the columns they act on; return the items to
   *   show, or `[]` for no menu. Framework menu adapters still run afterwards and may add items.
   * - `false`: no multi-column menu, and no adapter runs either.
   *
   * Note what `false` cannot do, unlike `ColDef.columnMenu: false`. Whether a menu is
   * multi-column is only known once it is being opened, after the grid has already claimed the
   * gesture — so a right-click with several columns selected shows no menu at all rather than
   * falling back to the browser's, and the ⋮ button stays visible but does nothing while a
   * multi-selection is active. Suppress the entry points per column if that matters.
   *
   * Selecting a column group expands it to its leaves, so right-clicking a group header with more
   * than one visible leaf opens a multi-column menu and reaches this option.
   */
  multiColumnMenu?: false | MultiColumnMenuItemsGetter;
  /**
   * When true, clicking the row-number column header toggles selection of all rows in the current
   * view (consistent with clicking any other header cell). Requires both the row-number column
   * (`rowNumbers`) and `rowSelection`. Defaults to false.
   */
  selectAllRowsOnHeaderClick?: boolean;
  /**
   * Scope of select-all operations (the row-number header click, `api.selectAllRows()`, and
   * `api.areAllRowsSelected()`): "filtered" (default) covers every selectable data row that
   * passes the current filters — all pages; "page" covers only the current page's view. On the
   * server-side row model "filtered" covers loaded rows.
   */
  selectAllScope?: "page" | "filtered";
  /**
   * What happens to the row selection when the filter / sort / quick-filter model changes:
   * "clear" (default) discards it; "keep" retains the selected row ids — selection is id-based,
   * so it survives rows moving pages or leaving the filtered view. The cell range is always
   * cleared (view indices shift).
   */
  selectionPersistence?: "clear" | "keep";
  /**
   * Which model changes reset pagination to the first page. Defaults to `[]`: no change resets
   * the page — the grid keeps the current page and, when the change shrinks the row count past
   * it, clamps to the last page (client-side row model; the server-side model snaps back once
   * the total count is known). Add "filter" (column-filter model edits), "quickFilter", and/or
   * "sort" to restore jump-to-page-1 for that trigger.
   */
  resetPageOn?: ResetPageTrigger[];
  pageSize?: number;
  pageSizes?: number[];
  serverSideBlockSize?: number;
  rowModelType?: RowModelType;
  serverSideDataSource?: IServerSideDataSource;
  serverSideAggregationSource?: IServerSideDataSource["getAggregates"];
  /**
   * Server-side grouping: reads a group row's leaf-descendant count (the "(N)" badge next to the
   * group label) off the row object the data source returned — typically a `COUNT(*)` field of the
   * GROUP BY result. Return null/undefined to omit the badge. Server-side row model only; the
   * client-side model counts descendants itself.
   */
  getGroupChildCount?: (row: any) => number | null | undefined;
  /**
   * Tooltip shown on the pagination page selector while the total row count is provisional — when
   * a server-side listing has not reported `totalRows` and its end has not been reached yet, the
   * page count renders with a "+" suffix (e.g. "3 of 12+") and carries this tooltip. Defaults to
   * "More rows may exist on the server; the total updates as they load".
   */
  paginationUnknownTotalTooltip?: string;
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
   * When true, the grid never writes committed edits into your row objects — the application owns
   * the write-back. Every user write path (editor commit, `setCellValue`, paste/cut/clear) still
   * runs the full pipeline — `valueParser`, `onBeforeCellCommit`, `editingChanged`, and
   * `cellValueChanged` with `oldValue`/`value`/`source` — but the row data is left untouched and
   * nothing enters undo history (undo/redo have nothing to replay; drive changes through your
   * store instead). Handle `onCellValueChanged` and feed the accepted value back via your own
   * state update (`rowData` or `applyTransaction`). Built for immutable-store consumers; see also
   * the editing guide's "Edits write into your row objects" note. Defaults to false.
   */
  readOnlyEdit?: boolean;
  /**
   * Initial sort applied once when the grid first sets up its columns — an ordered list of
   * `{ colId, dir }` (first = primary sort). Per-column `ColDef.sort` / `sortIndex` take precedence:
   * a column with its own `sort` keeps that, and `initialSort` only fills columns not covered that
   * way. Not kept in sync with later user sorting. Client-side row model.
   */
  initialSort?: InitialSortItem[];
  /**
   * When the multi-column sort priority number is shown on the sort icon: "multi" (default — only
   * when 2+ columns are sorted), "always" (whenever a column is sorted), or "never".
   */
  showSortPriority?: ShowSortPriority;
  /**
   * When true, cells of pinned rows can be edited: application-pinned top/bottom data rows
   * (`pinnedTopRowData` / `pinnedBottomRowData`) and pinned tree-data parent rows. Synthetic group
   * headers are never editable regardless. Edits to application-pinned rows write directly into
   * the provided row data objects (they live outside the row model). Defaults to false.
   */
  pinnedRowsEditable?: boolean;
  /**
   * When true, the body context menu offers "Pin row" (to top / to bottom) and "Unpin row" for the
   * rows owning the selected cells: a single-cell selection targets its owning row, a row selection
   * targets the selected rows, and a cell range targets every row the range covers (including group
   * header rows). Right-clicking outside the selection targets the clicked row only. Pinning uses
   * the same mechanism as {@link IGridAPI.setRowPinned}; a menu unpin overrides rows pinned by
   * {@link GridOptions.isRowPinned}. Application-supplied band rows (`pinnedTopRowData` /
   * `pinnedBottomRowData`) are application-owned and never targeted. Defaults to false.
   */
  rowPinningMenu?: boolean;
  /**
   * Adds Insert → "1 row above" / "1 row below" to row-number context menus. The option is
   * intentionally absent by default and only applies to client-side model rows. `createRow`
   * supplies the new row; `canInsert` can conditionally hide either direction.
   */
  rowInsertionMenu?: RowInsertionMenuOptions;
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
   * How grouped rows are laid out. Defaults to "singleColumn".
   */
  groupDisplayType?: GroupDisplayType;
  /**
   * Definition for the auto-generated group column shown in `groupDisplayType: "singleColumn"`.
   * It is a regular column: label, width, pinning, sorting, moving, resizing, visibility, and other
   * ordinary column options apply. Defaults to an unpinned, movable, resizable, sortable column
   * labelled "Group". Sorting it orders the group buckets at every grouping level (client-side row
   * model; on the server-side row model the sort is forwarded to the data source keyed by the
   * internal group column id). Identity and grouping-machinery fields (`colId`, `key`, `children`,
   * `groupable`, `aggregatable`, `filter`) are grid-owned and cannot be overridden.
   */
  groupColumnDef?: Partial<ColDef>;
  /**
   * Depth to which groups start expanded when a grouping is first applied. 0 (default) leaves all
   * groups collapsed; a value of N expands the first N levels; -1 expands all levels. Per-group
   * expansion state set by the user afterwards takes precedence.
   */
  groupDefaultExpanded?: number;
  /**
   * How sorts propagate through grouped rows: "local" (default) confines each sort to its own
   * grouping level or leaf rows; "hierarchy" lets grouped-column sorts reorder ancestor groups;
   * "global" lets any sort reorder groups from the globally sorted leaf order. Client-side only;
   * the server-side row model always behaves as "local" (per-listing requests carry no
   * cross-level ordering context).
   */
  groupSortMode?: GroupSortMode;
  /**
   * Start the grid in pivot mode. Rows display as the row-group tree (leaf rows never show) and
   * the header is generated from data: one nested column group per distinct value of each pivot
   * column, one value leaf per aggregated column. Non-participating source columns are hidden
   * while pivoted (they return exactly on exit). Toggle at runtime with `api.setPivotMode` or the
   * `pivotModeSet` action. Client-side row model only; mutually exclusive with tree data.
   */
  pivotMode?: boolean;
  /**
   * Columns to pivot on, in level order (outermost first), by colId. Stored even while pivot mode
   * is off; change at runtime with `api.setPivotColumns`. With pivot mode on and no pivot columns
   * the grid shows the degenerate grouped-aggregate view (one generated leaf per value entry).
   */
  pivotColumns?: string[];
  /**
   * Definition overlay for every generated pivot VALUE column (width, cellClass, formatter…).
   * Identity and behavior locks (`colId`, `editable: false`, `movable: false`, `filter: false`,
   * …) are grid-owned and cannot be overridden. Generated group headers take no overlay.
   */
  pivotResultColumnDef?: Partial<ColDef>;
  /**
   * Cap on generated pivot leaf columns (default 200). A discovery past the cap truncates
   * deterministically — the first columns in header order survive — and fires
   * `pivotColumnLimitReached`; never a hard failure. That event is latched: it reports the start
   * of truncation, any change in how much is dropped, and the return under the cap.
   *
   * The cap is a target, not an exact ceiling, because truncation is **per pivot value**: a value
   * is kept or dropped with all of its measures, so the generated count is always a whole multiple
   * of the measure count. It can land under the cap — 3 measures against a cap of 200 keep
   * `⌊200 / 3⌋ = 66` values, so 198 columns — and, because at least one value always survives, it
   * can land over it: 5 measures against a cap of 3 generate 5 columns.
   */
  maxPivotColumns?: number;
  /**
   * What dragging a generated pivot value column in the header does (default `"measures"`).
   *
   * - `"measures"` — a drop reorders the MEASURES (the aggregate model): every generated group
   *   re-renders its value leaves in the new order, symmetry is preserved, and the order is the
   *   same one `setAggregates` and the column panel's Values well control.
   * - `"free"` — value leaves (and whole generated groups) arrange per position: a leaf can leave
   *   its group and sit anywhere in the pivot area, carrying duplicated group captions with it
   *   (the split-and-carry behavior source column groups have). The arrangement is a leaf-order
   *   list over the generated columns (`setPivotColumnOrder` / view state `pivotColumnOrder`); it
   *   survives data- and filter-driven re-discoveries, and resets to the canonical layout on any
   *   explicit role edit (`setAggregates`, `setPivotColumns`, and the menus/wells that call them).
   */
  pivotColumnMoveMode?: "measures" | "free";
  /**
   * Client-side hierarchical data. Supports full paths, parent-id references, or nested children.
   * Tree data is mutually exclusive with column-value row grouping.
   */
  treeData?: TreeDataOptions;
  /**
   * Whether group (summary) rows participate in cell selection, keyboard navigation, and clipboard
   * copy/cut. When false (default), group rows are skipped: clicking a group cell selects nothing,
   * arrow/block navigation jumps over group rows to the nearest leaf, and copy/cut omits group
   * rows. When true, group cells behave like ordinary cells for selection/nav/clipboard (editing is
   * always blocked on group rows regardless). Client-side row model only.
   */
  groupRowsSelectable?: boolean;
  /**
   * Pins displayed row-model nodes into a frozen top or bottom band. This is primarily useful for
   * generated group nodes, which cannot be supplied through pinnedTopRowData/pinnedBottomRowData.
   * The live node moves out of the body section while pinned and retains group expansion and
   * aggregate values; unpinning returns it to its model-owned body position.
   */
  isRowPinned?: (params: IsRowPinnedParams) => RowPinnedPosition | null | undefined;
  /**
   * When true, the expanded ancestor groups of the first visible body row stack in a frozen band
   * beneath pinnedTopRowData and explicitly pinned top rows. Works with client-side grouping and
   * server-side grouping. Server-side note: a group whose listing has not reported `totalRows`
   * has a provisional block end, so its docked header stays docked while further children load
   * (the sticky span extends as blocks arrive, mirroring the pager's provisional "N+" semantics).
   */
  groupRowsSticky?: boolean;
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
   * Default column definition merged *under* every column. Any {@link ColDef} field set here becomes
   * the grid-wide default for that field; an explicit value on an individual column always wins, and
   * a built-in default applies when neither supplies one (precedence: column › `defaultColDef` ›
   * built-in). Merge is shallow at the top-level field, so a nested object (e.g. `cellRendererParams`,
   * `filterParams`, `actionFrameOptions`) set on a column replaces — does not merge with — the one
   * here. The per-column identity/structural fields (`colId`, `key`, `label`, `children`) are not
   * accepted (see {@link DefaultColDef}).
   */
  defaultColDef?: DefaultColDef;
  /**
   * Tooltips. Pass `true` (or omit) to enable with defaults, an options object to customise, or
   * `false` to disable all tooltips (including the built-in auto-truncation tooltip). Enabled by
   * default. See {@link TooltipOptions}.
   */
  tooltip?: boolean | TooltipOptions;
  /**
   * Quick filter (global search across all visible columns). Pass `true` to enable with defaults,
   * or an options object to customise. Omitted/false disables the feature. Client-side row model
   * only (server-side ignores it).
   */
  quickFilter?: boolean | QuickFilterOptions;
  /**
   * Built-in right-side column management panel. Pass `true` to show a collapsed "Columns" rail,
   * or an options object to configure its initial open state and width. The panel supports search,
   * live show/hide, pinning, drag/keyboard reordering, and restoring the initial column layout.
   * Omitted/false disables it.
   */
  columnPanel?: boolean | ColumnPanelOptions;
  /**
   * Built-in toolbar sections. Every section is disabled by default; enabling any section mounts
   * the toolbar. Section visibility can be changed live without recreating the grid.
   */
  toolbar?: GridToolbarOptions;
  /** Application-owned view definitions and persistence callbacks for `toolbar.views`. */
  savedViews?: SavedViewsOptions;
  /**
   * Spreadsheet-style sheet tabs in the footer's left zone (Data sheet + pivot sheets over one
   * shared row model). Supplying this option mounts the tab strip; the application owns the sheet
   * list and persistence through its callbacks. See {@link SheetsOptions}.
   */
  sheets?: SheetsOptions;
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
   * Text of the inline header hint shown while pivot mode is on but no aggregates have been chosen
   * (pivot mode with no values generates no columns, so the header would otherwise be a bare group
   * column). Defaults to "Choose Aggregate on a column to add values" — override it to match the
   * wording of your own aggregate entry point, or to translate it.
   */
  pivotNoValuesMessage?: string;
  /**
   * Text of the empty-state message shown while pivot mode is on but nothing is configured — no
   * row group, no pivot column, no value. That state displays no columns and no rows at all (the
   * blank canvas a fresh pivot sheet opens on), so this message is the whole screen. Defaults to
   * "Add row groups, column labels or values to build the pivot".
   */
  pivotEmptyMessage?: string;
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
  /**
   * Opt out of the grid delivering its own base stylesheet on attach. Set this
   * when the application imports `@agility-workbench/grid/styles.css` itself —
   * otherwise both copies apply, and the injected one sorts later and would
   * start winning over overrides written against the imported sheet.
   */
  suppressStyleInjection?: boolean;
  /**
   * CSP nonce for the injected `<style>` element, for apps served with
   * `style-src 'nonce-...'` and without `'unsafe-inline'`. Nonces are global to
   * a page, so every grid on the page must be given the same value. Not needed
   * for grids inside a shadow root, which are styled via CSSOM and are exempt
   * from `style-src`.
   */
  styleNonce?: string;
}

export interface InternalGridOptions extends GridOptions {
  headerHeight: number;
  leafHeaderHeight: number;
  parentHeaderHeight: number;
  rowHeight: number;
  pinnedTopRowData: any[];
  pinnedBottomRowData: any[];
  /** Resolved from the public `"auto"` default — the row model is consulted at data-set time for
   * whether a diff is actually possible, so this only records what was asked for. */
  rowDataMode: RowDataMode;
  asyncTransactionWaitMs: number;
  overscanRowCount: number;
  minResizeWidth: number;
  maxColumnWidth: number;
  allowExportAsCSV: boolean;
  allowExportAsExcel: boolean;
  pagination: boolean;
  paginationControls: ResolvedPaginationControlsOptions;
  rowNumbers: boolean;
  rowHover: boolean;
  columnHover: boolean;
  zebraRows: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  highlightActiveCell: boolean;
  rowSelection: boolean;
  rowSelectionMode: "single" | "multiple";
  rowSelectionCheckboxes: boolean;
  rowSelectionHeaderCheckbox: boolean;
  rowSelectionCheckboxColumnPinnable: boolean;
  rowSelectionCheckboxColumnPinned: "left" | "right" | null;
  cellSelection: CellSelectionMode;
  rangeSelection: boolean;
  columnSelection: boolean;
  headerKeyboardNavigation: boolean;
  showColumnButtonsOnHover: boolean;
  bodyContextMenu: boolean | BodyContextMenuGetter;
  selectAllRowsOnHeaderClick: boolean;
  selectAllScope: "page" | "filtered";
  selectionPersistence: "clear" | "keep";
  resetPageOn: ResetPageTrigger[];
  pageSize: number;
  pageSizes: number[];
  serverSideBlockSize: number;
  getGroupChildCount?: (row: any) => number | null | undefined;
  paginationUnknownTotalTooltip: string;
  autosizeColumnsOnDataChange: boolean;
  clearSelectionOnBodyClick: boolean;
  undoLimit: number;
  editTrigger: EditTrigger;
  readOnlyEdit: boolean;
  pinnedRowsEditable: boolean;
  rowPinningMenu: boolean;
  rowInsertionMenu?: RowInsertionMenuOptions;
  suppressKeyboardEdit: boolean;
  suppressTypeToEdit: boolean;
  moveAfterEdit: boolean;
  commitOnBlur: boolean;
  showSortPriority: ShowSortPriority;
  reevaluateOnEdit: boolean;
  groupDisplayType: GroupDisplayType;
  groupColumnDef?: Partial<ColDef>;
  groupDefaultExpanded: number;
  groupSortMode: GroupSortMode;
  pivotMode: boolean;
  pivotColumns: string[];
  pivotResultColumnDef?: Partial<ColDef>;
  maxPivotColumns: number;
  pivotColumnMoveMode: "measures" | "free";
  treeData?: TreeDataOptions;
  groupRowsSelectable: boolean;
  isRowSelectable?: (node: IRowNode) => boolean;
  isRowPinned?: (params: IsRowPinnedParams) => RowPinnedPosition | null | undefined;
  groupRowsSticky: boolean;
  isFullWidthRow?: (node: IRowNode) => boolean;
  fullWidthCellRenderer?: CellRenderer;
  defaultColDef?: DefaultColDef;
  tooltip: boolean | TooltipOptions;
  quickFilter: boolean | QuickFilterOptions;
  columnPanel: boolean | ColumnPanelOptions;
  toolbar: GridToolbarOptions;
  savedViews?: SavedViewsOptions;
  sheets?: SheetsOptions;
  loadingMessage: string;
  noRowsMessage: string;
  pivotNoValuesMessage: string;
  pivotEmptyMessage: string;
  filterDebounceMs: number;
  cellFlashDuration: number;
  cellFadeDuration: number;
  icons?: GridIconMap;
}

/**
 * The keys of {@link RuntimeGridOptions}, as a value. The type is derived from this list so the two
 * cannot drift: anything added here becomes part of the runtime slice, and nothing else can be.
 */
export const RUNTIME_OPTION_KEYS = [
  "rowHover",
  "columnHover",
  "zebraRows",
  "getRowClass",
  "getRowStyle",
  "getRowPresentation",
  "ariaLabel",
  "ariaLabelledBy",
  "highlightActiveCell",
  "cellSelection",
  "rangeSelection",
  "columnSelection",
  "headerKeyboardNavigation",
  "showColumnButtonsOnHover",
  "bodyContextMenu",
  "editTrigger",
  "readOnlyEdit",
  "pinnedRowsEditable",
  "rowPinningMenu",
  "rowInsertionMenu",
  "suppressKeyboardEdit",
  "suppressTypeToEdit",
  "moveAfterEdit",
  "commitOnBlur",
  "asyncTransactionWaitMs",
] as const;

/**
 * Grid options whose behavior can be changed in place after construction. Structural/initial
 * options (row model, row identity, initial sort, etc.) are intentionally excluded.
 *
 * This slice is applied as a unit: a consumer changing one member supplies the current values of the
 * rest (`IGridAPI.updateGridOptions` does that bookkeeping).
 */
export type RuntimeGridOptions = Pick<
  InternalGridOptions,
  (typeof RUNTIME_OPTION_KEYS)[number]
>;

/**
 * Updatable options owned by the renderer's widgets, the pinned-row bands, row-group presentation,
 * and the server-side plumbing. Unlike the runtime slice, each of these is applied independently.
 */
export const WIDGET_OPTION_KEYS = [
  "toolbar",
  "quickFilter",
  "tooltip",
  "columnPanel",
  "savedViews",
  "sheets",
  "pagination",
  "paginationControls",
  "rowSelection",
  "theme",
  "icons",
  "pinnedTopRowData",
  "pinnedBottomRowData",
  "isRowPinned",
  "groupRowsSticky",
  "groupDisplayType",
  "groupSortMode",
  "groupRowsSelectable",
  "pivotColumnMoveMode",
  "isRowSelectable",
  "serverSideDataSource",
  "serverSideAggregationSource",
] as const satisfies readonly (keyof GridOptions)[];

/** Every option `IGridAPI.updateGridOptions` accepts, as a value (used to reject the rest). */
export const UPDATABLE_OPTION_KEYS = [
  ...RUNTIME_OPTION_KEYS,
  ...WIDGET_OPTION_KEYS,
  "columnDefs",
] as const;

/**
 * The grid options a mounted grid can be reconfigured with, via `IGridAPI.updateGridOptions`.
 *
 * Everything here is a presentation or behavior option the grid can swap in place. Options absent
 * from this type are fixed at construction because they seed structure the grid builds once
 * (`rowHeight` and the header heights feed virtualization geometry, `rowNumbers` and `rowModelType`
 * decide which columns and row model exist, `getRowId` / `rowIdKey` define row identity). Changing
 * one of those means creating a new grid.
 */
export type UpdatableGridOptions =
  Partial<RuntimeGridOptions>
  & Pick<GridOptions, (typeof WIDGET_OPTION_KEYS)[number]>
  & {
    /**
     * Replace the column definitions. Marks the schema as caller-owned, exactly as passing
     * `columnDefs` to `createGrid` does, so a later `setRowData` cannot substitute an inferred schema.
     */
    columnDefs?: ColDef[] | null;
  };
