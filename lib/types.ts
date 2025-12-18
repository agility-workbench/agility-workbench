export interface ColumnDef {
  key: string;
  label: string;
  width?: number;    // fixed width
  minWidth?: number; // minimum width (resizable)
  maxWidth?: number; // maximum width (resizable)
  depth?: number;   // for hierarchical columns
  valueGetter?: (row: any) => any;
  valueFormatter?: (value: any, row: any) => string;
  type?: "string" | "number" | "date" | "boolean" | "currency";
  format?: string; // e.g., for date or currency formatting
  children?: ColumnDef[];
  hidden?: boolean;
  pinned?: "left" | "right";
}

export interface FilterDef {
  key: string;
  type: "contains" | "startsWith" | "endsWith" | "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
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
  left: string;
  right: string;
}
