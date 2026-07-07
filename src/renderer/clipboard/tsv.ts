import { Column } from "../../column/column";
import { IRowModel } from "../../interfaces/iRowModel";

/** Escape a single TSV field: quote it when it contains tab, newline or quote characters. */
export function escapeTSV(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes("\t") || s.includes("\n") || s.includes("\r") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize a rectangular block of the grid (given columns × view-index rows) to TSV.
 * Rows that aren't currently loaded (server-side sparse data) are skipped.
 */
export function serializeRowsToTSV(
  rowModel: IRowModel,
  cols: Column[],
  viewIdxs: number[],
  includeHeaders: boolean,
): string {
  const lines: string[] = [];
  if (includeHeaders) {
    lines.push(cols.map(c => escapeTSV(c.label ?? c.key ?? "")).join("\t"));
  }
  for (const viewIdx of viewIdxs) {
    const node = rowModel.getRowNodeAtViewIndex(viewIdx);
    if (!node) continue;
    const cells = cols.map(col => escapeTSV(col.formatValue(col.getValue(node), node)));
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/**
 * Parse the first cell out of a TSV/plain-text clipboard payload — the first field of the first
 * non-empty line, unescaping a surrounding pair of quotes. Used for single-cell paste until
 * multi-cell paste lands.
 */
export function firstCellFromTSV(text: string): string {
  if (!text) return "";

  // Quoted field: consume until the closing quote, treating "" as an escaped quote. A quoted
  // field may itself contain tabs and newlines, so this must run before any tab/line splitting.
  if (text[0] === '"') {
    let out = "";
    for (let i = 1; i < text.length; i++) {
      if (text[i] === '"') {
        if (text[i + 1] === '"') { out += '"'; i++; continue; }
        break; // closing quote
      }
      out += text[i];
    }
    return out;
  }

  // Unquoted: the first field ends at the first tab or line break.
  const end = text.search(/[\t\r\n]/);
  return end === -1 ? text : text.slice(0, end);
}
