import { GridCore } from "../../core/core";
import { RendererRecord } from "../renderer";
import { RowPoolDef } from "../types";
import { stampGridCellAria, stitchAriaRow } from "../aria";
import { columnRuns, sameColumns } from "./columnWindow";

interface BodyRowPoolRendererParams {
  core: GridCore;
  rowHeight: () => number;
  leadingViewport: HTMLDivElement;
  leftViewport: HTMLDivElement;
  centerViewport: HTMLDivElement;
  rightViewport: HTMLDivElement;
}

export class BodyRowPoolRenderer {
  constructor(private params: BodyRowPoolRendererParams) {}

  /**
   * Build `poolSize` slots. `centerCols` is the centre section's rendered column set (ascending
   * centre leaf indexes, see columnWindow.ts); omitted, every centre column is rendered.
   */
  build(poolSize: number, centerCols?: number[]): RowPoolDef[] {
    const { core, leadingViewport, leftViewport, centerViewport, rightViewport } = this.params;
    leadingViewport.innerHTML = "";
    leftViewport.innerHTML = "";
    centerViewport.innerHTML = "";
    rightViewport.innerHTML = "";
    const rowPool: RowPoolDef[] = [];

    for (let i = 0; i < poolSize; i++) {
      const idPrefix = `${core.id}-r${i}`;
      const row: RowPoolDef = {
        rowEl: document.createElement("div"),
        leadingCellEls: [],
        leftCellEls: [],
        cellEls: [],
        centerCols: [],
        centerGapEls: [],
        idPrefix,
        rightCellEls: [],
        fullWidthCellEl: this.createFullWidthCell(),
        descriptionEl: this.createDescription(i),
        cellRendererInstances: new Map<string, RendererRecord>(),
      };

      const leadingLeaves = core.getColumnModel().getLeadingLeaves();
      const leftLeaves = core.getColumnModel().getLeftLeaves();
      const centerLeaves = core.getColumnModel().getCenterLeaves();
      const rightLeaves = core.getColumnModel().getRightLeaves();
      if (leadingLeaves.length > 0) {
        row.leadingRowEl = this.createRow();

        for (const col of leadingLeaves) {
          if (col.hidden) continue;
          const cell = this.createCell(col.instanceID, col.isComputableType(), idPrefix);
          row.leadingRowEl.appendChild(cell);
          row.leadingCellEls?.push(cell);
        }

        leadingViewport.appendChild(row.leadingRowEl);
      }

      if (leftLeaves.length > 0) {
        row.leftRowEl = this.createRow();

        for (const col of leftLeaves) {
          if (col.hidden) continue;
          const cell = this.createCell(col.instanceID, col.isComputableType(), idPrefix);
          row.leftRowEl.appendChild(cell);
          row.leftCellEls.push(cell);
        }

        leftViewport.appendChild(row.leftRowEl);
      }

      row.rowEl = this.createRow();

      // The full-width host rides in the center row (always present even with zero center leaves).
      // Hidden by default; shown by applyFullWidthLayout for full-width rows only. Appended first
      // so the centre cells below are inserted ahead of it.
      row.rowEl.appendChild(row.fullWidthCellEl);
      // Its id is the one the positional stitching gave it before column virtualization: one past
      // the last leaf, so it can never collide with a cell's `-c${globalIndex}`.
      row.fullWidthCellEl.id = `${idPrefix}-c${core.getColumnModel().leafColumnLookup.size}`;
      this.reconcileCenter(row, centerCols ?? centerLeaves.map((_, c) => c));

      centerViewport.appendChild(row.rowEl);

      if (rightLeaves.length > 0) {
        row.rightRowEl = this.createRow();

        for (const col of rightLeaves) {
          if (col.hidden) continue;
          const cell = this.createCell(col.instanceID, col.isComputableType(), idPrefix);
          row.rightRowEl.appendChild(cell);
          row.rightCellEls.push(cell);
        }

        rightViewport.appendChild(row.rightRowEl);
      }

      // ARIA: stitch this slot's fragments into one owned row, in visual order. The pairing never
      // changes across vertical recycling; only a column-window change re-stitches (reconcileCenter).
      for (const el of [row.leadingRowEl, row.leftRowEl, row.rightRowEl]) {
        el?.setAttribute("role", "presentation");
      }
      this.stitch(row);
      rowPool.push(row);
    }

    return rowPool;
  }

  /**
   * Make the slot's centre row render exactly `cols` (ascending centre leaf indexes). Cells of
   * columns that stay are left alone — never moved, never re-rendered, so their renderer instances
   * keep their state and a focused editor inside one keeps its focus. Cells of columns that left are
   * removed and their renderer instances destroyed; cells of columns that entered are created empty
   * (sized, and hidden while the slot is in full-width layout) and returned for the caller to render.
   * Gap spacers stand in for the unrendered columns, so every rendered cell keeps its x position and
   * the row keeps its full content width.
   *
   * Assumes `slot.centerCols` indexes the CURRENT centre leaves: every structural column change
   * (show/hide/move/pin/defs) rebuilds the pool, so a live slot never holds indexes of an old layout.
   */
  reconcileCenter(slot: RowPoolDef, cols: number[]): Array<{ cell: HTMLDivElement; index: number }> {
    const leaves = this.params.core.getColumnModel().getCenterLeaves();
    const widths = leaves.map((col) => col.computedWidth);
    const entered: Array<{ cell: HTMLDivElement; index: number }> = [];
    const unchanged = sameColumns(slot.centerCols, cols);

    if (!unchanged) {
      const kept = new Set(cols);
      const byIndex = new Map<number, HTMLDivElement>();
      for (let c = 0; c < slot.centerCols.length; c++) {
        const index = slot.centerCols[c];
        const cell = slot.cellEls[c];
        if (!cell) continue;
        if (kept.has(index)) {
          byIndex.set(index, cell);
          continue;
        }
        const key = cell.dataset.colId;
        const rec = key ? slot.cellRendererInstances.get(key) : undefined;
        if (rec && key) {
          rec.runtime.destroy();
          slot.cellRendererInstances.delete(key);
        }
        cell.remove();
      }

      const fullWidth = slot.rowEl.classList.contains("pte-full-width-row");
      const cellEls: HTMLDivElement[] = [];
      for (const index of cols) {
        let cell = byIndex.get(index);
        if (!cell) {
          const col = leaves[index];
          if (!col) continue;
          cell = this.createCell(col.instanceID, col.isComputableType(), slot.idPrefix);
          cell.style.flex = "0 0 auto";
          cell.style.width = `${col.computedWidth}px`;
          if (fullWidth) cell.style.display = "none";
          entered.push({ cell, index });
        }
        cellEls.push(cell);
      }
      slot.cellEls = cellEls;
      slot.centerCols = cols.filter((index) => !!leaves[index]);
    }

    // Gaps are detached first, so the walk below only ever inserts: a retained cell is never moved
    // (moving a node that holds focus blurs it, and a blur commits an open editor).
    for (const gap of slot.centerGapEls) gap.remove();
    const runs = columnRuns(widths, slot.centerCols);
    while (slot.centerGapEls.length < runs.length) slot.centerGapEls.push(this.createGap());
    slot.centerGapEls.length = runs.length;

    const rowEl = slot.rowEl;
    let ref: ChildNode | null = rowEl.firstChild;
    const place = (node: HTMLElement) => {
      if (node === ref) ref = ref.nextSibling;
      else rowEl.insertBefore(node, ref);
    };
    runs.forEach((run, r) => {
      const gap = slot.centerGapEls[r];
      gap.style.width = `${run.gapPx}px`;
      if (run.gapPx > 0) place(gap);
      for (let c = run.from; c < run.to; c++) place(slot.cellEls[c]);
    });

    if (!unchanged) this.stitch(slot);
    return entered;
  }

  // ARIA: stitch the slot's fragments into one owned row, in visual order. Re-run whenever the
  // centre's rendered cells change; cell ids are column-derived (`-c${globalIndex}`), so a cell
  // keeps its id while it stays rendered and the root's aria-activedescendant keeps resolving.
  // The full-width host rides last: it is display:none (out of the ARIA tree) except in full-width
  // layout, where it is the row's only visible cell.
  private stitch(slot: RowPoolDef) {
    stitchAriaRow(
      slot.rowEl,
      [
        ...(slot.leadingCellEls ?? []),
        ...slot.leftCellEls,
        ...slot.cellEls,
        ...slot.rightCellEls,
        slot.fullWidthCellEl,
      ],
      slot.idPrefix,
    );
  }

  /** A spacer standing in for unrendered centre columns: no column identity, out of the ARIA tree. */
  private createGap() {
    const gap = document.createElement("div");
    gap.className = "pte-col-gap";
    gap.style.flex = "0 0 auto";
    gap.style.alignSelf = "stretch";
    gap.setAttribute("aria-hidden", "true");
    gap.setAttribute("role", "presentation");
    return gap;
  }

  private createRow() {
    const row = document.createElement("div");
    row.className = "pte-row";
    row.style.height = `${this.params.rowHeight()}px`;
    return row;
  }

  // The per-slot full-width host cell. Carries no dataset.colIdx (it is not a leaf column), so
  // selection hit-testing treats it as non-selectable like a group cell. Hidden until needed.
  private createFullWidthCell() {
    const cell = document.createElement("div");
    cell.className = "pte-cell pte-full-width-cell";
    cell.style.display = "none";
    // aria-colindex/-colspan are stamped by applyFullWidthLayout when the host activates.
    cell.setAttribute("role", "gridcell");
    return cell;
  }

  private createDescription(slot: number) {
    const description = document.createElement("span");
    description.id = `${this.params.core.id}-r${slot}-description`;
    description.hidden = true;
    return description;
  }

  private createCell(colId: string, isRightAligned: boolean, idPrefix: string) {
    const cell = document.createElement("div");
    cell.className = "pte-cell";
    const col = this.params.core.getColumnModel().getById(colId);
    if (col?.isRowNumberColumn()) {
      cell.classList.add("pte-row-number-cell");
    } else if (col?.isSelectionCheckboxColumn()) {
      // The checkbox visual is a decorative span driven purely by the cell's "selected" class
      // (toggled by the selection renderer); the row's aria-selected carries the semantics.
      cell.classList.add("pte-checkbox-cell");
      const box = document.createElement("span");
      box.className = "pte-checkbox";
      box.setAttribute("aria-hidden", "true");
      cell.appendChild(box);
    }
    const meta = this.params.core.getColumnModel().leafColumnLookup.get(colId);
    if (meta) {
      cell.dataset.colId = colId;
      cell.dataset.colIdx = String(meta.globalIndex);
    }
    stampGridCellAria(cell, meta?.globalIndex);
    // Column-derived, so it is the same id the positional stitching gave a fully rendered row, and
    // stays stable while a virtualized row's cells come and go around it.
    if (meta) cell.id = `${idPrefix}-c${meta.globalIndex}`;
    if (isRightAligned) cell.classList.add("pte-cell-right-aligned");
    return cell;
  }
}

/**
 * Write the gap widths of a slot's current rendered centre columns: after a column width change
 * the columns a gap stands for may have changed width without the rendered set changing.
 */
export function applyCenterGapWidths(slot: RowPoolDef, widths: readonly number[]): void {
  const runs = columnRuns(widths, slot.centerCols);
  for (let r = 0; r < runs.length; r++) {
    const gap = slot.centerGapEls[r];
    if (!gap) continue;
    const px = `${runs[r].gapPx}px`;
    if (gap.style.width !== px) gap.style.width = px;
    // A gap that grew from 0 was never attached; one that shrank to 0 can stay (0 wide).
    if (runs[r].gapPx > 0 && !gap.isConnected) {
      const first = slot.cellEls[runs[r].from];
      if (first?.parentNode === slot.rowEl) slot.rowEl.insertBefore(gap, first);
    }
  }
}
