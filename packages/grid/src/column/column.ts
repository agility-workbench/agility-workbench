import { FormatterOptions, FormatterOptionsParams, getFormatterByType, ValueFormatterParams, ValueParserParams } from "./formatters";
import { isFalse, isNullOrUndefined, isTrue } from "../misc";
import { CellRenderer } from "../renderer/renderer";
import { HeaderComponent } from "../renderer/header/headerComponent";
import { CellEditor } from "../renderer/editing/cellEditor";
import { IRowNode } from "../interfaces/iRowNode";
import { CellClass, CellClassParams, CellStyle, ColDef, ColumnType } from "../interfaces/column";
import { ComparatorFn, Filter, FilterParams } from "../interfaces/filter";
import type { SortDir } from "../interfaces/sort";
import type { SortingOrder, SortIconVisibility } from "../interfaces/gridOptions";

type InternalColumnRole = "rowNumber" | "autoGroup";
type InternalColDef = ColDef & { __internalRole?: InternalColumnRole; __groupLevel?: number };

export class Column {
  instanceID: string;
  originalInstanceID: string;
  colId: string;
  key: string;
  label: string;
  width?: number;    // fixed width
  minWidth?: number; // minimum width (resizable)
  maxWidth?: number; // maximum width (resizable)
  depth?: number;   // for hierarchical columns
  computedWidth: number = 200; // computed width (after layout)
  // Width set by an explicit user resize. When present it overrides content-based auto-measurement
  // so a hand-sized column survives grouping/move/aggregate/data-refresh recomputes. Cleared by an
  // explicit "fit to content" autosize. Undefined until the user actually drags a resize handle.
  resizedWidth?: number;
  valueGetter?: (row: any) => any;
  valueFormatter?: (params: ValueFormatterParams) => string;
  valueParser?: (params: ValueParserParams) => any;
  cellEditor?: CellEditor;
  cellEditorParams?: any;
  editable: boolean = false;
  formatterOptions?: FormatterOptions | ((params: FormatterOptionsParams) => FormatterOptions);
  cellRenderer?: CellRenderer;
  cellRendererParams?: any;
  // Custom header components (see ColDef.headerComponent / headerCellComponent). Undefined = use the
  // grid default or the built-in header.
  headerComponent?: HeaderComponent;
  headerCellComponent?: HeaderComponent;
  cellClass?: CellClass;
  cellStyle?: CellStyle;
  // Per-row horizontal span callback (see ColDef.colSpan). Undefined = never spans.
  colSpan?: (params: CellClassParams) => number;
  type: ColumnType;
  format?: string; // e.g., for date or currency formatting
  children: Column[] = [];
  hidden: boolean;
  pinned?: "left" | "right" | null;
  sortable: boolean;
  filter?: Filter;
  filterParams?: FilterParams;
  groupable: boolean;
  resizable: boolean;
  movable: boolean;
  hideable?: boolean;
  showColumnMenu: boolean;
  columnContextMenu: boolean;
  centralPosition?: number;
  columnGroupShow: "always" | "open" | "closed";
  openByDefault: boolean;
  groupExpandState: "open" | "closed";
  columnGroupVisible: boolean;
  exportable: boolean = true;
  // The resolved comparator used for sorting (auto-derived from type, or the user-supplied one).
  comparator: ComparatorFn | null = null;
  // User-supplied comparator from the ColDef, if any. Takes precedence over auto-derivation.
  userComparator?: ComparatorFn;
  // Initial sort seeded from the ColDef (`sort` / `sortIndex`), applied once at first column setup.
  initialSort?: SortDir;
  initialSortIndex?: number;
  // Per-column overrides for sort-cycle order and resting neutral-icon visibility. Undefined = fall
  // back to the grid-level option; resolved at the point of use (cycle computation / icon render).
  sortingOrder?: SortingOrder;
  sortIconVisibility?: SortIconVisibility;
  collator?: Intl.Collator | null
  showExpander: boolean = false;
  internalRole?: InternalColumnRole;
  // For a "multipleColumns" auto-group column: the grouping level (0-based) this column represents.
  // Undefined for the "singleColumn" auto-group column and all non-group columns.
  groupLevel?: number;

  constructor(public col: ColDef, idx: string = '') {
    const id = crypto.randomUUID();
    this.instanceID = id;
    this.originalInstanceID = id;
    this.colId = "";
    this.key = "";
    this.label = "";
    this.type = ColumnType.STRING;
    this.hidden = false;
    this.sortable = true;
    this.groupable = true;
    this.resizable = true;
    this.movable = true;
    this.showColumnMenu = true;
    this.columnContextMenu = true;
    this.columnGroupShow = "always";
    this.openByDefault = false;
    this.groupExpandState = "closed";
    this.columnGroupVisible = true;
    this.updateFromColDef(col, idx, false);
  }

  updateFromColDef(col: ColDef, idx: string = '', preserveRuntimeState: boolean = true) {
    const previousComputedWidth = this.computedWidth;
    const previousResizedWidth = this.resizedWidth;
    const previousGroupExpandState = this.groupExpandState;
    const previousColumnGroupVisible = this.columnGroupVisible;

    this.col = col;
    this.colId = col.colId!;
    this.key = col.key || '';
    this.label = col.label ?? col.key ?? `Column ${idx}`;
    this.width = col.width;
    this.minWidth = col.minWidth;
    this.maxWidth = col.maxWidth;
    this.depth = col.depth || 0;
    this.valueGetter = col.valueGetter;
    this.valueFormatter = col.valueFormatter ? col.valueFormatter : getFormatterByType(col.type || ColumnType.STRING) || undefined;
    this.valueParser = col.valueParser;
    this.cellEditor = col.cellEditor;
    this.cellEditorParams = col.cellEditorParams;
    this.editable = isTrue(col.editable);
    this.formatterOptions = col.formatterOptions;
    this.cellRenderer = col.cellRenderer;
    this.cellRendererParams = col.cellRendererParams;
    this.headerComponent = col.headerComponent;
    this.headerCellComponent = col.headerCellComponent;
    this.cellClass = col.cellClass;
    this.cellStyle = col.cellStyle;
    this.colSpan = col.colSpan;
    this.type = col.type || ColumnType.STRING;
    this.format = col.format;
    this.hidden = isTrue(col.hidden);
    this.pinned = col.pinned || null;
    this.sortable = !isFalse(col.sortable);
    this.userComparator = col.comparator;
    this.initialSort = col.sort;
    this.initialSortIndex = col.sortIndex;
    this.sortingOrder = col.sortingOrder;
    this.sortIconVisibility = col.sortIconVisibility;
    this.filter = col.filter;
    this.filterParams = col.filterParams;
    this.groupable = !isFalse(col.groupable);
    this.resizable = !isFalse(col.resizable);
    this.movable = !isFalse(col.movable);
    this.hideable = !isFalse(col.hideable);
    this.showColumnMenu = !isFalse(col.showColumnMenu);
    this.columnContextMenu = !isFalse(col.columnContextMenu);
    this.columnGroupShow = col.columnGroupShow === "open" ? "open" : col.columnGroupShow === "closed" ? "closed" : "always";
    this.openByDefault = isTrue(col.openByDefault);
    this.centralPosition = undefined;
    this.groupExpandState = preserveRuntimeState ? previousGroupExpandState : (isTrue(col.openByDefault) ? "open" : "closed");
    this.columnGroupVisible = preserveRuntimeState
      ? previousColumnGroupVisible
      : isNullOrUndefined(col.columnGroupShow) ? true : (isTrue(col.openByDefault) ? col.columnGroupShow === "open" : col.columnGroupShow === "closed");
    this.exportable = !isFalse(col.exportable);
    this.internalRole = (col as InternalColDef).__internalRole;
    this.groupLevel = (col as InternalColDef).__groupLevel;
    this.updateComputedWidth();
    // Preserve a prior user resize across rebuilds that reuse this instance (grouping/move); a full
    // reset (preserveRuntimeState=false, e.g. setColumnDefs/reset) drops it back to auto-sizing.
    this.resizedWidth = preserveRuntimeState ? previousResizedWidth : undefined;
    if (preserveRuntimeState && this.resizedWidth != null) {
      this.computedWidth = this.resizedWidth;
    } else if (preserveRuntimeState && col.width == null) {
      this.computedWidth = previousComputedWidth;
    }
  }

  private updateComputedWidth() {
    if (this.width != null && isFinite(this.width)) {
      this.computedWidth = this.width;
    }
    if (this.minWidth != null && isFinite(this.minWidth)) {
      this.computedWidth = Math.max(this.computedWidth, this.minWidth);
    }
    if (this.maxWidth != null && isFinite(this.maxWidth)) {
      this.computedWidth = Math.min(this.computedWidth, this.maxWidth);
    }
  }

  isVisible(): boolean {
    return !this.hidden && this.columnGroupVisible;
  }

  isInternal(): boolean {
    return this.internalRole != null;
  }

  isRowNumberColumn(): boolean {
    return this.internalRole === "rowNumber";
  }

  isAutoGroupColumn(): boolean {
    return this.internalRole === "autoGroup";
  }

  /* The following props are derived from children and should not be set directly on group columns
    * - sortable
    * - groupable
    * - resizable
    * - movable
    * - hideable
   */
  updatePropsByChildren() {
    if (this.children.length === 0) return;
    this.children.forEach(c => c.updatePropsByChildren());
    this.sortable = this.children.every(c => c.sortable);
    this.groupable = this.children.every(c => c.groupable);
    this.resizable = this.children.every(c => c.resizable);
    this.movable = this.children.every(c => c.movable);
    this.hideable = this.children.every(c => c.hideable);
    this.showColumnMenu = this.children.every(c => c.showColumnMenu);
    this.columnContextMenu = this.children.every(c => c.columnContextMenu);
  }

  getComparator(): ComparatorFn | null {
    return this.comparator;
  }

  setComparator(comparator: ComparatorFn) {
    this.comparator = comparator;
  }

  getCollator() {
    if (!this.collator) {
      this.collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    }
    return this.collator;
  }

  getValue(row: IRowNode): any {
    if (this.valueGetter) {
      return this.valueGetter(row);
    }
    return row.data[this.key];
  }

  formatValue(value: any, row: IRowNode): string {
    if (this.valueFormatter) {
      return this.valueFormatter({ value, row, col: this });
    }
    if (value == null) {
      return "";
    }
    return String(value);
  }

  // Convert the raw text typed into a cell editor into the value to store. Uses the column's
  // valueParser when provided; otherwise the text is stored verbatim.
  parseValue(text: string, row: IRowNode, oldValue: any): any {
    if (this.valueParser) {
      return this.valueParser({ value: text, oldValue, row, col: this });
    }
    return text;
  }

  // Whether a cell in this column may be edited. Internal columns (e.g. row numbers) are never
  // editable regardless of the editable flag.
  isCellEditable(_row?: IRowNode): boolean {
    return this.editable && !this.isInternal();
  }

  duplicate(): Column {
    const dup = new Column({ ...this.col, label: this.label });
    dup.children = this.children.slice();
    dup.originalInstanceID = this.originalInstanceID;
    dup.valueFormatter = this.valueFormatter;
    dup.valueParser = this.valueParser;
    dup.cellEditor = this.cellEditor;
    dup.cellEditorParams = this.cellEditorParams;
    dup.headerComponent = this.headerComponent;
    dup.headerCellComponent = this.headerCellComponent;
    dup.cellClass = this.cellClass;
    dup.cellStyle = this.cellStyle;
    dup.editable = this.editable;
    dup.showColumnMenu = this.showColumnMenu;
    dup.columnContextMenu = this.columnContextMenu;
    dup.collator = this.collator;
    dup.comparator = this.comparator;
    dup.userComparator = this.userComparator;
    dup.groupExpandState = this.groupExpandState;
    dup.columnGroupVisible = this.columnGroupVisible;
    dup.computedWidth = this.computedWidth;
    dup.resizedWidth = this.resizedWidth;
    dup.showExpander = this.showExpander;
    return dup;
  }

  isComputableType(): boolean {
    return this.type === ColumnType.NUMBER || this.type === ColumnType.DATE || this.type === ColumnType.CURRENCY;
  }

  isNumericType(): boolean {
    return this.type === ColumnType.NUMBER || this.type === ColumnType.CURRENCY;
  }

  getVisibleChildren(): Column[] {
    return this.children.filter(c => !c.hidden && c.columnGroupVisible);
  }

  getLeaves(): Column[] {
    const leaves: Column[] = [];
    const walk = (col: Column) => {
      if (col.children.length === 0) leaves.push(col);
      for (const child of col.children) {
        walk(child);
      }
    };
    walk(this);
    return leaves;
  }

  // Get all visible leaf columns under this column (including itself if it's a leaf)
  getVisibleLeaves(): Column[] {
    const leaves: Column[] = [];
    const walk = (col: Column) => {
      if (col.hidden || !col.columnGroupVisible) return;
      if (col.children.length === 0) leaves.push(col);
      for (const child of col.children) {
        walk(child);
      }
    };
    walk(this);
    return leaves;
  }

}
