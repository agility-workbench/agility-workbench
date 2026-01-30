import { FormatterOptions, FormatterOptionsParams, getFormatterByType, ValueFormatterParams } from "../formatters";
import { isFalse, isNullOrUndefined, isTrue } from "../misc";
import { CellRenderer } from "../renderer/renderer";
import { IRowNode } from "../interfaces/IRowNode";
import { ColDef, ColumnType } from "../interfaces/column";
import { ComparatorFn } from "../interfaces/filter";

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
  valueGetter?: (row: any) => any;
  valueFormatter?: (params: ValueFormatterParams) => string;
  formatterOptions?: FormatterOptions | ((params: FormatterOptionsParams) => FormatterOptions);
  cellRenderer?: CellRenderer;
  cellRendererParams?: any;
  type: ColumnType;
  format?: string; // e.g., for date or currency formatting
  children: Column[];
  hidden: boolean;
  pinned?: "left" | "right" | null;
  sortable: boolean;
  filter?: boolean | string | ((valA: any, valB: any, nodeA: IRowNode, nodeB: IRowNode) => number);
  groupable: boolean;
  resizable: boolean;
  movable: boolean;
  hideable?: boolean;
  centralPosition?: number;
  columnGroupShow: "always" | "open" | "closed";
  openByDefault: boolean;
  groupExpandState: "open" | "closed";
  columnGroupVisible: boolean;
  exportable: boolean = true;
  comparator: ComparatorFn | null = null;
  collator?: Intl.Collator | null
  showExpander: boolean = false;

  constructor(public col: ColDef, idx: string = '') {
    const id = crypto.randomUUID();
    this.instanceID = id;
    this.originalInstanceID = id;
    this.colId = col.colId!;
    this.key = col.key || '';
    this.label = col.label || col.key || `Column ${idx}`;
    this.width = col.width;
    this.minWidth = col.minWidth;
    this.maxWidth = col.maxWidth;
    this.depth = col.depth || 0;
    this.valueGetter = col.valueGetter;
    this.valueFormatter = col.valueFormatter ? col.valueFormatter : getFormatterByType(col.type || ColumnType.STRING) || undefined;
    this.formatterOptions = col.formatterOptions;
    this.cellRenderer = col.cellRenderer;
    this.cellRendererParams = col.cellRendererParams;
    this.type = col.type || ColumnType.STRING;
    this.format = col.format;
    this.children = col.children ? col.children.map((c, i) => new Column(c, `${idx}.${i}`)) : [];
    this.hidden = isTrue(col.hidden);
    this.pinned = col.pinned || null;
    this.sortable = !isFalse(col.sortable);
    this.filter = col.filter;
    this.groupable = !isFalse(col.groupable);
    this.resizable = !isFalse(col.resizable);
    this.movable = !isFalse(col.movable);
    this.hideable = !isFalse(col.hideable);
    this.columnGroupShow = col.columnGroupShow === "open" ? "open" : col.columnGroupShow === "closed" ? "closed" : "always";
    this.openByDefault = isTrue(col.openByDefault);
    this.centralPosition = undefined;
    this.groupExpandState = isTrue(col.openByDefault) ? "open" : "closed";
    this.columnGroupVisible = isNullOrUndefined(col.columnGroupShow) ? true : (isTrue(col.openByDefault) ? col.columnGroupShow === "open" : col.columnGroupShow === "closed");
    this.exportable = !isFalse(col.exportable);
    this.updateComputedWidth();
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

  duplicate(): Column {
    const dup = new Column({
      key: this.key,
      label: this.label,
      width: this.width,
      minWidth: this.minWidth,
      maxWidth: this.maxWidth,
      depth: this.depth,
      valueGetter: this.valueGetter,
      valueFormatter: this.valueFormatter,
      formatterOptions: this.formatterOptions,
      cellRenderer: this.cellRenderer,
      cellRendererParams: this.cellRendererParams,
      type: this.type,
      format: this.format,
      hidden: this.hidden,
      sortable: this.sortable,
      filter: this.filter,
      groupable: this.groupable,
      resizable: this.resizable,
      movable: this.movable,
      hideable: this.hideable,
      columnGroupShow: this.columnGroupShow === "always" ? undefined : this.columnGroupShow,
      openByDefault: this.openByDefault,
    });
    dup.children = this.children.slice();
    dup.originalInstanceID = this.originalInstanceID;
    dup.valueFormatter = this.valueFormatter;
    dup.collator = this.collator;
    dup.comparator = this.comparator;
    dup.groupExpandState = this.groupExpandState;
    dup.columnGroupVisible = this.columnGroupVisible;
    dup.computedWidth = this.computedWidth;
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

  getVisibleLeaves(): Column[] {
    const leaves: Column[] = [];
    const walk = (col: Column) => {
      const visibleChildren = col.getVisibleChildren()
      if (visibleChildren.length > 0) {
        for (const child of visibleChildren) walk(child);
      }
      leaves.push(col);
    }
    walk(this);
    return leaves;
  }

}
