import { ColumnSection } from "../../interfaces/column";
import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import {
  clearGroupDropPosition,
  resolveGroupDropIndex,
  showGroupDropPosition,
} from "../toolbar/groupDropPosition";
import {
  getSortDirections,
  insertSortColumn,
} from "../toolbar/sortModelOperations";

const COLUMN_DRAG_THRESHOLD_PX = 4;

interface ColumnInteractionRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  rowHeight: () => number;
  maxDepth: () => number;
  headerWrapper: HTMLDivElement;
  leftHeader: HTMLDivElement;
  centerHeader: HTMLDivElement;
  rightHeader: HTMLDivElement;
  leftScroller: HTMLDivElement;
  centerScroller: HTMLDivElement;
  rightScroller: HTMLDivElement;
  leafColumnLookup: () => Map<string, { section: ColumnSection; globalIndex: number; localIndex: number }>;
}

export class ColumnInteractionRenderer {
  private resizingColumn = "";
  private resizeStartX = 0;
  private resizeStartWidth = 0;
  private suppressHeaderClick = false;
  private isDraggingColumn = false;
  private draggingColumn: Column | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragLastX = 0;
  private dragTargetIndex = -1;
  private dragGhostEl: HTMLDivElement | null = null;
  private dragIndicatorEl: HTMLDivElement | null = null;
  private dragHeaderEl: HTMLDivElement | null = null;
  private dragHeaderContainer: HTMLDivElement | null = null;
  private dragSection: ColumnSection | null = null;
  private dragDirection: "left" | "right" | null = null;
  private dragAllowsDrop = false;
  private groupDropZone: HTMLElement | null = null;
  private groupDropIndex: number | null = null;
  private sortDropZone: HTMLElement | null = null;
  private sortDropIndex: number | null = null;

  constructor(private params: ColumnInteractionRendererParams) { }

  consumeSuppressClick() {
    if (!this.suppressHeaderClick) return false;
    this.suppressHeaderClick = false;
    return true;
  }

  onHeaderMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const handle = (e.target as HTMLElement | null)?.closest(".pte-hcell-resize-handle") as HTMLElement | null;
    if (handle) {
      const header = handle.closest(".pte-hcell") as HTMLDivElement | null;
      if (!header) return;
      const col = this.params.core.getColumnModel().getById(header.id);
      if (!col || col.hidden || col.isInternal()) return;
      if (!col.resizable) return;

      const headerRect = header.getBoundingClientRect();
      this.resizingColumn = col.instanceID;
      this.resizeStartX = e.clientX;
      this.resizeStartWidth = headerRect.width;
      this.suppressHeaderClick = true;
      document.body.style.cursor = "col-resize";
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const header = (e.target as HTMLElement | null)?.closest(".pte-hcell") as HTMLDivElement | null;
    if (!header) return;
    const col = this.params.core.getColumnModel().getById(header.id);
    if (!col || col.hidden || col.isInternal()) return;
    if ((e.target as HTMLElement | null)?.closest(".pte-hcell-menu-btn")) return;
    const allowDrop = col.movable;
    this.maybeStartColumnDrag(col, header, e, allowDrop);
  }

  onColumnResizeMouseMove(e: MouseEvent) {
    if (this.resizingColumn === "") return;
    const delta = e.clientX - this.resizeStartX;
    const nextWidth = this.resizeStartWidth + delta;
    this.applyColumnResize(this.resizingColumn, nextWidth);
    e.preventDefault();
  }

  onColumnResizeMouseUp() {
    if (this.resizingColumn === "") return;
    this.resizingColumn = "";
    this.resizeStartX = 0;
    this.resizeStartWidth = 0;
    document.body.style.cursor = "";
    this.suppressHeaderClick = true;
    setTimeout(() => { this.suppressHeaderClick = false; }, 0);
  }

  onColumnDragMouseMove(e: MouseEvent) {
    if (!this.draggingColumn) return;
    const deltaX = Math.abs(e.clientX - this.dragStartX);
    const deltaY = Math.abs(e.clientY - this.dragStartY);
    if (!this.isDraggingColumn) {
      if (deltaX < COLUMN_DRAG_THRESHOLD_PX && deltaY < COLUMN_DRAG_THRESHOLD_PX) return;
      this.beginColumnDrag();
      this.suppressHeaderClick = true;
    }

    const drift = e.clientX - this.dragStartX;
    if (Math.abs(drift) >= COLUMN_DRAG_THRESHOLD_PX) {
      const nextDir = drift >= 0 ? "right" : "left";
      this.dragDirection = nextDir;
    }

    if (this.dragGhostEl) {
      this.dragGhostEl.style.left = `${e.clientX + 8}px`;
      this.dragGhostEl.style.top = `${e.clientY + 8}px`;
    }

    const groupDropZone = this.getGroupDropZoneForPoint(e.clientX, e.clientY);
    const sortDropZone = groupDropZone
      ? null
      : this.getSortDropZoneForPoint(e.clientX, e.clientY);
    this.setGroupDropZone(groupDropZone);
    this.setSortDropZone(sortDropZone);
    if (groupDropZone) {
      this.groupDropIndex = resolveGroupDropIndex(groupDropZone, e.clientX);
      showGroupDropPosition(groupDropZone, this.groupDropIndex);
      this.dragTargetIndex = -1;
      if (this.dragIndicatorEl) this.dragIndicatorEl.style.display = "none";
      e.preventDefault();
      return;
    }
    if (sortDropZone) {
      const chipSelector = ".pte-grid-toolbar-sort-chip";
      this.sortDropIndex = resolveGroupDropIndex(sortDropZone, e.clientX, chipSelector);
      showGroupDropPosition(
        sortDropZone,
        this.sortDropIndex,
        chipSelector,
        "pte-grid-toolbar-sort-drop-indicator",
      );
      this.dragTargetIndex = -1;
      if (this.dragIndicatorEl) this.dragIndicatorEl.style.display = "none";
      e.preventDefault();
      return;
    }

    if (!this.dragAllowsDrop) {
      this.dragTargetIndex = -1;
      e.preventDefault();
      return;
    }

    const sectionAtPointer = this.getSectionForPoint(e.clientX, e.clientY) || this.dragSection || "center";
    if (sectionAtPointer !== this.dragSection) {
      this.dragSection = sectionAtPointer;
      this.dragHeaderContainer = this.getSectionContainer(sectionAtPointer);
      if (this.dragIndicatorEl && this.dragHeaderContainer && this.dragIndicatorEl.parentElement !== this.dragHeaderContainer) {
        this.dragIndicatorEl.remove();
        this.dragHeaderContainer.appendChild(this.dragIndicatorEl);
      }
    }

    const section = this.dragSection || "center";
    const headers = this.getDropAnchorHeaders(section);
    if (headers.length === 0) {
      this.dragTargetIndex = -1;
      return;
    }

    const originRect = this.dragHeaderEl?.getBoundingClientRect();
    const insideOrigin = originRect
      && e.clientX >= originRect.left
      && e.clientX <= originRect.right
      && e.clientY >= originRect.top
      && e.clientY <= originRect.bottom;
    if (insideOrigin) {
      this.dragTargetIndex = -1;
      this.positionDropIndicator(-1, -1, headers);
      this.dragLastX = e.clientX;
      return;
    }

    const hoverIndex = headers.findIndex(h => {
      const rect = h.el.getBoundingClientRect();
      return e.clientX >= rect.left && e.clientX <= rect.right;
    });

    let targetIndex: number;
    const movingRight = this.dragDirection === "right" || (this.dragDirection === null && e.clientX >= this.dragLastX);
    if (hoverIndex === -1) {
      const firstRect = headers[0].el.getBoundingClientRect();
      if (e.clientX < firstRect.left) {
        targetIndex = 0;
      } else {
        targetIndex = headers.length;
      }
    } else {
      targetIndex = movingRight ? hoverIndex + 1 : hoverIndex;
    }

    this.dragLastX = e.clientX;
    this.dragTargetIndex = targetIndex;
    this.positionDropIndicator(targetIndex, hoverIndex, headers);
    e.preventDefault();
  }

  onColumnDragMouseUp() {
    if (!this.draggingColumn) return;
    const col = this.draggingColumn;
    const targetIndex = this.dragTargetIndex;
    const section = this.dragSection || "center";
    const performedDrag = this.isDraggingColumn;
    const allowDrop = this.dragAllowsDrop;
    const addToGroups = this.groupDropZone != null;
    const groupDropIndex = this.groupDropIndex;
    const addToSorts = this.sortDropZone != null;
    const sortDropIndex = this.sortDropIndex;
    this.teardownColumnDrag();
    if (!performedDrag) return;
    if (addToGroups) {
      const colIds = this.params.core.getRowGroupColumns().map(group => group.instanceID);
      if (!colIds.includes(col.instanceID)) {
        const insertAt = Math.max(0, Math.min(groupDropIndex ?? colIds.length, colIds.length));
        colIds.splice(insertAt, 0, col.instanceID);
        this.params.core.dispatch({ type: "rowGroupSet", colIds });
      }
      this.suppressHeaderClick = true;
      setTimeout(() => { this.suppressHeaderClick = false; }, 0);
      return;
    }
    if (addToSorts) {
      insertSortColumn(this.params.core, col, sortDropIndex ?? undefined);
      this.suppressHeaderClick = true;
      setTimeout(() => { this.suppressHeaderClick = false; }, 0);
      return;
    }
    if (!allowDrop) {
      this.suppressHeaderClick = true;
      setTimeout(() => { this.suppressHeaderClick = false; }, 0);
      return;
    }
    this.params.core.dispatch({ type: "columnMove", colId: col.instanceID, toIndex: targetIndex, toSection: section });
    this.suppressHeaderClick = true;
    setTimeout(() => { this.suppressHeaderClick = false; }, 0);
  }

  onHeaderDoubleClick(e: MouseEvent) {
    const handle = (e.target as HTMLElement | null)?.closest(".pte-hcell-resize-handle") as HTMLElement | null;
    if (!handle) return;
    const header = handle.closest(".pte-hcell") as HTMLDivElement | null;
    if (!header) return;
    const col = this.params.core.getColumnModel().getById(header.id);
    if (!col || col.isInternal()) return;
    this.params.core.dispatch({
      type: "columnAutosize",
      colId: header.id,
    });
    e.preventDefault();
    e.stopPropagation();
  }

  private maybeStartColumnDrag(col: Column, header: HTMLDivElement, e: MouseEvent, allowDrop = true) {
    const draggable = this.isDragSource(col);
    if (allowDrop && !draggable) return;
    this.draggingColumn = col;
    this.dragHeaderEl = header;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragLastX = e.clientX;
    this.dragAllowsDrop = allowDrop && draggable;
    const meta = this.params.leafColumnLookup().get(col.instanceID);
    const section = meta?.section ?? (col.pinned === "left" ? "left" : col.pinned === "right" ? "right" : "center");
    this.dragSection = section;
    this.dragHeaderContainer = this.getSectionContainer(section);
    this.dragTargetIndex = this.dragAllowsDrop
      ? this.getDropAnchorLeaves(section).findIndex(c => c.instanceID === col.instanceID)
      : -1;
    this.isDraggingColumn = false;
    this.dragDirection = null;
  }

  private beginColumnDrag() {
    if (!this.draggingColumn) return;
    this.isDraggingColumn = true;
    this.setDragCursor(true, this.dragAllowsDrop);

    if (!this.dragGhostEl) {
      const ghost = document.createElement("div");
      ghost.className = "pte-column-drag-ghost";
      const ghostContent = document.createElement("div");
      ghostContent.className = "pte-column-drag-ghost-content";
      const ghostDragIcon = document.createElement("span");
      ghostDragIcon.className = "pte-column-drag-ghost-icon";
      if (this.dragAllowsDrop) {
        ghostDragIcon.classList.add("icon-drag");
      } else {
        ghostDragIcon.classList.add("icon-not-allowed");
      }
      ghostContent.appendChild(ghostDragIcon);
      const ghostLabel = document.createElement("span");
      ghostLabel.className = "pte-column-drag-ghost-label";
      ghostLabel.textContent = this.draggingColumn.label ?? this.draggingColumn.key;
      ghostContent.appendChild(ghostLabel);
      ghost.appendChild(ghostContent);
      if (this.dragHeaderEl) {
        const rect = this.dragHeaderEl.getBoundingClientRect();
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
      }
      document.body.appendChild(ghost);
      const contentRect = ghostContent.getBoundingClientRect();
      ghost.style.width = `${contentRect.width}px`;
      ghost.style.height = `${contentRect.height}px`;
      this.dragGhostEl = ghost;
    }

    if (this.dragAllowsDrop && !this.dragIndicatorEl && this.dragHeaderContainer) {
      const indicator = document.createElement("div");
      indicator.className = "pte-column-drop-indicator";
      indicator.style.height = `${this.params.headerWrapper.getBoundingClientRect().height || this.params.rowHeight() * this.params.maxDepth()}px`;
      this.dragHeaderContainer.appendChild(indicator);
      this.dragIndicatorEl = indicator;
    }
  }

  private getSectionContainer(section: ColumnSection) {
    if (section === "left") return this.params.leftHeader;
    if (section === "right") return this.params.rightHeader;
    return this.params.centerHeader;
  }

  private getSectionForPoint(x: number, y: number): ColumnSection | null {
    const candidates: Array<{ section: ColumnSection; el: HTMLElement }> = [
      { section: "left", el: this.params.leftHeader },
      { section: "center", el: this.params.centerHeader },
      { section: "right", el: this.params.rightHeader },
      { section: "left", el: this.params.leftScroller },
      { section: "center", el: this.params.centerScroller },
      { section: "right", el: this.params.rightScroller },
    ];
    for (const { section, el } of candidates) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return section;
      }
    }
    return null;
  }

  private getGroupDropZoneForPoint(x: number, y: number): HTMLElement | null {
    const col = this.draggingColumn;
    if (
      !col
      || !col.groupable
      || col.isInternal()
      || this.params.core.getRowModel().getType() !== "clientSide"
      || this.params.core.getRowGroupColumns().some(group => group.instanceID === col.instanceID)
    ) return null;
    const zone = this.params.root.querySelector<HTMLElement>(".pte-grid-toolbar-group-dropzone");
    if (!zone) return null;
    const rect = zone.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom ? zone : null;
  }

  private getSortDropZoneForPoint(x: number, y: number): HTMLElement | null {
    const col = this.draggingColumn;
    if (
      !col
      || !col.sortable
      || col.isInternal()
      || getSortDirections(col).length === 0
    ) return null;
    const zone = this.params.root.querySelector<HTMLElement>(".pte-grid-toolbar-sort-dropzone");
    if (!zone) return null;
    const rect = zone.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom ? zone : null;
  }

  private setGroupDropZone(zone: HTMLElement | null): void {
    if (zone === this.groupDropZone) return;
    if (this.groupDropZone) {
      this.groupDropZone.classList.remove("drag-over");
      clearGroupDropPosition(this.groupDropZone);
    }
    this.groupDropZone = zone;
    this.groupDropIndex = null;
    this.groupDropZone?.classList.add("drag-over");
    if (this.isDraggingColumn) this.setDragCursor(true, zone != null || this.dragAllowsDrop);
  }

  private setSortDropZone(zone: HTMLElement | null): void {
    if (zone === this.sortDropZone) return;
    if (this.sortDropZone) {
      this.sortDropZone.classList.remove("drag-over");
      clearGroupDropPosition(
        this.sortDropZone,
        "pte-grid-toolbar-sort-drop-indicator",
      );
    }
    this.sortDropZone = zone;
    this.sortDropIndex = null;
    this.sortDropZone?.classList.add("drag-over");
    if (this.isDraggingColumn) this.setDragCursor(true, zone != null || this.dragAllowsDrop);
  }

  private getDropAnchorLeaves(section: ColumnSection = "center"): Column[] {
    const model = this.params.core.getColumnModel();
    const leaves = model.getLeavesBySection(section);
    return leaves.filter(c => this.isDropAnchor(c));
  }

  private getDropAnchorHeaders(section: ColumnSection = "center"): Array<{ col: Column; el: HTMLDivElement }> {
    const container = this.getSectionContainer(section);
    const headers = Array.from(container.children) as HTMLDivElement[];
    const output: Array<{ col: Column; el: HTMLDivElement }> = [];
    for (const el of headers) {
      if (!el.classList.contains("pte-hcell")) continue;
      const col = this.params.core.getColumnModel().getById(el.id);
      if (!col) continue;
      if (col.children.length > 0) {
        const leaves = col.getLeaves();
        leaves.filter(c => this.isDropAnchor(c)).forEach(leaf => {
          output.push({ col: leaf, el: document.getElementById(leaf.instanceID) as HTMLDivElement });
        });
        continue;
      } else if (this.isDropAnchor(col)) {
        output.push({ col, el });
      }
    }
    return output.filter(h => h.el != null);
  }

  private positionDropIndicator(targetIndex: number, hoverIndex: number, headers: Array<{ col: Column; el: HTMLDivElement }>) {
    if (!this.dragIndicatorEl || headers.length === 0) return;
    if (targetIndex < 0) {
      this.dragIndicatorEl.style.display = "none";
      return;
    }
    const container = this.dragHeaderContainer || this.params.centerHeader;
    const containerRect = container.getBoundingClientRect();
    const prev = targetIndex >= headers.length ? headers[headers.length - 1] : headers[hoverIndex];
    const ref = targetIndex >= headers.length ? headers[headers.length - 1] : headers[targetIndex];
    const rect = ref.el.getBoundingClientRect();
    const x = targetIndex >= headers.length ? rect.right : rect.left;
    const relativeX = x - containerRect.left + container.scrollLeft;
    const clampedX = Math.max(0, Math.min(relativeX, Math.max(0, container.scrollWidth - 2)));
    this.dragIndicatorEl.style.left = `${clampedX}px`;
    this.dragIndicatorEl.style.display = "block";
    this.dragIndicatorEl.style.top = prev.el.offsetTop + "px";
    this.dragIndicatorEl.style.height = `${prev.el.getBoundingClientRect().height}px`;
  }

  private animateDragGhostReturn(ghost: HTMLDivElement, header: HTMLDivElement | null) {
    if (!ghost.isConnected) return;
    if (!header) {
      ghost.remove();
      return;
    }
    const headerRect = header.getBoundingClientRect();
    const ghostRect = ghost.getBoundingClientRect();
    const targetLeft = headerRect.left + (headerRect.width - ghostRect.width) / 2;
    const targetTop = headerRect.top + (headerRect.height - ghostRect.height) / 2;
    ghost.style.transition = "left 120ms ease, top 120ms ease";
    ghost.style.transitionDelay = "0s";
    ghost.style.left = `${targetLeft}px`;
    ghost.style.top = `${targetTop}px`;
    const cleanup = () => {
      ghost.removeEventListener("transitionend", cleanup);
      ghost.remove();
    };
    ghost.addEventListener("transitionend", cleanup);
    setTimeout(() => {
      if (ghost.isConnected) ghost.remove();
    }, 180);
  }

  private teardownColumnDrag() {
    const ghost = this.dragGhostEl;
    if (ghost) {
      this.animateDragGhostReturn(ghost, this.dragHeaderEl);
      this.dragGhostEl = null;
    }
    if (this.dragIndicatorEl) {
      this.dragIndicatorEl.remove();
      this.dragIndicatorEl = null;
    }
    if (this.groupDropZone) {
      this.groupDropZone.classList.remove("drag-over");
      clearGroupDropPosition(this.groupDropZone);
    }
    if (this.sortDropZone) {
      this.sortDropZone.classList.remove("drag-over");
      clearGroupDropPosition(
        this.sortDropZone,
        "pte-grid-toolbar-sort-drop-indicator",
      );
    }
    this.groupDropZone = null;
    this.groupDropIndex = null;
    this.sortDropZone = null;
    this.sortDropIndex = null;
    this.draggingColumn = null;
    this.dragHeaderEl = null;
    this.dragHeaderContainer = null;
    this.dragSection = null;
    this.isDraggingColumn = false;
    this.dragTargetIndex = -1;
    this.dragAllowsDrop = false;
    this.setDragCursor(false);
  }

  private isDragSource(col: Column): boolean {
    if (!col) return false;
    return !col.isInternal() && col.movable && col.isVisible();
  }

  private isDropAnchor(col: Column): boolean {
    if (!col) return false;
    return !col.isInternal() && col.isVisible();
  }

  private setDragCursor(active: boolean, allowDrop = true) {
    const cursor = active ? (allowDrop ? "move" : "not-allowed") : "";
    document.body.style.setProperty("cursor", cursor, "important");
    if (this.params.headerWrapper) {
      this.params.headerWrapper.style.setProperty("cursor", cursor, "important");
    }
    this.params.root.classList.toggle("pte-column-dragging", active && allowDrop);
    this.params.root.classList.toggle("pte-column-dragging-not-allowed", active && !allowDrop);
  }

  private applyColumnResize(colId: string, rawWidth: number) {
    this.params.core.dispatch({
      type: "columnResize",
      colId: colId,
      widthPx: rawWidth,
    });
  }
}
