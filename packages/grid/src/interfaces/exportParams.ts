/**
 * Export parameters shared by the CSV and Excel exporters (`api.exportDataAsCsv`,
 * `api.exportDataAsExcel`, `api.getDataAsCsv`, `api.getDataAsExcel`). Kept apart from the API
 * interface so the exporters' option surface can grow without touching it.
 */
import type { Column } from "../column/column";

export type ExportScope = "all" | "selection" | "selectedColumns";

/** The data-row segment currently being written to an Excel workbook. */
export type ExcelExportRowType = "body" | "pinnedTop" | "pinnedBottom";

/**
 * The intentionally small set of Excel cell styles supported by the built-in OOXML writer.
 * Colors, fills, borders, and arbitrary browser CSS are outside this contract.
 */
export interface ExcelExportCellStyle {
  /** Excel number-format code (for example `0.00%` or `yyyy-mm-dd`). */
  numFmt?: string;
  bold?: boolean;
  alignment?: {
    horizontal?: "left" | "center" | "right";
    vertical?: "top" | "middle" | "bottom";
    wrapText?: boolean;
  };
}

/** Context supplied for each real data cell written to an Excel workbook. `TData` is the row
 * type (default `any`). */
export interface ExcelExportCellParams<TData = any> {
  /** Raw value resolved from the column before export customization. */
  value: unknown;
  /** Value after the column's value formatter, before export customization. */
  formattedValue: string;
  /** The row's data object. */
  data: TData;
  /** Zero-based index within the row segment identified by `rowType`. */
  rowIndex: number;
  rowType: ExcelExportRowType;
  column: Column;
}

/** A cell override returned by {@link ExportParams.processCellForExcel}. */
export interface ExcelExportCellResult {
  /** Replacement exported value. Omit to keep the grid-resolved value; `null` clears the cell. */
  value?: unknown;
  /** Style properties merge over the grid's default number format for this column. */
  style?: ExcelExportCellStyle;
}

export type ExcelExportCellProcessor<TData = any> = (
  params: ExcelExportCellParams<TData>,
) => ExcelExportCellResult | undefined;

/** The data-row segment currently being written to a CSV file (the same segments as Excel). */
export type CsvExportRowType = ExcelExportRowType;

/**
 * Context supplied for each real data cell written to a CSV file: the same shape the Excel
 * processor receives, so one helper can serve both formats.
 */
export type CsvExportCellParams<TData = any> = ExcelExportCellParams<TData>;

/**
 * Replaces a CSV data cell's text. Return the text to write, or `undefined` to keep the grid's
 * formatted text. See {@link ExportParams.processCellForCsv}.
 */
export type CsvExportCellProcessor<TData = any> = (params: CsvExportCellParams<TData>) => string | undefined;

/** Context supplied for each header label written to a CSV file. */
export interface CsvExportHeaderParams {
  /** The column the label belongs to: a leaf column, or a column group on a group header row. */
  column: Column;
  /** The label the grid would write (the column's `label`, else its `key`). */
  label: string;
}

/**
 * Replaces a CSV header label. Return the text to write, or `undefined` to keep the grid's label.
 * See {@link ExportParams.processHeaderForCsv}.
 */
export type CsvExportHeaderProcessor = (params: CsvExportHeaderParams) => string | undefined;

/**
 * Free-form CSV lines written before or after the grid's rows. A string is written verbatim as its
 * own line(s); a 2-D array is written as CSV rows (one inner array per row) with the export's
 * separator, quoting and formula guard. See {@link ExportParams.prependContent}.
 */
export type CsvExtraContent = string | string[][];

/** Options for a programmatic CSV/Excel export (all optional). */
export interface ExportParams<TData = any> {
  /** "all" (default) exports the full view; "selection" a cell range; "selectedColumns" the picked columns. */
  scope?: ExportScope;
  /** Output filename. Auto-derived (e.g. "grid-all.xlsx") when omitted; the extension is enforced. */
  fileName?: string;
  /** Restrict the export to these column instanceIDs / colIds / keys. */
  columnIds?: string[];
  /** Include the (hierarchical) header rows. Defaults to true. */
  includeHeaders?: boolean;
  /** For a row-grouped grid: "tree" (group headers + subtotals, default) or "leaves" (flat rows). */
  groupMode?: "tree" | "leaves";
  /**
   * Customize real data cells in Excel exports without changing grid data. Supports replacement
   * values plus number format, bold, and alignment. Applies to body and pinned rows; synthetic
   * group headers/subtotals and CSV output are unchanged.
   */
  processCellForExcel?: ExcelExportCellProcessor<TData>;
  /**
   * CSV only (Excel ignores it). The text placed between fields. Defaults to `","`; `"\t"` (tab
   * separated values) and `";"` (what Excel expects in locales whose decimal mark is a comma) are
   * the usual alternatives. A field that contains the separator is quoted, as a comma is by
   * default. An empty string falls back to `","`.
   */
  columnSeparator?: string;
  /**
   * CSV only (Excel ignores it). The text placed between rows. Defaults to `"\n"`, the grid's
   * historical output; RFC 4180 specifies `"\r\n"`, which some strict consumers require. Line
   * breaks inside a quoted field are written as they are in the data.
   */
  lineEnding?: "\n" | "\r\n";
  /**
   * CSV only (Excel ignores it). Start the file with a UTF-8 byte order mark (`U+FEFF`). Excel
   * reads a CSV without one in the system's legacy code page, which garbles non-ASCII text; with
   * it, Excel reads UTF-8. Defaults to `false`. `getDataAsCsv` returns the same text the download
   * holds, mark included.
   */
  includeBom?: boolean;
  /**
   * CSV only (Excel ignores it). Write fields without quoting, even when they contain the
   * separator, a quote or a line break; the caller then guarantees no field does. Defaults to
   * `false`. The formula guard still applies.
   */
  suppressQuotes?: boolean;
  /**
   * CSV only (Excel uses {@link processCellForExcel}). Replace a data cell's text without changing
   * grid data: return the text to write, or `undefined` to keep the grid's formatted text. Called
   * for body and pinned rows (`rowType` says which); header rows go to
   * {@link processHeaderForCsv}, and the prepended/appended content is written as given. The
   * result is quoted as needed and formula-guarded (a leading `=`, `+`, `-`, `@`, tab or CR gets a
   * `'` prefix) unless it is a plain number such as `-5` or `1.5e3`.
   */
  processCellForCsv?: CsvExportCellProcessor<TData>;
  /**
   * CSV only (Excel ignores it). Replace a header label: return the text to write, or `undefined`
   * to keep the grid's label. Called for every label on every header row, so on a grouped header
   * `column` is the column group for the group row's labels. The result is quoted and
   * formula-guarded like any header label.
   */
  processHeaderForCsv?: CsvExportHeaderProcessor;
  /**
   * CSV only (Excel ignores it). Content written before the header. A string is written verbatim
   * (no quoting, formula guard or line-ending conversion) as its own line(s); a 2-D array is
   * written as CSV rows with the export's separator, quoting and formula guard. The line ending
   * separates it from the grid's rows.
   */
  prependContent?: CsvExtraContent;
  /**
   * CSV only (Excel ignores it). Content written after the last row, in the same forms as
   * {@link prependContent}.
   */
  appendContent?: CsvExtraContent;
}

/**
 * Live-reconfiguration hooks provided by the renderer once it is attached (it owns the toolbar,
 * quick filter, tooltip layer, column panel, footer, pinned bands, and theme variables). Internal
 * wiring for {@link IGridAPI.updateGridOptions}: hosts call `updateGridOptions`, not this.
 */
