import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";
import { AggregateModel, AggregateType } from "../interfaces/aggregate";
import { GroupDisplayType } from "../interfaces/gridOptions";
import { AggregateCalculator } from "../aggregate/calculator";
import { CellStyle } from "./xlsx/styleRegistry";
import { CellValue, MergeRange, RowMeta, SheetCell, writeXlsx } from "./xlsx/writeXlsx";
import { columnName } from "./xlsx/xml";
import { resolveColSpan } from "../renderer/body/colSpan";
import type {
  ExcelExportCellProcessor,
  ExcelExportCellStyle,
  ExcelExportRowType,
} from "../interfaces/iGridAPI";

export type ExportScope = "all" | "selection" | "selectedColumns";

export interface ExportOptions {
  scope?: ExportScope;
  fileName?: string;
  columnIds?: string[];
  includeHeaders?: boolean;
  /** For a grouped export: "tree" (headers + subtotals, default) or "leaves" (flat leaf rows). */
  groupMode?: "tree" | "leaves";
  processCellForExcel?: ExcelExportCellProcessor;
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
  /**
   * Pinned band row data exported around the body, mirroring the on-screen order: `pinnedTopRows`
   * are emitted directly after the header (and included in the Excel frozen pane so they stay
   * pinned in the workbook), `pinnedBottomRows` after the last body row (before the aggregate
   * footer). Same shape as `rows`; the aggregate footer's formulas span body rows only.
   */
  pinnedTopRows?: any[];
  pinnedBottomRows?: any[];
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
  /**
   * Top-level (level-0) group nodes, each with nested `children`, when the grid is row-grouped.
   * When present, the Excel body is emitted with outline levels and per-group SUBTOTAL rows instead
   * of a flat row list. `groupColumns` gives the grouped columns in level order (for header labels).
   */
  groupRoots?: IRowNode[];
  groupColumns?: Column[];
  /**
   * How group headings are surfaced, mirroring the grid's on-screen layout:
   *  - "singleColumn": a dedicated group column (see `autoGroupColumn`) carries every level's label.
   *  - "multipleColumns": each grouped column shows the label for its own level in place.
   *  - "groupRows": the label rides in the first exported column.
   * Defaults to "singleColumn" when omitted.
   */
  groupDisplayType?: GroupDisplayType;
  /** Hierarchy is tree data: real parent nodes remain data rows rather than aggregate headers. */
  treeData?: boolean;
  /**
   * The synthesized auto-group column (grid-internal, normally non-exportable). Supplied for
   * "singleColumn" mode so the export can include a group-heading column the grid otherwise hides
   * from the exportable set.
   */
  autoGroupColumn?: Column;
  /**
   * How a grouped selection is exported:
   *  - "tree" (default): group headers + per-group SUBTOTAL rows + outline levels.
   *  - "leaves": a flat list of the selected leaf rows (no headers/subtotals). In singleColumn mode
   *    the Group column is filled with each leaf's full group path (e.g. "Analyst / Boston").
   *
   * A cell range's column span is honored via `columnIds` (the exporter restricts to those columns);
   * the singleColumn Group column is still prepended when present, so grouping context survives.
   */
  groupMode?: "tree" | "leaves";
  /**
   * Per-cell horizontal span resolver, mirroring the grid's `ColDef.colSpan`. Given a body row's
   * data and a column, returns the raw span the column requested for that row (1 / undefined = no
   * span). The exporter clamps the result to the exported column window and the column's pinned
   * section, then emits an Excel cell merge — reproducing the on-screen merged cell. Omitted → no
   * body spanning. Applies to leaf/data rows (flat and grouped exports); group header/subtotal rows
   * keep their own layout.
   */
  getCellColSpan?: (rowData: any, col: Column, rowIndex: number) => number | undefined;
  /**
   * Marks a body row as full-width (group rows in "groupRows" mode, or rows the grid's
   * `isFullWidthRow` opts in). A full-width row exports as a single value in the first column merged
   * across every exported column, mirroring the grid. `rowData` is the row's underlying data object.
   */
  isFullWidthRow?: (rowData: any) => boolean;
  /**
   * Renders a full-width row's exported text. Defaults to the row's group label (for group rows) or
   * empty. Only consulted for rows {@link isFullWidthRow} marks full-width.
   */
  fullWidthText?: (rowData: any) => string;
  /** Public, Excel-only customization hook forwarded by ExportRenderer. */
  processCellForExcel?: ExcelExportCellProcessor;
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

  const colStart = Math.min(Math.max(range.colStart, 0), Math.max(colCount - 1, 0));
  const colEnd = Math.min(Math.max(range.colEnd, 0), Math.max(colCount - 1, 0));

  // A range may live entirely in the pinned bands (body segment empty, rowStart > rowEnd). Its
  // column span still applies; the empty body segment is preserved so resolveRows yields nothing.
  if (range.rowEnd < range.rowStart) {
    return { rowStart: 0, rowEnd: -1, colStart: Math.min(colStart, colEnd), colEnd: Math.max(colStart, colEnd) };
  }

  const rowStart = Math.min(Math.max(range.rowStart, 0), Math.max(rowCount - 1, 0));
  const rowEnd = Math.min(Math.max(range.rowEnd, 0), Math.max(rowCount - 1, 0));

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
  if (range.rowEnd < range.rowStart) return [];
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

// Which pinned section a column belongs to. Body spans (like on screen) never cross a section
// boundary, so runs of same-section columns bound how far a span can reach.
const sectionOf = (col: Column): "left" | "center" | "right" =>
  col.pinned === "left" ? "left" : col.pinned === "right" ? "right" : "center";

/**
 * Resolve one body row's horizontal spans over the EXPORTED column window. Returns, per column
 * index, the effective span (>= 1). A span is clamped so it never runs past the end of the column's
 * pinned section within this window and never past the last exported column — exactly mirroring the
 * grid's clamp, but against the columns actually present in the export (so a selection/column filter
 * that cuts a span merges only the visible part). Columns covered by an earlier span get span 0
 * (they are emitted empty and folded into the merge).
 */
const resolveRowSpans = (
  rowData: any,
  columns: Column[],
  getCellColSpan: (rowData: any, col: Column, rowIndex: number) => number | undefined,
  rowIndex: number,
): number[] => {
  const spans = new Array<number>(columns.length).fill(1);
  let c = 0;
  while (c < columns.length) {
    const col = columns[c];
    const section = sectionOf(col);
    // Columns remaining in this same-section run from c onward.
    let sectionEnd = c;
    while (sectionEnd + 1 < columns.length && sectionOf(columns[sectionEnd + 1]) === section) sectionEnd++;
    const remainingInSection = sectionEnd - c + 1;

    const raw = getCellColSpan(rowData, col, rowIndex);
    const span = resolveColSpan(raw, remainingInSection);
    spans[c] = span;
    for (let k = 1; k < span; k++) spans[c + k] = 0; // covered
    c += span;
  }
  return spans;
};

// A body data row's Excel cells plus the column-local merges it needs (0-based column offsets;
// `span` >= 2). The caller translates each merge to an absolute MergeRange once it knows the row's
// 1-based sheet row.
interface BodyRowCells {
  cells: SheetCell[];
  spanMerges: Array<{ colStart: number; span: number }>;
  /** True when the whole row is a single full-width cell merged across every column. */
  fullWidth: boolean;
}

type ExportValueOverride = (
  col: Column,
  colIndex: number,
  current: ValueBundle,
) => ValueBundle | undefined;

const mergeExcelCellStyle = (
  base: CellStyle | undefined,
  override: ExcelExportCellStyle | undefined,
): CellStyle | undefined => {
  if (!override) return base;
  return {
    ...base,
    ...override,
    alignment: override.alignment
      ? { ...base?.alignment, ...override.alignment }
      : base?.alignment,
  };
};

/** Build a typed sheet cell, applying the public Excel-only override after grid value formatting. */
const exportDataCell = (
  rowData: any,
  col: Column,
  bundle: ValueBundle,
  defaultStyle: CellStyle | undefined,
  config: ExportConfig,
  rowIndex: number,
  rowType: ExcelExportRowType,
): SheetCell => {
  const override = config.processCellForExcel?.({
    value: bundle.raw,
    formattedValue: bundle.formatted,
    data: rowData,
    rowIndex,
    rowType,
    column: col,
  });
  const hasValueOverride = override != null
    && Object.prototype.hasOwnProperty.call(override, "value");
  const value = hasValueOverride ? override!.value : bundle.raw;
  const processedBundle = hasValueOverride
    ? { raw: value, formatted: value == null ? "" : String(value) }
    : bundle;
  return {
    value: toCellValue(processedBundle, col),
    style: mergeExcelCellStyle(defaultStyle, override?.style),
  };
};

/**
 * Build one leaf/data row's cells, honoring full-width rows and per-cell colSpan (both mirroring the
 * grid). Full-width → the row's text in column 0, empty elsewhere, merged across all columns. colSpan
 * → the spanning cell keeps its value, covered cells go empty, and a merge spans them. With neither
 * configured, every column emits its own value (the original behavior).
 */
const emitDataRowCells = (
  rowData: any,
  columns: Column[],
  bodyStyles: (CellStyle | undefined)[],
  config: ExportConfig,
  rowIndex: number,
  rowType: ExcelExportRowType = "body",
  valueOverride?: ExportValueOverride,
): BodyRowCells => {
  if (config.isFullWidthRow?.(rowData)) {
    const text = config.fullWidthText?.(rowData) ?? "";
    const cells = columns.map((_, colIdx) =>
      colIdx === 0
        ? exportDataCell(
            rowData,
            columns[0],
            { raw: text, formatted: text },
            bodyStyles[0],
            config,
            rowIndex,
            rowType,
          )
        : { value: { kind: "empty" } as CellValue },
    );
    return {
      cells,
      spanMerges: columns.length > 1 ? [{ colStart: 0, span: columns.length }] : [],
      fullWidth: true,
    };
  }

  if (!config.getCellColSpan) {
    return {
      cells: columns.map((col, colIdx) => {
        const current = getValueBundle(rowData, col);
        const bundle = valueOverride?.(col, colIdx, current) ?? current;
        return exportDataCell(rowData, col, bundle, bodyStyles[colIdx], config, rowIndex, rowType);
      }),
      spanMerges: [],
      fullWidth: false,
    };
  }

  const spans = resolveRowSpans(rowData, columns, config.getCellColSpan, rowIndex);
  const cells: SheetCell[] = [];
  const spanMerges: Array<{ colStart: number; span: number }> = [];
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const span = spans[colIdx];
    if (span === 0) {
      cells.push({ value: { kind: "empty" } as CellValue }); // covered by an earlier span
      continue;
    }
    const col = columns[colIdx];
    const current = getValueBundle(rowData, col);
    const bundle = valueOverride?.(col, colIdx, current) ?? current;
    cells.push(exportDataCell(rowData, col, bundle, bodyStyles[colIdx], config, rowIndex, rowType));
    if (span > 1) spanMerges.push({ colStart: colIdx, span });
  }
  return { cells, spanMerges, fullWidth: false };
};

// Translate a row's column-local span merges to absolute 1-based MergeRanges on a single sheet row.
const spanMergesToRanges = (
  spanMerges: Array<{ colStart: number; span: number }>,
  sheetRow1Based: number,
): MergeRange[] =>
  spanMerges.map(m => ({
    fromRow: sheetRow1Based,
    toRow: sheetRow1Based,
    fromCol: m.colStart + 1,
    toCol: m.colStart + m.span,
  }));

const escapeCSVValue = (value: string): string => {
  const needsQuote = /[",\n\r]/.test(value);
  if (needsQuote) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

/** Build the CSV text for a config, without downloading. Returns "" when there are no columns. */
export const buildCSV = (config: ExportConfig): string => {
  const columns = resolveColumns(config);
  const rows = resolveRows(config, columns.length);
  const includeHeaders = config.includeHeaders !== false;

  const csvRows: string[][] = [];
  if (includeHeaders) {
    const headerLayout = buildHeaderLayout(columns, config.columnTree);
    csvRows.push(...buildHeaderMatrix(headerLayout, columns.length));
  }

  const emitRow = (row: any, rowIndex: number) => {
    // CSV has no merged-cell concept, so mirror the grid's *visible* content: a full-width row puts
    // its text in the first column and blanks the rest; a colSpan puts the value in the spanning
    // column and blanks the columns it covers.
    if (config.isFullWidthRow?.(row)) {
      const text = config.fullWidthText?.(row) ?? "";
      const values = columns.map((_, colIdx) => (colIdx === 0 ? escapeCSVValue(text) : ""));
      csvRows.push(values);
      return;
    }

    const spans = config.getCellColSpan
      ? resolveRowSpans(row, columns, config.getCellColSpan, rowIndex)
      : null;
    const values = columns.map((col, colIdx) => {
      if (spans && spans[colIdx] === 0) return ""; // covered by an earlier span
      const { formatted } = getValueBundle(row, col);
      return escapeCSVValue(formatted ?? "");
    });
    csvRows.push(values);
  };

  // Pinned band rows frame the body, mirroring the on-screen top band → body → bottom band order.
  (config.pinnedTopRows ?? []).forEach(emitRow);
  rows.forEach(emitRow);
  (config.pinnedBottomRows ?? []).forEach(emitRow);

  return csvRows.map(r => r.join(",")).join("\n");
};

export const exportCSV = (config: ExportConfig, fileName = "grid-export.csv") => {
  const csvText = buildCSV(config);
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
 * Excel function name for an aggregate op that maps cleanly to a plain formula over a numeric range,
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
 * SUBTOTAL function code (1-11 range) for an aggregate op, or null when unavailable. Codes 1-11
 * ignore *nested* SUBTOTAL cells (so group subtotals never double-count into a parent/grand total)
 * while still *including* hidden rows (so collapsing a group leaves the totals unchanged). MEDIAN
 * and distinct-count have no SUBTOTAL equivalent.
 */
const subtotalCode = (op: AggregateType, isNumeric: boolean): number | null => {
  switch (op) {
    case AggregateType.AVG:
      return 1;
    case AggregateType.COUNT:
      return 3; // COUNTA
    case AggregateType.MAX:
      return isNumeric ? 4 : null;
    case AggregateType.MIN:
      return isNumeric ? 5 : null;
    case AggregateType.SUM:
      return 9;
    default:
      return null; // MEDIAN, DISTINCT_COUNT
  }
};

/**
 * Build one aggregate cell: a live formula over [rangeStart, rangeEnd] when the op maps to an Excel
 * function, else a static value. `useSubtotal` selects SUBTOTAL(code,…) (for grouped exports, where
 * subtotal/grand rows must not double-count) over the plain function form. `computed` is the grid's
 * own value, used as the formula's cached result or the static fallback.
 */
const aggregateCell = (
  col: Column,
  colIdx: number,
  op: AggregateType,
  computed: any,
  rangeStart: number,
  rangeEnd: number,
  useSubtotal: boolean,
): SheetCell => {
  const isNumeric = col.isComputableType();
  const style: CellStyle = { bold: true, numFmt: resolveNumberFormat(col) };
  const colLetter = columnName(colIdx + 1);
  const range = `${colLetter}${rangeStart}:${colLetter}${rangeEnd}`;
  const cachedIsText = typeof computed !== "number";

  if (useSubtotal) {
    const code = subtotalCode(op, isNumeric);
    if (code != null) {
      return {
        value: { kind: "formula", formula: `SUBTOTAL(${code},${range})`, cached: computed, cachedIsText },
        style,
      };
    }
  } else {
    const fn = excelAggregateFn(op, isNumeric);
    if (fn) {
      return {
        value: { kind: "formula", formula: `${fn}(${range})`, cached: computed, cachedIsText },
        style,
      };
    }
  }

  // Static fallback: write the grid's computed value directly.
  if (typeof computed === "number") return { value: { kind: "number", value: computed }, style };
  return { value: { kind: "string", value: String(computed ?? "") }, style: { bold: true } };
};

/**
 * Build the grand-total aggregate footer row. Uses SUBTOTAL when the body is grouped (so it ignores
 * the per-group subtotal rows) and plain functions otherwise. Returns null when there's nothing to
 * aggregate. `dataStartRow`/`dataEndRow` bound the full body block (1-based sheet rows).
 */
const buildAggregateFooter = (
  columns: Column[],
  rows: any[],
  aggregates: AggregateModel[],
  dataStartRow: number,
  dataEndRow: number,
  useSubtotal: boolean,
): SheetCell[] | null => {
  if (!aggregates || aggregates.length === 0 || rows.length === 0) return null;

  const opByCol = new Map(aggregates.map(a => [a.key, a.type]));
  const calculator = new AggregateCalculator();

  return columns.map((col, colIdx) => {
    const op = opByCol.get(col.instanceID);
    if (op == null) return { value: { kind: "empty" } as CellValue };
    const computed = calculator.calculateAggregate(col, op, rows);
    return aggregateCell(col, colIdx, op, computed, dataStartRow, dataEndRow, useSubtotal);
  });
};

/** Collect a group node's leaf-descendant data rows in display order. */
const collectGroupLeaves = (node: IRowNode): any[] => {
  const out: any[] = [];
  const walk = (n: IRowNode) => {
    for (const child of n.children ?? []) {
      if (child.isGroup) walk(child);
      else out.push(child.data);
    }
  };
  walk(node);
  return out;
};

interface GroupedBody {
  rows: SheetCell[][];
  rowMeta: RowMeta[];
  /** All leaf data rows in display order (for the grand-total footer range). */
  leafRows: any[];
  /** Absolute (1-based) cell merges from leaf-row colSpan (empty when no colSpan configured). */
  merges: MergeRange[];
}

/**
 * Emit the body for a grouped export: a group-header row per group (carrying SUBTOTAL formulas for
 * aggregated columns over that group's contiguous leaf range), followed by its children — nested
 * groups recurse, leaf rows render as data. Rows carry outline levels; collapsed groups hide their
 * descendants. The grid renders headers ABOVE their rows (summary-above), so a group's SUBTOTAL
 * range points at the rows emitted *after* its header.
 *
 * Group headings are placed to mirror `groupDisplayType`, matching the on-screen layout:
 *  - "singleColumn": every level's label goes in column 0 (the exported auto-group column), indented.
 *  - "multipleColumns": a group at level L labels the column tagged `groupLevel === L`.
 *  - "groupRows": the label goes in column 0 (the first exported column).
 */
const buildGroupedBody = (
  groupRoots: IRowNode[],
  columns: Column[],
  bodyStyles: (CellStyle | undefined)[],
  aggregates: AggregateModel[] | undefined,
  firstSheetRow: number, // 1-based sheet row where the body starts
  mode: GroupDisplayType,
  config: ExportConfig,
): GroupedBody => {
  const opByCol = new Map((aggregates ?? []).map(a => [a.key, a.type]));
  const calculator = new AggregateCalculator();
  const rows: SheetCell[][] = [];
  const rowMeta: RowMeta[] = [];
  const merges: MergeRange[] = [];
  let leafIndex = 0;
  const leafRows: any[] = [];

  // Column index that hosts a group's label, by mode. multipleColumns maps level → its tagged
  // column; singleColumn/groupRows always use column 0.
  const levelColIdx = new Map<number, number>();
  if (mode === "multipleColumns") {
    columns.forEach((col, idx) => {
      if (col.groupLevel != null) levelColIdx.set(col.groupLevel, idx);
    });
  }
  const labelColIdxFor = (level: number): number =>
    mode === "multipleColumns" ? (levelColIdx.get(level) ?? 0) : 0;

  // Emit a leaf data row, honoring per-cell colSpan (full-width leaf rows can't occur — a full-width
  // node is a group row, handled by emitGroup). colSpan merges are stamped at the leaf's absolute
  // sheet row. Indent for singleColumn mode is carried by the auto-group column's own value.
  const emitLeaf = (data: any, level: number, outlineLevel: number, hidden: boolean) => {
    const built = emitDataRowCells(data, columns, bodyStyles, config, leafIndex++);
    rows.push(built.cells);
    // The row just pushed sits at firstSheetRow + rows.length - 1 (1-based).
    merges.push(...spanMergesToRanges(built.spanMerges, firstSheetRow + rows.length - 1));
    rowMeta.push({ outlineLevel, hidden });
    leafRows.push(data);
    void level;
  };

  // Recursively emit a group node and its subtree. `ancestorCollapsed` hides rows whose ancestor
  // group is collapsed. Returns after appending the header row and all descendants.
  const emitGroup = (node: IRowNode, outlineLevel: number, ancestorCollapsed: boolean) => {
    const groupLeaves = collectGroupLeaves(node);
    const labelColIdx = labelColIdxFor(node.level);

    // Header row: group label + per-group SUBTOTAL cells. Placeholder pushed now; subtotal ranges
    // reference the rows emitted below, so we finalize the header cells after recursing.
    const headerCells: SheetCell[] = columns.map(() => ({ value: { kind: "empty" } as CellValue }));
    rows.push(headerCells);
    const headerSheetRow = firstSheetRow + rows.length - 1; // 1-based sheet row of this header
    rowMeta.push({
      outlineLevel,
      hidden: ancestorCollapsed,
      // Mark the (summary-above) header collapsed so Excel draws the +/- in the collapsed state.
      collapsed: !node.isExpanded,
    });

    // "<value> (<count>)" in the mode's label column.
    const label = `${node.groupKey ?? ""} (${node.childCount ?? groupLeaves.length})`;
    headerCells[labelColIdx] = { value: { kind: "string", value: label }, style: { bold: true } };

    // Children render at the next outline level; hidden if this group is collapsed (or an ancestor
    // was). Data rows sit one level deeper than their group header.
    const childrenCollapsed = ancestorCollapsed || !node.isExpanded;
    const firstChildRow = firstSheetRow + rows.length;
    for (const child of node.children ?? []) {
      if (child.isGroup) {
        emitGroup(child, outlineLevel + 1, childrenCollapsed);
      } else {
        emitLeaf(child.data, node.level + 1, outlineLevel + 1, childrenCollapsed);
      }
    }
    const lastChildRow = firstSheetRow + rows.length - 1;

    // In "groupRows" mode the on-screen group row is a single full-width cell (label only, no
    // per-column subtotals), so mirror that: merge the header across all columns and skip subtotals.
    if (mode === "groupRows") {
      if (columns.length > 1) {
        merges.push(...spanMergesToRanges([{ colStart: 0, span: columns.length }], headerSheetRow));
      }
      return;
    }

    // singleColumn / multipleColumns: fill the header's aggregate cells with SUBTOTAL formulas over
    // the group's leaf range. Skip the label column so a group value never gets overwritten.
    if (lastChildRow >= firstChildRow) {
      columns.forEach((col, colIdx) => {
        if (colIdx === labelColIdx) return;
        const op = opByCol.get(col.instanceID);
        if (op == null) return;
        const computed = calculator.calculateAggregate(col, op, groupLeaves);
        headerCells[colIdx] = aggregateCell(col, colIdx, op, computed, firstChildRow, lastChildRow, true);
      });
    }
  };

  for (const root of groupRoots) emitGroup(root, 1, false);
  return { rows, rowMeta, leafRows, merges };
};

interface FlatLeafBody {
  rows: SheetCell[][];
  leafRows: any[];
  /** Absolute (1-based) cell merges from leaf-row colSpan (empty when no colSpan configured). */
  merges: MergeRange[];
}

/**
 * Emit a flat body for a grouped selection ("Export leaf rows"): every leaf under `groupRoots`, in
 * display order, with no group-header or subtotal rows. In singleColumn mode `columns[0]` is the
 * synthesized Group column — since there are no header rows to carry the grouping, each leaf's cell
 * there is filled with its full group path ("Analyst / Boston"). Other modes carry the grouping in
 * the real data columns already, so column 0 renders the leaf's own value. Per-cell colSpan is
 * honored (and merged) like the flat export; the singleColumn group column never spans.
 */
const buildFlatLeafBody = (
  groupRoots: IRowNode[],
  columns: Column[],
  bodyStyles: (CellStyle | undefined)[],
  mode: GroupDisplayType,
  hasGroupColumn: boolean,
  config: ExportConfig,
  firstSheetRow: number, // 1-based sheet row where the body starts
): FlatLeafBody => {
  const rows: SheetCell[][] = [];
  const leafRows: any[] = [];
  const merges: MergeRange[] = [];
  let leafIndex = 0;
  const groupPathCol0 = mode === "singleColumn" && hasGroupColumn;

  const walk = (node: IRowNode, path: string[]) => {
    for (const child of node.children ?? []) {
      if (child.isGroup) {
        walk(child, [...path, String(child.groupKey ?? "")]);
      } else {
        const data = child.data;
        const groupPath = path.join(" / ");
        // The synthesized Group column's path is the value the processor should observe, rather
        // than the empty value its internal column would resolve from the leaf data.
        const built = emitDataRowCells(
          data,
          columns,
          bodyStyles,
          config,
          leafIndex++,
          "body",
          (_col, colIdx) => groupPathCol0 && colIdx === 0
            ? { raw: groupPath, formatted: groupPath }
            : undefined,
        );
        rows.push(built.cells);
        merges.push(...spanMergesToRanges(built.spanMerges, firstSheetRow + rows.length - 1));
        leafRows.push(data);
      }
    }
  };

  for (const root of groupRoots) walk(root, [String(root.groupKey ?? "")]);
  return { rows, leafRows, merges };
};

/**
 * Tree-data export keeps real parents as ordinary data rows and emits only missing path ancestors
 * as bold synthetic headings. The generated tree column carries each node's label/path.
 */
const buildTreeDataBody = (
  roots: IRowNode[],
  columns: Column[],
  bodyStyles: (CellStyle | undefined)[],
  config: ExportConfig,
  firstSheetRow: number,
  flat: boolean,
): GroupedBody => {
  const rows: SheetCell[][] = [];
  const rowMeta: RowMeta[] = [];
  const leafRows: any[] = [];
  const merges: MergeRange[] = [];
  let dataIndex = 0;
  const treeColumnIndex = columns.findIndex(column => column.isTreeColumn());

  const walk = (
    node: IRowNode,
    path: string[],
    ancestorCollapsed: boolean,
  ) => {
    const label = node.treeKey ?? node.groupKey ?? node.id;
    const nextPath = [...path, String(label)];

    if (node.isGroup) {
      if (!flat) {
        const cells: SheetCell[] = columns.map(() => ({
          value: { kind: "empty" } as CellValue,
        }));
        if (treeColumnIndex >= 0) {
          cells[treeColumnIndex] = {
            value: { kind: "string", value: String(label) },
            style: { bold: true },
          };
        }
        rows.push(cells);
        rowMeta.push({
          outlineLevel: node.level + 1,
          hidden: ancestorCollapsed,
          collapsed: !node.isExpanded,
        });
      }
    } else {
      const treeValue = flat ? nextPath.join(" / ") : String(label);
      const built = emitDataRowCells(
        node.data,
        columns,
        bodyStyles,
        config,
        dataIndex++,
        "body",
        (_col, colIdx) => colIdx === treeColumnIndex
          ? { raw: treeValue, formatted: treeValue }
          : undefined,
      );
      rows.push(built.cells);
      merges.push(...spanMergesToRanges(built.spanMerges, firstSheetRow + rows.length - 1));
      rowMeta.push(flat ? {} : {
        outlineLevel: node.level + 1,
        hidden: ancestorCollapsed,
        collapsed: node.children?.length ? !node.isExpanded : undefined,
      });
      leafRows.push(node.data);
    }

    const childrenHidden = ancestorCollapsed || (!flat && !!node.children?.length && !node.isExpanded);
    for (const child of node.children ?? []) walk(child, nextPath, flat ? false : childrenHidden);
  };

  for (const root of roots) walk(root, [], false);
  return { rows, rowMeta, leafRows, merges };
};

/** Build the .xlsx bytes for a config, without downloading. */
export const buildXlsx = async (config: ExportConfig): Promise<Uint8Array> => {
  const grouped = !!config.groupRoots && config.groupRoots.length > 0;
  const mode: GroupDisplayType = config.groupDisplayType ?? "singleColumn";
  const groupMode = config.groupMode ?? "tree";

    // `resolveColumns` already applies any `columnIds` filter (used to honor a cell range's column
    // span in a grouped export — the exportRenderer maps the range to the covered columns' ids).
    let columns = resolveColumns(config);
    // In singleColumn mode the group heading lives in a dedicated column the grid hides from the
    // exportable set — prepend it so the export mirrors the on-screen layout.
    const hierarchyColumnAlreadyIncluded = !!config.autoGroupColumn
      && columns.some(column => column.instanceID === config.autoGroupColumn!.instanceID);
    const hasGroupColumn = grouped
      && (mode === "singleColumn" || !!config.treeData)
      && !!config.autoGroupColumn;
    if (hasGroupColumn && !hierarchyColumnAlreadyIncluded) {
      columns = [config.autoGroupColumn!, ...columns];
    }

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

    // Body rows. `rowMeta` carries outline levels only in the grouped case; undefined otherwise.
    const bodyStyles = columns.map(bodyCellStyle);

    // Pinned top rows sit directly under the header, inside the frozen pane, so they stay pinned
    // in the workbook exactly as they are in the grid.
    const pinnedTopRows = config.pinnedTopRows ?? [];
    const pinnedBottomRows = config.pinnedBottomRows ?? [];
    pinnedTopRows.forEach((row, rowIndex) => {
      const built = emitDataRowCells(row, columns, bodyStyles, config, rowIndex, "pinnedTop");
      sheetRows.push(built.cells);
      merges.push(...spanMergesToRanges(built.spanMerges, sheetRows.length));
    });

    const dataStartRow = headerOffset + pinnedTopRows.length + 1; // 1-based sheet row of the first body row
    let rowMeta: RowMeta[] | undefined;
    let footerRows: any[]; // leaf rows the grand-total footer aggregates over

    // A tree export emits group-header + subtotal rows and needs SUBTOTAL in the grand total (to skip
    // the nested subtotals); a flat leaf export has neither, so its grand total uses plain functions.
    const treeExport = grouped && groupMode === "tree";

    if (grouped && config.treeData) {
      rowMeta = sheetRows.map(() => ({}));
      const body = buildTreeDataBody(
        config.groupRoots!,
        columns,
        bodyStyles,
        config,
        dataStartRow,
        groupMode === "leaves",
      );
      sheetRows.push(...body.rows);
      rowMeta.push(...body.rowMeta);
      merges.push(...body.merges);
      footerRows = body.leafRows;
    } else if (grouped && groupMode === "leaves") {
      const body = buildFlatLeafBody(config.groupRoots!, columns, bodyStyles, mode, hasGroupColumn, config, dataStartRow);
      sheetRows.push(...body.rows);
      merges.push(...body.merges);
      footerRows = body.leafRows;
    } else if (grouped) {
      // Header rows have no outline metadata; pad rowMeta so indices line up with sheetRows.
      rowMeta = sheetRows.map(() => ({}));
      const body = buildGroupedBody(
        config.groupRoots!,
        columns,
        bodyStyles,
        config.aggregates,
        dataStartRow,
        mode,
        config,
      );
      sheetRows.push(...body.rows);
      rowMeta.push(...body.rowMeta);
      merges.push(...body.merges);
      footerRows = body.leafRows;
    } else {
      rows.forEach((row, rowIndex) => {
        const built = emitDataRowCells(row, columns, bodyStyles, config, rowIndex);
        sheetRows.push(built.cells);
        // sheetRows.length is now the 1-based sheet row of the row just pushed.
        merges.push(...spanMergesToRanges(built.spanMerges, sheetRows.length));
      });
      footerRows = rows;
    }

    // Grand-total footer (SUBTOTAL for a tree export so it ignores per-group subtotal rows; plain
    // functions otherwise). At this point sheetRows holds header + pinned top + body, so its length
    // is the 1-based row of the last body row. Captured BEFORE the pinned bottom rows are appended
    // so the footer's formula ranges aggregate body rows only.
    const dataEndRow = sheetRows.length;

    pinnedBottomRows.forEach((row, rowIndex) => {
      const built = emitDataRowCells(row, columns, bodyStyles, config, rowIndex, "pinnedBottom");
      sheetRows.push(built.cells);
      merges.push(...spanMergesToRanges(built.spanMerges, sheetRows.length));
      if (rowMeta) rowMeta.push({}); // pinned rows sit at the top outline level
    });
    const footer = config.aggregates
      ? buildAggregateFooter(columns, footerRows, config.aggregates, dataStartRow, dataEndRow, treeExport)
      : null;
    if (footer) {
      sheetRows.push(footer);
      if (rowMeta) rowMeta.push({}); // footer sits at the top outline level
    }

    const leftPinnedCount = columns.filter(col => col.pinned === "left").length;

    const bytes = await writeXlsx({
      sheets: [
        {
          name: "Export",
          rows: sheetRows,
          rowMeta,
          columns: columns.map(col => ({ width: toExcelWidth(col, config) })),
          merges,
          frozen: {
            xSplit: leftPinnedCount || undefined,
            ySplit: (headerOffset + pinnedTopRows.length) || undefined,
          },
        },
      ],
    });

  return bytes;
};

export const exportExcel = async (config: ExportConfig, fileName = "grid-export.xlsx") => {
  try {
    const bytes = await buildXlsx(config);
    // `bytes` is a freshly allocated, exact-size Uint8Array, so its buffer is a plain ArrayBuffer.
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerDownload(blob, ensureExtension(fileName, "xlsx"));
  } catch (err) {
    console.error("Excel export failed", err);
  }
};
