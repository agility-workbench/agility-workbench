import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";
import { AggregateModel, AggregateType } from "../interfaces/aggregate";
import { AggregateCalculator } from "../aggregate/calculator";
import { CellStyle } from "./xlsx/styleRegistry";
import { CellValue, MergeRange, SheetCell, writeXlsx } from "./xlsx/writeXlsx";
import { columnName } from "./xlsx/xml";

export type ExportScope = "all" | "selection" | "selectedColumns";

export interface ExportOptions {
  scope?: ExportScope;
  fileName?: string;
  columnIds?: string[];
  includeHeaders?: boolean;
}

export interface ExportSelectionRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

export interface ExportConfig {
  rows: any[];
  columns: Column[];
  columnTree?: Column[];
  selectionRange?: ExportSelectionRange | null;
  selectedColumnIDs?: Set<string>;
  columnIds?: string[];
  includeHeaders?: boolean;
  columnWidths?: Map<string, { width: number; minWidth?: number; maxWidth?: number; fixed?: boolean }>;
  /**
   * When present and non-empty, an aggregate footer row is appended to the Excel export. Each entry
   * keys off a column's instanceID; columns without an entry get their default op (SUM for numeric,
   * COUNT otherwise), matching the grid's on-screen aggregate row.
   */
  aggregates?: AggregateModel[];
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
  paths: Column[][];
}

interface ValueBundle {
  raw: any;
  formatted: string;
}

const DEFAULT_CURRENCY_FORMAT = '"$"#,##0.00;[Red]\-"$"#,##0.00';
const DEFAULT_DATE_FORMAT = "yyyy-mm-dd";

const isDateLikeFormat = (fmt?: string): boolean => {
  if (!fmt) return false;
  return /[dmyhs]/i.test(fmt);
};

const resolveNumberFormat = (col: Column): string | undefined => {
  if (col.type === ColumnType.CURRENCY) {
    // Always prefer a currency-friendly format; ignore date-like formats that might slip in.
    if (col.format && !isDateLikeFormat(col.format)) {
      return col.format;
    }
    return DEFAULT_CURRENCY_FORMAT;
  }
  if (col.type === ColumnType.NUMBER) {
    if (col.format && !isDateLikeFormat(col.format)) {
      return col.format;
    }
    return undefined;
  }
  if (col.type === ColumnType.DATE) {
    return col.format || DEFAULT_DATE_FORMAT;
  }
  return undefined;
};

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

const resolveColumns = (config: ExportConfig): Column[] => {
  const baseCols = config.columns ?? [];
  const range = clampSelection(config.selectionRange, config.rows?.length ?? 0, baseCols.length);

  let cols = range ? baseCols.slice(range.colStart, range.colEnd + 1) : baseCols.slice();
  cols = cols.filter(c => !c.isInternal() && c.exportable);
  if (config.columnIds && config.columnIds.length > 0) {
    const allowed = new Set(config.columnIds);
    cols = cols.filter(c => allowed.has(c.instanceID) || allowed.has(c.colId) || allowed.has(c.key));
  } else if (config.selectedColumnIDs && config.selectedColumnIDs.size > 0) {
    cols = cols.filter(c => config.selectedColumnIDs?.has(c.instanceID));
  }
  return cols;
};

const resolveRows = (config: ExportConfig, colCount: number): any[] => {
  const rows = config.rows ?? [];
  const range = clampSelection(config.selectionRange, rows.length, colCount);
  if (!range) return rows.slice();
  return rows.slice(range.rowStart, range.rowEnd + 1);
};

const getColumnAncestors = (columnTree: Column[], colId: string): Column[] => {
  const visit = (cols: Column[], path: Column[]): Column[] => {
    for (const col of cols) {
      const nextPath = [...path, col];
      if (col.instanceID === colId) return nextPath;
      const found = visit(col.children, nextPath);
      if (found.length > 0) return found;
    }
    return [];
  };

  return visit(columnTree, []);
};

const buildPaths = (columns: Column[], columnTree?: Column[]): Column[][] => {
  return columns.map(col => {
    if (columnTree && columnTree.length > 0) {
      const ancestors = getColumnAncestors(columnTree, col.instanceID);
      if (ancestors.length > 0) return ancestors;
    }
    return [col];
  });
};

const buildHeaderLayout = (columns: Column[], columnTree?: Column[]): HeaderLayout => {
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
          if (otherPath[d]?.instanceID !== path[d]?.instanceID) {
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

const getValueBundle = (row: any, col: Column): ValueBundle => {
  const rowNode = row && typeof row === "object" && "data" in row
    ? row as IRowNode
    : { data: row } as IRowNode;
  const raw = col.getValue(rowNode);
  const formatted = col.formatValue(raw, rowNode);
  if (formatted !== String(raw ?? "")) return { raw, formatted };
  if (raw == null) {
    return { raw, formatted: "" };
  }
  if (col.type === ColumnType.DATE) {
    const date = raw instanceof Date ? raw : new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return { raw: date, formatted: date.toISOString() };
    }
  }
  return { raw, formatted };
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

/**
 * Map a grid value bundle to a typed sheet cell value. Mirrors the previous exceljs mapping: numeric
 * and date columns are written as real numbers/dates (so Excel can format/aggregate them), with the
 * formatted string as a fallback when the raw value isn't coercible.
 */
const toCellValue = (bundle: ValueBundle, col: Column): CellValue => {
  const { raw, formatted } = bundle;
  if (raw == null) return { kind: "empty" };

  switch (col.type) {
    case ColumnType.NUMBER:
    case ColumnType.CURRENCY: {
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isNaN(num)) return { kind: "number", value: num };
      return { kind: "string", value: formatted ?? String(raw) };
    }
    case ColumnType.DATE: {
      const date = raw instanceof Date ? raw : new Date(raw);
      if (!Number.isNaN(date.getTime())) return { kind: "date", value: date };
      return { kind: "string", value: formatted ?? String(raw) };
    }
    case ColumnType.BOOLEAN:
      return { kind: "boolean", value: Boolean(raw) };
    default:
      return { kind: "string", value: formatted ?? String(raw) };
  }
};

/** Body-cell style for a column: just its number format (dates always get a format). */
const bodyCellStyle = (col: Column): CellStyle | undefined => {
  const fmt = resolveNumberFormat(col);
  if (fmt) return { numFmt: fmt };
  return undefined;
};

/** Excel character-unit width from the grid's pixel width (roughly 7px per character). */
const toExcelWidth = (col: Column, config: ExportConfig): number => {
  const widthInfo = config.columnWidths?.get(col.instanceID);
  const rawWidth = widthInfo?.width ?? col.width;
  if (rawWidth) return Math.max(10, Math.floor(rawWidth / 7));
  return Math.max(10, Math.min(40, Math.ceil((col.label?.length ?? col.key.length ?? 6) + 6)));
};

/**
 * Excel function name for an aggregate op that maps cleanly to a live formula over a numeric range,
 * or null when it can't (text MIN/MAX, distinct count) and we must fall back to a static value.
 */
const excelAggregateFn = (op: AggregateType, isNumeric: boolean): string | null => {
  switch (op) {
    case AggregateType.SUM:
      return "SUM";
    case AggregateType.AVG:
      return "AVERAGE";
    case AggregateType.MEDIAN:
      return "MEDIAN";
    case AggregateType.MIN:
      return isNumeric ? "MIN" : null; // text MIN uses the grid's collator, not Excel's
    case AggregateType.MAX:
      return isNumeric ? "MAX" : null;
    case AggregateType.COUNT:
      return "COUNTA"; // counts non-empty cells, matching the grid's row count
    case AggregateType.DISTINCT_COUNT:
      return null; // no single portable Excel function
    default:
      return null;
  }
};

/**
 * Build the aggregate footer row. Each column with an aggregate becomes either a live Excel formula
 * over its body range (SUM/AVERAGE/MEDIAN/MIN/MAX/COUNTA on numeric data) or a static precomputed
 * value (text MIN/MAX, distinct count) — always matching what the grid's own calculator produces.
 * Returns null when there are no aggregates to show.
 */
const buildAggregateFooter = (
  columns: Column[],
  rows: any[],
  aggregates: AggregateModel[],
  dataStartRow: number, // 1-based sheet row of the first body row
): SheetCell[] | null => {
  if (!aggregates || aggregates.length === 0 || rows.length === 0) return null;

  const opByCol = new Map(aggregates.map(a => [a.key, a.type]));
  const calculator = new AggregateCalculator();
  const dataEndRow = dataStartRow + rows.length - 1;

  const footer: SheetCell[] = columns.map((col, colIdx) => {
    const op = opByCol.get(col.instanceID);
    if (op == null) return { value: { kind: "empty" } as CellValue };

    const computed = calculator.calculateAggregate(col, op, rows);
    const isNumeric = col.isComputableType();
    const fn = excelAggregateFn(op, isNumeric);
    const style: CellStyle = { bold: true, numFmt: resolveNumberFormat(col) };

    if (fn) {
      const colLetter = columnName(colIdx + 1);
      const range = `${colLetter}${dataStartRow}:${colLetter}${dataEndRow}`;
      const cachedIsText = typeof computed !== "number";
      return {
        value: {
          kind: "formula",
          formula: `${fn}(${range})`,
          cached: computed as number | string,
          cachedIsText,
        },
        style,
      };
    }

    // Static fallback: write the grid's computed value directly.
    if (typeof computed === "number") {
      return { value: { kind: "number", value: computed }, style };
    }
    return { value: { kind: "string", value: String(computed ?? "") }, style: { bold: true } };
  });

  return footer;
};

export const exportExcel = async (config: ExportConfig, fileName = "grid-export.xlsx") => {
  try {
    const columns = resolveColumns(config);
    const rows = resolveRows(config, columns.length);
    const includeHeaders = config.includeHeaders !== false;
    const headerLayout = includeHeaders
      ? buildHeaderLayout(columns, config.columnTree)
      : { cells: [], depth: 0, paths: [] };
    const headerOffset = includeHeaders ? headerLayout.depth : 0;

    const sheetRows: SheetCell[][] = [];
    const merges: MergeRange[] = [];

    // Header rows (with hierarchical merges).
    if (includeHeaders && headerLayout.depth > 0) {
      for (let level = 0; level < headerLayout.depth; level++) {
        sheetRows.push(Array.from({ length: columns.length }, () => ({ value: { kind: "empty" } as CellValue })));
      }
      const headerStyle: CellStyle = {
        bold: true,
        alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      };
      headerLayout.cells.forEach((rowCells, rowIdx) => {
        rowCells.forEach(cell => {
          sheetRows[rowIdx][cell.colStart] = {
            value: { kind: "string", value: cell.label ?? "" },
            style: headerStyle,
          };
          if (cell.colEnd > cell.colStart || cell.rowSpan > 1) {
            merges.push({
              fromRow: rowIdx + 1,
              fromCol: cell.colStart + 1,
              toRow: rowIdx + cell.rowSpan,
              toCol: cell.colEnd + 1,
            });
          }
        });
      });
    }

    // Body rows.
    const bodyStyles = columns.map(bodyCellStyle);
    const dataStartRow = headerOffset + 1; // 1-based sheet row of the first body row
    rows.forEach(row => {
      const sheetRow: SheetCell[] = columns.map((col, colIdx) => ({
        value: toCellValue(getValueBundle(row, col), col),
        style: bodyStyles[colIdx],
      }));
      sheetRows.push(sheetRow);
    });

    // Aggregate footer (live Excel formulas where possible, static values otherwise).
    const footer = config.aggregates
      ? buildAggregateFooter(columns, rows, config.aggregates, dataStartRow)
      : null;
    if (footer) sheetRows.push(footer);

    const leftPinnedCount = columns.filter(col => col.pinned === "left").length;

    const bytes = await writeXlsx({
      sheets: [
        {
          name: "Export",
          rows: sheetRows,
          columns: columns.map(col => ({ width: toExcelWidth(col, config) })),
          merges,
          frozen: {
            xSplit: leftPinnedCount || undefined,
            ySplit: headerOffset || undefined,
          },
        },
      ],
    });

    // `bytes` is a freshly allocated, exact-size Uint8Array, so its buffer is a plain ArrayBuffer.
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerDownload(blob, ensureExtension(fileName, "xlsx"));
  } catch (err) {
    console.error("Excel export failed", err);
  }
};
