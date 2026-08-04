import type { SelectionRange } from "../interfaces/selection";

export interface BodyMenuSelectionSnapshot {
  rowIds: string[];
  colIds: string[];
  range: SelectionRange | null;
}

export interface BodyMenuContext {
  trigger: "bodyContextMenu";
  rowId: string;
  colId: string;
  /**
   * View index of the clicked row. For app-pinned band rows (rowPinned set) this is the band-local
   * index within that band, not a body view index.
   */
  viewIdx: number;
  /** Set when the clicked cell is in an app-pinned band (pinnedTopRowData / pinnedBottomRowData). */
  rowPinned?: "top" | "bottom";
  selection: BodyMenuSelectionSnapshot;
  anchorEl?: HTMLElement;
  clientX?: number;
  clientY?: number;
}
