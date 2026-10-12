import type { GroupDisplayType } from "../interfaces/gridOptions";
import type { IRowNode } from "../interfaces/iRowNode";
import type { SelectionRange } from "../interfaces/selection";

export interface BodyMenuSelectionSnapshot {
  rowIds: string[];
  colIds: string[];
  range: SelectionRange | null;
}

export interface BodyMenuContext {
  trigger: "bodyContextMenu";
  rowId: string;
  /**
   * Instance id of the clicked column. On a full-width row (`isFullWidth`) there is one cell
   * spanning the row, and this is the column it stands in for: the first leaf after the leading
   * utility columns (row numbers, checkboxes).
   */
  colId: string;
  /** The clicked row's node. For an app-pinned band row, the pinned node as displayed. */
  node: IRowNode;
  /** Whether the clicked row is a group row (any `groupDisplayType`, and pivot rows). */
  isGroup: boolean;
  /**
   * Whether the clicked row renders as a single full-width cell — a group row under
   * `groupDisplayType: "groupRows"`. `colId` then names the column that cell stands in for.
   */
  isFullWidth: boolean;
  /** The grid's current `groupDisplayType`, so a getter can tell how group rows are laid out. */
  groupDisplayType: GroupDisplayType;
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
