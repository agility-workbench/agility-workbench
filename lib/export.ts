import ExcelJS from "exceljs";
import { getColumnAncestors } from "./helpers";
import { ColumnType, InternalColumn } from "./types";

export interface ExportSelectionRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export interface ExportConfig {
  rows: any[];
  columns: InternalColumn[];
  columnTree?: InternalColumn[];
  selectionRange?: ExportSelectionRange | null;
  selectedColumnIDs?: Set<string>;
  columnIds?: string[];
  includeHeaders?: boolean;
}

interface HeaderCell {
  label: string;
  colStart: number;
  colEnd: number;
  rowSpan: number;
}

interface HeaderLayout {
  cells: HeaderCell[][];
  depth: number;
  paths: InternalColumn[][];
}

interface ValueBundle {
  raw: any;
  formatted: string;
}

const DEFAULT_CURRENCY_FORMAT = '"$"#,##0.00;[Red]\-"$"#,##0.00';

const ensureExtension = (fileName: string, ext: string): string => {
  if (!fileName.toLowerCase().endsWith(`.${ext}`)) {
    return `${fileName}.${ext}`;
  }
  return fileName;
};

const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const clampSelection = (
  range: ExportSelectionRange | null | undefined,
  rowCount: number,
  colCount: number,
): ExportSelectionRange | null => {
  if (!range) return null;
  if (rowCount <= 0 || colCount <= 0) return null;

  const rowStart = Math.min(Math.max(range.rowStart, 0), Math.max(rowCount - 1, 0));
  const rowEnd = Math.min(Math.max(range.rowEnd, 0), Math.max(rowCount - 1, 0));
  const colStart = Math.min(Math.max(range.colStart, 0), Math.max(colCount - 1, 0));
  const colEnd = Math.min(Math.max(range.colEnd, 0), Math.max(colCount - 1, 0));

  return {
    rowStart: Math.min(rowStart, rowEnd),
    rowEnd: Math.max(rowStart, rowEnd),
    colStart: Math.min(colStart, colEnd),
    colEnd: Math.max(colStart, colEnd),
  };
};

const resolveColumns = (config: ExportConfig): InternalColumn[] => {
  const baseCols = config.columns ?? [];
  const range = clampSelection(config.selectionRange, config.rows?.length ?? 0, baseCols.length);

  let cols = range ? baseCols.slice(range.colStart, range.colEnd + 1) : baseCols.slice();
  if (config.columnIds && config.columnIds.length > 0) {
    const allowed = new Set(config.columnIds);
    cols = cols.filter(c => allowed.has(c.id));
  } else if (config.selectedColumnIDs && config.selectedColumnIDs.size > 0) {
    cols = cols.filter(c => config.selectedColumnIDs?.has(c.id));
  }
  return cols;
};

const resolveRows = (config: ExportConfig, colCount: number): any[] => {
  const rows = config.rows ?? [];
  const range = clampSelection(config.selectionRange, rows.length, colCount);
  if (!range) return rows.slice();
  return rows.slice(range.rowStart, range.rowEnd + 1);
};

const buildPaths = (columns: InternalColumn[], columnTree?: InternalColumn[]): InternalColumn[][] => {
  return columns.map(col => {
    if (columnTree && columnTree.length > 0) {
      const ancestors = getColumnAncestors(columnTree, col.id);
      if (ancestors.length > 0) return ancestors;
    }
    return [col];
  });
};

const buildHeaderLayout = (columns: InternalColumn[], columnTree?: InternalColumn[]): HeaderLayout => {
  if (!columns.length) {
    return { cells: [], depth: 0, paths: [] };
  }

  const paths = buildPaths(columns, columnTree);
  const depth = Math.max(1, ...paths.map(p => p.length));
  const cells: HeaderCell[][] = [];

  for (let level = 0; level < depth; level++) {
    const rowCells: HeaderCell[] = [];
    let colIdx = 0;
    while (colIdx < columns.length) {
      const path = paths[colIdx];
      if (level >= path.length) {
        colIdx++;
        continue;
      }
      const node = path[level];
      let span = 1;
      let next = colIdx + 1;
      while (next < columns.length) {
        const otherPath = paths[next];
        if (level >= otherPath.length) break;

        let same = true;
        for (let d = 0; d <= level; d++) {
          if (otherPath[d]?.id !== path[d]?.id) {
            same = false;
            break;
          }
        }
        if (!same) break;

        span++;
        next++;
      }
      const isLeafLevel = level === path.length - 1;
      const rowSpan = isLeafLevel ? (depth - level) : 1;
      rowCells.push({
        label: node.label ?? node.key,
        colStart: colIdx,
        colEnd: colIdx + span - 1,
        rowSpan,
      });
      colIdx = next;
    }
    cells.push(rowCells);
  }

  return { cells, depth, paths };
};

const buildHeaderMatrix = (layout: HeaderLayout, columnCount: number): string[][] => {
  if (!layout.depth || !columnCount) return [];

  const matrix: string[][] = Array.from({ length: layout.depth }, () => Array(columnCount).fill(""));
  layout.cells.forEach((rowCells, rowIdx) => {
    rowCells.forEach(cell => {
      matrix[rowIdx][cell.colStart] = cell.label ?? "";
    });
  });

  return matrix;
};

const getValueBundle = (row: any, col: InternalColumn): ValueBundle => {
  const raw = col.valueGetter ? col.valueGetter(row) : row?.[col.key];
  if (col.valueFormatter) {
    return {
      raw,
      formatted: col.valueFormatter(raw, row),
    };
  }
  if (raw == null) {
    return { raw, formatted: "" };
  }
  if (col.type === ColumnType.DATE) {
    const date = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return { raw: date, formatted: date.toISOString() };
    }
  }
  return { raw, formatted: String(raw) };
};

const escapeCSVValue = (value: string): string => {
  const needsQuote = /[",\n\r]/.test(value);
  if (needsQuote) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export const exportCSV = (config: ExportConfig, fileName = "grid-export.csv") => {
  const columns = resolveColumns(config);
  const rows = resolveRows(config, columns.length);
  const includeHeaders = config.includeHeaders !== false;

  const csvRows: string[][] = [];
  if (includeHeaders) {
    const headerLayout = buildHeaderLayout(columns, config.columnTree);
    csvRows.push(...buildHeaderMatrix(headerLayout, columns.length));
  }

  rows.forEach(row => {
    const values = columns.map(col => {
      const { formatted } = getValueBundle(row, col);
      return escapeCSVValue(formatted ?? "");
    });
    csvRows.push(values);
  });

  const csvText = csvRows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, ensureExtension(fileName, "csv"));
};

const applyExcelValue = (cell: ExcelJS.Cell, bundle: ValueBundle, col: InternalColumn) => {
  const { raw, formatted } = bundle;
  if (raw == null) {
    cell.value = null;
    return;
  }

  switch (col.type) {
    case ColumnType.NUMBER: {
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isNaN(num)) {
        cell.value = num;
        if (col.format) {
          cell.numFmt = col.format;
        }
      } else {
        cell.value = formatted ?? String(raw);
      }
      break;
    }
    case ColumnType.CURRENCY: {
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isNaN(num)) {
        cell.value = num;
        cell.numFmt = col.format || DEFAULT_CURRENCY_FORMAT;
      } else {
        cell.value = formatted ?? String(raw);
      }
      break;
    }
    case ColumnType.DATE: {
      const date = raw instanceof Date ? raw : new Date(raw);
      if (!Number.isNaN(date.getTime())) {
        cell.value = date;
        if (col.format) {
          cell.numFmt = col.format;
        }
      } else {
        cell.value = formatted ?? String(raw);
      }
      break;
    }
    case ColumnType.BOOLEAN: {
      cell.value = Boolean(raw);
      break;
    }
    default: {
      cell.value = formatted ?? String(raw);
    }
  }
};

export const exportExcel = async (config: ExportConfig, fileName = "grid-export.xlsx") => {
  try {
    const columns = resolveColumns(config);
    const rows = resolveRows(config, columns.length);
    const includeHeaders = config.includeHeaders !== false;
    const headerLayout = includeHeaders ? buildHeaderLayout(columns, config.columnTree) : { cells: [], depth: 0, paths: [] };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Export");

    if (includeHeaders && headerLayout.depth > 0) {
      headerLayout.cells.forEach((rowCells, rowIdx) => {
        const excelRow = sheet.getRow(rowIdx + 1);
        rowCells.forEach(cell => {
          const target = excelRow.getCell(cell.colStart + 1);
          target.value = cell.label;
          target.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

          if (cell.colEnd > cell.colStart || cell.rowSpan > 1) {
            sheet.mergeCells(
              rowIdx + 1,
              cell.colStart + 1,
              rowIdx + cell.rowSpan,
              cell.colEnd + 1,
            );
          }
        });
      });
    }

    const headerOffset = includeHeaders ? headerLayout.depth : 0;
    rows.forEach((row, rowIdx) => {
      const excelRow = sheet.getRow(headerOffset + rowIdx + 1);
      columns.forEach((col, colIdx) => {
        const bundle = getValueBundle(row, col);
        const cell = excelRow.getCell(colIdx + 1);
        applyExcelValue(cell, bundle, col);
      });
    });

    sheet.columns?.forEach((col, idx) => {
      const sourceCol = columns[idx];
      if (sourceCol?.width) {
        col.width = Math.max(10, Math.floor(sourceCol.width / 7));
      } else if (sourceCol?.label) {
        col.width = Math.max(10, Math.min(40, Math.ceil((sourceCol.label.length + 6))));
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerDownload(blob, ensureExtension(fileName, "xlsx"));
  } catch (err) {
    console.error("Excel export failed", err);
  }
};
