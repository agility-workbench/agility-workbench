import { IRowNode } from "./IRowNode";

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
  IS_BLANK = "isBlank",
  IS_NOT_BLANK = "isNotBlank"
}

export type ComparatorFn = (a: any, b: any, nodeA: IRowNode, nodeB: IRowNode) => number;

export interface FilterDef {
  key: string;
  type: FilterType;
  v: any;
}

export interface FilterModel {
  filters?: FilterDef[];
  filter?: FilterModel;
  // AND/OR between filters (simple global join; you can evolve later)
  join?: "and" | "or";
}
