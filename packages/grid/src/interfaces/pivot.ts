import { AggregateType } from "./aggregate";
import type { Column } from "../column/column";

/**
 * One measure of the pivot: a source value column plus the aggregate applied to it. Derived by the
 * core from the aggregate model (a column may appear once per aggregate type).
 */
export interface PivotValueEntry {
  /** Live source value column — aggregate computation reads through it. NOT in the request's
   * `leafColumns` while pivoted (those are the generated leaves), hence carried here. */
  column: Column;
  /** Live source column instanceID — what aggregate computation reads values through. */
  instanceID: string;
  /** Source column colId — the stable half used to build deterministic generated colIds. */
  colId: string;
  /** Header label of the source column, for generated leaf labels. */
  label: string;
  type: AggregateType;
}

/** One distinct pivot value at one level of the discovered header structure. */
export interface PivotPathNode {
  /** Stringified pivot key for this segment (BLANK_GROUP_KEY when the value is blank). */
  key: string;
  /** First-seen raw value backing the key, for header-label formatting. */
  value: any;
  children: PivotPathNode[];
}

/**
 * The pivot header structure discovered from the current filtered rows, pushed model → core via
 * `IRowModelListener.onPivotResult` so the core can reconcile the generated columns before rows
 * paint. `roots` is empty when no pivot columns are configured — the degenerate "one generated
 * leaf per value entry" shape.
 */
export interface PivotDiscovery {
  roots: PivotPathNode[];
  valueEntries: PivotValueEntry[];
  /**
   * How many pivot columns produced this discovery. Disambiguates empty `roots`: 0 = the
   * degenerate no-pivot-columns shape (one generated leaf per value entry at the root path);
   * >0 with empty roots = no rows, no generated columns.
   */
  pivotColumnCount: number;
  /** Generated leaf columns dropped by the `maxPivotColumns` cap. 0 = nothing truncated. */
  truncatedLeafCount: number;
}

/**
 * The core's answer to `onPivotResult`: generated leaf colId → live Column instanceID. The model
 * stamps group-node `aggregateValues` with these instanceIDs so the existing group-row cell paint
 * (`row.aggregateValues[col.instanceID]`) works unchanged.
 */
export type PivotResolution = Map<string, string>;

/** Pivot state carried on a row-model request. Absent = pivot mode off. */
export interface PivotRequestState {
  /** Pivot columns in level order (outermost first). May be empty while pivot mode is on. */
  columns: Column[];
  valueEntries: PivotValueEntry[];
  /** Cap on generated leaf columns; discovery truncates deterministically past it. */
  maxPivotColumns: number;
}

/** Public description of one generated pivot value column (see IGridAPI.getPivotResultColumns). */
export interface PivotResultColumnDescriptor {
  colId: string;
  label: string;
  /** Labels of the enclosing generated group headers, outermost first. */
  groupPath: string[];
  /** colId of the source column this leaf aggregates. */
  valueColId: string;
  aggregateType: AggregateType;
}

/** Stable, position-independent id for a pivot path (generated group column id). */
export function pivotPathId(path: string[]): string {
  return "pv:" + path.map(encodeURIComponent).join("/");
}

/** Stable id for a generated value leaf: path + source colId + aggregate type. */
export function pivotLeafColId(path: string[], valueColId: string, type: AggregateType): string {
  return pivotLeafColIdFromKey(path.map(encodeURIComponent).join("/"), valueColId, type);
}

/** Same as {@link pivotLeafColId}, from an already-encoded path key ("" = the root path). */
export function pivotLeafColIdFromKey(pathKey: string, valueColId: string, type: AggregateType): string {
  return "pv:" + pathKey + "|" + encodeURIComponent(valueColId) + "|" + type;
}
