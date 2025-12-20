export enum ColumnType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  BOOLEAN = "boolean",
  CURRENCY = "currency"
}

export interface ColumnDef {
  key: string;
  label: string;
  width?: number;    // fixed width
  minWidth?: number; // minimum width (resizable)
  maxWidth?: number; // maximum width (resizable)
  depth?: number;   // for hierarchical columns
  valueGetter?: (row: any) => any;
  valueFormatter?: (value: any, row: any) => string;
  type?: ColumnType;
  format?: string; // e.g., for date or currency formatting
  children?: ColumnDef[];
  hidden?: boolean;
  pinned?: "left" | "right";
}

export interface InternalColumnDef {
  id: string;
  key: string;
  label: string;
  width?: number;    // fixed width
  minWidth?: number; // minimum width (resizable)
  maxWidth?: number; // maximum width (resizable)
  depth?: number;   // for hierarchical columns
  valueGetter?: (row: any) => any;
  valueFormatter?: (value: any, row: any) => string;
  type?: ColumnType;
  format?: string; // e.g., for date or currency formatting
  children?: InternalColumnDef[];
  hidden?: boolean;
  pinned?: "left" | "right";
}

export function getColumnDefs(cols: (ColumnDef | any)[]): InternalColumnDef[] {
  return cols.map(getColumnDef);
}

export function getColumnDef(col: ColumnDef | any): InternalColumnDef {
  return {
    id: crypto.randomUUID(),
    key: col.key,
    label: col.label || col.key,
    width: col.width,
    minWidth: col.minWidth,
    maxWidth: col.maxWidth,
    depth: col.depth || 0,
    valueGetter: col.valueGetter,
    valueFormatter: col.valueFormatter,
    type: col.type,
    format: col.format,
    children: col.children ? col.children.map(getColumnDef) : undefined,
    hidden: col.hidden || false,
    pinned: col.pinned,
  };
}

export function getValue(row: any, col: ColumnDef): any {
  if (col.valueGetter) {
    return col.valueGetter(row);
  }
  return row[col.key];
}

export function getFormattedValue(row: any, col: ColumnDef): string {
  const value = getValue(row, col);
  if (col.valueFormatter) {
    return col.valueFormatter(value, row);
  }
  if (value == null) {
    return "";
  }
  return String(value);
}

export function formatValue(value: any, row: any, col: ColumnDef): string {
  if (col.valueFormatter) {
    return col.valueFormatter(value, row);
  }
  if (value == null) {
    return "";
  }
  return String(value);
}

export enum FilterType {
  CONTAINS = "contains",
  STARTS_WITH = "startsWith",
  ENDS_WITH = "endsWith",
  EQ = "eq",
  NEQ = "neq",
  LT = "lt",
  LTE = "lte",
  GT = "gt",
  GTE = "gte"
}

export interface FilterDef {
  key: string;
  type: FilterType;
  q?: string; // for text filters
  v?: any;   // for eq filter
}

export interface SortDef {
  key: string;
  dir: "asc" | "desc";
}

export interface MenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  subMenu?: MenuItem[];
  left?: string;
  right?: string;
}
