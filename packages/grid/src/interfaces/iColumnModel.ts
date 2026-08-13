import { Column } from "../column/column";
import { ColumnSection } from "./column";
import { ColumnState } from "./iGridCore";

export interface IColumnModel {
  setColumnDefs(colDefs: any[]): void;
  updateSelectionCheckboxColumn(): void;
  addColumnDef(colDef: any, section?: ColumnSection, measureCtx?: any, params?: any, rows?: any[]): string;
  getById(id: string): Column | undefined;
  /** Tolerant lookup: instance id, then public colId, then key. */
  resolve(id: string): Column | undefined;
  getByColId(colId: string): Column | undefined;
  getByKey(key: string): Column | undefined;
  getColumnState(): ColumnState[];
  applyColumnState(state: ColumnState[], opts?: { defaultState?: Partial<ColumnState> }): void;
  getColumns(): Column[];
  getLeaves(): Column[];
  getLeadingColumns(): Column[];
  getLeftColumns(): Column[];
  getCenterColumns(): Column[];
  getRightColumns(): Column[];
  getLeadingLeaves(): Column[];
  getLeftLeaves(): Column[];
  getCenterLeaves(): Column[];
  getRightLeaves(): Column[];
  getLeavesBySection(section: ColumnSection): Column[];
  readonly maxHeaderDepth: number;
  readonly leafColumnLookup: Map<string, { section: ColumnSection; globalIndex: number; localIndex: number }>;
  computeColumnWidths(measureCtx: any, params: any, rows: any[]): void;
  resizeColumn(colId: string, widthPx: number): string[];
  getAncestors(colId: string): Column[];
  walkColumns(callback: (col: Column) => void): void;
  toggleGroupExpansion(colId: string): boolean;
  setRowGroupColumns(
    groupColumns: Column[],
    mode: "singleColumn" | "multipleColumns" | "groupRows",
    treeData?: boolean,
  ): void;
  getAutoGroupColumns(): Column[];
  getHierarchyColumn(): Column | undefined;
}
