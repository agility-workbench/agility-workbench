import { RowDataChangeReason } from "./iRowModel";
import { IRowNode } from "./iRowNode";

export interface IRowModelOnRowsParams {
  reason: RowDataChangeReason;
  rows: IRowNode[];
  visibleStart: number;     // index of first row in viewport
  visibleEnd: number;       // index of last row in viewport
  rowCount?: number;          // if known
  storeInfo?: any;            // optional (block cache / group state)
}

export type IRowModelListener = {
  onLoadingStart: (id: number) => void;
  onRows: (id: number, payload: IRowModelOnRowsParams) => void;
  onLoadingEnd: (id: number) => void;
  onError: (id: number, err: unknown) => void;
};
