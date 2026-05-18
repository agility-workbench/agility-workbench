import { FormatterOptions, FormatterOptionsParams, ValueFormatterParams } from "../column/formatters";
import { CellRenderer } from "../renderer/renderer";
import { Filter, FilterParams } from "./filter";

export enum ColumnType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  BOOLEAN = "boolean",
  CURRENCY = "currency",
}

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
  formatterOptions?: FormatterOptions | ((params: FormatterOptionsParams) => FormatterOptions);
  cellRenderer?: CellRenderer;
  cellRendererParams?: any;
  sparklineType?: "line" | "bar" | "column";
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
