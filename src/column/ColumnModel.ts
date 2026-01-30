import { ColDef } from "../interfaces/column";
import { Column } from "./Column";
import { ITextMeasurer, TextMeasureParams } from "../interfaces/ITextMeasure";
import { IRowNode } from "../interfaces/IRowNode";
import { IColumnModel } from "../interfaces/IColumnModel";
import { ColumnState } from "@grid/interfaces/iCore";
import { InternalGridOptions } from "@grid/interfaces/GridOptions";

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

  constructor(private options: InternalGridOptions) { }

  setColumnDefs(colDefs: ColDef[]): void {
    this.originalColDefs = colDefs.map((c) => this.deepCopyColDef(c));
    const cols = this.originalColDefs.map((c, i) => {
      c.colId = c.colId || c.key || `col_${this.colIdSeq++}`;
      return new Column(c, `${i + 1}`);
    });
    this.columns = cols;
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

  computeColumnWidths(measureCtx: ITextMeasurer, params: TextMeasureParams, rows: IRowNode[]): void {
    for (const col of this.leaves) {
      this.computeColumnWidth(col, measureCtx, params, rows);
    }
    this.updateParentColumnWidthsForAll();
  }

  computeColumnWidth(col: Column, measureCtx: ITextMeasurer, params: TextMeasureParams, rows: IRowNode[]): void {
    if (col.cellRenderer) {
      col.computedWidth = col.width || 200;
      return;
    }
    let maxWidth = measureCtx.measure(col.label, params.headerFont || "14px Arial") + 104; // 16px padding + 88px for sort/filter icons
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
    const longestWidth = this.measureText(longestText, measureCtx, params.cellFont || "14px Arial");
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
      ? (a: any, b: any) => {
        const av = column.getValue(a), bv = column.getValue(b);
        if (av === bv) return 0;
        if (av == null) return -1;
        if (bv == null) return 1;
        return (Number(av) - Number(bv));
      }
      : (a: any, b: any) => {
        const av = column.getValue(a), bv = column.getValue(b);
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

  resizeColumn(colId: string, width: number): string[] {
    const col = this.getById(colId);
    if (!col) return [];

    const minWidth = Math.max(this.options.minResizeWidth, col.minWidth ?? this.options.minResizeWidth);
    let maxWidth = col.maxWidth ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(maxWidth)) maxWidth = Number.POSITIVE_INFINITY;
    width = Math.min(Math.max(width, minWidth), maxWidth);

    if (col.children.length > 0) {
      const visibleChildren = col.getVisibleChildren();
      if (visibleChildren.length > 0) {
        const childInfos = visibleChildren.map(child => {
          const childMin = Math.max(this.options.minResizeWidth, child.minWidth ?? this.options.minResizeWidth);
          let childMax = child.maxWidth ?? this.options.maxColumnWidth;
          if (!Number.isFinite(childMax)) childMax = this.options.maxColumnWidth;
          const childWidth = Math.max(childMin, Math.min(childMax, child.width ?? width / visibleChildren.length));
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

        const totalWidth = childInfos.reduce((sum, c) => sum + c.width, 0);
        for (const c of childInfos) {
          c.col.computedWidth = c.width;
        }
        width = totalWidth;
      }
    }
    col.computedWidth = width;
    const ancestors = this.getAncestors(col.instanceID);
    if (ancestors.length > 1) {
      for (let i = ancestors.length - 2; i >= 0; i--) {
        const ancestor = ancestors[i];
        if (!ancestor.children || ancestor.children.length === 0) continue;
        let totalWidth = 0;
        for (const child of ancestor.getVisibleChildren()) {
          totalWidth += child.computedWidth;
        }
        ancestor.computedWidth = totalWidth;
      }
    }
    return col.getVisibleLeaves().map(c => c.instanceID);
  }
}
