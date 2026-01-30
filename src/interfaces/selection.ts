export interface CellRef {
  rowId: string;
  colId: string;
}

export interface SelectionRange {
  anchor: CellRef;
  head: CellRef;
}
