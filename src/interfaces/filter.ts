import { FilterValueAsyncSource } from "../filter/types";
import { Column } from "../column/column";
import { IRowNode } from "./iRowNode";

export type Filter = boolean | string | ((valA: any, valB: any, nodeA: IRowNode, nodeB: IRowNode) => number);

export enum FilterType {
  CONTAINS = "contains",
  NOT_CONTAINS = "notContains",
  STARTS_WITH = "startsWith",
  ENDS_WITH = "endsWith",
  EQ = "eq",
  NEQ = "neq",
  LT = "lt",
  LTE = "lte",
  GT = "gt",
  GTE = "gte",
  IN_RANGE = "inRange",
  NOT_IN_RANGE = "notInRange",
  IS_BLANK = "isBlank",
  IS_NOT_BLANK = "isNotBlank",
  IN = "in",
  NOT_IN = "notIn",
}

export type ComparatorFn = (a: any, b: any, nodeA: IRowNode, nodeB: IRowNode) => number;

export interface FilterDef {
  type: FilterType;
  values: any;
}

export interface FilterModel {
  col: Column
  key: string;
  filters: FilterDef[];
  // AND/OR between filters
  join?: "and" | "or";
}

export type FilterAction = "apply" | "clear" | "reset" | "cancel";

export type FilterOption = {
  value: FilterType;
  label: string;
};

export interface FilterParams {
  buttons?: FilterAction[];
  closeOnApply?: boolean;
  debounceMs?: number;
  caseSensitive?: boolean;
  trimValues?: boolean;
  filterOptions?: FilterOption[];
  maxFilterItems?: number;
  initialFilterItemsCount?: number;
  filterValues?: any[] | FilterValueAsyncSource; // for set filter; if not specified, will be derived from rows
  textFormatter?: (value: any) => string;
  filterFunction?: (type: FilterType, filterValues: any[], cellValue: any, caseSensitive?: boolean, trimValues?: boolean) => boolean;
}

export type FilterInputType = "text" | "number" | "date" | "boolean" | "dropdown" | "set" | "tree" | "none";

export function valuesNeededFor(op: FilterType): number {
  switch (op) {
    case FilterType.IS_BLANK:
    case FilterType.IS_NOT_BLANK:
      return 0;
    case "inRange":
      return 2;
    case FilterType.IN:
    case FilterType.NOT_IN:
      return -1; // but “multipleValues” true; values[0] is array OR store in values directly
    default:
      return 1;
  }
}
