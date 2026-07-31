import { GridCore } from "../../core/core";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { IRowNode } from "../../interfaces/iRowNode";
import type { RowPinnedPosition } from "../../interfaces/gridOptions";
import type { Column } from "../../column/column";
import type { RendererRecord } from "../renderer";
import { BodyCellRenderer } from "../body/cellRenderer";
import { applyDynamicClasses, applyDynamicStyles } from "../body/dynamicStyle";

interface BandElements {
  root: HTMLDivElement;
  leading: HTMLDivElement;
  left: HTMLDivElement;
  center: HTMLDivElement;
  right: HTMLDivElement;
  leadingHost: HTMLDivElement;
  leftHost: HTMLDivElement;
  centerHost: HTMLDivElement;
  rightHost: HTMLDivElement;
  vertical: HTMLDivElement;
  verticalScroller: HTMLDivElement;
}

interface RenderedPinnedRow {
  node: IRowNode;
  position: RowPinnedPosition;
}

export interface PinnedRowsController {
  setPinnedTopRowData(rows: any[]): void;
  setPinnedBottomRowData(rows: any[]): void;
  setRowPinned(rowId: string, position: RowPinnedPosition | null): void;
}

interface PinnedRowsRendererParams {
  core: GridCore;
  api: IGridAPI;
  root: HTMLDivElement;
  body: HTMLDivElement;
  rowHeight: () => number;
  bodyCellRenderer: BodyCellRenderer;
  onHeightChanged: () => void;
  onBodyPartitionChanged: () => void;
}

/**
 * Frozen rows are deliberately a renderer concern: application-owned pinned data does not enter the
 * row model, while pinned group/tree-parent rows remain model-owned but move out of the body paint
 * partition. Both bands reuse BodyCellRenderer, so formatting, hierarchy labels, aggregates, and
 * custom renderers stay consistent.
 */
export class PinnedRowsRenderer implements PinnedRowsController {
  private readonly top: BandElements;
  private readonly bottom: BandElements;
  private readonly manualPinned = new Map<string, RowPinnedPosition>();
  private readonly topRendererMaps = new Set<Map<string, RendererRecord>>();
  private readonly bottomRendererMaps = new Set<Map<string, RendererRecord>>();
  private dataSequence = 0;
  private dataIds = new WeakMap<object, string>();
  private topSignature = "";
  private bottomSignature = "";
  private lastScrollTop = 0;
  private topCount = 0;
  private bottomCount = 0;
  private bodyPartitionSignature = "";

  constructor(private params: PinnedRowsRendererParams) {
    this.top = this.createBand("top");
    this.bottom = this.createBand("bottom");
    this.params.root.insertBefore(this.top.root, this.params.body);
    this.params.body.insertAdjacentElement("afterend", this.bottom.root);
  }

  getInteractionRoots(): HTMLDivElement[] {
    return [this.top.root, this.bottom.root];
  }

  setPinnedTopRowData(rows: any[]): void {
    this.params.core.setPinnedRowOptions({ pinnedTopRowData: rows ?? [] });
    this.render(this.lastScrollTop, true);
  }

  setPinnedBottomRowData(rows: any[]): void {
    this.params.core.setPinnedRowOptions({ pinnedBottomRowData: rows ?? [] });
    this.render(this.lastScrollTop, true);
  }

  setRowPinned(rowId: string, position: RowPinnedPosition | null): void {
    if (position) this.manualPinned.set(rowId, position);
    else this.manualPinned.delete(rowId);
    this.render(this.lastScrollTop, true);
  }

  setOptions(options: {
    pinnedTopRowData?: any[];
    pinnedBottomRowData?: any[];
    isRowPinned?: import("../../interfaces/gridOptions").GridOptions["isRowPinned"];
    groupRowsSticky?: boolean;
  }): void {
    this.params.core.setPinnedRowOptions(options);
    this.render(this.lastScrollTop, true);
  }

  render(scrollTop = this.lastScrollTop, force = false): void {
    this.lastScrollTop = Math.max(0, scrollTop);
    const { top, bottom } = this.resolveRows(this.lastScrollTop);
    const topSignature = this.signature(top);
    const bottomSignature = this.signature(bottom);
    const heightChanged = top.length !== this.topCount || bottom.length !== this.bottomCount;

    if (force || topSignature !== this.topSignature) {
      this.renderBand(this.top, top);
      this.topSignature = topSignature;
    }
    if (force || bottomSignature !== this.bottomSignature) {
      this.renderBand(this.bottom, bottom);
      this.bottomSignature = bottomSignature;
    }
    this.params.core.setDisplayedPinnedRows(
      top.map(item => item.node),
      bottom.map(item => item.node),
    );
    const bodyPartitionSignature = [...top, ...bottom]
      .filter(item => item.node.viewIndex >= 0)
      .map(item => `${item.position}:${item.node.id}`)
      .join("|");
    if (bodyPartitionSignature !== this.bodyPartitionSignature) {
      this.bodyPartitionSignature = bodyPartitionSignature;
      this.params.onBodyPartitionChanged();
    }
    this.refreshSelectionStyles();
    this.updateLayout();
    this.topCount = top.length;
    this.bottomCount = bottom.length;
    if (heightChanged) this.params.onHeightChanged();
  }

  syncHorizontal(left: number, center: number, right: number): void {
    this.top.left.scrollLeft = left;
    this.bottom.left.scrollLeft = left;
    this.top.center.scrollLeft = center;
    this.bottom.center.scrollLeft = center;
    this.top.right.scrollLeft = right;
    this.bottom.right.scrollLeft = right;
  }

  updateLayout(): void {
    const model = this.params.core.getColumnModel();
    const leadingWidth = this.columnsWidth(model.getLeadingLeaves());
    const leftWidth = this.columnsWidth(model.getLeftLeaves());
    const centerWidth = this.columnsWidth(model.getCenterLeaves());
    const rightWidth = this.columnsWidth(model.getRightLeaves());
    const cap = this.params.root.clientWidth * 0.35;

    for (const band of [this.top, this.bottom]) {
      this.sizeSection(band.leading, band.leadingHost, leadingWidth, leadingWidth);
      band.centerHost.style.width = `${centerWidth}px`;
      band.centerHost.style.minWidth = `${centerWidth}px`;
      band.leading.style.display = leadingWidth > 0 ? "block" : "none";
      band.left.style.display = leftWidth > 0 ? "block" : "none";
      band.right.style.display = rightWidth > 0 ? "block" : "none";
    }
  }

  refreshSelectionStyles(): void {
    const active = this.params.core.options.highlightActiveCell
      ? this.params.core.getActiveCell()
      : null;
    for (const band of [this.top, this.bottom]) {
      band.root.querySelectorAll<HTMLElement>(".pte-cell").forEach(cell => {
        const row = cell.closest<HTMLElement>(".pte-row");
        const rowIndex = Number(row?.dataset.viewIdx);
        const colIndex = Number(cell.dataset.colIdx);
        const rowPinned = row?.dataset.rowPinned;
        cell.classList.toggle(
          "pte-active-cell",
          !!active
          && active.rowPinned === rowPinned
          && active.row === rowIndex
          && active.colIdx === colIndex,
        );
      });
    }
  }

  ensureCellVisible(position: RowPinnedPosition, rowIndex: number): void {
    const band = position === "top" ? this.top : this.bottom;
    const rowTop = rowIndex * this.params.rowHeight();
    const rowBottom = rowTop + this.params.rowHeight();
    const viewportHeight = band.center.clientHeight;
    if (rowTop < band.center.scrollTop) {
      this.syncBandVertical(band, band.center, rowTop);
    } else if (rowBottom > band.center.scrollTop + viewportHeight) {
      this.syncBandVertical(band, band.center, rowBottom - viewportHeight);
    }
  }

  destroy(): void {
    this.destroyRendererMaps(this.topRendererMaps);
    this.destroyRendererMaps(this.bottomRendererMaps);
    this.top.root.remove();
    this.bottom.root.remove();
    this.params.core.setDisplayedPinnedRows([], []);
    this.manualPinned.clear();
  }

  private createBand(position: RowPinnedPosition): BandElements {
    const root = document.createElement("div");
    root.className = `pte-pinned-rows pte-pinned-rows-${position}`;
    root.dataset.pinned = position;

    const section = (name: string) => {
      const outer = document.createElement("div");
      outer.className = `pte-pinned-rows-${name}`;
      const host = document.createElement("div");
      host.className = "pte-pinned-rows-host";
      outer.appendChild(host);
      root.appendChild(outer);
      return { outer, host };
    };
    const leading = section("leading");
    const left = section("left");
    const center = section("center");
    const right = section("right");
    const vertical = document.createElement("div");
    vertical.className = "pte-pinned-rows-vertical";
    const verticalScroller = document.createElement("div");
    verticalScroller.className = "pte-pinned-rows-vertical-scroller";
    vertical.appendChild(verticalScroller);
    root.appendChild(vertical);

    const band: BandElements = {
      root,
      leading: leading.outer,
      left: left.outer,
      center: center.outer,
      right: right.outer,
      leadingHost: leading.host,
      leftHost: left.host,
      centerHost: center.host,
      rightHost: right.host,
      vertical,
      verticalScroller,
    };
    for (const scroller of [band.leading, band.left, band.center, band.right, band.vertical]) {
      scroller.addEventListener("scroll", () => this.syncBandVertical(band, scroller));
    }
    return band;
  }

  private resolveRows(scrollTop: number): {
    top: RenderedPinnedRow[];
    bottom: RenderedPinnedRow[];
  } {
    const top = this.dataRows(this.params.core.options.pinnedTopRowData, "top");
    const bottom = this.dataRows(this.params.core.options.pinnedBottomRowData, "bottom");
    const topIds = new Set(top.map(item => item.node.id));
    const bottomIds = new Set(bottom.map(item => item.node.id));
    const model = this.params.core.getRowModel();
    const callback = this.params.core.options.isRowPinned;

    for (let index = 0; index < model.getViewCount(); index++) {
      const source = model.getRowNodeAtViewIndex(index);
      if (!source) continue;
      const position = this.manualPinned.get(source.id) ?? callback?.({
        node: source,
        data: source.data,
        rowId: source.id,
        rowIndex: index,
        isGroup: !!source.isGroup,
      });
      if (!position) continue;
      const target = position === "top" ? top : bottom;
      const ids = position === "top" ? topIds : bottomIds;
      if (ids.has(source.id)) continue;
      target.push({ node: { ...source, rowPinned: position }, position });
      ids.add(source.id);
    }

    if (this.params.core.options.groupRowsSticky && model.getType() === "clientSide") {
      for (const source of this.stickyAncestors(scrollTop)) {
        if (topIds.has(source.id)) continue;
        top.push({ node: { ...source, rowPinned: "top" }, position: "top" });
        topIds.add(source.id);
      }
    }
    return { top, bottom };
  }

  private dataRows(rows: any[], position: RowPinnedPosition): RenderedPinnedRow[] {
    return (rows ?? []).map((data, index) => ({
      position,
      node: {
        id: this.pinnedDataId(data, position, index),
        data,
        viewIndex: -1,
        selected: false,
        type: "leaf",
        level: 0,
        isGroup: false,
        isExpanded: false,
        rowPinned: position,
      },
    }));
  }

  private pinnedDataId(data: any, position: RowPinnedPosition, index: number): string {
    const configured = this.params.core.options.getRowId?.(data)
      ?? (this.params.core.options.rowIdKey ? data?.[this.params.core.options.rowIdKey] : undefined);
    if (configured != null) return `p:${position}:${String(configured)}`;
    if (data && typeof data === "object") {
      let id = this.dataIds.get(data);
      if (!id) {
        id = String(++this.dataSequence);
        this.dataIds.set(data, id);
      }
      return `p:${position}:${id}`;
    }
    return `p:${position}:${index}:${String(data)}`;
  }

  private stickyAncestors(scrollTop: number): IRowNode[] {
    const model = this.params.core.getRowModel();
    const rowHeight = Math.max(1, this.params.rowHeight());
    const total = model.getViewCount();
    if (total === 0) return [];

    // Resolve against the first row *below* the sticky stack, not merely the first row at the
    // physical viewport top. This is a small fixed-point calculation because discovering one sticky
    // ancestor moves that content boundary down by one row, which may reveal the next group level.
    // For Region → Country, scrolling the Region header by 1px therefore resolves both headers in
    // the same frame instead of waiting for Country to travel underneath Region and reach y=0.
    let stackHeightRows = 0;
    let previousSignature = "";
    let resolved: IRowNode[] = [];
    const maxPasses = Math.min(total + 1, 64);

    for (let pass = 0; pass < maxPasses; pass++) {
      const contentEdge = scrollTop + stackHeightRows * rowHeight;
      const index = Math.min(total - 1, Math.max(0, Math.floor(contentEdge / rowHeight)));
      const current = model.getRowNodeAtViewIndex(index);
      if (!current) return resolved;

      const chain: IRowNode[] = [];
      let parentId = current.parentId;
      while (parentId) {
        const parent = model.getRowNode(parentId);
        if (!parent || (!parent.isGroup && !parent.isTreeData)) break;
        chain.push(parent);
        parentId = parent.parentId;
      }
      chain.reverse();

      // A group joins the stack once its natural row edge has crossed the content edge below its
      // already-resolved ancestors. Strict '<' keeps the unscrolled first group in its natural row.
      const ancestorEdge = scrollTop + chain.length * rowHeight;
      if ((current.isGroup || current.isTreeData)
        && current.children?.length
        && index * rowHeight < ancestorEdge) chain.push(current);

      const signature = chain.map(node => node.id).join("|");
      resolved = chain;
      if (signature === previousSignature) break;
      previousSignature = signature;
      stackHeightRows = chain.length;
    }
    return resolved;
  }

  private signature(rows: RenderedPinnedRow[]): string {
    return rows.map(({ node }) =>
      `${node.id}:${node.isExpanded ? 1 : 0}:${node.childCount ?? ""}:${node.level}:${node.rowPinned}`
    ).join("|");
  }

  private renderBand(band: BandElements, rows: RenderedPinnedRow[]): void {
    this.destroyRendererMaps(this.mapsFor(band));
    band.leadingHost.replaceChildren();
    band.leftHost.replaceChildren();
    band.centerHost.replaceChildren();
    band.rightHost.replaceChildren();
    band.root.style.display = rows.length > 0 ? "flex" : "none";
    const rowHeight = this.params.rowHeight();
    const contentHeight = rows.length * rowHeight;
    const gridHeight = this.params.root.clientHeight;
    // Keep enough central body visible even when an application pins many rows. Top and bottom
    // each get at most 30% of the grid and then scroll independently. In non-layout test/SSR-like
    // environments clientHeight may be zero; leave the band uncapped there.
    const maxHeight = gridHeight > 0
      ? Math.max(rowHeight, Math.floor(gridHeight * 0.3))
      : contentHeight;
    const viewportHeight = Math.min(contentHeight, maxHeight);
    const overflows = contentHeight > viewportHeight;
    band.root.style.height = `${viewportHeight}px`;
    for (const section of [band.leading, band.left, band.center, band.right, band.vertical]) {
      section.style.height = `${viewportHeight}px`;
    }
    band.verticalScroller.style.height = `${contentHeight}px`;
    band.vertical.classList.toggle("scrollable", overflows);
    band.vertical.style.pointerEvents = overflows ? "auto" : "none";
    if (!overflows) this.syncBandVertical(band, band.vertical, 0);

    rows.forEach(({ node, position }, rowIndex) => {
      this.renderRow(band, node, position, rowIndex);
    });
  }

  private renderRow(
    band: BandElements,
    row: IRowNode,
    position: RowPinnedPosition,
    rowIndex: number,
  ): void {
    const rendererMap = new Map<string, RendererRecord>();
    this.mapsFor(band).add(rendererMap);
    const model = this.params.core.getColumnModel();
    const leading = this.createSectionRow(band.leadingHost, row, position, rowIndex);
    const left = this.createSectionRow(band.leftHost, row, position, rowIndex);
    const center = this.createSectionRow(band.centerHost, row, position, rowIndex);
    const right = this.createSectionRow(band.rightHost, row, position, rowIndex);

    if (!this.params.core.options.treeData
      && row.isGroup
      && this.params.core.options.groupDisplayType === "groupRows") {
      const cell = document.createElement("div");
      cell.className = "pte-cell pte-full-width-cell pte-group-cell";
      cell.dataset.colIdx = String(model.getLeadingLeaves().length);
      cell.style.display = "flex";
      cell.style.width = `${this.columnsWidth(model.getCenterLeaves())}px`;
      center.appendChild(cell);
      center.classList.add("pte-full-width-row");
      this.params.bodyCellRenderer.renderFullWidthCell(cell, row, rendererMap, row.viewIndex, 0);
      this.applyActiveCell(center, rowIndex, position);
      return;
    }

    this.renderCells(leading, model.getLeadingLeaves(), row, rendererMap, rowIndex, position);
    this.renderCells(left, model.getLeftLeaves(), row, rendererMap, rowIndex, position);
    this.renderCells(center, model.getCenterLeaves(), row, rendererMap, rowIndex, position);
    this.renderCells(right, model.getRightLeaves(), row, rendererMap, rowIndex, position);
  }

  private createSectionRow(
    host: HTMLDivElement,
    row: IRowNode,
    position: RowPinnedPosition,
    rowIndex: number,
  ): HTMLDivElement {
    const element = document.createElement("div");
    element.className = "pte-row pte-pinned-row";
    element.style.height = `${this.params.rowHeight()}px`;
    element.setAttribute("row-id", row.id);
    element.dataset.rowId = row.id;
    element.dataset.pinned = position;
    element.dataset.rowPinned = position;
    element.dataset.viewIdx = String(rowIndex);
    if (row.isGroup) {
      element.classList.add("pte-group-row");
      element.dataset.groupId = row.id;
    }
    const { getRowClass, getRowStyle } = this.params.core.options;
    const callbackParams = {
      data: row.data,
      rowId: row.id,
      rowIndex: row.viewIndex,
      isGroup: !!row.isGroup,
      node: row,
      rowPinned: position,
    };
    if (getRowClass) applyDynamicClasses(element, getRowClass(callbackParams));
    if (getRowStyle) applyDynamicStyles(element, getRowStyle(callbackParams));
    host.appendChild(element);
    return element;
  }

  private renderCells(
    rowElement: HTMLDivElement,
    columns: Column[],
    row: IRowNode,
    rendererMap: Map<string, RendererRecord>,
    rowIndex: number,
    position: RowPinnedPosition,
  ): void {
    let width = 0;
    for (const column of columns) {
      if (column.hidden) continue;
      const cell = document.createElement("div");
      cell.className = "pte-cell";
      cell.dataset.colId = column.instanceID;
      const meta = this.params.core.getColumnModel().leafColumnLookup.get(column.instanceID);
      if (meta) cell.dataset.colIdx = String(meta.globalIndex);
      cell.style.flex = "0 0 auto";
      cell.style.width = `${column.computedWidth}px`;
      if (column.isComputableType()) cell.classList.add("pte-cell-right-aligned");
      if (column.isRowNumberColumn()) cell.classList.add("pte-row-number-cell");
      rowElement.appendChild(cell);
      this.params.bodyCellRenderer.renderCell(cell, row, column, rendererMap, row.viewIndex, 0);
      if (column.isRowNumberColumn()) cell.textContent = "";
      width += column.computedWidth;
    }
    rowElement.style.width = `${width}px`;
    this.applyActiveCell(rowElement, rowIndex, position);
  }

  private applyActiveCell(
    rowElement: HTMLDivElement,
    rowIndex: number,
    position: RowPinnedPosition,
  ): void {
    const active = this.params.core.options.highlightActiveCell
      ? this.params.core.getActiveCell()
      : null;
    rowElement.querySelectorAll<HTMLElement>(".pte-cell").forEach(cell => {
      cell.classList.toggle(
        "pte-active-cell",
        !!active
        && active.rowPinned === position
        && active.row === rowIndex
        && Number(cell.dataset.colIdx) === active.colIdx,
      );
    });
  }

  private columnsWidth(columns: Column[]): number {
    return columns.reduce((sum, column) => sum + (column.hidden ? 0 : column.computedWidth), 0);
  }

  private sizeSection(
    section: HTMLDivElement,
    host: HTMLDivElement,
    visibleWidth: number,
    contentWidth: number,
  ): void {
    section.style.width = `${visibleWidth}px`;
    section.style.minWidth = `${visibleWidth}px`;
    section.style.maxWidth = `${visibleWidth}px`;
    host.style.width = `${contentWidth}px`;
    host.style.minWidth = `${contentWidth}px`;
  }

  private syncBandVertical(
    band: BandElements,
    source: HTMLDivElement,
    explicitScrollTop?: number,
  ): void {
    const scrollTop = explicitScrollTop ?? source.scrollTop;
    for (const target of [band.leading, band.left, band.center, band.right, band.vertical]) {
      if (target !== source && target.scrollTop !== scrollTop) target.scrollTop = scrollTop;
    }
  }

  private mapsFor(band: BandElements): Set<Map<string, RendererRecord>> {
    if (band === this.top) return this.topRendererMaps;
    return this.bottomRendererMaps;
  }

  private destroyRendererMaps(maps: Set<Map<string, RendererRecord>>): void {
    for (const map of maps) {
      for (const record of map.values()) record.runtime.destroy();
      map.clear();
    }
    maps.clear();
  }
}
