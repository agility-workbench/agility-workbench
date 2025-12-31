import { formatValue, getValue, InternalColumn } from "./types";

export interface ExportRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export interface ExportConfig {
  rows: any[];
  /**
   * Ordered list of visible leaf columns.
   * The array should already respect pinning (left -> center -> right).
   */
  columns: InternalColumn[];
  /**
   * Optional list of explicit column IDs to export.
   * When provided, this wins over selectionRange/selectedColumnIDs.
   */
  columnIds?: string[];
  /**
   * Selected leaf column IDs (used when columnIds is not provided).
   */
  selectedColumnIDs?: Set<string> | string[];
  /**
   * If provided, a subset of rows/columns (0-based, inclusive) to export.
   */
  selectionRange?: ExportRange | null;
  /**
   * Include the header row. Defaults to true.
   */
  includeHeaders?: boolean;
}

export interface ExportDataset {
  headers: string[];
  rows: string[][];
}

function toSet(ids?: Set<string> | string[]): Set<string> | null {
  if (!ids) return null;
  if (ids instanceof Set) return ids;
  if (Array.isArray(ids)) return new Set(ids);
  return null;
}

function clampRange(range: ExportRange, rowCount: number, colCount: number): ExportRange {
  const rowStart = Math.max(0, Math.min(range.rowStart, rowCount - 1));
  const rowEnd = Math.max(0, Math.min(range.rowEnd, rowCount - 1));
  const colStart = Math.max(0, Math.min(range.colStart, colCount - 1));
  const colEnd = Math.max(0, Math.min(range.colEnd, colCount - 1));

  return {
    rowStart: Math.min(rowStart, rowEnd),
    rowEnd: Math.max(rowStart, rowEnd),
    colStart: Math.min(colStart, colEnd),
    colEnd: Math.max(colStart, colEnd),
  };
}

function resolveColumns(config: ExportConfig): InternalColumn[] {
  const visibleCols = (config.columns || []).filter(col => !col.hidden);
  if (!visibleCols.length) return [];

  if (config.columnIds && config.columnIds.length > 0) {
    const lookup = new Set(config.columnIds);
    return visibleCols.filter(col => lookup.has(col.id));
  }

  if (config.selectionRange) {
    const { colStart, colEnd } = clampRange(config.selectionRange, config.rows.length, visibleCols.length);
    return visibleCols.slice(colStart, colEnd + 1);
  }

  const selected = toSet(config.selectedColumnIDs);
  if (selected && selected.size > 0) {
    return visibleCols.filter(col => selected.has(col.id));
  }

  return visibleCols;
}

function resolveRows(config: ExportConfig): any[] {
  if (!Array.isArray(config.rows)) return [];
  if (config.selectionRange) {
    const { rowStart, rowEnd } = clampRange(config.selectionRange, config.rows.length, config.columns.length);
    return config.rows.slice(rowStart, rowEnd + 1);
  }
  return config.rows.slice();
}

function buildDataset(config: ExportConfig): ExportDataset | null {
  const cols = resolveColumns(config);
  const rows = resolveRows(config);

  if (!cols.length || !rows.length) {
    return null;
  }

  const headers: string[] = config.includeHeaders === false ? [] : cols.map(col => col.label ?? col.key);
  const data = rows.map(row => cols.map(col => {
    const normalizedCol = { ...col, pinned: col.pinned ?? undefined } as any;
    const value = getValue(row, normalizedCol);
    return formatValue(value, row, normalizedCol);
  }));

  return { headers, rows: data };
}

function escapeCSV(value: string): string {
  const needsEscape = /[",\n\r]/.test(value);
  if (!needsEscape) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureExtension(fileName: string, ext: string): string {
  if (!fileName) return `grid-export.${ext}`;
  if (fileName.toLowerCase().endsWith(`.${ext}`)) return fileName;
  return `${fileName}.${ext}`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportCSV(config: ExportConfig, fileName = "grid-export.csv") {
  const dataset = buildDataset(config);
  if (!dataset) return;

  const lines: string[] = [];
  if (dataset.headers.length) {
    lines.push(dataset.headers.map(escapeCSV).join(","));
  }
  for (const row of dataset.rows) {
    lines.push(row.map(value => escapeCSV(String(value ?? ""))).join(","));
  }

  const csv = "\ufeff" + lines.join("\r\n"); // BOM helps Excel read UTF-8
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, ensureExtension(fileName, "csv"));
}

export function exportExcel(config: ExportConfig, fileName = "grid-export.xlsx") {
  const dataset = buildDataset(config);
  if (!dataset) return;

  const headerHTML = dataset.headers.length
    ? `<tr>${dataset.headers.map(h => `<th>${escapeHTML(h)}</th>`).join("")}</tr>`
    : "";

  const bodyHTML = dataset.rows
    .map(row => `<tr>${row.map(cell => `<td>${escapeHTML(String(cell ?? ""))}</td>`).join("")}</tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>
<table>
<thead>${headerHTML}</thead>
<tbody>${bodyHTML}</tbody>
</table>
</body>
</html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  triggerDownload(blob, ensureExtension(fileName, "xlsx"));
}
