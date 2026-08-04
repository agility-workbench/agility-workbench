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
  viewIdx: number;
  selection: BodyMenuSelectionSnapshot;
  anchorEl?: HTMLElement;
  clientX?: number;
  clientY?: number;
}
