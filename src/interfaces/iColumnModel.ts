import { Column } from "../column/column";
import { ColumnState } from "./iGridCore";

export interface IColumnModel {
  setColumnDefs(colDefs: any[]): void;
  getById(id: string): Column | undefined;
  getByColId(colId: string): Column | undefined;
  getByKey(key: string): Column | undefined;
  getColumnState(): ColumnState[];
  getColumns(): Column[];
  getLeaves(): Column[];
  getLeftColumns(): Column[];
  getCenterColumns(): Column[];
  getRightColumns(): Column[];
  getLeftLeaves(): Column[];
  getCenterLeaves(): Column[];
  getRightLeaves(): Column[];
  readonly maxHeaderDepth: number;
  readonly leafColumnLookup: Map<string, { section: "left" | "center" | "right"; globalIndex: number; localIndex: number }>;
  computeColumnWidths(measureCtx: any, params: any, rows: any[]): void;
  resizeColumn(colId: string, widthPx: number): string[];
  getAncestors(colId: string): Column[];
  walkColumns(callback: (col: Column) => void): void;
  toggleGroupExpansion(colId: string): boolean;
}
