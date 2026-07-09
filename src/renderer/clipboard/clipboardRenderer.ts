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
 * active cell). When the selection span is an exact multiple of the source block in both
 * dimensions, the block tiles (repeats) to fill the selection — so a 1×1 block fills the whole
 * range and a 1×2 block repeats down a 3×2 selection; otherwise the block spills once from the
 * anchor. Non-editable target cells are skipped but still consume their grid slot so alignment is
 * preserved. Cells that would fall outside the grid are clipped (no rows/columns are created).
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

    // Clear the copied cells (cut = copy + clear).
    const edits = this.buildClearEdits(block);
    if (edits.length) this.params.core.dispatch({ type: "cellsCommit", edits, reason: "cut" });
  }

  /**
   * Clear the editable cells of the current selection (Delete/Backspace). Like cut without the
   * copy: one cellsCommit → one undoable step, one repaint. No-op when nothing editable is selected.
   */
  clearContents(): void {
    const block = this.resolveSelectionBlock();
    if (!block) return;
    const edits = this.buildClearEdits(block);
    if (edits.length) this.params.core.dispatch({ type: "cellsCommit", edits, reason: "clear" });
  }

  // Build the "" commit for every editable cell in the block; locked cells are left untouched.
  // Committing "" runs the column's valueParser (so e.g. numeric columns decide the empty result).
  private buildClearEdits(block: SelectionBlock): { cell: CellRef; value: unknown }[] {
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
    return edits;
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

    const blockRows = grid.length;
    const blockCols = grid[0].length;

    // Tile when the selection span is an exact multiple of the source block in BOTH dimensions
    // (and at least as large) — e.g. a 1×2 block into a 3×2 selection repeats 3× down; a 1×1
    // block into any selection fills it. Otherwise spill the block once from the anchor.
    const tile =
      anchor.rowSpan >= blockRows && anchor.rowSpan % blockRows === 0 &&
      anchor.colSpan >= blockCols && anchor.colSpan % blockCols === 0;
    const targetRows = tile ? anchor.rowSpan : blockRows;
    const targetCols = tile ? anchor.colSpan : blockCols;

    const edits: { cell: CellRef; value: unknown }[] = [];
    let clipped = 0;

    for (let r = 0; r < targetRows; r++) {
      const viewIdx = anchor.rowStart + r;
      if (viewIdx >= viewCount) { clipped += targetCols; continue; }
      const rowId = core.getRowIdAtViewIndex(viewIdx);
      if (!rowId) { clipped += targetCols; continue; }
      const row = rowModel.getRowNode(rowId);
      // Source row wraps for tiling; ragged rows fall back to "" for missing fields.
      const srcRow = grid[r % blockRows] ?? [];

      for (let c = 0; c < targetCols; c++) {
        const colIdx = anchor.colStart + c;
        const col = leaves[colIdx];
        if (!col || col.isInternal() || col.hidden) { clipped++; continue; }
        // Skip non-editable targets but keep their positional slot (already advanced by c).
        if (!col.isCellEditable(row)) continue;
        const value = srcRow[c % blockCols] ?? "";
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
      const viewIdxs = this.filterCopyableRows(rangeToViewIdxs(range.rowStart, range.rowEnd));
      return cols.length && viewIdxs.length ? { cols, viewIdxs } : null;
    }

    const selectedRowIds = core.getSelectedRowIds();
    if (selectedRowIds.size > 0) {
      const viewIdxs: number[] = [];
      for (let i = 0; i < rowModel.getViewCount(); i++) {
        const id = core.getRowIdAtViewIndex(i);
        if (id && selectedRowIds.has(id)) viewIdxs.push(i);
      }
      const copyable = this.filterCopyableRows(viewIdxs);
      return copyable.length ? { cols: visibleLeaves, viewIdxs: copyable } : null;
    }

    const selectedColIds = core.getSelectedColumnIds();
    if (selectedColIds.size > 0) {
      const cols = visibleLeaves.filter(c => selectedColIds.has(c.instanceID));
      const viewIdxs = this.filterCopyableRows(rangeToViewIdxs(0, rowModel.getViewCount() - 1));
      return cols.length && viewIdxs.length ? { cols, viewIdxs } : null;
    }

    return null;
  }

  // Drop group (summary) rows from a copy/cut set unless groupRowsSelectable is enabled. Group
  // cells hold labels/aggregate totals rather than real values, so including them in TSV output is
  // usually noise; the option lets callers opt into copying them.
  private filterCopyableRows(viewIdxs: number[]): number[] {
    if (this.params.core.getOptions().groupRowsSelectable) return viewIdxs;
    const rowModel = this.params.core.getRowModel();
    return viewIdxs.filter(i => !rowModel.getRowNodeAtViewIndex(i)?.isGroup);
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
