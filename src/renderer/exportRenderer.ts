import { Column } from "../column/column";
import { GridCore } from "../core/core";
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

    let rows: any[] = [];
    let selectionRange = null;
    let selectedColumnIDs: Set<string> | undefined;

    if (scope === "selection" && this.params.selectionRange()) {
      rows = this.getRowsForSelectionExport();
      selectionRange = { ...this.params.selectionRange()! };
    } else if (scope === "selectedColumns") {
      rows = this.getRowsForExport(true);
      selectedColumnIDs = this.params.selectedColumnIDs();
    } else {
      rows = this.getRowsForExport(true);
    }

    if (!rows || rows.length === 0) return null;

    return {
      rows,
      columns,
      selectionRange,
      selectedColumnIDs,
      columnIds: options.columnIds,
      includeHeaders: options.includeHeaders,
      columnTree: this.params.core.getColumnModel().getColumns(),
      columnWidths: this.params.columnWidths(),
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
