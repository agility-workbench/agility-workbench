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
