export enum ColumnType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  BOOLEAN = "boolean",
  CURRENCY = "currency"
}

export type RowModelType = "clientSide" | "serverSide";

export function isComputableType(type: ColumnType | undefined): boolean {
  return type === ColumnType.NUMBER || type === ColumnType.DATE || type === ColumnType.CURRENCY;
}

export interface Column {
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
  children?: Column[];
  hidden?: boolean;
  pinned?: "left" | "right";
  sortable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
  resizable?: boolean;
  movable?: boolean;
}

export interface InternalColumn {
  id: string;
  originalID: string;
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
  children?: InternalColumn[];
  hidden?: boolean;
  pinned?: "left" | "right" | null;
  sortable: boolean;
  filterable: boolean;
  groupable: boolean;
  resizable: boolean;
  movable: boolean;
  centralPosition: number;
}

export function getColumnDefs(cols: (Column | any)[]): InternalColumn[] {
  return cols.map(getColumnDef);
}

export function getColumnDef(col: Column | any): InternalColumn {
  const id = crypto.randomUUID();
  return {
    id: id,
    originalID: id,
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
    pinned: col.pinned || null,
    sortable: col.sortable !== false,
    filterable: col.filterable !== false,
    groupable: col.groupable !== false,
    resizable: col.resizable !== false,
    movable: col.movable !== false,
    centralPosition: 0,
  };
}

export function getValue(row: any, col: Column | InternalColumn): any {
  if (col.valueGetter) {
    return col.valueGetter(row);
  }
  return row[col.key];
}

export function getFormattedValue(row: any, col: Column): string {
  const value = getValue(row, col);
  if (col.valueFormatter) {
    return col.valueFormatter(value, row);
  }
  if (value == null) {
    return "";
  }
  return String(value);
}

export function formatValue(value: any, row: any, col: InternalColumn): string {
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
  v: any;
}

export interface SortDef {
  key: string;
  dir: "asc" | "desc";
}

export interface ServerSideFilter {
  key: string;
  type: FilterType;
  value: any;
}

export interface ServerSideSort {
  key: string;
  dir: "asc" | "desc";
}

export interface ServerSideRequest {
  filters: ServerSideFilter[];
  sorts: ServerSideSort[];
  page: number;
  pageSize: number;
}

export interface ServerSideResult {
  rows: any[];
  totalRows?: number;
}

export type ServerSideDataSource = (request: ServerSideRequest) => Promise<ServerSideResult> | ServerSideResult;

export interface MenuItem {
  id?: string;
  label?: string;
  disabled?: boolean;
  onClick?: () => void;
  subMenu?: MenuItem[];
  left?: string;
  right?: string;
  isSeparator?: boolean;
  extra?: any;
}

export interface RowPoolDef {
  leftRowEl?: HTMLDivElement;
  rowEl: HTMLDivElement;
  rightRowEl?: HTMLDivElement;
  leftCellEls: HTMLDivElement[];
  cellEls: HTMLDivElement[];
  rightCellEls: HTMLDivElement[];
}

export enum AggregateType {
  COUNT = "count",
  SUM = "sum",
  AVG = "avg",
  MIN = "min",
  MAX = "max",
  MEDIAN = "median",
}

export function allAggregateTypes(): AggregateType[] {
  return [
    AggregateType.COUNT,
    AggregateType.SUM,
    AggregateType.AVG,
    AggregateType.MIN,
    AggregateType.MAX,
    AggregateType.MEDIAN,
  ];
}

export type AggregateScope = "none" | "page" | "all";

export interface AggregateRequestItem {
  key: string;
  type: AggregateType;
}

export interface ServerSideAggregationRequest {
  aggregates: AggregateRequestItem[];
  filters: ServerSideFilter[];
  sorts: ServerSideSort[];
  scope: AggregateScope;
  page: number;
  pageSize: number;
}

export type ServerSideAggregationResult = {
  values: Record<string, any>;
} | Record<string, any>;

export type ServerSideAggregation = (request: ServerSideAggregationRequest) => Promise<ServerSideAggregationResult> | ServerSideAggregationResult;
