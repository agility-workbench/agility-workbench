import { ColDef, ColumnSection, NON_DEFAULTABLE_COLDEF_KEYS } from "../interfaces/column";
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

interface ColumnReuseContext {
  byColId: Map<string, Column[]>;
  byKey: Map<string, Column[]>;
  used: Set<Column>;
}

const ROW_NUMBER_COL_ID = "__pte_row_number__";
const ROW_NUMBER_COLUMN_DEF = {
  colId: ROW_NUMBER_COL_ID,
  key: ROW_NUMBER_COL_ID,
  label: "",
  width: 52,
  minWidth: 52,
  maxWidth: 52,
  pinned: "left",
  sortable: false,
  filter: false,
  groupable: false,
  aggregatable: false,
  resizable: false,
  movable: false,
  hideable: false,
  exportable: false,
  __internalRole: "rowNumber",
} satisfies ColDef & { __internalRole: "rowNumber" };

const AUTO_GROUP_COL_ID = "__pte_group__";
// Base def for the synthesized auto-group column (shown in "singleColumn" display mode). The
// chevron + indented label are painted by the body cell renderer, which branches on
// col.isAutoGroupColumn() + row.isGroup — the column itself carries no cellRenderer so the core
// stays free of any renderer dependency. It gets no special treatment beyond that: by default it is
// an unpinned, movable, resizable, sortable column, and clients tune it via
// gridOptions.groupColumnDef (layered over these defaults in buildAutoGroupColDef).
const AUTO_GROUP_COLUMN_DEF = {
  colId: AUTO_GROUP_COL_ID,
  key: AUTO_GROUP_COL_ID,
  label: "Group",
  width: 240,
  minWidth: 120,
  sortable: true,
  filter: false,
  groupable: false,
  aggregatable: false,
  resizable: true,
  movable: true,
  hideable: false,
  exportable: false,
  __internalRole: "autoGroup",
} satisfies ColDef & { __internalRole: "autoGroup" };

const TREE_COLUMN_DEF = {
  colId: "__pte_tree__",
  key: "__pte_tree__",
  label: "Hierarchy",
  width: 240,
  minWidth: 120,
  sortable: true,
  filter: true,
  groupable: false,
  aggregatable: false,
  resizable: true,
  movable: true,
  hideable: true,
  exportable: true,
  __treeColumn: true,
} satisfies ColDef & { __treeColumn: true };

export class ColumnModel implements IColumnModel {
  private originalColDefs: ColDef[] = [];
  private rowNumberColumn?: Column;
  // Synthesized auto-group columns, in grouping-level order. Empty unless grouping is active in
  // "singleColumn" (one column) or "multipleColumns" (one per level) display mode.
  private autoGroupColumns: Column[] = [];

  private columnsById: Map<string, Column> = new Map();
  private columnsByColId: Map<string, Column> = new Map();
  private columnsByKey: Map<string, Column> = new Map();

  private columns: Column[] = [];
  private leadingColumns: Column[] = [];
  private leftColumns: Column[] = [];
  private rightColumns: Column[] = [];
  private centerColumns: Column[] = [];

  private leaves: Column[] = [];
  private leadingLeaves: Column[] = [];
  private leftLeaves: Column[] = [];
  private rightLeaves: Column[] = [];
  private centerLeaves: Column[] = [];

  private maxDepth: number = 1;

  private _leafColumnLookup: Map<string, { section: ColumnSection; globalIndex: number; localIndex: number }> = new Map();

  private baselineWidths: Map<string, BaselineWidthDef> = new Map();

  constructor(private options: InternalGridOptions) { }

  setColumnDefs(colDefs: ColDef[]): void {
    this.originalColDefs = colDefs.map((c) => this.deepCopyColDef(c));
    this.updateColumns(this.withInternalColumns(this.buildColumns(colDefs, undefined, "", this.createReuseContext())));
  }

  /**
   * Append a single column (or group subtree) to the model without re-evaluating
   * every existing column. Only the new subtree is measured, comparator-prepared,
   * and registered; existing columns are untouched.
   *
   * The added column is transient: it lives in `this.columns` (so it survives
   * imperative mutations like hide/move/reorder) but is NOT written to
   * `originalColDefs`, so `reset()` and any subsequent `setColumnDefs()` drop it.
   * This is intended for user-added derived columns such as sparklines.
   *
   * When `measureCtx`/`params`/`rows` are supplied, the new leaves are sized to
   * their content and given comparators so they are immediately sortable.
   */
  addColumnDef(rawColDef: ColDef, section: ColumnSection = "center", measureCtx?: ITextMeasurer, params?: TextMeasureParams, rows: IRowNode[] = []): string {
    const colDef = this.mergeColDef(rawColDef);
    // Normalize colId
    colDef.colId = colDef.colId || colDef.key || `col_${crypto.randomUUID()}`;

    // Dedup: if a column with this colId already exists, return it rather than
    // adding a duplicate (which would clobber the lookup maps and double up leaves).
    const existing = this.columnsByColId.get(colDef.colId);
    if (existing) return existing.instanceID;

    const col = new Column(colDef, colDef.colId);
    if (colDef.children && colDef.children.length > 0) {
      this.buildColumns(colDef.children, col, `${colDef.colId}.`);
    }

    // Append to the top-level columns list and section list
    this.columns.push(col);
    const sectionArray = this.getSectionArray(section);
    sectionArray.push(col);

    // Register the new subtree into the existing leaves array
    const sectionLeaves = this.getSectionLeavesArray(section);
    this.registerColumns(sectionArray.slice(-1), sectionLeaves, section == "center");

    // Rebuild the flat leaves array
    this.leaves = [this.leadingLeaves, this.leftLeaves, this.centerLeaves, this.rightLeaves].flat();

    // Update leaf lookup (global indices may have shifted for later columns)
    this.updateLeafColumnLookup();

    // Propagate properties from children to parent
    col.updatePropsByChildren();

    // Set expanders on the new subtree
    this.setExpandersForColumns([col]);

    // Prepare the new subtree's leaves. Only the new column is evaluated — existing
    // columns keep their widths and comparators.
    const newLeaves = col.getLeaves();

    // Comparators only need row data, so identify them whenever rows are available
    // (mirrors identifyComparators over the full leaf set).
    for (const leaf of newLeaves) {
      this.identifyComparator(leaf, rows);
    }

    // Content-based width requires a measurement context.
    if (measureCtx && params) {
      for (const leaf of newLeaves) {
        this.computeColumnWidth(leaf, measureCtx, params, rows);
      }
    }

    // Roll leaf widths up into the group header. No-op for a plain leaf.
    if (col.children.length > 0) {
      this.updateParentColumnWidth(col);
    }

    return col.instanceID;
  }

  private updateColumns(cols: Column[]) {
    this.columns = this.withInternalColumns(cols);
    this.columns.forEach(c => c.updatePropsByChildren());
    this.leadingColumns = this.columns.filter((c) => c.isRowNumberColumn());
    this.leftColumns = this.columns.filter((c) => c.pinned === "left" && !c.isRowNumberColumn());
    this.rightColumns = this.columns.filter((c) => c.pinned === "right");
    this.centerColumns = this.columns.filter((c) => c.pinned == null);

    this.leaves = [];
    this.leadingLeaves = [];
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

  private getSectionArray(section: ColumnSection): Column[] {
    if (section === "left") return this.leftColumns;
    if (section === "right") return this.rightColumns;
    return this.centerColumns;
  }

  private getSectionLeavesArray(section: ColumnSection): Column[] {
    if (section === "left") return this.leftLeaves;
    if (section === "right") return this.rightLeaves;
    return this.centerLeaves;
  }

  /**
   * Register columns into an existing leaves array (append mode).
   * Updates lookup maps, resolves visibility, computes depth, and assigns centralPosition.
   */
  private registerColumns(cols: Column[], appendTo: Column[], reassignCentralColumns: boolean = false): void {
    const traverse = (col: Column, depth: number, openState: "open" | "closed" | null = null, ignoreGroupShow: boolean = false) => {
      this.columnsById.set(col.instanceID, col);
      if (!col.isInternal()) {
        this.columnsByColId.set(col.colId, col);
        this.columnsByKey.set(col.key, col);
      }
      col.columnGroupVisible = ignoreGroupShow || col.columnGroupShow === "always" || (openState !== null && openState === col.columnGroupShow);
      // Resolve group-controlled visibility even for manually hidden leaves. Consumers such as the
      // column panel need to distinguish "hidden by the user" from "inactive for this group state",
      // while the latter must remain owned by the column model.
      if (col.hidden) return;
      if (col.columnGroupVisible) {
        if (col.children.length > 0) {
          const uniformToggle = this.hasUniformToggle(col);
          for (const child of col.children) {
            traverse(child, depth + 1, col.groupExpandState, uniformToggle);
          }
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
    };

    for (const col of cols) {
      traverse(col, 1);
    }

    // Reassign centralPosition for center leaves
    if (reassignCentralColumns) {
      for (let i = 0; i < this.centerLeaves.length; i++) {
        this.centerLeaves[i].centralPosition = i;
      }
    }
  }

  private buildColumns(colDefs: ColDef[], parentCol?: Column, idxPrefix: string = "", reuseContext?: ColumnReuseContext): Column[] {
    return colDefs.map((rawColDef, i) => {
      const idx = `${idxPrefix}${i + 1}`;
      const colDef = this.mergeColDef(rawColDef);
      colDef.colId = colDef.colId || colDef.key || `col_${idx}`;
      const col = this.claimReusableColumn(colDef, reuseContext);
      if (col) {
        col.children = [];
        col.updateFromColDef(colDef, idx);
      }
      const nextCol = col || new Column(colDef, idx);
      if (parentCol) {
        parentCol.children.push(nextCol);
      }
      if (colDef.children && colDef.children.length > 0) {
        this.buildColumns(colDef.children, nextCol, `${idxPrefix}${i + 1}.`, reuseContext);
      }
      return nextCol;
    });
  }

  private createReuseContext(): ColumnReuseContext {
    const context: ColumnReuseContext = {
      byColId: new Map(),
      byKey: new Map(),
      used: new Set(),
    };

    this.walkColumns((col) => {
      if (col.isInternal()) return;
      this.addReusableColumn(context.byColId, col.colId, col);
      this.addReusableColumn(context.byKey, col.key, col);
    });

    return context;
  }

  private addReusableColumn(map: Map<string, Column[]>, key: string | undefined, col: Column): void {
    if (!key) return;
    const cols = map.get(key);
    if (cols) {
      cols.push(col);
    } else {
      map.set(key, [col]);
    }
  }

  private claimReusableColumn(colDef: ColDef, context?: ColumnReuseContext): Column | undefined {
    if (!context) return undefined;
    return this.claimReusableColumnFromMap(context.byColId, colDef.colId, context.used)
      ?? this.claimReusableColumnFromMap(context.byKey, colDef.key, context.used);
  }

  private claimReusableColumnFromMap(map: Map<string, Column[]>, key: string | undefined, used: Set<Column>): Column | undefined {
    if (!key) return undefined;
    const cols = map.get(key);
    if (!cols) return undefined;
    const col = cols.find(candidate => !used.has(candidate));
    if (!col) return undefined;
    used.add(col);
    return col;
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

  getLeadingColumns(): Column[] {
    return this.leadingColumns;
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

  getLeadingLeaves(): Column[] {
    return this.leadingLeaves;
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

  getLeavesBySection(section: ColumnSection): Column[] {
    if (section == "left") return this.getLeftLeaves();
    if (section == "center") return this.getCenterLeaves();
    return this.getRightLeaves();
  }

  get maxHeaderDepth(): number {
    return this.maxDepth;
  }

  get leafColumnLookup(): Map<string, { section: ColumnSection; globalIndex: number; localIndex: number }> {
    return this._leafColumnLookup;
  }

  private computeHeaderDepth() {
    this.registerColumns(this.leadingColumns, this.leadingLeaves);
    this.registerColumns(this.centerColumns, this.centerLeaves, true);
    this.registerColumns(this.leftColumns, this.leftLeaves);
    this.registerColumns(this.rightColumns, this.rightLeaves);
    this.leaves = [this.leadingLeaves, this.leftLeaves, this.centerLeaves, this.rightLeaves].flat();
  }

  private setExpandersForColumns(cols: Column[]) {
    const setExpanderRec = (col: Column) => {
      col.showExpander = false;
      if (col.children.length > 0) {
        let groupToggle = "";
        for (const child of col.children) {
          if (child.hidden) continue;
          if (groupToggle == "" ) {
            groupToggle = child.columnGroupShow;
          } else if (groupToggle != child.columnGroupShow) {
            groupToggle = "mixed";
          }
          setExpanderRec(child);
        }
        col.showExpander = groupToggle === "mixed";
      } else {
        col.showExpander = false;
      }
    };

    for (const col of cols) {
      setExpanderRec(col);
    }
  }

  /**
   * True when every non-hidden child carries the same non-"always" `columnGroupShow`. Such a
   * group could only ever toggle between "all children" and "no children", so its expand state
   * is ignored: the children render as always visible (see registerColumns) and no expander is
   * shown (a uniform value can never make groupToggle "mixed" in setExpandersForColumns).
   */
  private hasUniformToggle(col: Column): boolean {
    let show = "";
    for (const child of col.children) {
      if (child.hidden) continue;
      if (show === "") {
        show = child.columnGroupShow;
      } else if (show !== child.columnGroupShow) {
        return false;
      }
    }
    return show !== "" && show !== "always";
  }

  private setExpanders() {
    this.setExpandersForColumns(this.columns);
  }

  private updateLeafColumnLookup() {
    this._leafColumnLookup = new Map();

    const addCols = (cols: Column[], section: ColumnSection) => {
      for (const col of cols) {
        if (col.hidden) continue;
        this._leafColumnLookup.set(col.instanceID, { section, globalIndex, localIndex: localIndex });
        globalIndex++;
        localIndex++;
      }
    };

    let globalIndex = 0;
    let localIndex = 0;
    addCols(this.leadingLeaves, "left");
    localIndex = 0;
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

  /**
   * Layer the grid-level `defaultColDef` *under* a column's own definition: every field the column
   * omits falls back to `defaultColDef`, while an explicit value on the column always wins (shallow
   * merge — a nested object on the column replaces the default's, not deep-merged). The identity /
   * structural fields (`colId`, `key`, `label`, `children`) never inherit; a column keeps its own.
   * Applied per level, so group children each inherit in turn.
   */
  private mergeColDef(colDef: ColDef): ColDef {
    const dflt = this.options.defaultColDef;
    if (!dflt) return colDef;
    // Start from the inheritable defaults, dropping any per-column identity/structure keys. The type
    // (DefaultColDef) already forbids them, but a plain-JS caller could still pass one — strip
    // defensively so a stray `colId`/`label` in defaultColDef can never clobber a real column.
    const merged: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dflt)) {
      if (!(NON_DEFAULTABLE_COLDEF_KEYS as readonly string[]).includes(k)) merged[k] = v;
    }
    // A field explicitly set to `undefined` on the column means "not specified" and must not clobber
    // the inherited default — only defined column values override.
    for (const [k, v] of Object.entries(colDef)) {
      if (v !== undefined) merged[k] = v;
    }
    return merged as unknown as ColDef;
  }

  private withInternalColumns(cols: Column[]): Column[] {
    // The auto-group column is an ordinary movable/pinnable column once synthesized, so when `cols`
    // already carries auto-group instances they keep their in-place position. A move rebuilds the
    // dragged column as a duplicate instance (ColumnMove.duplicate), so adopt whatever `cols`
    // carries as the canonical list. Auto-group columns absent from `cols` (fresh grouping,
    // setColumnDefs rebuild) lead the user columns instead — the historical default position.
    const presentAuto = cols.filter((col) => col.isAutoGroupColumn());
    if (presentAuto.length > 0) this.autoGroupColumns = presentAuto;
    const missingAuto = this.autoGroupColumns.filter((col) => !presentAuto.includes(col));
    const body = cols.filter((col) => !col.isRowNumberColumn());
    const leading: Column[] = [];
    if (this.options.rowNumbers) {
      const rowNumberColumn = this.getRowNumberColumn();
      rowNumberColumn.pinned = "left";
      rowNumberColumn.hidden = false;
      leading.push(rowNumberColumn);
    }
    return [...leading, ...missingAuto, ...body];
  }

  private createTreeColumn(): Column {
    const treeData = this.options.treeData!;
    const clientDef = treeData.columnDef ?? {};
    const valueGetter = clientDef.valueGetter ?? ((node: IRowNode) => {
      const row = node?.data;
      const custom = treeData.getLabel?.(row);
      if (custom != null) return custom;
      if (treeData.mode === "path") {
        const path = treeData.getPath(row);
        if (path.length > 0) return path[path.length - 1];
      }
      return row?.name ?? row?.label ?? node?.id ?? "";
    });
    return new Column({
      ...TREE_COLUMN_DEF,
      ...clientDef,
      valueGetter,
      // These capabilities have no meaningful operation in tree mode.
      groupable: false,
      aggregatable: false,
      __treeColumn: true,
    } as ColDef & { __treeColumn: true }, "tree");
  }

  // Reconfigure the columns for the current grouping, then rebuild the column layout so sections /
  // leaf lookup / widths stay consistent. `groupColumns` is the ordered list of user columns being
  // grouped by; `mode` selects how the group label is surfaced:
  //  - "singleColumn": one synthesized auto column renders every level (indented). Default.
  //  - "multipleColumns": no synthesized column — each real grouped column shows the group value in
  //    place, tagged with its grouping level.
  //  - "groupRows": no auto column (the label spans the row).
  setRowGroupColumns(
    groupColumns: Column[],
    mode: "singleColumn" | "multipleColumns" | "groupRows",
    treeData: boolean = false,
  ): void {
    // Clear any prior per-column group-level tags before re-tagging for the new grouping.
    this.walkColumns((c) => { if (!c.isAutoGroupColumn()) c.groupLevel = undefined; });

    const next: Column[] = [];
    if (!treeData && groupColumns.length > 0 && mode === "singleColumn") {
      next.push(this.getAutoGroupColumn());
    } else if (groupColumns.length > 0 && mode === "multipleColumns") {
      // Tag the real grouped columns so the renderer shows each level's value under its own column.
      groupColumns.forEach((gc, level) => { gc.groupLevel = level; });
    }
    this.autoGroupColumns = next;
    // Rebuild from the current user columns (dropping auto columns from any previous grouping). A
    // surviving auto-group column keeps its runtime position, like the tree hierarchy column.
    const userColumns = this.columns.filter(
      (c) => !c.isRowNumberColumn() && (!c.isAutoGroupColumn() || next.includes(c)),
    );
    if (treeData) {
      const existingTreeColumn = userColumns.find(c => c.isTreeColumn());
      this.updateColumns(existingTreeColumn ? userColumns : [this.createTreeColumn(), ...userColumns]);
    } else {
      this.updateColumns(userColumns.filter(c => !c.isTreeColumn()));
    }
  }

  getAutoGroupColumns(): Column[] {
    return this.autoGroupColumns;
  }

  // The singleColumn auto-group column def: the client's gridOptions.groupColumnDef layered over
  // the defaults. Identity and the grouping machinery stay grid-owned regardless of the client def
  // (filtering/grouping/aggregating the synthesized column has no meaningful operation).
  private buildAutoGroupColDef(): ColDef {
    return {
      ...AUTO_GROUP_COLUMN_DEF,
      ...this.options.groupColumnDef,
      colId: AUTO_GROUP_COL_ID,
      key: AUTO_GROUP_COL_ID,
      children: undefined,
      groupable: false,
      aggregatable: false,
      filter: false,
      __internalRole: "autoGroup",
    } as ColDef;
  }

  // Synthesize the auto-group column, reusing the live instance across regroups. Reuse keeps the
  // instanceID stable, so an active sort on the group column (and its user-resized width) survives
  // grouping changes and colDef swaps; def-driven props (label, width, pinned, flags) re-apply.
  private getAutoGroupColumn(): Column {
    const existing = this.autoGroupColumns[0];
    if (existing) {
      existing.updateFromColDef(this.buildAutoGroupColDef(), "auto-group");
      return existing;
    }
    return new Column(this.buildAutoGroupColDef(), "auto-group");
  }

  getHierarchyColumn(): Column | undefined {
    return this.columns.find(col => col.isTreeColumn()) ?? this.autoGroupColumns[0];
  }

  private getRowNumberColumn(): Column {
    if (this.rowNumberColumn) {
      this.rowNumberColumn.updateFromColDef({ ...ROW_NUMBER_COLUMN_DEF }, "row-number");
      return this.rowNumberColumn;
    }
    this.rowNumberColumn = new Column({ ...ROW_NUMBER_COLUMN_DEF }, "row-number");
    return this.rowNumberColumn;
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
    // 16px padding + 104px for the header affordances: sort arrow, its (possible) multi-sort priority
    // badge, and the filter & menu buttons. The badge is included even for single-sort columns so an
    // auto-sized column never clips the sort button once a priority number appears.
    return measureCtx.measure(col.label, params?.headerFont ?? "500 14px Arial") + 120;
  }

  computeColumnWidth(col: Column, measureCtx: ITextMeasurer, params: TextMeasureParams, rows: IRowNode[]): void {
    // A user-set width wins over content measurement so hand-sized columns don't snap back on the
    // implicit recomputes triggered by column-state actions. Explicit "fit to content" clears this.
    if (col.resizedWidth != null) {
      col.computedWidth = col.resizedWidth;
      return;
    }

    if (col.isInternal()) {
      col.computedWidth = col.width || col.computedWidth;
      return;
    }

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
    let longestRow: IRowNode | undefined;
    for (let i = 0; i < rows.length; i++) {
      const value = this.cellValueForWidth(col, rows[i]);
      if (value && String(value).length > longestText.length) {
        longestText = String(value);
        longestRow = rows[i];
      }
    }
    if (longestText.length === 0 || !longestRow) {
      col.computedWidth = col.minWidth ? Math.max(maxWidth, col.minWidth) : maxWidth;
      return;
    }

    longestText = col.formatValue(this.cellValueForWidth(col, longestRow), longestRow);
    const longestWidth = this.measureText(longestText, measureCtx, params.cellFont ?? "14px Arial");
    if (longestWidth > maxWidth) {
      maxWidth = longestWidth;
    }

    col.computedWidth = col.maxWidth ? Math.min(maxWidth, col.maxWidth) : maxWidth;
  }

  // The value a cell in this column would display for width measurement. Group rows show their
  // per-group aggregate value for the column (not the column's raw value, which is absent on the
  // synthetic group node) so aggregate totals get room to fit.
  private cellValueForWidth(col: Column, row: IRowNode): any {
    if (row.isGroup) return row.aggregateValues?.[col.instanceID];
    return col.getValue(row);
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

  identifyComparatorsFor(columns: Column[], rows: IRowNode[]): void {
    for (const col of columns) {
      const visibleLeaves = col.getVisibleLeaves();
      for (const child of visibleLeaves) {
        this.identifyComparator(child, rows);
      }
    }
  }

  identifyComparators(rows: IRowNode[]): void {
    for (const col of this.leaves) {
      this.identifyComparator(col, rows);
    }
  }

  identifyComparator(column: Column, rows: IRowNode[]): void {
    // An explicit ColDef comparator always wins over type-based auto-derivation (and doesn't need
    // sample rows to resolve). The public comparator contract is (aValue, bValue, nodeA, nodeB) —
    // cell VALUES first — but the row model's sort passes row-data objects as the first two args, so
    // wrap it to extract each column value from the node (matching the auto-derived comparators).
    if (column.userComparator) {
      const userCmp = column.userComparator;
      column.comparator = (_a, _b, nodeA, nodeB) =>
        userCmp(column.getValue(nodeA), column.getValue(nodeB), nodeA, nodeB);
      return;
    }
    if (column.filter == "") {
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
    // Walk section columns (not getLeaves(), which drops hidden leaves) so hidden columns are
    // captured too — otherwise a persisted layout couldn't restore a column's hidden state. Section
    // order (leading → left → center → right) mirrors the visible leaf order.
    const orderedLeaves = [
      ...this.leadingColumns,
      ...this.leftColumns,
      ...this.centerColumns,
      ...this.rightColumns,
    ].flatMap((col) => col.getLeaves());
    let order = 0;
    for (const col of orderedLeaves) {
      if (col.isInternal()) continue;
      state.push({
        colId: col.colId,
        widthPx: col.computedWidth,
        pinned: col.pinned,
        hidden: col.hidden,
        order: order++,
      });
    }
    return state;
  }

  /**
   * Restore a previously-captured column layout (from `getColumnState`). By default this is a MERGE:
   * entries whose `colId` no longer exists are ignored, and existing columns absent from `state`
   * keep their current position and width.
   *
   * Ordering is driven by the explicit `order` field, NOT by array position:
   *  - Entries WITH `order` reposition their column to that index (remove-then-insert). Ties on the
   *    same `order` value keep their relative array order.
   *  - Entries WITHOUT `order` (and columns absent from `state`) keep their current relative
   *    position; they're only shifted to make room for the positioned columns. So a partial state
   *    like `[{ colId, pinned: "left" }]` sets the property without dragging the column to the front.
   *  A round-trip of `getColumnState()` (which stamps a dense `order` on every column) therefore
   *  reproduces the exact layout, while a hand-authored partial state only touches what it names.
   *
   * `opts.defaultState` changes how columns ABSENT from `state` are treated — this is what turns a
   * merge into an exact restore. It is applied to every current column not referenced by `state`
   * (new columns added since the state was captured, or ones deliberately omitted). Only `hidden`,
   * `pinned`, and `widthPx` are honored; `colId` / `order` / `selected` are ignored. The most common
   * use is `{ hidden: true }` — "show exactly the saved view, hide everything else". With no
   * `defaultState`, absent columns are left untouched (the merge default).
   *
   * Reuses the existing mutators so the layout stays consistent:
   *  - visibility → `col.hidden`, applied before the rebuild;
   *  - pinning → `col.pinned` (top-level columns only), bucketed by `updateColumns`;
   *  - order → columns repositioned among siblings at every group depth (see above);
   *  - width → `resizeColumn` (stamped as `resizedWidth` so it survives later autosize recomputes).
   */
  applyColumnState(state: ColumnState[], opts?: { defaultState?: Partial<ColumnState> }): void {
    const widthOps: { col: Column; width: number }[] = [];
    const seenTop = new Set<Column>();
    // A leaf's order positions it among its siblings and contributes the minimum descendant order
    // to each ancestor group. This lets a flat ColumnState round-trip a nested column tree.
    const targetOrder = new Map<Column, { order: number; arrayIndex: number }>();

    // Apply per-column properties in array order (order-independent), and record positioning intent.
    state.forEach((s, i) => {
      const col = this.getByColId(s.colId);
      if (!col || col.isInternal()) return;
      if (s.hidden != null) col.hidden = s.hidden;
      const path = this.getAncestors(col.instanceID);
      const top = path[0] ?? col;
      // Pinning is a section property; only meaningful for a top-level column (a group pins as a
      // whole, and a lone leaf is its own top-level column).
      if (top === col && s.pinned !== undefined) col.pinned = s.pinned;
      if (s.widthPx != null) widthOps.push({ col, width: s.widthPx });
      seenTop.add(top);
      if (s.order != null) {
        for (const node of path.length > 0 ? path : [col]) {
          const previous = targetOrder.get(node);
          if (
            !previous
            || s.order < previous.order
            || (s.order === previous.order && i < previous.arrayIndex)
          ) {
            targetOrder.set(node, { order: s.order, arrayIndex: i });
          }
        }
      }
    });

    const topLevel = this.columns.filter((c) => !c.isInternal());

    // Apply defaultState to columns absent from `state` entirely. This is the escape hatch that
    // makes an exact restore possible: without it these columns keep their current layout (merge).
    const def = opts?.defaultState;
    if (def) {
      for (const top of topLevel) {
        if (seenTop.has(top)) continue;
        if (def.pinned !== undefined) top.pinned = def.pinned;
        for (const leaf of top.getLeaves()) {
          if (def.hidden != null) leaf.hidden = def.hidden;
          if (def.widthPx != null) widthOps.push({ col: leaf, width: def.widthPx });
        }
      }
    }

    this.updateColumns(this.reorderTreeByTargetOrder(topLevel, targetOrder));
    this.updateParentColumnWidthsForAll();

    // Widths last so they apply to the rebuilt layout (resizeColumn is a no-op for unknown ids).
    for (const { col, width } of widthOps) {
      this.resizeColumn(col.instanceID, width);
    }
  }

  private reorderTreeByTargetOrder(
    columns: Column[],
    targetOrder: Map<Column, { order: number; arrayIndex: number }>,
  ): Column[] {
    const ordered = this.reorderByTargetOrder(columns, targetOrder);
    for (const column of ordered) {
      if (column.children.length > 0) {
        column.children = this.reorderTreeByTargetOrder(column.children, targetOrder);
      }
    }
    return ordered;
  }

  // Remove-then-insert: columns WITHOUT a target order keep their current relative order; columns
  // WITH one are inserted at that index, ascending by order (ties → array order). Insertion indices
  // are clamped to the running length so out-of-range orders land at the end.
  private reorderByTargetOrder(
    topLevel: Column[],
    targetOrder: Map<Column, { order: number; arrayIndex: number }>,
  ): Column[] {
    const positioned = topLevel
      .filter((c) => targetOrder.has(c))
      .map((c) => ({ col: c, ...targetOrder.get(c)! }))
      .sort((a, b) => a.order - b.order || a.arrayIndex - b.arrayIndex);
    if (positioned.length === 0) return topLevel;

    const result = topLevel.filter((c) => !targetOrder.has(c));
    // Insert same-order columns as one block so ties preserve array order (a per-item splice at the
    // same index would reverse them).
    let i = 0;
    while (i < positioned.length) {
      let j = i;
      while (j < positioned.length && positioned[j].order === positioned[i].order) j++;
      const block = positioned.slice(i, j).map((p) => p.col);
      result.splice(Math.min(positioned[i].order, result.length), 0, ...block);
      i = j;
    }
    return result;
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
    // Only the row-number column is layout-frozen; the auto-group column is a regular column whose
    // resizable/movable/pinnable behavior is driven by its (client-tunable) def like any other.
    if (!col || col.isRowNumberColumn()) return [];
    const resizedLeafIds = this.resizeActualColumn(col, width);
    // Record the user-set width on each affected leaf so it survives later auto-size recomputes
    // (grouping, move, aggregate change, data refresh). Stamped here in the public entry — not in
    // resizeActualColumn, which is also used by the internal baseline rollup (not a user action).
    for (const leafId of resizedLeafIds) {
      const leaf = this.getById(leafId);
      if (leaf) leaf.resizedWidth = leaf.computedWidth;
    }
    return resizedLeafIds;
  }

  moveColumnTo(colId: string, targetIndex: number, section: ColumnSection): boolean {
    const col = this.getById(colId);
    if (!col || col.isRowNumberColumn()) return false;
    const moveResult = new ColumnMove(this).applyColumnReorder(col, targetIndex, section);
    if (moveResult.length === 0) return false;
    this.updateColumns(moveResult);
    this.updateParentColumnWidthsForAll();
    return true;
  }

  setPinned(colId: string, pin: "left" | "right" | null): boolean {
    const col = this.getById(colId);
    if (!col || col.isRowNumberColumn()) return false;

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
      if (!col || col.isRowNumberColumn()) continue;
      col.hidden = hidden;
      affectedCols.add(col);
    }
    this.updateColumns(this.columns);
    this.updateParentColumnWidthsForAll();
    return Array.from(affectedCols).map(c => c.instanceID);
  }

  toggleGroupExpansion(colId: string): boolean {
    const col = this.getById(colId);
    if (!col || col.isInternal() || col.children.length === 0) return false;
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
