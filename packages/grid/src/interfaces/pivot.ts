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

/**
 * Whether a colId addresses a generated pivot column. Generated columns are internal, so they are
 * absent from the public colId lookups — a captured `pv:` id has to be resolved against the live
 * pivot layout instead (see IColumnModel.getPivotResultLeaf).
 */
export function isPivotResultColId(colId: string): boolean {
  return colId.startsWith("pv:");
}

/**
 * Append one segment to an encoded pivot path key — the address a generated column and a stamped
 * cell share. Segments are percent-encoded individually and joined by "/", so a "/" inside a value
 * cannot collide with the separator; "" is the root path (a pivot with no pivot columns). Owned
 * here with the id encoders, since {@link pivotLeafColIdFromKey} consumes exactly this form.
 */
export function appendPivotPathKey(pathKey: string, segment: string): string {
  return pathKey === "" ? encodeURIComponent(segment) : pathKey + "/" + encodeURIComponent(segment);
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

/** The parts a generated value leaf's colId is built from — see {@link parsePivotLeafColId}. */
export interface ParsedPivotLeafColId {
  /** Encoded path key, exactly as it appears in the id ("" = the root path). */
  pathKey: string;
  /** Decoded pivot path segments, outermost first. Empty for the root path. */
  path: string[];
  /** Decoded colId of the source column this leaf aggregates. */
  valueColId: string;
  type: AggregateType;
}

/**
 * Read a generated value leaf's colId back into its parts — the inverse of
 * {@link pivotLeafColIdFromKey}, and the only place the id format is taken apart.
 *
 * Total: null for anything that is not a generated value leaf (a plain column, a generated GROUP
 * header, a malformed id). Callers get one answer to "is this a measure, and which one" instead of
 * re-deriving the split and each choosing what to do about the parts that might be missing.
 */
export function parsePivotLeafColId(colId: string): ParsedPivotLeafColId | null {
  if (!isPivotResultColId(colId)) return null;
  // Path segments and the source colId are percent-encoded on the way in, so neither can contain a
  // literal separator: a value leaf splits into exactly prefix+path, source colId, aggregate type.
  const parts = colId.split("|");
  if (parts.length !== 3) return null;
  const [prefixedPathKey, encodedValueColId, type] = parts;
  if (type === "") return null;
  const pathKey = prefixedPathKey.slice("pv:".length);
  try {
    return {
      pathKey,
      path: pathKey === "" ? [] : pathKey.split("/").map(decodeURIComponent),
      valueColId: decodeURIComponent(encodedValueColId),
      type: type as AggregateType,
    };
  } catch {
    // Malformed percent-encoding — a hand-written id, not one this module produced.
    return null;
  }
}
