import { FormatterOptions, FormatterOptionsParams, ValueFormatterParams, ValueParserParams } from "../column/formatters";
import { CellRenderer } from "../renderer/renderer";
import { HeaderComponent } from "../renderer/header/headerComponent";
import { TooltipComponent, TooltipComponentParams } from "../renderer/tooltip/tooltipComponent";
import { ActionFrameComponent } from "../renderer/actionFrame/actionFrameComponent";
import { CellEditor } from "../renderer/editing/cellEditor";
import { ComparatorFn, Filter, FilterParams } from "./filter";
import type { SortDir } from "./sort";
import type { SortingOrder, SortIconVisibility, TooltipColumnOptions, ActionFrameOptions } from "./gridOptions";
import type { MenuItem } from "./menuItem";
import type { ColumnMenuContext } from "../menu/context";
import type { Column } from "../column/column";
import type { AggregateKind } from "./aggregate";
import type { IRowNode } from "./iRowNode";

/**
 * Resolves the items shown in a single column's menu. Mirrors `BodyContextMenuGetter`, which does
 * the same for the body context menu.
 *
 * - `items` — what the grid built for this column; return the items to show.
 * - `column` — the resolved column. Prefer `column.colId` for identifying it: `ctx.targetColId`
 *   carries the grid's internal instance id, not the public `ColDef.colId`.
 * - `ctx` — how and where the menu was opened.
 */
export type ColumnMenuItemsGetter = (
  params: { ctx: ColumnMenuContext; column: Column; items: MenuItem[] },
) => MenuItem[];

export enum ColumnType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  BOOLEAN = "boolean",
  CURRENCY = "currency",
}

export type ColumnSection = "left" | "center" | "right";

/**
 * Built-in renderer names `ColDef.cellRenderer` accepts besides a renderer function or class.
 *
 * - `"text"` — plain formatted text, opting a column out of its type's default renderer (a
 *   `ColumnType.BOOLEAN` column otherwise draws `BooleanCellRenderer`'s checkbox).
 * - `"link"` — `LinkCellRenderer`, an `<a>` to the value (`LinkCellRendererParams`).
 * - `"image"` — `ImageCellRenderer`, an `<img>` of the value (`ImageCellRendererParams`).
 * - `"progress"` — `ProgressCellRenderer`, a bar filled to the value (`ProgressCellRendererParams`).
 * - `"rating"` — `RatingCellRenderer`, stars filled to the value (`RatingCellRendererParams`).
 *
 * Each built-in reads its options from `cellRendererParams`.
 */
export type CellRendererAlias = "text" | "link" | "image" | "progress" | "rating";

/** Context passed to the per-column cell styling callbacks (`cellClass` / `cellStyle`). */
export interface CellClassParams<TData = any> {
  /** The raw cell value (from valueGetter / row data). */
  value: any;
  /** The row's underlying data object (a placeholder on a client-side group row). */
  data: TData;
  /** The row's stable id. */
  rowId: string;
  /** The row's current view index. */
  rowIndex: number;
  /** The column definition for this cell. */
  colDef: ColDef<TData>;
  /** Resolved defaults and metadata for this row, when `getRowPresentation` is configured. */
  rowPresentation?: import("./gridOptions").RowPresentation;
  /** The row node. Set for body cells (`cellClass`, `cellStyle`, `actionFrameIndicator`); absent
   * where the grid evaluates a callback against a row it has no node for (exports). */
  node?: import("./iRowNode").IRowNode<TData>;
  /** True on a group row. Only `actionFrameIndicator` is evaluated on group rows, where `value`
   * is the group cell's value (its aggregate, or the label on the group's label column). */
  isGroup?: boolean;
}

/** Context passed to `ColDef.groupValueGetter` for one group row. */
export interface GroupValueGetterParams<TData = any> {
  /** The group row: `level`, `groupKey`, `groupValue`, `isExpanded` say where it sits. */
  node: import("./iRowNode").IRowNode<TData>;
  /**
   * Server-side row model: the raw group row the data source returned (a `COUNT(*)` or any other
   * field of the GROUP BY result is read off it). Client-side row model: undefined — a client-side
   * group row is synthesized and has no data row of its own. Typed `any` rather than the row type:
   * a server-side group row has the GROUP BY result's shape, not a leaf row's.
   */
  data: any;
  /**
   * This group's aggregate values by colId — one entry per column with an aggregate assigned that
   * has a value for this group (a server-side group row carries only what the server stamped).
   */
  aggregates: Readonly<Record<string, unknown>>;
}

/** Extra CSS class(es) for a cell: a static value or a function of the cell context. */
export type CellClass<TData = any> =
  | string
  | string[]
  | ((params: CellClassParams<TData>) => string | string[] | null | undefined);

/** Inline styles for a cell: a static object or a function of the cell context. */
export type CellStyle<TData = any> =
  | Partial<CSSStyleDeclaration>
  | ((params: CellClassParams<TData>) => Partial<CSSStyleDeclaration> | null | undefined);

/**
 * One column (or, with `children`, one column group) of the grid.
 *
 * `TData` is the row type — the shape of one object in `rowData` — and defaults to `any`, so an
 * unparameterized `ColDef` behaves exactly as before. Supplying it (`ColDef<Trade>`) types the
 * row wherever a column callback receives one:
 * - `valueGetter` gets the row node, `IRowNode<TData>` (read the row off `node.data`);
 * - `cellClass` / `cellStyle` / `colSpan` / `actionFrameIndicator` get `CellClassParams<TData>`
 *   (`data: TData`, `node: IRowNode<TData>`);
 * - `cellRenderer` gets `CellRendererParams<TData>` (`node: IRowNode<TData>`; its `data` stays
 *   `any`, being the row node on a column cell — see `CellRendererParams.data`);
 * - `cellEditor` gets `ICellEditorParams<TData>` (`row: IRowNode<TData>`);
 * - `tooltipComponent` / `tooltipValueGetter` get `TooltipComponentParams<TData>` (`data: TData`);
 * - `actionFrameComponent` gets `ActionFrameComponentParams<TData>` (`data: TData`);
 * - `valueFormatter` / `valueParser` get the row node as `row: IRowNode<TData>`;
 * - `groupValueGetter`, `comparator` and a function `filter` get `IRowNode<TData>` nodes;
 * - `children` are `ColDef<TData>` too.
 *
 * Cell values themselves stay `any` (a column's value type is not derived from `TData`), and the
 * runtime `Column` objects the grid hands back (`CellRendererParams.colDef`, `api.getColumn`) are
 * not parameterized.
 */
export interface ColDef<TData = any> {
  colId?: string;
  key?: string;
  label: string;
  /**
   * Custom component for this column's header *content* — replaces the label, sort icon, and group
   * expander (the `.pte-hcell-content` slot). The grid still renders the resize handle and the
   * filter/menu button row. A function returning an element/string, or a class with
   * `init/getGui/refresh/destroy` (see {@link HeaderComponent}). Overridden by `headerCellComponent`
   * when both are set on the same column (Level 2 wins). A grid-wide default can be supplied via
   * `defaultColDef.headerComponent`.
   */
  headerComponent?: HeaderComponent;
  /**
   * Custom component for the *entire* header cell — replaces the content *and* the filter/menu
   * buttons. The grid keeps only the resize handle. Reuse the grid header CSS classes
   * (`.pte-hcell-sort`, `.pte-hcell-menu-btn`, `.pte-hcell-menu-filterBtn`, `.pte-hcell-content`) to
   * inherit default click routing, or drive sort/filter/menu/select via the callbacks on the
   * component params. Takes precedence over `headerComponent`. A grid-wide default can be supplied
   * via `defaultColDef.headerCellComponent`.
   */
  headerCellComponent?: HeaderComponent;
  /**
   * Tooltip content for this column's body cells, resolved in precedence order:
   * `tooltipComponent` → `tooltipValueGetter` → `tooltipField` → built-in auto-truncation (the cell's
   * own full text when clipped). A grid-wide default for any of these can be supplied via
   * `defaultColDef` (e.g. `defaultColDef.tooltipComponent`).
   *
   * `tooltipField` reads a string from another field on the row.
   */
  tooltipField?: string;
  /** Computes tooltip text for a body cell. See {@link tooltipField} for precedence. */
  tooltipValueGetter?: (params: TooltipComponentParams<TData>) => string | null | undefined;
  /**
   * Custom component rendered inside the tooltip (a function returning an element/string, or a class
   * with `init/getGui/refresh/destroy`). Highest precedence. See {@link TooltipComponent}.
   */
  tooltipComponent?: TooltipComponent<TData>;
  /** Extra params merged into {@link TooltipComponentParams} for this column's tooltip component. */
  tooltipComponentParams?: any;
  /**
   * Per-column tooltip presentation overrides (mode, placement, interactive, escapeRootClip). Each
   * omitted field falls back to the grid-level `tooltip` option. See {@link TooltipColumnOptions}.
   */
  tooltipOptions?: TooltipColumnOptions;
  /**
   * Controls which row-presentation cell defaults this column inherits. Omitted fields inherit.
   * `false` opts out of every cell-level row default for this column.
   */
  inheritRowPresentation?: boolean | {
    cellClass?: boolean;
    cellStyle?: boolean;
    tooltip?: boolean;
    /** Ignore the row-level `editable` gate when false. The column's own `editable` still applies. */
    editable?: boolean;
  };
  /** Opt this column out of the built-in auto-truncation tooltip (on by default). */
  suppressAutoTooltip?: boolean;
  /**
   * ActionFrame form body for this column's body cells — the client-owned content rendered inside
   * the popover attached to a framed cell (à la a Google Sheets comment). See
   * {@link ActionFrameComponent}. A grid-wide default can be supplied via
   * `defaultColDef.actionFrameComponent`.
   *
   * Group rows host frames too, wherever the cell cursor can land on them: with
   * `groupRowsSelectable`, or in pivot mode. The component receives `isGroup` and `node`, and
   * `value` is the group cell's value (its aggregate, or the label on the group's label column). In
   * `groupDisplayType: "groupRows"` a group row has a single full-width cell standing in for the
   * nominal column (the first non-leading leaf), so only that column's frame opens there.
   */
  actionFrameComponent?: ActionFrameComponent<TData>;
  /** Extra params merged into {@link ActionFrameComponentParams} for this column's ActionFrame. */
  actionFrameComponentParams?: any;
  /**
   * Built-in trigger that opens this column's ActionFrame. `"click"` opens on a single cell click;
   * `"none"` (default) disables the built-in trigger (the API and the Shift+F2 keyboard shortcut
   * still work). Clicking a cell-selectable group row's cell triggers like a leaf cell; in
   * `"groupRows"` mode the full-width cell triggers the nominal column's frame.
   */
  actionFrameTrigger?: "click" | "none";
  /**
   * Per-column ActionFrame presentation overrides (popover placement / offset / clip escape). A
   * grid-wide default can be supplied via `defaultColDef.actionFrameOptions`; note the merge with
   * `defaultColDef` is shallow, so a value set here replaces (does not field-merge with) the default.
   * See {@link ActionFrameOptions}.
   */
  actionFrameOptions?: ActionFrameOptions;
  /**
   * Opt-in visual indicator marking body cells whose ActionFrame has content (a small corner
   * triangle, à la a spreadsheet comment marker). Off by default. Three forms:
   *   - `true` — mark every cell in the column.
   *   - a field name (string) — mark when `row.data[field]` is truthy.
   *   - a predicate — mark when it returns true for the cell.
   * Recomputed as cells scroll into view (recycle-safe). This is a grid-drawn convenience; a custom
   * `cellRenderer` can still draw any indicator instead.
   *
   * Group rows are evaluated too: the predicate gets `isGroup`, `node` and the group cell's value,
   * while a field name reads the group's (synthetic) data and so never marks a client-side group.
   * In `"groupRows"` mode the full-width cell carries the nominal column's indicator.
   */
  actionFrameIndicator?: boolean | string | ((params: CellClassParams<TData>) => boolean);
  /**
   * Tooltip for this column's *header* cell. A plain string, or a custom {@link TooltipComponent}.
   */
  headerTooltip?: string | TooltipComponent;
  width?: number;    // fixed width
  minWidth?: number; // minimum width (resizable)
  maxWidth?: number; // maximum width (resizable)
  depth?: number;   // for hierarchical columns
  /**
   * Computes this column's value on a leaf row. Receives the row NODE, not the row data object:
   * read the row off `node.data`. Never runs on a group row (see {@link groupValueGetter}).
   */
  valueGetter?: (node: IRowNode<TData>) => any;
  /**
   * The value this column holds on a GROUP row when no aggregate is assigned to it. Receives the
   * group node, its aggregates by colId, and (server-side row model only) the group's raw data
   * row. Runs after the aggregate and group-label steps of the group cell value rule and before
   * the empty fallback; it never runs on a leaf row and `valueGetter` never runs on a group row.
   * One rule feeds cell renderers, the clipboard and the click/ActionFrame payloads alike.
   */
  groupValueGetter?: (params: GroupValueGetterParams<TData>) => any;
  valueFormatter?: (params: ValueFormatterParams<TData>) => string;
  // When true, cells in this column can be edited (e.g. via double-click). Defaults to false.
  editable?: boolean;
  // Converts text headed for a cell — typed, pasted, filled, or a string given to setCellValue —
  // into the stored value. Return the exported `REJECT` to refuse the text (the cell keeps its
  // value). When omitted, the built-in parser for the column's `type` runs: numbers and currency
  // through Number(), dates from ISO 8601 text in the cell's stored shape, booleans from
  // true/false/yes/no/1/0, and strings verbatim; blank is null, and text the type cannot hold is
  // refused.
  valueParser?: (params: ValueParserParams<TData>) => any;
  // The editor used when a cell in this column is edited. A built-in alias ("text" | "number" |
  // "date" | "boolean" | "select" | "textarea"), a custom editor class, or a factory function.
  // When omitted, a default is chosen from `type` (number→number, date→date, boolean→boolean,
  // else text).
  cellEditor?: CellEditor<TData>;
  // Config passed to the editor (e.g. { values } for the select editor).
  cellEditorParams?: any;
  formatterOptions?: FormatterOptions | ((params: FormatterOptionsParams) => FormatterOptions);
  /**
   * What a data cell in this column shows: a renderer function, a renderer class, or a built-in
   * name (`CellRendererAlias`: `"link"`, `"image"`, `"progress"`, `"rating"`, `"text"`). When
   * omitted, a `ColumnType.BOOLEAN` column draws a checkbox (`BooleanCellRenderer`) and every other
   * type shows the formatted value as text; set `"text"` to keep a boolean column as text. The
   * renderer changes only what the cell shows: export, the clipboard, tooltips and quick-filter
   * matching still read the formatted value.
   */
  cellRenderer?: CellRenderer<TData> | CellRendererAlias;
  /** Options for the renderer, e.g. `ProgressCellRendererParams` for `cellRenderer: "progress"`. */
  cellRendererParams?: any;
  /**
   * Extra CSS class(es) applied to every data cell in this column. A static class/array, or a
   * function returning class(es) from the cell context (value, row data, etc.). Recomputed as cells
   * scroll into view; a class that stops being returned is cleared on the next repaint.
   */
  cellClass?: CellClass<TData>;
  /**
   * Inline styles applied to every data cell in this column (camelCase CSS properties). A static
   * object, or a function returning styles from the cell context. Recomputed as cells scroll into
   * view; a property that stops being returned is cleared on the next repaint.
   */
  cellStyle?: CellStyle<TData>;
  /**
   * Number of columns this cell should span horizontally: the cell widens to cover itself plus the
   * next `N-1` adjacent leaf columns, and those covered cells are hidden. Evaluated per row from the
   * cell context, so a column can span on some rows and not others. A span is clamped to the end of
   * this column's section — a colSpan never crosses a pinned (left/center/right) boundary. Values
   * `<= 1`, non-finite, or non-integer collapse to 1 (no span). Recomputed as cells scroll into
   * view.
   *
   * Note: because the cell-selection range is a rectangle in column-index space, a colSpan present
   * on some rows but not others can produce an L-shaped selection whose border under the spanned
   * portion is not drawn on the non-spanning rows. This is a known limitation.
   */
  colSpan?: (params: CellClassParams<TData>) => number;
  sparklineType?: "line" | "bar" | "area";
  type?: ColumnType;
  format?: string; // e.g., for date or currency formatting
  children?: ColDef<TData>[];
  hidden?: boolean;
  pinned?: "left" | "right";
  sortable?: boolean;
  /**
   * The cycle this column steps through on successive sort clicks — an ordered list of directions
   * where `null` is the unsorted state (e.g. `["desc", "asc", null]` for descending-first). Overrides
   * the grid-level `sortingOrder`. When omitted, the grid-level order (default `["asc", "desc", null]`)
   * applies.
   */
  sortingOrder?: SortingOrder;
  /**
   * When the sort icon is shown for this column: "always" shows the neutral icon at rest, "hover"
   * reveals it on header hover / focus, "never" renders no icon (still sortable via menu / Shift+click
   * / API). Overrides the grid-level `sortIconVisibility` for this column.
   */
  sortIconVisibility?: SortIconVisibility;
  /**
   * Custom sort comparator for this column: `(a, b, nodeA, nodeB) => number` (negative if a<b).
   * `a`/`b` are the two cell values; the row nodes are provided for value-getter or cross-field
   * comparisons. When omitted, a comparator is auto-derived from the column `type`.
   */
  comparator?: ComparatorFn<TData>;
  /**
   * Initial sort direction for this column ("asc" | "desc"), applied once when the grid first sets
   * up its columns. Combine with `sortIndex` to order a multi-column initial sort. Overrides the
   * grid-level `initialSort` for this column. Not kept in sync with later user sorting.
   */
  sort?: SortDir;
  /**
   * Order of this column within a multi-column initial sort (lower first). Only meaningful alongside
   * `sort`. Columns with `sort` but no `sortIndex` are ordered after indexed ones, in definition
   * order.
   */
  sortIndex?: number;
  filter?: Filter<TData>;
  filterParams?: FilterParams;
  groupable?: boolean;
  /**
   * When true (default), the column menu includes aggregation actions for this column. For a
   * multi-column selection, every selected column must be aggregatable for the aggregate item to
   * appear.
   */
  aggregatable?: boolean;
  /**
   * The column's aggregate function: a built-in {@link AggregateType} (`"sum"`, `"first"`, …) or
   * the name of a function in `GridOptions.aggFuncs`. Two effects:
   * - It is the column's DEFAULT function — what the footer, the aggregate menu and an aggregate
   *   assignment without a type use — in place of the built-in rule (sum for numeric columns,
   *   count otherwise).
   * - The column is aggregated from the start: it joins the initial aggregate model exactly as if
   *   `api.setAggregates` had listed it (so group rows show its per-group values and the footer
   *   turns on at page scope). Removing it from the model afterwards — the menu, the column panel,
   *   `setAggregates([])` — sticks; the seeding happens once, with the first column definitions.
   *
   * An unknown name warns once and the column keeps the built-in rule. Ignored, with a warning, on
   * an `aggregatable: false` column. Read with the column definitions.
   */
  aggFunc?: AggregateKind;
  /**
   * When true (default), this column can be pivoted on: the column menu offers "Pivot on Column"
   * and `setPivotColumns` accepts it. For a multi-column selection, every selected column must be
   * pivotable for the pivot item to appear.
   */
  pivotable?: boolean;
  /**
   * Orders this column's distinct values across the generated pivot header when the column is
   * pivoted on: `(a, b) => number` over raw cell values, applied ascending. When omitted, the
   * column's sort `comparator` (or its type-derived default) orders the pivot values; blanks
   * always sort last.
   */
  pivotComparator?: (a: any, b: any) => number;
  resizable?: boolean;
  movable?: boolean;
  /**
   * Keep this column at an edge of its section: `true` or `"left"` holds it at the left edge of
   * its section's order (after the selection-checkbox column), `"right"` at the right edge. A
   * locked column cannot be dragged or moved (header drag, column panel, `api.moveColumn`), columns
   * dropped next to it never displace it, and `applyColumnState`, saved views and `setColumnDefs`
   * put it back at its edge. Several columns locked to the same edge keep their relative order.
   * Pinning still works and composes: a locked column pinned left sits at the edge of the left
   * section. On a child of a column group the lock applies within the group (the group's edge);
   * set it on the group definition to lock the whole group. Default `false`.
   */
  lockPosition?: boolean | "left" | "right";
  /**
   * Wrap a long header label onto several lines instead of truncating it on one; the sort icon,
   * menu and expander keep their place beside it. Without {@link autoHeaderHeight} the header keeps
   * its configured height and a label that wraps past it is clipped. Works on group definitions
   * too, and in `defaultColDef`. Default `false`.
   */
  wrapHeaderText?: boolean;
  /**
   * Grow the header level this column's label sits on so the whole label fits: the level becomes
   * as tall as the tallest such label on it (plus the cell's padding), never shorter than its
   * configured `headerHeight` / `leafHeaderHeight` / `parentHeaderHeight`. Meant for use with
   * {@link wrapHeaderText}; on a group definition it grows that group's level. Pinned sections grow
   * together. Re-measured when widths, visible columns, labels, header heights, the theme or the
   * loaded fonts change. Default `false`.
   */
  autoHeaderHeight?: boolean;
  hideable?: boolean;
  /**
   * Omit this column from the built-in column-management drawer while leaving it available in the
   * grid, column state, menus, and API. Default false.
   */
  suppressColumnPanel?: boolean;
  /**
   * Column-menu content, or `false` to remove the menu entirely.
   *
   * As a function, it is called each time this column's menu opens and returns the items to
   * show — receiving the grid's built-in items so they can be extended, reordered, filtered, or
   * discarded. Items are plain {@link MenuItem} objects: `label`, `left` (an icon CSS class or an
   * element), and `onClick` cover most cases, and `onClick` takes precedence over the built-in
   * command an item would otherwise run. Returning an empty array opens no menu.
   *
   * It runs only when the menu targets this column alone. When several columns are selected the
   * built-in items act on the whole set, so no single column's configuration governs them and the
   * defaults are used unchanged.
   *
   * Set it on `defaultColDef` to customize every column's menu from one place.
   *
   * `false` is a hard veto: it hides the ⋮ button *and* disables the header context menu,
   * overriding `showColumnMenu` and `columnContextMenu`. Use those two instead when you want only
   * one of the entry points (button without right-click, or the reverse).
   */
  columnMenu?: false | ColumnMenuItemsGetter;
  /**
   * When true (default), the column header shows its menu (⋮) button, which opens the column menu.
   * When false, the button is hidden; the column menu can still be reached via right-click unless
   * `columnContextMenu` is also false. Ignored when `columnMenu` is `false`.
   */
  showColumnMenu?: boolean;
  /**
   * When true (default), right-clicking this column's header opens the column context menu. When
   * false, the header context menu is disabled for this column and the browser's native menu
   * appears instead. The menu (⋮) button is unaffected (see `showColumnMenu`). Ignored when
   * `columnMenu` is `false`.
   */
  columnContextMenu?: boolean;
  columnGroupShow?: "open" | "closed";
  openByDefault?: boolean;
  exportable?: boolean;
}

/**
 * ColDef fields that are per-column identity / structure and therefore never inherit from a
 * grid-level `defaultColDef` — sharing them across columns would be meaningless or actively wrong
 * (e.g. every column ending up with the same `colId`). Single source of truth: both the
 * `DefaultColDef` type and the runtime merge in `ColumnModel` derive from this list, so they can't
 * drift apart.
 */
export const NON_DEFAULTABLE_COLDEF_KEYS = ["colId", "key", "label", "children"] as const;

/**
 * The shape of the grid-level `defaultColDef`: any {@link ColDef} field except the per-column
 * identity/structure ones (see {@link NON_DEFAULTABLE_COLDEF_KEYS}), all optional.
 */
export type DefaultColDef<TData = any> = Omit<ColDef<TData>, (typeof NON_DEFAULTABLE_COLDEF_KEYS)[number]>;
