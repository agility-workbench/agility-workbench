import { Column } from "../../column/column";
import { IGridCore } from "../../interfaces/iGridCore";
import { CellRef } from "../../interfaces/selection";
import { parseTSV, serializeRowsToTSV } from "./tsv";

interface ClipboardRendererParams {
  core: IGridCore;
  // Clipboard IO seams — default to the platform clipboard, overridable for tests / headless.
  writeText?: (text: string) => Promise<void>;
  readText?: () => Promise<string>;
}

// The rectangular block resolved from the current selection, in the terms the TSV serializer wants.
interface SelectionBlock {
  cols: Column[];
  viewIdxs: number[];
}

/**
 * Owns clipboard interaction (Ctrl+C / Ctrl+X / Ctrl+V). Holds no state — it reads the core's
 * current selection, serializes to TSV for copy/cut, and routes paste/cut-clear through the core's
 * cellsCommit action so each cell's column valueParser runs and the grid repaints once per action.
 *
 * Paste positions the clipboard block from a top-left anchor (the selection's top-left, or the
 * active cell) and spills down/right. A 1×1 clipboard fills the whole selected range. Non-editable
 * target cells are skipped but still consume their grid slot so alignment is preserved. Cells that
 * would fall outside the grid are clipped (no rows/columns are created).
 */
export class ClipboardRenderer {
  constructor(private params: ClipboardRendererParams) { }

  copy(): void {
    const block = this.resolveSelectionBlock();
    if (!block) return;
    const tsv = serializeRowsToTSV(this.params.core.getRowModel(), block.cols, block.viewIdxs, false);
    void this.write(tsv);
  }

  cut(): void {
    const block = this.resolveSelectionBlock();
    if (!block) return;
    const tsv = serializeRowsToTSV(this.params.core.getRowModel(), block.cols, block.viewIdxs, false);
    void this.write(tsv);

    // Clear only the editable cells in the block; leave locked cells untouched. Committing "" runs
    // the column's valueParser (so e.g. numeric columns decide what an empty value becomes). One
    // cellsCommit → one repaint for the whole block.
    const core = this.params.core;
    const edits: { cell: CellRef; value: unknown }[] = [];
    for (const viewIdx of block.viewIdxs) {
      const rowId = core.getRowIdAtViewIndex(viewIdx);
      if (!rowId) continue;
      const row = core.getRowModel().getRowNode(rowId);
      for (const col of block.cols) {
        if (!col.isCellEditable(row)) continue;
        edits.push({ cell: { rowId, colId: col.instanceID }, value: "" });
      }
    }
    if (edits.length) core.dispatch({ type: "cellsCommit", edits, reason: "cut" });
  }

  async paste(): Promise<void> {
    const anchor = this.pasteAnchor();
    if (!anchor) return;

    let text: string;
    try {
      text = await this.read();
    } catch (err) {
      console.error("Failed to read from clipboard", err);
      return;
    }

    const grid = parseTSV(text);
    if (grid.length === 0) return;

    const core = this.params.core;
    const leaves = core.getColumnModel().getLeaves();
    const rowModel = core.getRowModel();
    const viewCount = rowModel.getViewCount();

    // A 1×1 clipboard fills the whole selected range; otherwise spill the block from the anchor.
    const single = grid.length === 1 && grid[0].length === 1;
    const targetRows = single ? anchor.rowSpan : grid.length;
    const targetCols = single ? anchor.colSpan : grid[0].length;

    const edits: { cell: CellRef; value: unknown }[] = [];
    let clipped = 0;

    for (let r = 0; r < targetRows; r++) {
      const viewIdx = anchor.rowStart + r;
      if (viewIdx >= viewCount) { clipped += targetCols; continue; }
      const rowId = core.getRowIdAtViewIndex(viewIdx);
      if (!rowId) { clipped += targetCols; continue; }
      const row = rowModel.getRowNode(rowId);
      // Ragged rows: fall back to an empty string for missing source fields.
      const srcRow = single ? grid[0] : (grid[r] ?? []);

      for (let c = 0; c < targetCols; c++) {
        const colIdx = anchor.colStart + c;
        const col = leaves[colIdx];
        if (!col || col.isInternal() || col.hidden) { clipped++; continue; }
        // Skip non-editable targets but keep their positional slot (already advanced by c).
        if (!col.isCellEditable(row)) continue;
        const value = single ? srcRow[0] : (srcRow[c] ?? "");
        edits.push({ cell: { rowId, colId: col.instanceID }, value });
      }
    }

    if (clipped > 0) {
      console.warn(`Paste clipped ${clipped} cell(s) that fell outside the grid.`);
    }
    if (edits.length === 0) return;

    core.dispatch({ type: "cellsCommit", edits, reason: "paste" });

    // Select the pasted rectangle so the result is visible and re-copyable.
    const rowEnd = Math.min(anchor.rowStart + targetRows - 1, viewCount - 1);
    const colEnd = Math.min(anchor.colStart + targetCols - 1, leaves.length - 1);
    core.dispatch({ type: "rangeSelectSet", viewIdx: anchor.rowStart, colIdx: anchor.colStart, mode: "start" });
    if (rowEnd > anchor.rowStart || colEnd > anchor.colStart) {
      core.dispatch({ type: "rangeSelectSet", viewIdx: rowEnd, colIdx: colEnd, mode: "extend" });
    }
  }

  // ---------------- Selection → block resolution ----------------
  private resolveSelectionBlock(): SelectionBlock | null {
    const core = this.params.core;
    const leaves = core.getColumnModel().getLeaves();
    const visibleLeaves = leaves.filter(c => !c.isInternal() && !c.hidden);
    const rowModel = core.getRowModel();

    const range = core.getSelectionRange();
    if (range) {
      const cols = visibleLeaves.filter(c => {
        const globalIdx = leaves.indexOf(c);
        return globalIdx >= range.colStart && globalIdx <= range.colEnd;
      });
      const viewIdxs = rangeToViewIdxs(range.rowStart, range.rowEnd);
      return cols.length ? { cols, viewIdxs } : null;
    }

    const selectedRowIds = core.getSelectedRowIds();
    if (selectedRowIds.size > 0) {
      const viewIdxs: number[] = [];
      for (let i = 0; i < rowModel.getViewCount(); i++) {
        const id = core.getRowIdAtViewIndex(i);
        if (id && selectedRowIds.has(id)) viewIdxs.push(i);
      }
      return viewIdxs.length ? { cols: visibleLeaves, viewIdxs } : null;
    }

    const selectedColIds = core.getSelectedColumnIds();
    if (selectedColIds.size > 0) {
      const cols = visibleLeaves.filter(c => selectedColIds.has(c.instanceID));
      const viewIdxs = rangeToViewIdxs(0, rowModel.getViewCount() - 1);
      return cols.length ? { cols, viewIdxs } : null;
    }

    return null;
  }

  // The top-left cell paste starts from, plus the selected span (used to fill a 1×1 clipboard).
  // rowStart is a view index; colStart is a global leaf-column index.
  private pasteAnchor(): { rowStart: number; colStart: number; rowSpan: number; colSpan: number } | null {
    const core = this.params.core;
    const range = core.getSelectionRange();
    if (range) {
      return {
        rowStart: Math.min(range.rowStart, range.rowEnd),
        colStart: Math.min(range.colStart, range.colEnd),
        rowSpan: Math.abs(range.rowEnd - range.rowStart) + 1,
        colSpan: Math.abs(range.colEnd - range.colStart) + 1,
      };
    }
    const active = core.getActiveCell();
    if (!active) return null;
    return { rowStart: active.row, colStart: active.colIdx, rowSpan: 1, colSpan: 1 };
  }

  // ---------------- Clipboard IO ----------------
  private async write(text: string): Promise<void> {
    if (!text) return;
    if (this.params.writeText) return this.params.writeText(text);

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (err) {
        console.error("Failed to write to clipboard", err);
      }
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (err) { console.error("Failed to copy to clipboard", err); }
    document.body.removeChild(ta);
  }

  private read(): Promise<string> {
    if (this.params.readText) return this.params.readText();
    if (navigator?.clipboard?.readText) return navigator.clipboard.readText();
    return Promise.reject(new Error("Clipboard read not supported"));
  }
}

function rangeToViewIdxs(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}
