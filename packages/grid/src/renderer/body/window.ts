import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { GridEventRowsChangedParams } from "../../events/events";
import { IRowNode } from "../../interfaces/iRowNode";
import { stampRowHierarchyAria } from "../aria";
import { RendererRecord } from "../renderer";
import { RowPoolDef } from "../types";
import { applyDynamicClasses, applyDynamicStyles } from "./dynamicStyle";
import { resolveColSpan } from "./colSpan";

interface BodyWindowRendererParams {
  core: GridCore;
  rowHeight: () => number;
  rowPool: () => RowPoolDef[];
  leadingScroller: HTMLDivElement;
  leftScroller: HTMLDivElement;
  centerScroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
  vScroll: HTMLDivElement;
  leadingViewport: HTMLDivElement;
  leftViewport: HTMLDivElement;
  centerViewport: HTMLDivElement;
  rightViewport: HTMLDivElement;
  serverSidePendingRangeKeys: Set<string>;
  beginScrollSync: (targets: HTMLDivElement[]) => void;
  setStartIndex: (startIndex: number) => void;
  renderCell: (cell: HTMLDivElement, row: IRowNode, col: Column, cellRendererMap: Map<string, RendererRecord>, viewIndex: number, rowNumber: number) => void;
  renderFullWidthCell: (slot: RowPoolDef, row: IRowNode, viewIndex: number, rowNumber: number) => void;
  clearFullWidthCell: (slot: RowPoolDef) => void;
  applySelectionToSlot: (slot: RowPoolDef, viewIndex: number | null) => void;
}

export class BodyWindowRenderer {
  constructor(private params: BodyWindowRendererParams) { }

  update(forcePatch: boolean, scrollSrc?: HTMLDivElement, eventParams?: GridEventRowsChangedParams) {
    const rowModel = this.params.core.getRowModel();
    const total = rowModel.getViewCount();
    const scrollTop = scrollSrc?.scrollTop ?? this.params.centerScroller.scrollTop ?? this.params.vScroll.scrollTop ?? 0;

    this.syncScrollTop(scrollSrc, scrollTop);

    const rowPool = this.params.rowPool();
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / this.params.core.options.rowHeight) - this.params.core.options.overscanRowCount
    );
    const endIndex = Math.min(total, startIndex + rowPool.length);

    this.requestMissingServerSideRows(startIndex, endIndex, total);

    const startIdx = eventParams?.firstRowIndex ?? -1;
    if (!forcePatch && startIndex === startIdx) {
      return;
    }

    this.params.setStartIndex(startIndex);
    this.translateViewports(startIndex);
    this.patchRows(startIndex, total, rowPool);
  }

  private syncScrollTop(scrollSrc: HTMLDivElement | undefined, scrollTop: number) {
    const syncTargets: HTMLDivElement[] = [];
    if (scrollSrc !== this.params.leadingScroller && this.params.leadingScroller.scrollTop !== scrollTop) {
      syncTargets.push(this.params.leadingScroller);
    }
    if (scrollSrc !== this.params.leftScroller && this.params.leftScroller.scrollTop !== scrollTop) {
      syncTargets.push(this.params.leftScroller);
    }
    if (scrollSrc !== this.params.centerScroller && this.params.centerScroller.scrollTop !== scrollTop) {
      syncTargets.push(this.params.centerScroller);
    }
    if (scrollSrc !== this.params.rightScroller && this.params.rightScroller.scrollTop !== scrollTop) {
      syncTargets.push(this.params.rightScroller);
    }
    if (scrollSrc !== this.params.vScroll && this.params.vScroll.scrollTop !== scrollTop) {
      syncTargets.push(this.params.vScroll);
    }

    this.params.beginScrollSync(syncTargets);
    for (const target of syncTargets) {
      target.scrollTop = scrollTop;
    }
  }

  private requestMissingServerSideRows(startIndex: number, endIndex: number, total: number) {
    const rowModel = this.params.core.getRowModel();
    if (rowModel.getType() !== "serverSide" || endIndex <= startIndex) return;

    let firstMissingRow = -1;
    for (let i = startIndex; i < endIndex; i++) {
      if (!rowModel.getRowNodeAtViewIndex(i)) {
        firstMissingRow = i;
        break;
      }
    }

    if (firstMissingRow < 0) return;

    const blockSize = Math.max(1, this.params.core.options.serverSideBlockSize);
    const blockStart = Math.floor(firstMissingRow / blockSize) * blockSize;
    const blockEnd = Math.min(total, blockStart + blockSize);
    const key = `${blockStart}:${blockEnd}`;
    if (this.params.serverSidePendingRangeKeys.has(key)) return;
    this.params.serverSidePendingRangeKeys.add(key);
    this.params.core.refreshRows("viewport", { start: blockStart, end: blockEnd });
  }

  private translateViewports(startIndex: number) {
    // Application-pinned model rows are removed from the body's flow (sticky group ancestors are
    // not — they stay in the flow and are mirrored by the overlay). Account for every removed row
    // before the virtual window so the compacted offset holds as the pool advances.
    const bodyRowsBefore = startIndex - this.params.core.getBodyPinnedRowCountBefore(startIndex);
    const offsetY = bodyRowsBefore * this.params.rowHeight();
    this.params.leadingViewport.style.transform = `translateY(${offsetY}px)`;
    this.params.leftViewport.style.transform = `translateY(${offsetY}px)`;
    this.params.centerViewport.style.transform = `translateY(${offsetY}px)`;
    this.params.rightViewport.style.transform = `translateY(${offsetY}px)`;
  }

  private patchRows(startIndex: number, total: number, rowPool: RowPoolDef[]) {
    const rowModel = this.params.core.getRowModel();
    for (let i = 0; i < rowPool.length; i++) {
      const viewIndex = startIndex + i;
      const slot = rowPool[i];

      if (viewIndex >= total) {
        this.applyFullWidthLayout(slot, null);
        this.hideSlot(slot);
        this.clearSlotIdentity(slot);
        this.clearRowStyling(slot);
        this.params.applySelectionToSlot(slot, null);
        continue;
      }

      this.showSlot(slot);
      const row = rowModel.getRowNodeAtViewIndex(viewIndex);
      if (!row) {
        this.applyFullWidthLayout(slot, null);
        this.hideSlot(slot);
        this.clearSlotIdentity(slot);
        this.clearRowStyling(slot);
        this.params.applySelectionToSlot(slot, null);
        continue;
      }
      if (this.params.core.isBodyRowPinned(row.id)) {
        // The node has transitioned to the top/bottom row section. Keep its model index stable for
        // sorting/group ancestry, but remove every body fragment immediately so it cannot be
        // painted, hit-tested, or focused twice during the transition. translateViewports retains
        // the same compacted offset after this source slot leaves the virtual pool.
        this.applyFullWidthLayout(slot, null);
        this.hideSlot(slot);
        this.clearSlotIdentity(slot);
        this.clearRowStyling(slot);
        this.params.applySelectionToSlot(slot, null);
        continue;
      }

      slot.rowEl.setAttribute("row-id", row.id);
      slot.rowEl.setAttribute("data-view-idx", String(viewIndex));

      if (slot.leadingRowEl) {
        slot.leadingRowEl.setAttribute("data-view-idx", String(viewIndex));
      }
      if (slot.leftRowEl) {
        slot.leftRowEl.setAttribute("data-view-idx", String(viewIndex));
      }
      if (slot.rightRowEl) {
        slot.rightRowEl.setAttribute("data-view-idx", String(viewIndex));
      }

      const isAltRow = this.params.core.options.zebraRows && viewIndex % 2 === 1;
      for (const el of [slot.rowEl, slot.leadingRowEl, slot.leftRowEl, slot.rightRowEl]) {
        el?.classList.toggle("pte-row-alt", isAltRow);
      }

      const rowNumber = this.params.core.getRowNumberForViewIndex(viewIndex);
      // Dataset-scoped ARIA row index (plan 2.1): header row is 1, body rows follow their
      // absolute display number. Only the center fragment carries it — one write per row.
      slot.rowEl.setAttribute("aria-rowindex", String(rowNumber + 1));
      this.applyRowStyling(slot, row, viewIndex);
      this.markGroupRow(slot, row);

      const fullWidth = this.params.core.isFullWidthNode(row);
      if (fullWidth) {
        // Full-width rows own their layout: no per-column cells, one host cell spanning the body.
        this.applyFullWidthLayout(slot, row);
        this.params.renderFullWidthCell(slot, row, viewIndex, rowNumber);
      } else {
        this.applyFullWidthLayout(slot, null);
        this.patchCells(slot, row, viewIndex, rowNumber);
      }
      this.params.applySelectionToSlot(slot, viewIndex);
    }
  }

  // Switch a slot between full-width and normal layout. Passing a non-null `row` (a full-width node)
  // hides the three pinned section rows and every center data cell, shows the sticky full-width
  // host, and tags the center row. Group rows are constrained to the center columns' total width;
  // user-defined full-width rows continue to span the visible center body. Passing `null` reverses
  // all of that so a recycled slot returns to normal per-column rendering with the correct width.
  private applyFullWidthLayout(slot: RowPoolDef, row: IRowNode | null) {
    if (row) {
      slot.rowEl.classList.add("pte-full-width-row");
      // A groupRows heading describes the rendered columns, so do not stretch its background into
      // empty body space when the columns are narrower than the viewport. Other full-width rows
      // retain their documented viewport-spanning behaviour.
      const width = row.isGroup ? this.centerTotalWidth() : this.params.centerScroller.clientWidth;
      slot.rowEl.style.width = `${width}px`;
      for (const cell of slot.cellEls) cell.style.display = "none";
      slot.fullWidthCellEl.style.display = "flex";
      slot.fullWidthCellEl.style.width = `${width}px`;
      // A group full-width row is cell-selectable (gated by groupRowsSelectable) exactly like the
      // old sticky-label cell was: stamp the host with the first selectable leaf index so a click
      // resolves to a real cell location. A non-group full-width row stays non-cell-selectable, so
      // it carries no colIdx (getCellLocation returns null on the NaN path).
      if (row.isGroup) {
        slot.fullWidthCellEl.dataset.colIdx = String(this.params.core.getColumnModel().getLeadingLeaves().length);
      } else {
        delete slot.fullWidthCellEl.dataset.colIdx;
      }
      // The host is now the row's only visible cell: it spans the full ARIA column range.
      slot.fullWidthCellEl.setAttribute("aria-colindex", "1");
      slot.fullWidthCellEl.setAttribute("aria-colspan", String(this.params.core.getColumnModel().leafColumnLookup.size));
      // Hide the pinned/leading section rows so no pinned cells bleed through under the host.
      for (const el of [slot.leadingRowEl, slot.leftRowEl, slot.rightRowEl]) {
        if (el) el.style.display = "none";
      }
      return;
    }

    if (!slot.rowEl.classList.contains("pte-full-width-row") && slot.fullWidthCellEl.style.display === "none") {
      return; // already in normal layout — nothing to undo
    }
    slot.rowEl.classList.remove("pte-full-width-row");
    slot.fullWidthCellEl.style.display = "none";
    delete slot.fullWidthCellEl.dataset.colIdx;
    slot.fullWidthCellEl.removeAttribute("aria-colindex");
    slot.fullWidthCellEl.removeAttribute("aria-colspan");
    this.params.clearFullWidthCell(slot);
    for (const cell of slot.cellEls) cell.style.display = "";
    slot.rowEl.style.width = `${this.centerTotalWidth()}px`;
    // Section-row display is restored by showSlot/hideSlot on the next patch; nothing to do here.
  }

  // Sum of the non-hidden center leaf columns' computed widths — the correct center row width to
  // restore when a slot leaves full-width layout (mirrors columnLayout.applyCenterColumnWidths).
  private centerTotalWidth(): number {
    let total = 0;
    for (const col of this.params.core.getColumnModel().getCenterLeaves()) {
      if (col.hidden) continue;
      total += col.computedWidth;
    }
    return total;
  }

  // Mark a slot as a group row (or clear the mark) across all four section row elements, and stamp
  // the group id so the chevron click handler can resolve which group to toggle.
  private markGroupRow(slot: RowPoolDef, row: IRowNode) {
    const isGroup = !!row.isGroup;
    for (const el of [slot.rowEl, slot.leadingRowEl, slot.leftRowEl, slot.rightRowEl]) {
      if (!el) continue;
      el.classList.toggle("pte-group-row", isGroup);
      if (isGroup) el.setAttribute("data-group-id", row.id);
      else el.removeAttribute("data-group-id");
    }
    // Only the center fragment is the ARIA row, so hierarchy state goes there alone.
    stampRowHierarchyAria(slot.rowEl, row);
  }

  /**
   * Re-apply row-level styling for a single already-rendered slot. Called after a targeted cell
   * refresh (e.g. a transaction update) so getRowClass/getRowStyle reflect the new row data without
   * a full window repaint. No-op when neither option is set.
   */
  refreshRowStyling(slot: RowPoolDef, row: IRowNode, viewIndex: number) {
    this.applyRowStyling(slot, row, viewIndex);
  }

  // Apply the user-supplied getRowClass / getRowStyle to every fragment of this row. No-op (fast
  // path) when neither option is set. Applied to all four section rows so pinned columns match.
  private applyRowStyling(slot: RowPoolDef, row: IRowNode, viewIndex: number) {
    const { getRowClass, getRowStyle } = this.params.core.options;
    const params = { data: row.data, rowId: row.id, rowIndex: viewIndex, isGroup: !!row.isGroup, node: row };
    const cls = getRowClass ? getRowClass(params) : null;
    const style = getRowStyle ? getRowStyle(params) : null;
    for (const el of [slot.rowEl, slot.leadingRowEl, slot.leftRowEl, slot.rightRowEl]) {
      if (!el) continue;
      applyDynamicClasses(el, cls);
      applyDynamicStyles(el, style);
    }
  }

  // Clear any previously-applied dynamic row class/style from a slot being hidden/recycled, so a
  // reused empty slot never carries stale styling.
  private clearRowStyling(slot: RowPoolDef) {
    for (const el of [slot.rowEl, slot.leadingRowEl, slot.leftRowEl, slot.rightRowEl]) {
      if (!el) continue;
      applyDynamicClasses(el, null);
      applyDynamicStyles(el, null);
    }
  }

  private hideSlot(slot: RowPoolDef) {
    slot.rowEl.style.display = "none";
    if (slot.leadingRowEl) slot.leadingRowEl.style.display = "none";
    if (slot.leftRowEl) slot.leftRowEl.style.display = "none";
    if (slot.rightRowEl) slot.rightRowEl.style.display = "none";
  }

  private clearSlotIdentity(slot: RowPoolDef) {
    for (const element of [slot.rowEl, slot.leadingRowEl, slot.leftRowEl, slot.rightRowEl]) {
      if (!element) continue;
      element.removeAttribute("row-id");
      element.removeAttribute("data-view-idx");
      element.removeAttribute("data-group-id");
      element.removeAttribute("aria-rowindex");
      // markGroupRow is skipped for emptied slots, so hierarchy state has to be cleared here or a
      // blank slot keeps claiming to be an expanded group.
      element.removeAttribute("aria-expanded");
      element.removeAttribute("aria-level");
      element.classList.remove("pte-group-row");
    }
  }

  private showSlot(slot: RowPoolDef) {
    slot.rowEl.style.display = "flex";
    if (slot.leadingRowEl) slot.leadingRowEl.style.display = "flex";
    if (slot.leftRowEl) slot.leftRowEl.style.display = "flex";
    if (slot.rightRowEl) slot.rightRowEl.style.display = "flex";
  }

  private patchCells(slot: RowPoolDef, row: IRowNode, viewIndex: number, rowNumber: number) {
    const columnModel = this.params.core.getColumnModel();

    const leadingLeaves = columnModel.getLeadingLeaves();
    if (leadingLeaves.length > 0 && slot.leadingCellEls) {
      slot.leadingRowEl?.setAttribute("row-id", row.id);
      this.patchSection(slot.leadingCellEls, leadingLeaves, slot, row, viewIndex, rowNumber);
    }

    const leftLeaves = columnModel.getLeftLeaves();
    if (leftLeaves.length > 0 && slot.leftCellEls) {
      slot.leftRowEl?.setAttribute("row-id", row.id);
      this.patchSection(slot.leftCellEls, leftLeaves, slot, row, viewIndex, rowNumber);
    }

    const centerLeaves = columnModel.getCenterLeaves();
    this.patchSection(slot.cellEls, centerLeaves, slot, row, viewIndex, rowNumber);

    const rightLeaves = columnModel.getRightLeaves();
    if (rightLeaves.length > 0 && slot.rightCellEls) {
      slot.rightRowEl?.setAttribute("row-id", row.id);
      this.patchSection(slot.rightCellEls, rightLeaves, slot, row, viewIndex, rowNumber);
    }
  }

  // Render one section's cells, applying per-cell colSpan. `cellEls` and `leaves` are aligned
  // one-to-one (both exclude hidden columns). When no column in the section defines colSpan (or the
  // row is a group row), takes the plain fast path (no per-cell width writes). Otherwise a spanning
  // cell widens to cover the next `span-1` leaves in this section (clamped to the section end) and
  // those covered cells are hidden; recycled non-spanning cells are restored to their column width.
  private patchSection(
    cellEls: HTMLDivElement[],
    leaves: Column[],
    slot: RowPoolDef,
    row: IRowNode,
    viewIndex: number,
    rowNumber: number,
  ) {
    const spanning = !row.isGroup && leaves.some((l) => l.colSpan != null);

    if (!spanning) {
      for (let c = 0; c < leaves.length; c++) {
        const cell = cellEls[c];
        if (!cell) continue;
        this.resetSpanGeometry(cell, leaves[c]);
        this.params.renderCell(cell, row, leaves[c], slot.cellRendererInstances, viewIndex, rowNumber);
      }
      return;
    }

    let c = 0;
    while (c < leaves.length) {
      const col = leaves[c];
      const cell = cellEls[c];
      if (!cell) { c++; continue; }

      this.params.renderCell(cell, row, col, slot.cellRendererInstances, viewIndex, rowNumber);

      const raw = col.colSpan
        ? col.colSpan({ value: col.getValue(row), data: row.data, rowId: row.id, rowIndex: viewIndex, colDef: col.col })
        : 1;
      const span = resolveColSpan(raw, leaves.length - c);

      if (span > 1) {
        let width = col.computedWidth;
        for (let k = 1; k < span; k++) {
          const covered = cellEls[c + k];
          width += leaves[c + k].computedWidth;
          if (covered) {
            covered.style.display = "none";
            if (covered.dataset.colSpan) {
              delete covered.dataset.colSpan;
              covered.removeAttribute("aria-colspan");
            }
          }
        }
        cell.style.flex = "0 0 auto";
        cell.style.width = `${width}px`;
        cell.style.display = "";
        cell.dataset.colSpan = String(span);
        cell.setAttribute("aria-colspan", String(span));
        c += span;
      } else {
        this.resetSpanGeometry(cell, col);
        c++;
      }
    }
  }

  // Restore a cell to its own column's width and clear any span marker / hidden state left over from
  // a previous (spanning or covered) render on the recycled slot.
  private resetSpanGeometry(cell: HTMLDivElement, col: Column) {
    if (cell.dataset.colSpan) {
      delete cell.dataset.colSpan;
      cell.removeAttribute("aria-colspan");
      cell.style.flex = "0 0 auto";
      cell.style.width = `${col.computedWidth}px`;
    }
    if (cell.style.display === "none") cell.style.display = "";
  }
}
