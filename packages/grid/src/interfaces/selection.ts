export interface CellRef {
  rowId: string;
  colId: string;
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

/**
 * A rectangular cell selection in view-index space. `pageStartIdx` records the page the
 * selection was made on so it can be invalidated when the page changes.
 */
export interface SelectionRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  pageStartIdx: number;
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
  selectedColumnIds: string[];
  /**
   * Resolved-identity projection of `range` as a flat, row-major list of cells — computed on read
   * (only populated when the snapshot is requested with id resolution). Rows that are not
   * currently loaded (server-side sparse data) have no rowId and are omitted, so this contains
   * loaded cells only. `null` when there is no active range.
   */
  rangeCells?: CellRef[] | null;
}
