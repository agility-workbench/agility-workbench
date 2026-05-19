import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { RowPoolDef } from "../types";

interface ColumnLayoutRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  body: HTMLDivElement;
  rowPool: () => RowPoolDef[];
  leftViewport: HTMLDivElement;
  centerViewport: HTMLDivElement;
  rightViewport: HTMLDivElement;
  leftScroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
  leftHeader: HTMLDivElement;
  centerHeader: HTMLDivElement;
  rightHeader: HTMLDivElement;
  headerWrapper: HTMLDivElement;
  hScrollContainer: HTMLDivElement;
  hScrollLeftParent: HTMLDivElement;
  hScrollParent: HTMLDivElement;
  hScrollRightParent: HTMLDivElement;
  hScrollerLeft: HTMLDivElement;
  hScroller: HTMLDivElement;
  hScrollerRight: HTMLDivElement;
  aggregateLeft: HTMLDivElement;
  aggregateCenterRow?: () => HTMLDivElement | undefined;
  aggregateRight: HTMLDivElement;
}

export class ColumnLayoutRenderer {
  constructor(private params: ColumnLayoutRendererParams) {}

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
    this.params.hScrollParent.style.width = `calc(100% - ${maxWidth}px)`;
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
      slot.rowEl.style.width = `${totalWidth}px`;
      maxWidth = Math.max(maxWidth, totalWidth);
    }
    this.params.hScroller.style.width = `${maxWidth}px`;
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
      this.params.rightHeader.style.width = `${maxWidth + 16}px`;
      this.params.rightHeader.style.minWidth = `${maxWidth + 16}px`;
      this.params.aggregateRight.style.width = `${maxWidth + 1}px`;
      this.params.aggregateRight.style.minWidth = `${maxWidth + 1}px`;
      this.params.aggregateRight.style.display = "block";
      maxWidth += this.params.hScrollLeftParent.clientWidth;
      this.params.hScrollParent.style.width = `calc(100% - ${maxWidth}px)`;
    } else {
      this.params.rightScroller.classList.remove("visible");
      this.params.rightHeader.style.width = "0px";
      this.params.rightHeader.style.minWidth = "0px";
      this.params.rightHeader.classList.remove("visible");
      this.params.aggregateRight.style.width = "0px";
      this.params.aggregateRight.style.minWidth = "0px";
      this.params.aggregateRight.style.display = "none";
    }
    this.params.centerHeader.style.paddingRight = `${maxWidth > 0 ? 0 : 15}px`;
    return totalWidth;
  }

  updateColumnWidths(colIDs: string[] = []) {
    let totalWidth = 0;
    totalWidth += this.applyLeftColumnWidths(colIDs);
    totalWidth += this.applyCenterColumnWidths(colIDs);
    totalWidth += this.applyRightColumnWidths(colIDs);

    const allColIDs: Column[] = [];
    this.params.core.getColumnModel().walkColumns(c => c.isVisible() && allColIDs.push(c));
    allColIDs.forEach(col => {
      const hcell = document.getElementById(col.instanceID);
      if (!hcell) return;
      hcell.style.width = `${col.computedWidth}px`;
    });

    if (totalWidth > this.params.root.clientWidth) {
      this.params.hScrollContainer.style.display = "flex";
    } else {
      this.params.hScrollContainer.style.display = "none";
    }

    const headerHeight = this.params.headerWrapper.getBoundingClientRect().height;
    const hScrollHeight = this.params.hScrollContainer.getBoundingClientRect().height;
    const chromeHeight = headerHeight
      + (this.params.hScrollContainer.style.display === "flex" ? hScrollHeight : 0);
    this.params.body.style.height = `calc(100% - ${chromeHeight}px)`;
  }
}
