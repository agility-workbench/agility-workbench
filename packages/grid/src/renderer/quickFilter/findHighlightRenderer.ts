import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { IRowNode } from "../../interfaces/iRowNode";
import { RowPoolDef } from "../types";

interface FindHighlightRendererParams {
  core: GridCore;
  rowPool: () => RowPoolDef[];
  startIndex: () => number;
  leafColumns: () => Column[];
}

export const FIND_MATCH_CLASS = "pte-find-match";
export const FIND_MATCH_ACTIVE_CLASS = "pte-find-match-active";

/**
 * Paints the quick filter's find highlights: a tint on every cell the search text occurs in, and a
 * stronger emphasis on the one match navigation last landed on.
 *
 * Holds no state — it asks the core per cell on the render hot path, exactly like the selection
 * renderer, so a scroll, a repaint and a find-state change all paint from the same source of truth
 * and there is no per-cell bookkeeping to keep in sync with the row pool.
 *
 * Whole-cell tint rather than marking the matched run inside the text: a cell may be drawn by an
 * app-supplied cellRenderer whose DOM the grid must not rewrite, and the tint reads the same
 * whoever drew the cell.
 */
export class FindHighlightRenderer {
  constructor(private params: FindHighlightRendererParams) {}

  // ---------------- Hot path: per-row painting ----------------
  applyToSlot(slot: RowPoolDef, viewIndex: number | null): void {
    const core = this.params.core;
    const node = viewIndex == null ? null : core.getRowModel().getRowNodeAtViewIndex(viewIndex);
    const leaves = this.params.leafColumns();
    const paint = (cells: HTMLDivElement[] | undefined) => {
      if (!cells) return;
      for (const cell of cells) {
        // Covered by a colSpan neighbour: nothing is drawn here, so it carries no highlight — and
        // is cleared rather than skipped, so it cannot resurface with a stale one when the span
        // goes away.
        if (cell.style.display === "none") {
          this.clearCell(cell);
          continue;
        }
        const colIdx = Number(cell.dataset.colIdx);
        this.applyToCell(cell, node ?? null, Number.isFinite(colIdx) ? leaves[colIdx] : undefined);
      }
    };
    paint(slot.leadingCellEls);
    paint(slot.leftCellEls);
    paint(slot.cellEls);
    paint(slot.rightCellEls);
    // A full-width row has no per-column cell to highlight (its content is app-drawn or a group
    // label), so it never carries a find class — but it must not keep one from a previous row.
    this.clearCell(slot.fullWidthCellEl);
  }

  /**
   * Paint one cell. Public so the pinned/sticky bands can highlight from inside their own paint
   * loops — a mirrored row is the same data row, and a match the user can see must look matched
   * wherever it is drawn.
   */
  applyToCell(cell: HTMLElement, node: IRowNode | null, col: Column | undefined): void {
    if (!node || !col) {
      this.clearCell(cell);
      return;
    }
    const match = this.params.core.isFindMatch(node, col);
    const active = match && this.params.core.isActiveFindMatch(node.id, col.instanceID);
    const cls = cell.classList;
    if (!match && !cls.contains(FIND_MATCH_CLASS)) return;
    cls.toggle(FIND_MATCH_CLASS, match);
    cls.toggle(FIND_MATCH_ACTIVE_CLASS, active);
  }

  private clearCell(cell: HTMLElement): void {
    const cls = cell.classList;
    if (!cls.contains(FIND_MATCH_CLASS)) return;
    cls.remove(FIND_MATCH_CLASS);
    cls.remove(FIND_MATCH_ACTIVE_CLASS);
  }

  /** Repaint every rendered body row — the response to a find-state change. */
  refresh(): void {
    const rowPool = this.params.rowPool();
    const total = this.params.core.getRowModel().getViewCount();
    const startIndex = this.params.startIndex();
    for (let i = 0; i < rowPool.length; i++) {
      const viewIndex = startIndex + i;
      this.applyToSlot(rowPool[i], viewIndex >= total ? null : viewIndex);
    }
  }
}
