import { Column } from "../column/column";
import { GridCore } from "../core/core";
import { IRowNode } from "../interfaces/iRowNode";
import {
  exportCSV as downloadCSV,
  exportExcel as downloadExcel,
  ExportConfig,
  ExportOptions,
  ExportScope,
} from "../export/export";

type SelectionRange = { rowStart: number; rowEnd: number; colStart: number; colEnd: number };

interface ExportRendererParams {
  core: GridCore;
  leafColumns: () => Column[];
  columnWidths: () => Map<string, {
    width: number;
    minWidth?: number;
    maxWidth?: number;
    fixed?: boolean;
  }>;
  selectionRange: () => SelectionRange | null;
  selectedColumnIDs: () => Set<string>;
}

export class ExportRenderer {
  constructor(private params: ExportRendererParams) { }

  exportCSV(options: ExportOptions = {}) {
    this.performExport("csv", options);
  }

  exportExcel(options: ExportOptions = {}) {
    this.performExport("excel", options);
  }

  exportColumnCSV(columnIDs: string[] | null = []) {
    const selectedColumns = columnIDs || [...this.params.selectedColumnIDs()];
    let fileName = "Export";
    if (selectedColumns.length == 1) {
      fileName = this.params.core.getColumnModel().getById(selectedColumns[0])?.label || fileName;
    }
    this.performExport("csv", {
      scope: "all",
      columnIds: selectedColumns,
      fileName: fileName,
    });
  }

  exportColumnXLSX(columnIDs: string[] | null = []) {
    const selectedColumns = columnIDs || [...this.params.selectedColumnIDs()];
    let fileName = "Export";
    if (selectedColumns.length == 1) {
      fileName = this.params.core.getColumnModel().getById(selectedColumns[0])?.label || fileName;
    }
    this.performExport("excel", {
      scope: "all",
      columnIds: selectedColumns,
      fileName: fileName,
    });
  }

  private performExport(format: "csv" | "excel", options: ExportOptions = {}) {
    const config = this.buildExportConfig(options);
    if (!config) return;

    const fileName = options.fileName ?? this.defaultExportFileName(format, options);
    if (format === "csv") {
      downloadCSV(config, fileName);
    } else {
      downloadExcel(config, fileName);
    }
  }

  private buildExportConfig(options: ExportOptions): ExportConfig | null {
    const scope = this.resolveExportScope(options);
    const columns = this.params.leafColumns()?.length ? this.params.leafColumns().slice() : [];
    if (!columns.length) return null;

    // When the grid is row-grouped, the export is driven by the group tree (outline levels +
    // per-group subtotals over the full leaf set), regardless of scope. A cell-range selection can't
    // be honored over a grouped view — its rows interleave synthetic group headers and leaves, and a
    // "select all" is a range spanning the whole (possibly collapsed) view — so grouping wins. A
    // column selection still narrows the exported columns; it just keeps the grouped layout.
    const groupColumns = this.params.core.getRowGroupColumns();
    const grouped = groupColumns.length > 0;

    let rows: any[] = [];
    let selectionRange = null;
    let selectedColumnIDs: Set<string> | undefined;

    if (grouped) {
      rows = this.getRowsForExport(true); // all leaf data (drives the guard + grand-total footer)
      if (scope === "selectedColumns") selectedColumnIDs = this.params.selectedColumnIDs();
    } else if (scope === "selection" && this.params.selectionRange()) {
      rows = this.getRowsForSelectionExport();
      selectionRange = { ...this.params.selectionRange()! };
    } else if (scope === "selectedColumns") {
      rows = this.getRowsForExport(true);
      selectedColumnIDs = this.params.selectedColumnIDs();
    } else {
      rows = this.getRowsForExport(true);
    }

    if (!rows || rows.length === 0) return null;

    let groupRoots: IRowNode[] | undefined;
    let autoGroupColumn: Column | undefined;
    if (grouped) {
      const roots = this.params.core.getRowModel().getGroupNodes().filter(n => n.level === 0);
      if (roots.length > 0) groupRoots = roots;
      // singleColumn mode hides the group-heading column from the exportable set; surface it so the
      // export can include it.
      autoGroupColumn = this.params.core.getColumnModel().getAutoGroupColumns()[0];
    }

    // Include the aggregate footer only when the grid is actually showing aggregates on-screen
    // (scope !== "none" and at least one column is aggregated). A flat range/selection export skips
    // it, since the footer's formulas span whole-column ranges, not an arbitrary block; a grouped
    // export always keeps it (SUBTOTAL over the full leaf set).
    const showFooter = grouped || scope !== "selection";
    const aggregates =
      showFooter && this.params.core.getAggregateScope() !== "none"
        ? this.params.core.getAggregateModel()
        : undefined;

    return {
      rows,
      columns,
      selectionRange,
      selectedColumnIDs,
      columnIds: options.columnIds,
      includeHeaders: options.includeHeaders,
      columnTree: this.params.core.getColumnModel().getColumns(),
      columnWidths: this.params.columnWidths(),
      aggregates,
      groupRoots,
      groupColumns: groupRoots ? groupColumns : undefined,
      groupDisplayType: groupRoots ? this.params.core.getOptions().groupDisplayType : undefined,
      autoGroupColumn: groupRoots ? autoGroupColumn : undefined,
    };
  }

  private resolveExportScope(options: ExportOptions): ExportScope {
    if (options.scope) return options.scope;
    if (options.columnIds && options.columnIds.length > 0) return "all";
    if (this.params.selectionRange()) return "selection";
    if (this.params.selectedColumnIDs().size > 0) return "selectedColumns";
    return "all";
  }

  private getRowsForExport(includeAllRows: boolean): any[] {
    const rows: any[] = [];
    if (includeAllRows) {
      this.params.core.getRowModel().forEachNodeAfterFilterAndSort((node) => {
        rows.push(node.data);
      });
      return rows;
    }

    for (let i = 0; i < this.params.core.getRowModel().getViewCount(); i++) {
      const node = this.params.core.getRowModel().getRowNodeAtViewIndex(i);
      if (node) rows.push(node.data);
    }
    return rows;
  }

  private getRowsForSelectionExport(): any[] {
    const range = this.params.selectionRange();
    if (!range) return [];
    const rows: any[] = [];
    const rowStart = Math.max(0, range.rowStart);
    const rowEnd = Math.min(this.params.core.getRowModel().getViewCount() - 1, range.rowEnd);
    for (let i = rowStart; i <= rowEnd; i++) {
      const node = this.params.core.getRowModel().getRowNodeAtViewIndex(i);
      if (node) rows.push(node.data);
    }
    return rows;
  }

  private defaultExportFileName(format: "csv" | "excel", options: ExportOptions): string {
    const ext = format === "csv" ? "csv" : "xlsx";
    if (options.columnIds && options.columnIds.length === 1) {
      const col = this.params.core.getColumnModel().getById(options.columnIds[0]);
      if (col) return `${col.label ?? col.key}.${ext}`;
    }
    const scope = this.resolveExportScope(options);
    if (scope === "selection") return `grid-selection.${ext}`;
    if (scope === "selectedColumns") return `grid-columns.${ext}`;
    return `grid-all.${ext}`;
  }
}
