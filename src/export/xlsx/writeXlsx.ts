/**
 * Hand-rolled .xlsx workbook assembler.
 *
 * Takes an abstract sheet model (values + styles + layout) and produces the OOXML parts, then zips
 * them into a valid .xlsx byte array. This module knows nothing about the grid — the grid → sheet
 * mapping lives in the exporter. That keeps this a small, testable OOXML emitter.
 */
import { createZip, ZipEntry } from "./zip";
import { cellRef, dateToSerial, escapeXml } from "./xml";
import { CellStyle, StyleRegistry } from "./styleRegistry";

export type CellValue =
  | { kind: "empty" }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "date"; value: Date }
  /**
   * A formula cell. `formula` is the Excel expression WITHOUT the leading "=" (e.g. "SUM(B2:B10)").
   * `cached` is the precomputed result Excel shows until it recalculates — supply the grid's own
   * computed value so the file reads correctly even before a recalc.
   */
  | { kind: "formula"; formula: string; cached?: number | string; cachedIsText?: boolean };

export interface SheetCell {
  value: CellValue;
  style?: CellStyle;
}

export interface MergeRange {
  /** 1-based inclusive bounds. */
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

export interface FrozenPane {
  /** Number of leading columns to freeze. */
  xSplit?: number;
  /** Number of leading rows to freeze. */
  ySplit?: number;
}

export interface ColumnDef {
  /** Excel column width (in character units). */
  width?: number;
}

export interface SheetModel {
  name: string;
  /** Row-major grid of cells; ragged rows are allowed (missing trailing cells are empty). */
  rows: SheetCell[][];
  columns?: ColumnDef[];
  merges?: MergeRange[];
  frozen?: FrozenPane;
}

export interface WorkbookModel {
  sheets: SheetModel[];
}

const CONTENT_TYPES = (sheetCount: number): string => {
  const overrides = Array.from({ length: sheetCount }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    overrides +
    `</Types>`
  );
};

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

function workbookXml(sheets: SheetModel[]): string {
  const sheetEls = sheets
    .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheetEls}</sheets>` +
    `</workbook>`
  );
}

function workbookRels(sheets: SheetModel[]): string {
  const rels = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("");
  const stylesId = sheets.length + 1;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    rels +
    `<Relationship Id="rId${stylesId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`
  );
}

function cellXml(cell: SheetCell, ref: string, styleId: number): string {
  const s = styleId !== 0 ? ` s="${styleId}"` : "";
  const v = cell.value;
  switch (v.kind) {
    case "empty":
      return styleId !== 0 ? `<c r="${ref}"${s}/>` : "";
    case "string":
      // Inline string (t="inlineStr") avoids a separate sharedStrings part.
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v.value)}</t></is></c>`;
    case "number":
      return `<c r="${ref}"${s}><v>${numberToXml(v.value)}</v></c>`;
    case "boolean":
      return `<c r="${ref}"${s} t="b"><v>${v.value ? 1 : 0}</v></c>`;
    case "date":
      return `<c r="${ref}"${s}><v>${numberToXml(dateToSerial(v.value))}</v></c>`;
    case "formula": {
      const f = `<f>${escapeXml(v.formula)}</f>`;
      if (v.cached == null) return `<c r="${ref}"${s}>${f}</c>`;
      if (v.cachedIsText) {
        return `<c r="${ref}"${s} t="str">${f}<v>${escapeXml(String(v.cached))}</v></c>`;
      }
      return `<c r="${ref}"${s}>${f}<v>${numberToXml(Number(v.cached))}</v></c>`;
    }
  }
}

function numberToXml(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(n);
}

function worksheetXml(sheet: SheetModel, styles: StyleRegistry): string {
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
  parts.push(
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
  );

  // Child element order matters per the CT_Worksheet schema: sheetViews -> cols -> sheetData ->
  // mergeCells. Emit them in that order.
  parts.push(frozenPaneXml(sheet.frozen));

  // <cols> for widths.
  if (sheet.columns && sheet.columns.some(c => c.width != null)) {
    const colEls = sheet.columns
      .map((c, i) =>
        c.width != null
          ? `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`
          : "",
      )
      .filter(Boolean)
      .join("");
    parts.push(`<cols>${colEls}</cols>`);
  }

  parts.push(`<sheetData>`);
  sheet.rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 1;
    const cells: string[] = [];
    row.forEach((cell, cIdx) => {
      const styleId = cell.style ? styles.getStyleId(cell.style) : 0;
      const xml = cellXml(cell, cellRef(cIdx + 1, rowNum), styleId);
      if (xml) cells.push(xml);
    });
    parts.push(`<row r="${rowNum}">${cells.join("")}</row>`);
  });
  parts.push(`</sheetData>`);

  // Merged cells.
  if (sheet.merges && sheet.merges.length) {
    const mergeEls = sheet.merges
      .map(
        m =>
          `<mergeCell ref="${cellRef(m.fromCol, m.fromRow)}:${cellRef(m.toCol, m.toRow)}"/>`,
      )
      .join("");
    parts.push(`<mergeCells count="${sheet.merges.length}">${mergeEls}</mergeCells>`);
  }

  parts.push(`</worksheet>`);
  return parts.join("");
}

function frozenPaneXml(frozen: FrozenPane | undefined): string {
  if (!frozen || (!frozen.xSplit && !frozen.ySplit)) return "";
  const x = frozen.xSplit ?? 0;
  const y = frozen.ySplit ?? 0;
  const topLeft = cellRef(x + 1, y + 1);
  const activePane = x && y ? "bottomRight" : x ? "topRight" : "bottomLeft";
  return (
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane xSplit="${x || 0}" ySplit="${y || 0}" topLeftCell="${topLeft}" activePane="${activePane}" state="frozen"/>` +
    `</sheetView></sheetViews>`
  );
}

/** Assemble a workbook model into .xlsx bytes. */
export async function writeXlsx(workbook: WorkbookModel): Promise<Uint8Array> {
  // One shared style table across all sheets, per OOXML.
  const styles = new StyleRegistry();

  const worksheetParts: ZipEntry[] = workbook.sheets.map((sheet, i) => ({
    path: `xl/worksheets/sheet${i + 1}.xml`,
    data: worksheetXml(sheet, styles),
  }));

  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", data: CONTENT_TYPES(workbook.sheets.length) },
    { path: "_rels/.rels", data: ROOT_RELS },
    { path: "xl/workbook.xml", data: workbookXml(workbook.sheets) },
    { path: "xl/_rels/workbook.xml.rels", data: workbookRels(workbook.sheets) },
    ...worksheetParts,
    // styles.xml is emitted last so every getStyleId() call from worksheet building is captured.
    { path: "xl/styles.xml", data: styles.toXml() },
  ];

  return createZip(entries);
}
