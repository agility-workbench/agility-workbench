import { Column } from "../column/column";
import { ColumnSection } from "./column";
import { GridViewColumnGroupState } from "./gridView";
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
  /**
   * The leaf a full-width group row's single host cell stands in for (selection, clicks, menus,
   * ActionFrame all key off it): the first non-leading leaf; null when there is none.
   */
  getFullWidthNominalLeaf(): Column | null;
  getLeftLeaves(): Column[];
  getCenterLeaves(): Column[];
  getRightLeaves(): Column[];
  getLeavesBySection(section: ColumnSection): Column[];
  /** The displayed generated pivot leaf colIds, in display order (empty when pivot display is off). */
  getDisplayedPivotLeafOrder(): string[];
  /** Canonical generated pivot column roots (empty when pivot display is off). */
  getPivotResultRoots(): Column[];
  /** The live generated pivot leaf with this generated colId (see ColumnModel implementation). */
  getPivotResultLeaf(colId: string): Column | undefined;
  readonly maxHeaderDepth: number;
  readonly leafColumnLookup: Map<string, { section: ColumnSection; globalIndex: number; localIndex: number }>;
  computeColumnWidths(measureCtx: any, params: any, rows: any[]): void;
  resizeColumn(colId: string, widthPx: number): string[];
  getAncestors(colId: string): Column[];
  /** Pre-order walk of the displayed column tree, or of `roots` when another tree is given. */
  walkColumns(callback: (col: Column) => void, roots?: Column[]): void;
  toggleGroupExpansion(colId: string): boolean;
  /**
   * Every column group's expander state (nested groups included), in pre-order; the stashed source
   * groups while pivot display is active, as `getColumnState` describes the source columns.
   */
  getColumnGroupState(): GridViewColumnGroupState[];
  /**
   * The batch form of `toggleGroupExpansion`: set the named groups' expander state in one rebuild.
   * Unknown ids, leaves and internal columns are ignored; groups absent from the list keep their
   * state. Returns the instanceIDs of the groups whose state changed.
   */
  setColumnGroupState(groups: GridViewColumnGroupState[]): string[];
  setRowGroupColumns(
    groupColumns: Column[],
    mode: "singleColumn" | "multipleColumns" | "groupRows",
    treeData?: boolean,
  ): void;
  getAutoGroupColumns(): Column[];
  getHierarchyColumn(): Column | undefined;
}
