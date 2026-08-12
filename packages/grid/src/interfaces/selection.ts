export interface CellRef {
  rowId: string;
  /**
   * The column's public ColDef colId in every CellRef the grid emits. As an INPUT (API methods,
   * dispatched actions) it is resolved tolerantly: an internal instance id, a public colId, or a
   * key all work.
   */
  colId: string;
  /**
   * The column's internal instance id (unique even when split/moved column duplicates share a
   * public colId). Present on every CellRef the grid emits; optional on input, where it wins over
   * `colId` when set.
   */
  colInstanceId?: string;
  /** Present when the cell belongs to a pinned top/bottom row section. */
  rowPinned?: "top" | "bottom";
}

/** A cell position in section-local row-index space and global leaf-column space. */
export interface CellPos {
  row: number;
  colIdx: number;
  /** Omitted for the body; otherwise `row` is local to this pinned section. */
  rowPinned?: "top" | "bottom";
}

/** A contiguous run of rows inside one pinned band, in band-local indices (inclusive). */
export interface PinnedRangeSegment {
  start: number;
  end: number;
}

/**
 * A rectangular cell selection. Rows form one contiguous span in the unified row sequence
 * `pinned top → body → pinned bottom`; `rowStart`/`rowEnd` hold the body part in view-index
 * space, and `pinnedTop`/`pinnedBottom` the band parts. A range with no body rows carries
 * `rowStart: 0, rowEnd: -1` (start > end) so body-oriented consumers naturally iterate nothing.
 * `pageStartIdx` records the page the selection was made on so it can be invalidated when the
 * page changes.
 */
export interface SelectionRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  pageStartIdx: number;
  pinnedTop?: PinnedRangeSegment;
  pinnedBottom?: PinnedRangeSegment;
}

/** Which kind of selection is currently active. The three kinds are mutually exclusive. */
export type SelectionKind = "cell" | "range" | "row" | "column";

/** Full snapshot of the grid's selection state. */
export interface SelectionSnapshot {
  /**
   * The active selection kind (always present): "cell" (1×1 range), "range" (multi-cell rect),
   * "row", "column", or "none" when nothing is selected.
   */
  kind: SelectionKind | "none";
  range: SelectionRange | null;
  anchor: CellPos | null;
  active: CellPos | null;
  selectedRowIds: string[];
  /** Internal instance ids of the selected columns (unique; renderer-facing). */
  selectedColumnIds: string[];
  /** Public ColDef colIds of the selected columns (parallel to `selectedColumnIds`). */
  selectedColIds?: string[];
  /**
   * Resolved-identity projection of `range` as a flat, row-major list of cells — computed on read
   * (only populated when the snapshot is requested with id resolution). Rows that are not
   * currently loaded (server-side sparse data) have no rowId and are omitted, so this contains
   * loaded cells only. `null` when there is no active range.
   */
  rangeCells?: CellRef[] | null;
}
