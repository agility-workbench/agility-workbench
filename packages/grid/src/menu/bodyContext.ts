export interface BodyMenuSelectionSnapshot {
  rowIds: string[];
  colIds: string[];
  range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number } | null;
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
