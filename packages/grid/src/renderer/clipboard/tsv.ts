import { IRowNode } from "../../interfaces/iRowNode";
import { Column } from "../../column/column";
import { IRowModel } from "../../interfaces/iRowModel";
import type { GroupCellValue } from "../../core/groupCellValue";
import { readsGroupCellValue } from "../../core/groupCellValue";

/**
 * Escape a single field: quote it when it contains the delimiter (a tab by default), a newline or
 * a quote character.
 */
export function escapeTSV(value: unknown, delimiter = "\t"): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(delimiter) || s.includes("\n") || s.includes("\r") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** What a group row's cell copies as: the grid passes `GridCore.getGroupCellValue`. */
export type GroupCellValueResolver = (col: Column, node: IRowNode) => GroupCellValue;

/**
 * How a copy is written: the field separator and the per-cell / per-header transforms
 * (`GridOptions.clipboard`). Each transform sees the text the grid would copy and returns what to
 * write instead; its result is then stringified and quoted like any other field.
 */
export interface SerializeFormat {
  /** Field separator. Defaults to a tab. */
  delimiter?: string;
  processCell?: (col: Column, node: IRowNode, text: string) => unknown;
  processHeader?: (col: Column, text: string) => unknown;
}

/**
 * Serialize a rectangular block of the grid (given columns × row nodes) to TSV. Accepts any row
 * nodes — body rows and pinned band rows serialize identically. `groupValue` writes a group row's
 * cells; it is a parameter rather than a default so a copy can never drift from the core's group
 * cell value rule (the count policy, `groupValueGetter`) by forgetting it.
 */
export function serializeNodesToTSV(
  cols: Column[],
  nodes: IRowNode[],
  includeHeaders: boolean,
  groupValue: GroupCellValueResolver,
  format: SerializeFormat = {},
): string {
  const delimiter = format.delimiter || "\t";
  const { processCell, processHeader } = format;
  const lines: string[] = [];
  if (includeHeaders) {
    lines.push(cols.map(c => {
      const label = String(c.label ?? c.key ?? "");
      return escapeTSV(processHeader ? processHeader(c, label) : label, delimiter);
    }).join(delimiter));
  }
  for (const node of nodes) {
    const cells = cols.map(col => {
      const text = cellText(col, node, groupValue);
      return escapeTSV(processCell ? processCell(col, node, text) : text, delimiter);
    });
    lines.push(cells.join(delimiter));
  }
  return lines.join("\n");
}

// One cell's copy text. Group rows (pivot rows, groupRowsSelectable copies) have no underlying
// data row; they follow the group cell convention the cell renderer paints and the exporter writes.
function cellText(col: Column, node: IRowNode, groupValue: GroupCellValueResolver): string {
  // A tree parent's aggregated cell copies what it shows (the aggregate), like a group row's.
  if (node.isGroup || readsGroupCellValue(col, node)) return groupValue(col, node).formatted;
  return col.formatValue(col.getValue(node), node);
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
  groupValue: GroupCellValueResolver,
): string {
  const nodes = viewIdxs
    .map(viewIdx => rowModel.getRowNodeAtViewIndex(viewIdx))
    .filter((node): node is NonNullable<typeof node> => node != null);
  return serializeNodesToTSV(cols, nodes, includeHeaders, groupValue);
}

/**
 * Parse a TSV/plain-text clipboard payload into a 2D grid of strings (rows × fields). Fields split
 * on `delimiter` (a tab by default; any non-empty string, matched literally). Handles quoted
 * fields ("...") whose content may contain the delimiter, newlines and escaped quotes (""), and
 * treats CRLF / CR / LF all as row separators. Rows may be ragged (different field counts).
 *
 * A trailing newline does not produce an extra empty row; an empty input yields [].
 */
export function parseTSV(text: string, delimiter = "\t"): string[][] {
  if (!text) return [];
  if (!delimiter) delimiter = "\t";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // whether the current row has any content/fields yet

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    started = true;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter[0] && text.startsWith(delimiter, i)) {
      endField();
      i += delimiter.length - 1;
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++; // CRLF → one separator
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      field += ch;
    }
  }

  // Flush the final field/row unless the input ended exactly on a row separator.
  if (started || field !== "" || row.length > 0) {
    endField();
    rows.push(row);
  }

  return rows;
}

/**
 * Parse the first cell out of a clipboard payload — the first field of the first row.
 * Convenience wrapper over parseTSV for single-cell paste.
 */
export function firstCellFromTSV(text: string): string {
  return parseTSV(text)[0]?.[0] ?? "";
}
