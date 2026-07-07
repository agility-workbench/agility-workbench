import { Column } from "../../column/column";
import { IGridCore } from "../../interfaces/iGridCore";
import { CellRef } from "../../interfaces/selection";
import { firstCellFromTSV, serializeRowsToTSV } from "./tsv";

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
 * current selection, serializes to TSV for copy/cut, and routes paste/cut-clear through the same
 * editCommit action as inline editing so the column's valueParser runs and cells repaint.
 *
 * Multi-cell paste is not implemented yet: paste writes the first clipboard cell into the active
 * cell only.
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
    // the column's valueParser (so e.g. numeric columns decide what an empty value becomes).
    const core = this.params.core;
    for (const viewIdx of block.viewIdxs) {
      const rowId = core.getRowIdAtViewIndex(viewIdx);
      if (!rowId) continue;
      const row = core.getRowModel().getRowNode(rowId);
      for (const col of block.cols) {
        if (!col.isCellEditable(row)) continue;
        core.dispatch({ type: "editCommit", cell: { rowId, colId: col.instanceID }, value: "" });
      }
    }
  }

  async paste(): Promise<void> {
    const cell = this.activeCellRef();
    if (!cell) return;
    const col = this.params.core.getColumnModel().getById(cell.colId);
    const row = this.params.core.getRowModel().getRowNode(cell.rowId);
    if (!col || !col.isCellEditable(row)) return;

    let text: string;
    try {
      text = await this.read();
    } catch (err) {
      console.error("Failed to read from clipboard", err);
      return;
    }
    // TODO(multi-cell paste): fan the full TSV grid out across cells starting at the active cell.
    const value = firstCellFromTSV(text);
    this.params.core.dispatch({ type: "editCommit", cell, value });
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

  private activeCellRef(): CellRef | null {
    const core = this.params.core;
    const active = core.getActiveCell();
    if (!active) return null;
    const rowId = core.getRowIdAtViewIndex(active.row);
    const col = core.getColumnModel().getLeaves()[active.colIdx];
    if (!rowId || !col) return null;
    return { rowId, colId: col.instanceID };
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
