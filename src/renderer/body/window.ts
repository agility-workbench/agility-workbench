import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { GridEventRowsChangedParams } from "../../events/events";
import { IRowNode } from "../../interfaces/iRowNode";
import { RendererRecord } from "../renderer";
import { RowPoolDef } from "../types";

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
    const offsetY = startIndex * this.params.rowHeight();
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
        this.hideSlot(slot);
        this.params.applySelectionToSlot(slot, null);
        continue;
      }

      this.showSlot(slot);
      const row = rowModel.getRowNodeAtViewIndex(viewIndex);
      if (!row) {
        this.hideSlot(slot);
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

      this.patchCells(slot, row, viewIndex, this.params.core.getRowNumberForViewIndex(viewIndex));
    }
  }

  private hideSlot(slot: RowPoolDef) {
    slot.rowEl.style.display = "none";
    if (slot.leadingRowEl) slot.leadingRowEl.style.display = "none";
    if (slot.leftRowEl) slot.leftRowEl.style.display = "none";
    if (slot.rightRowEl) slot.rightRowEl.style.display = "none";
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
      for (let c = 0; c < leadingLeaves.length; c++) {
        const col = leadingLeaves[c];
        this.params.renderCell(slot.leadingCellEls[c], row, col, slot.cellRendererInstances, viewIndex, rowNumber);
      }
    }

    const leftLeaves = columnModel.getLeftLeaves();
    if (leftLeaves.length > 0 && slot.leftCellEls) {
      slot.leftRowEl?.setAttribute("row-id", row.id);
      for (let c = 0; c < leftLeaves.length; c++) {
        const col = leftLeaves[c];
        this.params.renderCell(slot.leftCellEls[c], row, col, slot.cellRendererInstances, viewIndex, rowNumber);
      }
    }

    const centerLeaves = columnModel.getCenterLeaves();
    for (let c = 0; c < centerLeaves.length; c++) {
      const col = centerLeaves[c];
      this.params.renderCell(slot.cellEls[c], row, col, slot.cellRendererInstances, viewIndex, rowNumber);
    }

    const rightLeaves = columnModel.getRightLeaves();
    if (rightLeaves.length > 0 && slot.rightCellEls) {
      slot.rightRowEl?.setAttribute("row-id", row.id);
      for (let c = 0; c < rightLeaves.length; c++) {
        const col = rightLeaves[c];
        this.params.renderCell(slot.rightCellEls[c], row, col, slot.cellRendererInstances, viewIndex, rowNumber);
      }
    }
  }
}
