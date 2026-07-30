import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { RowPoolDef } from "../types";

interface ColumnLayoutRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  body: HTMLDivElement;
  rowPool: () => RowPoolDef[];
  leadingViewport: HTMLDivElement;
  leftViewport: HTMLDivElement;
  centerViewport: HTMLDivElement;
  rightViewport: HTMLDivElement;
  leadingScroller: HTMLDivElement;
  leftScroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
  leadingHeader: HTMLDivElement;
  leftHeader: HTMLDivElement;
  centerHeader: HTMLDivElement;
  rightHeader: HTMLDivElement;
  headerWrapper: HTMLDivElement;
  hScrollContainer: HTMLDivElement;
  hScrollLeadingParent: HTMLDivElement;
  hScrollLeftParent: HTMLDivElement;
  hScrollParent: HTMLDivElement;
  hScrollRightParent: HTMLDivElement;
  hScrollerLeft: HTMLDivElement;
  hScroller: HTMLDivElement;
  hScrollerRight: HTMLDivElement;
  aggregateLeading: HTMLDivElement;
  aggregateLeadingCells: () => HTMLDivElement[];
  aggregateLeft: HTMLDivElement;
  aggregateLeftCells: () => HTMLDivElement[];
  aggregateCenterRow?: () => HTMLDivElement | undefined;
  aggregateCenterCells: () => HTMLDivElement[];
  aggregateRight: HTMLDivElement;
  aggregateRightCells: () => HTMLDivElement[];
  updatePinnedRowsLayout?: () => void;
}

export class ColumnLayoutRenderer {
  constructor(private params: ColumnLayoutRendererParams) {}

  applyLeadingColumnWidths(colIDs: string[] = []): number {
    let maxWidth = 0;
    for (const slot of this.params.rowPool()) {
      let totalWidth = 0;
      let c = 0;
      for (const col of this.params.core.getColumnModel().getLeadingLeaves()) {
        if (col.hidden) continue;
        const cell = slot.leadingCellEls?.[c++];
        if (!cell) continue;
        totalWidth += col.computedWidth;
        if (colIDs.length > 0 && !colIDs.includes(col.instanceID)) continue;
        cell.style.flex = "0 0 auto";
        cell.style.width = `${col.computedWidth}px`;
      }
      if (slot.leadingRowEl) slot.leadingRowEl.style.width = `${totalWidth}px`;
      maxWidth = Math.max(maxWidth, totalWidth);
    }

    this.params.leadingViewport.style.width = `${maxWidth}px`;
    this.applyAggregateColumnWidths(this.params.aggregateLeadingCells(), this.params.core.getColumnModel().getLeadingLeaves(), colIDs);
    this.params.leadingScroller.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.leadingScroller.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.leadingHeader.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.leadingHeader.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.aggregateLeading.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.aggregateLeading.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.hScrollLeadingParent.style.width = `${maxWidth}px`;
    this.params.hScrollLeadingParent.style.minWidth = `${maxWidth}px`;
    this.params.hScrollLeadingParent.style.display = maxWidth > 0 ? "block" : "none";

    if (maxWidth > 0) {
      this.params.leadingScroller.classList.add("visible");
      this.params.leadingHeader.classList.add("visible");
      this.params.aggregateLeading.style.display = "block";
    } else {
      this.params.leadingScroller.classList.remove("visible");
      this.params.leadingHeader.classList.remove("visible");
      this.params.aggregateLeading.style.display = "none";
    }

    return maxWidth;
  }

  applyLeftColumnWidths(colIDs: string[] = []): number {
    let maxWidth = 0;
    for (const slot of this.params.rowPool()) {
      let totalWidth = 0;
      let c = 0;
      for (const col of this.params.core.getColumnModel().getLeftLeaves()) {
        if (col.hidden) continue;
        const cell = slot.leftCellEls[c++];
        if (!cell) continue;
        totalWidth += col.computedWidth;
        if (colIDs.length > 0 && !colIDs.includes(col.instanceID)) continue;
        cell.style.flex = "0 0 auto";
        cell.style.width = `${col.computedWidth}px`;
      }
      if (slot.leftRowEl) slot.leftRowEl.style.width = `${totalWidth}px`;
      maxWidth = Math.max(maxWidth, totalWidth);
    }
    this.params.leftViewport.style.width = `${maxWidth}px`;
    this.applyAggregateColumnWidths(this.params.aggregateLeftCells(), this.params.core.getColumnModel().getLeftLeaves(), colIDs);
    this.params.hScrollerLeft.style.width = `${maxWidth}px`;
    this.params.hScrollLeftParent.style.display = maxWidth > 0 ? "block" : "none";
    this.params.leftHeader.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.leftHeader.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.aggregateLeft.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.aggregateLeft.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    const totalWidth = maxWidth;
    if (maxWidth > 0) {
      this.params.leftScroller.classList.add("visible");
      this.params.leftHeader.classList.add("visible");
      if (maxWidth > this.params.root.clientWidth * 0.35) {
        maxWidth = this.params.root.clientWidth * 0.35;
        this.params.leftHeader.style.width = `${maxWidth}px`;
        this.params.leftHeader.style.minWidth = `${maxWidth}px`;
        this.params.aggregateLeft.style.width = `${maxWidth}px`;
        this.params.aggregateLeft.style.minWidth = `${maxWidth}px`;
      }
      this.params.aggregateLeft.style.display = "block";
    } else {
      this.params.leftScroller.classList.remove("visible");
      this.params.leftHeader.classList.remove("visible");
      this.params.aggregateLeft.style.display = "none";
    }
    this.params.hScrollLeftParent.style.width = `${maxWidth}px`;
    this.params.hScrollLeftParent.style.minWidth = `${maxWidth}px`;
    this.params.hScrollParent.style.width = `calc(100% - ${this.params.hScrollLeadingParent.clientWidth + maxWidth}px)`;
    return totalWidth;
  }

  applyCenterColumnWidths(colIDs: string[] = []): number {
    let maxWidth = 0;
    for (const slot of this.params.rowPool()) {
      let totalWidth = 0;
      let c = 0;
      for (const col of this.params.core.getColumnModel().getCenterLeaves()) {
        if (col.hidden) continue;
        const cell = slot.cellEls[c++];
        if (!cell) continue;
        totalWidth += col.computedWidth;
        if (colIDs.length > 0 && !colIDs.includes(col.instanceID)) continue;
        cell.style.flex = "0 0 auto";
        cell.style.width = `${col.computedWidth}px`;
      }
      // groupRows headings track the center columns' total width, including during a live column
      // resize. User-defined full-width rows are viewport-sized by the window renderer, so leave
      // those alone. The hidden data-cell widths above are harmless in either case.
      if (slot.rowEl.classList.contains("pte-full-width-row") && slot.rowEl.classList.contains("pte-group-row")) {
        slot.rowEl.style.width = `${totalWidth}px`;
        slot.fullWidthCellEl.style.width = `${totalWidth}px`;
      } else if (!slot.rowEl.classList.contains("pte-full-width-row")) {
        slot.rowEl.style.width = `${totalWidth}px`;
      }
      maxWidth = Math.max(maxWidth, totalWidth);
    }
    this.params.hScroller.style.width = `${maxWidth}px`;
    this.applyAggregateColumnWidths(this.params.aggregateCenterCells(), this.params.core.getColumnModel().getCenterLeaves(), colIDs);
    if (maxWidth == 0) {
      this.params.hScrollParent.style.flex = "1 1 auto";
    }
    this.params.centerViewport.style.width = `${maxWidth}px`;
    const aggregateCenterRow = this.params.aggregateCenterRow?.();
    if (aggregateCenterRow) {
      aggregateCenterRow.style.width = `${maxWidth}px`;
      aggregateCenterRow.style.minWidth = `${maxWidth}px`;
    }
    return maxWidth;
  }

  applyRightColumnWidths(colIDs: string[] = []): number {
    let maxWidth = 0;
    for (const slot of this.params.rowPool()) {
      let totalWidth = 0;
      let c = 0;
      for (const col of this.params.core.getColumnModel().getRightLeaves()) {
        if (col.hidden) continue;
        const cell = slot.rightCellEls[c++];
        if (!cell) continue;
        totalWidth += col.computedWidth;
        if (colIDs.length > 0 && !colIDs.includes(col.instanceID)) continue;
        cell.style.flex = "0 0 auto";
        cell.style.width = `${col.computedWidth}px`;
      }
      if (slot.rightRowEl) slot.rightRowEl.style.width = `${totalWidth}px`;
      maxWidth = Math.max(maxWidth, totalWidth);
    }
    this.params.rightViewport.style.width = `${maxWidth}px`;
    this.applyAggregateColumnWidths(this.params.aggregateRightCells(), this.params.core.getColumnModel().getRightLeaves(), colIDs);
    this.params.rightHeader.style.paddingRight = `${maxWidth > 0 ? 15 : 0}px`;
    this.params.hScrollerRight.style.width = `${maxWidth}px`;
    this.params.hScrollRightParent.style.display = maxWidth > 0 ? "block" : "none";
    const totalWidth = maxWidth;
    if (maxWidth > 0) {
      this.params.rightScroller.classList.add("visible");
      this.params.rightHeader.classList.add("visible");
      if (maxWidth > this.params.root.clientWidth * 0.35) {
        maxWidth = this.params.root.clientWidth * 0.35;
      }
      this.params.hScrollRightParent.style.width = `${maxWidth}px`;
      this.params.hScrollRightParent.style.minWidth = `${maxWidth}px`;
      this.params.rightHeader.style.width = `${maxWidth + 16}px`;
      this.params.rightHeader.style.minWidth = `${maxWidth + 16}px`;
      this.params.aggregateRight.style.width = `${maxWidth + 1}px`;
      this.params.aggregateRight.style.minWidth = `${maxWidth + 1}px`;
      this.params.aggregateRight.style.display = "block";
      maxWidth += this.params.hScrollLeadingParent.clientWidth + this.params.hScrollLeftParent.clientWidth;
      this.params.hScrollParent.style.width = `calc(100% - ${maxWidth}px)`;
    } else {
      this.params.rightScroller.classList.remove("visible");
      this.params.rightHeader.style.width = "0px";
      this.params.rightHeader.style.minWidth = "0px";
      this.params.rightHeader.classList.remove("visible");
      this.params.hScrollRightParent.style.width = "0px";
      this.params.hScrollRightParent.style.minWidth = "0px";
      this.params.aggregateRight.style.width = "0px";
      this.params.aggregateRight.style.minWidth = "0px";
      this.params.aggregateRight.style.display = "none";
    }
    this.params.centerHeader.style.paddingRight = `${maxWidth > 0 ? 0 : 15}px`;
    return totalWidth;
  }

  updateColumnWidths(colIDs: string[] = []) {
    const leadingWidth = this.applyLeadingColumnWidths(colIDs);
    const leftWidth = this.applyLeftColumnWidths(colIDs);
    const centerWidth = this.applyCenterColumnWidths(colIDs);
    const rightWidth = this.applyRightColumnWidths(colIDs);
    const totalWidth = leadingWidth + leftWidth + centerWidth + rightWidth;

    const allColIDs: Column[] = [];
    this.params.core.getColumnModel().walkColumns(c => c.isVisible() && allColIDs.push(c));
    allColIDs.forEach(col => {
      const hcell = document.getElementById(col.instanceID);
      if (!hcell) return;
      hcell.style.width = `${col.computedWidth}px`;
    });

    const needsSectionScroll =
      leftWidth > this.params.hScrollLeftParent.clientWidth
      || centerWidth > this.params.hScrollParent.clientWidth
      || rightWidth > this.params.hScrollRightParent.clientWidth;
    if (totalWidth > this.params.root.clientWidth || needsSectionScroll) {
      this.params.hScrollContainer.style.display = "flex";
    } else {
      this.params.hScrollContainer.style.display = "none";
    }

    const headerHeight = this.params.headerWrapper.getBoundingClientRect().height;
    const hScrollHeight = this.params.hScrollContainer.getBoundingClientRect().height;
    const chromeHeight = headerHeight
      + (this.params.hScrollContainer.style.display === "flex" ? hScrollHeight : 0);
    this.params.body.style.height = `calc(100% - ${chromeHeight}px)`;
    this.params.updatePinnedRowsLayout?.();
  }

  private applyAggregateColumnWidths(cells: HTMLDivElement[], columns: Column[], colIDs: string[]): void {
    let c = 0;
    for (const col of columns) {
      if (col.hidden) continue;
      const cell = cells[c++];
      if (!cell) continue;
      if (colIDs.length > 0 && !colIDs.includes(col.instanceID)) continue;
      cell.style.flex = "0 0 auto";
      cell.style.width = `${col.computedWidth}px`;
    }
  }
}
