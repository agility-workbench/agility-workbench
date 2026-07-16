import { Column } from "../column/column";
import { ColumnType } from "../interfaces/column";
import { IRowNode } from "../interfaces/iRowNode";
import { AggregateModel, AggregateType } from "../interfaces/aggregate";
import { GroupDisplayType } from "../interfaces/gridOptions";
import { AggregateCalculator } from "../aggregate/calculator";
import { CellStyle } from "./xlsx/styleRegistry";
import { CellValue, MergeRange, RowMeta, SheetCell, writeXlsx } from "./xlsx/writeXlsx";
import { columnName } from "./xlsx/xml";

export type ExportScope = "all" | "selection" | "selectedColumns";

export interface ExportOptions {
  scope?: ExportScope;
  fileName?: string;
  columnIds?: string[];
  includeHeaders?: boolean;
  /** For a grouped export: "tree" (headers + subtotals, default) or "leaves" (flat leaf rows). */
  groupMode?: "tree" | "leaves";
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
): GroupedBody => {
  const opByCol = new Map((aggregates ?? []).map(a => [a.key, a.type]));
  const calculator = new AggregateCalculator();
  const rows: SheetCell[][] = [];
  const rowMeta: RowMeta[] = [];
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

  // Emit a leaf data row. Indent applies per-level in singleColumn mode (col 0 mirrors the grid's
  // indented auto-group column); other modes render leaf data verbatim.
  const emitLeaf = (data: any, level: number, outlineLevel: number, hidden: boolean) => {
    rows.push(columns.map((col, colIdx) => ({
      value: toCellValue(getValueBundle(data, col), col),
      style: bodyStyles[colIdx],
    })));
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

    // Fill the header's aggregate cells with SUBTOTAL formulas over the group's leaf range. Skip the
    // label column so a group value never gets overwritten by a subtotal.
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
  return { rows, rowMeta, leafRows };
};

interface FlatLeafBody {
  rows: SheetCell[][];
  leafRows: any[];
}

/**
 * Emit a flat body for a grouped selection ("Export leaf rows"): every leaf under `groupRoots`, in
 * display order, with no group-header or subtotal rows. In singleColumn mode `columns[0]` is the
 * synthesized Group column — since there are no header rows to carry the grouping, each leaf's cell
 * there is filled with its full group path ("Analyst / Boston"). Other modes carry the grouping in
 * the real data columns already, so column 0 renders the leaf's own value.
 */
const buildFlatLeafBody = (
  groupRoots: IRowNode[],
  columns: Column[],
  bodyStyles: (CellStyle | undefined)[],
  mode: GroupDisplayType,
  hasGroupColumn: boolean,
): FlatLeafBody => {
  const rows: SheetCell[][] = [];
  const leafRows: any[] = [];

  const walk = (node: IRowNode, path: string[]) => {
    for (const child of node.children ?? []) {
      if (child.isGroup) {
        walk(child, [...path, String(child.groupKey ?? "")]);
      } else {
        const data = child.data;
        const cells = columns.map((col, colIdx) => {
          // singleColumn's prepended Group column (index 0) gets the leaf's full group path.
          if (colIdx === 0 && mode === "singleColumn" && hasGroupColumn) {
            return { value: { kind: "string", value: path.join(" / ") } as CellValue, style: bodyStyles[0] };
          }
          return { value: toCellValue(getValueBundle(data, col), col), style: bodyStyles[colIdx] };
        });
        rows.push(cells);
        leafRows.push(data);
      }
    }
  };

  for (const root of groupRoots) walk(root, [String(root.groupKey ?? "")]);
  return { rows, leafRows };
};

export const exportExcel = async (config: ExportConfig, fileName = "grid-export.xlsx") => {
  try {
    const grouped = !!config.groupRoots && config.groupRoots.length > 0;
    const mode: GroupDisplayType = config.groupDisplayType ?? "singleColumn";
    const groupMode = config.groupMode ?? "tree";

    // `resolveColumns` already applies any `columnIds` filter (used to honor a cell range's column
    // span in a grouped export — the exportRenderer maps the range to the covered columns' ids).
    let columns = resolveColumns(config);
    // In singleColumn mode the group heading lives in a dedicated column the grid hides from the
    // exportable set — prepend it so the export mirrors the on-screen layout.
    const hasGroupColumn = grouped && mode === "singleColumn" && !!config.autoGroupColumn;
    if (hasGroupColumn) {
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
    const dataStartRow = headerOffset + 1; // 1-based sheet row of the first body row
    let rowMeta: RowMeta[] | undefined;
    let footerRows: any[]; // leaf rows the grand-total footer aggregates over

    // A tree export emits group-header + subtotal rows and needs SUBTOTAL in the grand total (to skip
    // the nested subtotals); a flat leaf export has neither, so its grand total uses plain functions.
    const treeExport = grouped && groupMode === "tree";

    if (grouped && groupMode === "leaves") {
      const body = buildFlatLeafBody(config.groupRoots!, columns, bodyStyles, mode, hasGroupColumn);
      sheetRows.push(...body.rows);
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
      );
      sheetRows.push(...body.rows);
      rowMeta.push(...body.rowMeta);
      footerRows = body.leafRows;
    } else {
      rows.forEach(row => {
        sheetRows.push(columns.map((col, colIdx) => ({
          value: toCellValue(getValueBundle(row, col), col),
          style: bodyStyles[colIdx],
        })));
      });
      footerRows = rows;
    }

    // Grand-total footer (SUBTOTAL for a tree export so it ignores per-group subtotal rows; plain
    // functions otherwise). At this point sheetRows holds header + body, so its length is the
    // 1-based row of the last body row.
    const dataEndRow = sheetRows.length;
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
