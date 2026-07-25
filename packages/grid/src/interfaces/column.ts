import { FormatterOptions, FormatterOptionsParams, ValueFormatterParams, ValueParserParams } from "../column/formatters";
import { CellRenderer } from "../renderer/renderer";
import { CellEditor } from "../renderer/editing/cellEditor";
import { ComparatorFn, Filter, FilterParams } from "./filter";
import type { SortDir } from "./sort";
import type { SortingOrder, SortIconVisibility } from "./gridOptions";

export enum ColumnType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  BOOLEAN = "boolean",
  CURRENCY = "currency",
}

export type ColumnSection = "left" | "center" | "right";

/** Context passed to the per-column cell styling callbacks (`cellClass` / `cellStyle`). */
export interface CellClassParams {
  /** The raw cell value (from valueGetter / row data). */
  value: any;
  /** The row's underlying data object. */
  data: any;
  /** The row's stable id. */
  rowId: string;
  /** The row's current view index. */
  rowIndex: number;
  /** The column definition for this cell. */
  colDef: ColDef;
}

/** Extra CSS class(es) for a cell: a static value or a function of the cell context. */
export type CellClass =
  | string
  | string[]
  | ((params: CellClassParams) => string | string[] | null | undefined);

/** Inline styles for a cell: a static object or a function of the cell context. */
export type CellStyle =
  | Partial<CSSStyleDeclaration>
  | ((params: CellClassParams) => Partial<CSSStyleDeclaration> | null | undefined);

export interface ColDef {
  colId?: string;
  key?: string;
  label: string;
  width?: number;    // fixed width
  minWidth?: number; // minimum width (resizable)
  maxWidth?: number; // maximum width (resizable)
  depth?: number;   // for hierarchical columns
  valueGetter?: (row: any) => any;
  valueFormatter?: (params: ValueFormatterParams) => string;
  // When true, cells in this column can be edited (e.g. via double-click). Defaults to false.
  editable?: boolean;
  // Converts the raw string the user typed into the stored cell value. When omitted, the
  // typed text is stored verbatim.
  valueParser?: (params: ValueParserParams) => any;
  // The editor used when a cell in this column is edited. A built-in alias ("text" | "number" |
  // "date" | "boolean" | "select" | "textarea"), a custom editor class, or a factory function.
  // When omitted, a default is chosen from `type` (number→number, date→date, boolean→boolean,
  // else text).
  cellEditor?: CellEditor;
  // Config passed to the editor (e.g. { values } for the select editor).
  cellEditorParams?: any;
  formatterOptions?: FormatterOptions | ((params: FormatterOptionsParams) => FormatterOptions);
  cellRenderer?: CellRenderer;
  cellRendererParams?: any;
  /**
   * Extra CSS class(es) applied to every data cell in this column. A static class/array, or a
   * function returning class(es) from the cell context (value, row data, etc.). Recomputed as cells
   * scroll into view; a class that stops being returned is cleared on the next repaint.
   */
  cellClass?: CellClass;
  /**
   * Inline styles applied to every data cell in this column (camelCase CSS properties). A static
   * object, or a function returning styles from the cell context. Recomputed as cells scroll into
   * view; a property that stops being returned is cleared on the next repaint.
   */
  cellStyle?: CellStyle;
  sparklineType?: "line" | "bar" | "area";
  type?: ColumnType;
  format?: string; // e.g., for date or currency formatting
  children?: ColDef[];
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
  comparator?: ComparatorFn;
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
  filter?: Filter;
  filterParams?: FilterParams;
  groupable?: boolean;
  resizable?: boolean;
  movable?: boolean;
  hideable?: boolean;
  /**
   * When true (default), the column header shows its menu (⋮) button, which opens the column menu.
   * When false, the button is hidden; the column menu can still be reached via right-click unless
   * `columnContextMenu` is also false.
   */
  showColumnMenu?: boolean;
  /**
   * When true (default), right-clicking this column's header opens the column context menu. When
   * false, the header context menu is disabled for this column and the browser's native menu
   * appears instead. The menu (⋮) button is unaffected (see `showColumnMenu`).
   */
  columnContextMenu?: boolean;
  columnGroupShow?: "open" | "closed";
  openByDefault?: boolean;
  exportable?: boolean;
}
