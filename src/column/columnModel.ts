import { ColDef } from "../interfaces/column";
import { Column } from "./column";
import { ITextMeasurer, TextMeasureParams } from "../interfaces/iTextMeasure";
import { IRowNode } from "../interfaces/iRowNode";
import { IColumnModel } from "../interfaces/iColumnModel";
import { ColumnState } from "../interfaces/iGridCore";
import { InternalGridOptions } from "../interfaces/gridOptions";
import { isNullOrUndefined } from "../misc";
import { ColumnMove } from "./columnMove";

interface BaselineWidthDef {
  width: number;
  totalChildrenWidth: number;
}

export class ColumnModel implements IColumnModel {
  private originalColDefs: ColDef[] = [];

  private columnsById: Map<string, Column> = new Map();
  private columnsByColId: Map<string, Column> = new Map();
  private columnsByKey: Map<string, Column> = new Map();

  private columns: Column[] = [];
  private leftColumns: Column[] = [];
  private rightColumns: Column[] = [];
  private centerColumns: Column[] = [];

  private leaves: Column[] = [];
  private leftLeaves: Column[] = [];
  private rightLeaves: Column[] = [];
  private centerLeaves: Column[] = [];

  private colIdSeq: number = 0;
  private maxDepth: number = 1;

  private _leafColumnLookup: Map<string, { section: "left" | "center" | "right"; globalIndex: number; localIndex: number }> = new Map();

  private baselineWidths: Map<string, BaselineWidthDef> = new Map();

  constructor(private options: InternalGridOptions) { }

  setColumnDefs(colDefs: ColDef[]): void {
    this.originalColDefs = colDefs.map((c) => this.deepCopyColDef(c));
    this.updateColumns(this.buildColumns(colDefs));
  }

  private updateColumns(cols: Column[]) {
    this.columns = cols;
    this.columns.forEach(c => c.updatePropsByChildren());
    this.leftColumns = cols.filter((c) => c.pinned === "left");
    this.rightColumns = cols.filter((c) => c.pinned === "right");
    this.centerColumns = cols.filter((c) => c.pinned == null);

    this.leaves = [];
    this.leftLeaves = [];
    this.centerLeaves = [];
    this.rightLeaves = [];
    this.maxDepth = 1;
    this.columnsById.clear();
    this.columnsByColId.clear();
    this.columnsByKey.clear();

    this.computeHeaderDepth();
    this.updateLeafColumnLookup();
    this.setExpanders();
  }

  private buildColumns(colDefs: ColDef[], parentCol?: Column, idxPrefix: string = ""): Column[] {
    return colDefs.map((colDef, i) => {
      colDef.colId = colDef.colId || colDef.key || `col_${this.colIdSeq++}`;
      const col = new Column(colDef, `${idxPrefix}${i + 1}`);
      if (parentCol) {
        parentCol.children.push(col);
      }
      if (colDef.children && colDef.children.length > 0) {
        this.buildColumns(colDef.children, col, `${idxPrefix}${i + 1}.`);
      }
      return col;
    });
  }

  reset(): void {
    this.setColumnDefs(this.originalColDefs);
  }

  getById(id: string): Column | undefined {
    return this.columnsById.get(id);
  }

  getByColId(colId: string): Column | undefined {
    return this.columnsByColId.get(colId);
  }

  getByKey(key: string): Column | undefined {
    return this.columnsByKey.get(key);
  }

  getColumns(): Column[] {
    return this.columns;
  }

  getLeaves(): Column[] {
    return this.leaves;
  }

  getLeftColumns(): Column[] {
    return this.leftColumns;
  }

  getCenterColumns(): Column[] {
    return this.centerColumns;
  }

  getRightColumns(): Column[] {
    return this.rightColumns;
  }

  getLeftLeaves(): Column[] {
    return this.leftLeaves;
  }

  getCenterLeaves(): Column[] {
    return this.centerLeaves;
  }

  getRightLeaves(): Column[] {
    return this.rightLeaves;
  }

  get maxHeaderDepth(): number {
    return this.maxDepth;
  }

  get leafColumnLookup(): Map<string, { section: "left" | "center" | "right"; globalIndex: number; localIndex: number }> {
    return this._leafColumnLookup;
  }

  private computeHeaderDepth() {
    const traverse = (cols: Column[], depth: number, appendTo: Column[], openState: "open" | "closed" | null = null) => {
      for (const col of cols) {
        this.columnsById.set(col.instanceID, col);
        this.columnsByColId.set(col.colId, col);
        this.columnsByKey.set(col.key, col);
        if (col.hidden) continue;
        col.columnGroupVisible = col.columnGroupShow === "always" || (openState !== null && openState == col.columnGroupShow);
        if (col.columnGroupVisible) {
          if (col.children.length > 0) {
            traverse(col.children, depth + 1, appendTo, col.groupExpandState);
            col.depth = col.children.reduce((max, c) => Math.max(max, c.depth || 1), 1) + 1;
          } else {
            col.depth = 1;
            appendTo.push(col);
          }
          if (col.depth > this.maxDepth) {
            this.maxDepth = col.depth;
          }
        } else {
          col.depth = 0;
        }
      }
    };

    traverse(this.centerColumns, 1, this.centerLeaves);
    traverse(this.leftColumns, 1, this.leftLeaves);
    traverse(this.rightColumns, 1, this.rightLeaves);
    for (let i = 0; i < this.centerLeaves.length; i++) {
      this.centerLeaves[i].centralPosition = i;
    }
    this.leaves = [this.leftLeaves, this.centerLeaves, this.rightLeaves].flat();
  }

  private setExpanders() {
    const setExpanderRec = (col: Column) => {
      col.showExpander = false;
      if (col.children.length > 0) {
        let groupToggle = "";
        for (const child of col.children) {
          if (child.hidden) continue;
          if (child.columnGroupShow !== "always") {
            if (groupToggle === "") {
              groupToggle = child.columnGroupShow || "open";
            } else if (groupToggle !== child.columnGroupShow) {
              groupToggle = "mixed";
            }
          } else {
            col.showExpander = true;
          }
          setExpanderRec(child);
        }
        col.showExpander = col.showExpander || groupToggle === "mixed";
      } else {
        col.showExpander = false;
      }
    };

    for (const col of this.columns) {
      setExpanderRec(col);
    }
  }

  private updateLeafColumnLookup() {
    this._leafColumnLookup = new Map();

    const addCols = (cols: Column[], section: "left" | "center" | "right") => {
      for (const col of cols) {
        if (col.hidden) continue;
        this._leafColumnLookup.set(col.instanceID, { section, globalIndex, localIndex: localIndex });
        globalIndex++;
        localIndex++;
      }
    };

    let globalIndex = 0;
    let localIndex = 0;
    addCols(this.leftLeaves, "left");
    localIndex = 0;
    addCols(this.centerLeaves, "center");
    localIndex = 0;
    addCols(this.rightLeaves, "right");
  }

  private deepCopyColDef(colDef: ColDef): ColDef {
    const copy: ColDef = { ...colDef };
    if (colDef.children) {
      copy.children = colDef.children.map((child) => this.deepCopyColDef(child));
    }
    return copy;
  }

  private computeBaselineWidths(measureCtx: ITextMeasurer, params: TextMeasureParams): void {
    const walk = (columns: Column[]): number => {
      let totalWidth = 0;
      for (const col of columns) {
        if (col.children.length === 0) {
          totalWidth += col.computedWidth;
          continue;
        }
        const totalChildrenWidth = walk(col.getVisibleChildren());
        col.computedWidth = this.getColumnContentWidth(col, measureCtx, params);
        const colWidth = Math.max(col.computedWidth, totalChildrenWidth);
        this.baselineWidths.set(col.instanceID, { width: col.computedWidth, totalChildrenWidth });
        totalWidth += colWidth;
      }
      return totalWidth;
    }
    walk(this.columns);
  }

  computeColumnWidths(measureCtx: ITextMeasurer, params: TextMeasureParams, rows: IRowNode[]): void {
    for (const col of this.leaves) {
      this.computeColumnWidth(col, measureCtx, params, rows);
    }
    this.computeBaselineWidths(measureCtx, params);
    const walk = (columns: Column[]) => {
      for (const col of columns) {
        if (col.children.length === 0) continue;
        walk(col.getVisibleChildren());
        const baselineWidth = this.baselineWidths.get(col.instanceID);
        if (!baselineWidth) continue;
        if (baselineWidth.width > baselineWidth.totalChildrenWidth) {
          this.resizeActualColumn(col, baselineWidth.width);
        }
      }
    }
    walk(this.columns);
    this.updateParentColumnWidthsForAll();
  }

  private getColumnContentWidth(col: Column, measureCtx: ITextMeasurer, params: TextMeasureParams): number {
    return measureCtx.measure(col.label, params.headerFont ?? "500 14px Arial") + 104; // 16px padding + 88px for sort/filter icons
  }

  computeColumnWidth(col: Column, measureCtx: ITextMeasurer, params: TextMeasureParams, rows: IRowNode[]): void {
    if (col.cellRenderer) {
      col.computedWidth = col.width || 200;
      return;
    }

    let maxWidth = this.getColumnContentWidth(col, measureCtx, params);
    if (col.maxWidth && maxWidth > col.maxWidth) {
      maxWidth = col.maxWidth;
      return;
    }

    let longestText = "";
    let longestRowIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const value = col.getValue(rows[i]);
      if (value && String(value).length > longestText.length) {
        longestText = String(value);
        longestRowIdx = i;
      }
    }
    if (longestText.length === 0) {
      col.computedWidth = col.minWidth ? Math.max(maxWidth, col.minWidth) : maxWidth;
      return;
    }

    longestText = col.formatValue(col.getValue(rows[longestRowIdx]), rows[longestRowIdx])
    const longestWidth = this.measureText(longestText, measureCtx, params.cellFont ?? "14px Arial");
    if (longestWidth > maxWidth) {
      maxWidth = longestWidth;
    }

    col.computedWidth = col.maxWidth ? Math.min(maxWidth, col.maxWidth) : maxWidth;
  }

  updateParentColumnWidth(col: Column): void {
    if (col.children.length === 0) return;
    let totalWidth = 0;
    for (const child of col.getVisibleChildren()) {
      this.updateParentColumnWidth(child);
      totalWidth += child.computedWidth;
    }
    col.computedWidth = totalWidth;
  }

  updateParentColumnWidthsForAll(): void {
    for (const col of this.columns) {
      this.updateParentColumnWidth(col);
    }
  }

  private measureText(text: string, measureCtx: ITextMeasurer, font: string, padding: number = 16): number {
    return measureCtx.measure(text ?? "", font) + padding;
  }

  identifyComparators(rows: IRowNode[]): void {
    for (const col of this.leaves) {
      this.identifyComparator(col, rows);
    }
  }

  identifyComparator(column: Column, rows: IRowNode[]): void {
    if (column.filter && typeof column.filter === "function") {
      column.comparator = column.filter;
      return;
    } else if (column.filter == "") {
      return;
    } else if (rows.length == 0) {
      column.comparator = null;
      return;
    }

    const numericPreferred = column.isNumericType();
    const stringPreferred = column.type === "string";
    let numericLikely = false;

    if (!stringPreferred) {
      let seen = 0;
      let numericCount = 0;
      for (const row of rows) {
        const v = column.getValue(row);
        if (v == null) return;
        seen++;
        const num = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(num)) numericCount++;
      }
      numericLikely = numericPreferred || (seen > 0 && numericCount === seen);
    }

    const collator = column.getCollator();
    const comparator = numericLikely
      ? (a: any, b: any, nodeA: IRowNode, nodeB: IRowNode) => {
        const av = column.getValue(nodeA), bv = column.getValue(nodeB);
        if (av === bv) return 0;
        if (av == null) return -1;
        if (bv == null) return 1;
        return (Number(av) - Number(bv));
      }
      : (a: any, b: any, nodeA: IRowNode, nodeB: IRowNode) => {
        const av = column.getValue(nodeA), bv = column.getValue(nodeB);
        if (av === bv) return 0;
        if (av == null) return -1;
        if (bv == null) return 1;
        // Using collator.compare is still faster than localeCompare for mixed case and numbers
        return collator.compare(String(av), String(bv));
      };

    column.setComparator(comparator);
  }

  getAncestors(colID: string): Column[] {
    const path: Column[] = [];

    function helper(cols: Column[], targetId: string): boolean {
      for (const col of cols) {
        if (col.instanceID === targetId) {
          path.push(col);
          return true;
        }
        if (col.children) {
          if (helper(col.children, targetId)) {
            path.push(col);
            return true;
          }
        }
      }
      return false;
    }

    helper(this.columns, colID);
    return path.reverse();
  }

  getColumnState(): ColumnState[] {
    const state: ColumnState[] = [];
    const leaves = this.getLeaves();
    for (let i = 0; i < leaves.length; i++) {
      const col = leaves[i];
      state.push({
        colId: col.colId,
        widthPx: col.computedWidth,
        pinned: col.pinned,
        hidden: col.hidden,
        order: i,
      });
    }
    return state;
  }

  private resizeActualColumn(col: Column, width: number): string[] {
    const minWidth = Math.max(this.options.minResizeWidth, col.minWidth ?? this.options.minResizeWidth);
    let maxWidth = col.maxWidth ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(maxWidth)) maxWidth = Number.POSITIVE_INFINITY;
    width = Math.min(Math.max(width, minWidth), maxWidth);

    const visibleLeaves = col.getVisibleLeaves();
    if (visibleLeaves.length > 0) {
      const childInfos = visibleLeaves.map(child => {
        const childMin = Math.max(this.options.minResizeWidth, child.minWidth ?? this.options.minResizeWidth);
        let childMax = child.maxWidth ?? this.options.maxColumnWidth;
        if (!Number.isFinite(childMax)) childMax = this.options.maxColumnWidth;
        const childWidth = Math.max(childMin, Math.min(childMax, child.width ?? width / visibleLeaves.length));
        return {
          col: child,
          min: childMin,
          max: childMax,
          width: childWidth,
        };
      });

      const currentTotal = childInfos.reduce((sum, c) => sum + c.width, 0);
      const minTotal = childInfos.reduce((sum, c) => sum + c.min, 0);
      const maxTotal = childInfos.reduce((sum, c) => sum + c.max, 0);

      // Clamp parent width to what children can support.
      width = Math.min(Math.max(width, minTotal), Math.min(maxWidth, maxTotal));

      let remaining = width - currentTotal;
      let safety = 0;
      while (Math.abs(remaining) > 0.5 && safety < 20) {
        safety++;
        const grow = remaining > 0;
        const candidates = childInfos.filter(c => {
          return grow ? c.width < c.max : c.width > c.min;
        });
        if (candidates.length === 0) break;
        const deltaPer = remaining / candidates.length;
        let applied = 0;
        for (const c of candidates) {
          const delta = grow
            ? Math.min(c.max - c.width, Math.max(1, Math.round(deltaPer)))
            : Math.max(c.min - c.width, Math.min(-1, Math.round(deltaPer)));
          c.width += delta;
          applied += delta;
        }
        remaining -= applied;
      }

      // const totalWidth = childInfos.reduce((sum, c) => sum + c.width, 0);
      let totalWidth = 0;
      for (const c of childInfos) {
        c.col.computedWidth = c.width;
        totalWidth += c.width;
      }
      width = totalWidth;
    }
    col.computedWidth = width;
    const ancestors = this.getAncestors(col.instanceID);
    this.updateParentColumnWidth(ancestors[0]);
    return col.getVisibleLeaves().map(c => c.instanceID);
  }

  resizeColumn(colId: string, width: number): string[] {
    const col = this.getById(colId);
    if (!col) return [];
    return this.resizeActualColumn(col, width);
  }

  moveColumnTo(colId: string, targetIndex: number, section: "left" | "center" | "right"): boolean {
    const col = this.getById(colId);
    if (!col) return false;
    const moveResult = new ColumnMove(this).applyColumnReorder(col, targetIndex, section);
    if (moveResult.length === 0) return false;
    this.updateColumns(moveResult);
    this.updateParentColumnWidthsForAll();
    return true;
  }

  setPinned(colId: string, pin: "left" | "right" | null): boolean {
    const col = this.getById(colId);
    if (!col) return false;

    if (col.pinned === pin) return false;

    let targetIdx = Infinity;
    if (pin === null) {
      if (isNullOrUndefined(col.centralPosition)) {
        if (col.pinned === "left") targetIdx = 0;
      } else {
        targetIdx = col.centralPosition || 0;
      }
      if (col.children.length > 0) {
        const leaves = col.getVisibleLeaves();
        targetIdx = leaves[0].centralPosition || 0;
      }
    }

    return this.moveColumnTo(colId, targetIdx, pin || "center");
  }

  setPinneds(colIds: string[], pin: "left" | "right" | null): string[] {
    const affectedCols = new Set<string>();
    for (const colId of colIds) {
      if (this.setPinned(colId, pin)) affectedCols.add(colId);
    }
    return Array.from(affectedCols);
  }

  toggleVisibility(colIds: string[], hidden: boolean): string[] {
    const affectedCols = new Set<Column>();
    for (const colId of colIds) {
      const col = this.getById(colId);
      if (!col) continue;
      col.hidden = hidden;
      affectedCols.add(col);
    }
    this.updateColumns(this.columns);
    this.updateParentColumnWidthsForAll();
    return Array.from(affectedCols).map(c => c.instanceID);
  }

  toggleGroupExpansion(colId: string): boolean {
    const col = this.getById(colId);
    if (!col || col.children.length === 0) return false;
    col.groupExpandState = col.groupExpandState === "open" ? "closed" : "open";
    this.updateColumns(this.columns);
    const ancestors = this.getAncestors(colId);
    this.updateParentColumnWidth(ancestors[0]);
    return true;
  }

  walkColumns(callback: (col: Column) => void): void {
    const walk = (cols: Column[]) => {
      for (const col of cols) {
        callback(col);
        if (col.children.length > 0) {
          walk(col.children);
        }
      }
    };
    walk(this.columns);
  }

}
