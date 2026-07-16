import { FormatterOptions, FormatterOptionsParams, ValueFormatterParams, ValueParserParams } from "../column/formatters";
import { CellRenderer } from "../renderer/renderer";
import { CellEditor } from "../renderer/editing/cellEditor";
import { Filter, FilterParams } from "./filter";

export enum ColumnType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  BOOLEAN = "boolean",
  CURRENCY = "currency",
}

export type ColumnSection = "left" | "center" | "right";

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
  sparklineType?: "line" | "bar" | "area";
  type?: ColumnType;
  format?: string; // e.g., for date or currency formatting
  children?: ColDef[];
  hidden?: boolean;
  pinned?: "left" | "right";
  sortable?: boolean;
  filter?: Filter;
  filterParams?: FilterParams;
  groupable?: boolean;
  resizable?: boolean;
  movable?: boolean;
  hideable?: boolean;
  columnGroupShow?: "open" | "closed";
  openByDefault?: boolean;
  exportable?: boolean;
}
