import type { IRowNode } from "./iRowNode";

export enum AggregateType {
  COUNT = "count",
  DISTINCT_COUNT = "distinct_count",
  SUM = "sum",
  AVG = "avg",
  MIN = "min",
  MAX = "max",
  MEDIAN = "median",
  /** The first non-blank value in the rows' display order (after sorting). */
  FIRST = "first",
  /** The last non-blank value in the rows' display order (after sorting). */
  LAST = "last",
}

/**
 * What an aggregate entry names: a built-in {@link AggregateType}, or the name of a custom function
 * registered in `GridOptions.aggFuncs`. The `(string & {})` arm keeps the enum's autocompletion
 * while still accepting any name; names are checked where they are used (an unknown one warns once
 * and falls back to the column's default function).
 */
export type AggregateKind = AggregateType | (string & {});

export function allAggregateTypes(): AggregateType[] {
  return [
    AggregateType.COUNT,
    AggregateType.DISTINCT_COUNT,
    AggregateType.SUM,
    AggregateType.AVG,
    AggregateType.MIN,
    AggregateType.MAX,
    AggregateType.MEDIAN,
    AggregateType.FIRST,
    AggregateType.LAST,
  ];
}

const BUILT_IN_AGGREGATE_TYPES: ReadonlySet<string> = new Set(allAggregateTypes());

/** Whether a name is one of the built-in aggregate types (rather than a custom function's name). */
export function isBuiltInAggregateType(type: AggregateKind): type is AggregateType {
  return BUILT_IN_AGGREGATE_TYPES.has(type);
}

/** Display names for the built-in aggregate types, shared by the footer, the menus and the panel. */
export const AGGREGATE_TYPE_LABELS: Readonly<Record<AggregateType, string>> = {
  [AggregateType.COUNT]: "Count",
  [AggregateType.DISTINCT_COUNT]: "Distinct Count",
  [AggregateType.SUM]: "Sum",
  [AggregateType.AVG]: "Average",
  [AggregateType.MIN]: "Min",
  [AggregateType.MAX]: "Max",
  [AggregateType.MEDIAN]: "Median",
  [AggregateType.FIRST]: "First",
  [AggregateType.LAST]: "Last",
};

/** How an aggregate is labelled in the UI: the built-in's display name, a custom name as given. */
export function aggregateTypeLabel(type: AggregateKind): string {
  return isBuiltInAggregateType(type) ? AGGREGATE_TYPE_LABELS[type] : type;
}

export type AggregateScope = "none" | "page" | "all";

/** What a custom aggregate function receives: the column's values over the rows it covers. */
export interface AggregateFunctionParams {
  /**
   * The raw cell values (what the column's `valueGetter`/`key` reads, before formatting) in display
   * order, blanks (`null`, `undefined`, `""`) INCLUDED — unlike the built-ins, which skip blanks, a
   * custom function decides for itself what a blank means. Empty for an empty group.
   */
  values: unknown[];
  /**
   * The rows those values came from, aligned with `values` (leaf rows: a group row's value is
   * computed over its leaf descendants, never over child aggregates). In an export the nodes are
   * minimal and may carry only `data`.
   */
  rows: IRowNode[];
  /** The public colId of the aggregated column. */
  colId: string;
}

/**
 * A custom aggregate registered through `GridOptions.aggFuncs` and selected by name (the key) in
 * `ColDef.aggFunc`, `api.setAggregates` or the aggregate menu. Returns the aggregate value; the
 * column's formatter renders it, and exports write it as a static value (no formula). Return
 * `null`/`undefined` for "nothing to show" (an empty cell). A function that throws yields an empty
 * cell too (the error is logged), so one bad group cannot break the whole repaint.
 */
export type AggregateFunction = (params: AggregateFunctionParams) => unknown;

export interface AggregateModel {
  key: string;
  type: AggregateKind;
}

/**
 * One aggregate assignment addressed by public colId — the shape `IGridAPI.setAggregates` /
 * `getAggregates` speak. (The internal `AggregateModel` keys entries by column instanceID.)
 * A column may appear several times with different types; each is a distinct measure.
 */
export interface ColumnAggregate {
  colId: string;
  /** A built-in {@link AggregateType} or the name of a function in `GridOptions.aggFuncs`. */
  type: AggregateKind;
}
