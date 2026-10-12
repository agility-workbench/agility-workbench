import { IRowNode } from "../../interfaces/iRowNode";
import { Column } from "../../column/column";
import { IRowModel } from "../../interfaces/iRowModel";
import { groupCellValue } from "../../core/groupCellValue";

/** Escape a single TSV field: quote it when it contains tab, newline or quote characters. */
export function escapeTSV(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes("\t") || s.includes("\n") || s.includes("\r") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** The label a group row copies with: the grid passes `GridCore.getGroupRowLabel`. */
export type GroupLabelResolver = (node: IRowNode) => string;

/**
 * Serialize a rectangular block of the grid (given columns × row nodes) to TSV. Accepts any row
 * nodes — body rows and pinned band rows serialize identically. `groupLabel` writes a group row's
 * label cell; it is a parameter rather than a default so a copy can never drift from the screen's
 * count policy (`groupChildCount`) by forgetting it.
 */
export function serializeNodesToTSV(
  cols: Column[],
  nodes: IRowNode[],
  includeHeaders: boolean,
  groupLabel: GroupLabelResolver,
): string {
  const lines: string[] = [];
  if (includeHeaders) {
    lines.push(cols.map(c => escapeTSV(c.label ?? c.key ?? "")).join("\t"));
  }
  for (const node of nodes) {
    const cells = cols.map(col => escapeTSV(cellText(col, node, groupLabel)));
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

// One cell's copy text. Group rows (pivot rows, groupRowsSelectable copies) have no underlying
// data row; they follow the group cell convention the cell renderer paints and the exporter writes.
function cellText(col: Column, node: IRowNode, groupLabel: GroupLabelResolver): string {
  if (node.isGroup) return groupCellValue(col, node, groupLabel).formatted;
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
  groupLabel: GroupLabelResolver,
): string {
  const nodes = viewIdxs
    .map(viewIdx => rowModel.getRowNodeAtViewIndex(viewIdx))
    .filter((node): node is NonNullable<typeof node> => node != null);
  return serializeNodesToTSV(cols, nodes, includeHeaders, groupLabel);
}

/**
 * Parse a TSV/plain-text clipboard payload into a 2D grid of strings (rows × fields). Handles
 * quoted fields ("...") whose content may contain tabs, newlines and escaped quotes (""), and
 * treats CRLF / CR / LF all as row separators. Rows may be ragged (different field counts).
 *
 * A trailing newline does not produce an extra empty row; an empty input yields [].
 */
export function parseTSV(text: string): string[][] {
  if (!text) return [];

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
    } else if (ch === "\t") {
      endField();
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
