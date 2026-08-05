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

/** One sticky ancestor with its viewport-relative y position (px below the body top; negative while
 * sliding out above it). */
interface StickyStackRow {
  node: IRowNode;
  top: number;
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
  /** Scroll the grid body by a wheel delta. The sticky overlay covers real body rows even at rest,
   * so wheel gestures over it must keep scrolling the grid as if the overlay were not there. */
  forwardWheel?: (deltaX: number, deltaY: number) => void;
}

/**
 * Two distinct mechanisms share this renderer because they share row markup and section layout:
 *
 * - Application-pinned rows (pinnedTopRowData / isRowPinned / api.setRowPinned) render in top and
 *   bottom bands that push the body viewport. Model-backed pinned rows leave the body's paint
 *   partition; their membership only changes through explicit API/option calls, never mid-scroll,
 *   so the resulting reflow is a deliberate one-off.
 * - Sticky group ancestors render in an absolutely-positioned overlay on top of the body. The
 *   original rows stay in the body flow and scroll beneath it, so the overlay never affects layout:
 *   a chain change repaints only the overlay, and an incoming sibling header pushes the outgoing
 *   one out with a per-frame translate (true position:sticky semantics). This is what keeps the
 *   body free of row-height jumps when a group row converts to pinned during scrolling.
 *
 * Both reuse BodyCellRenderer, so formatting, hierarchy labels, aggregates, and custom renderers
 * stay consistent with the body.
 */
export class PinnedRowsRenderer implements PinnedRowsController {
  private readonly top: BandElements;
  private readonly bottom: BandElements;
  private readonly sticky: BandElements;
  // Explicit per-row pin state set through the API/menu. A stored `null` is an explicit unpin
  // override: it wins over the isRowPinned callback, which would otherwise re-pin the row on the
  // next resolve. Without a callback there is nothing to override, so null just clears the entry.
  private readonly manualPinned = new Map<string, RowPinnedPosition | null>();
  private readonly topRendererMaps = new Set<Map<string, RendererRecord>>();
  private readonly bottomRendererMaps = new Set<Map<string, RendererRecord>>();
  private readonly stickyRendererMaps = new Set<Map<string, RendererRecord>>();
  private dataSequence = 0;
  private dataIds = new WeakMap<object, string>();
  private topSignature = "";
  private bottomSignature = "";
  private stickySignature = "";
  private lastScrollTop = 0;
  private topCount = 0;
  private bottomCount = 0;
  private bodyPartitionSignature = "";
  // Application-pinned rows only change through API/option/model events (which force-render), so
  // the O(rows) resolve is cached and scroll frames touch only the sticky overlay.
  private appRows: { top: RenderedPinnedRow[]; bottom: RenderedPinnedRow[] } | null = null;

  constructor(private params: PinnedRowsRendererParams) {
    this.top = this.createBand("top");
    this.bottom = this.createBand("bottom");
    this.sticky = this.createBand("sticky");
    this.params.root.insertBefore(this.top.root, this.params.body);
    this.params.body.insertAdjacentElement("afterend", this.bottom.root);
    this.params.body.appendChild(this.sticky.root);
    // The overlay is not inside any grid scroller, so native wheel chaining would scroll the page.
    this.sticky.root.addEventListener("wheel", event => {
      if (!this.params.forwardWheel) return;
      event.preventDefault();
      this.params.forwardWheel(event.deltaX, event.deltaY);
    }, { passive: false });
  }

  getInteractionRoots(): HTMLDivElement[] {
    // The sticky overlay lives inside the body, so body-level listeners already cover it.
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
    if (position || this.params.core.options.isRowPinned) this.manualPinned.set(rowId, position);
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
    if (force || !this.appRows) this.appRows = this.resolveAppRows();
    const { top, bottom } = this.appRows;
    const topSignature = this.signature(top.map(item => item.node));
    const bottomSignature = this.signature(bottom.map(item => item.node));
    const heightChanged = top.length !== this.topCount || bottom.length !== this.bottomCount;
    let bandsChanged = false;

    if (force || topSignature !== this.topSignature) {
      this.renderBand(this.top, top);
      this.topSignature = topSignature;
      bandsChanged = true;
    }
    if (force || bottomSignature !== this.bottomSignature) {
      this.renderBand(this.bottom, bottom);
      this.bottomSignature = bottomSignature;
      bandsChanged = true;
    }

    if (bandsChanged) {
      const bodyPinnedIds = new Set(
        [...top, ...bottom]
          .filter(item => item.node.viewIndex >= 0)
          .map(item => item.node.id),
      );
      this.params.core.setDisplayedPinnedRows(
        top.map(item => item.node),
        bottom.map(item => item.node),
        bodyPinnedIds,
      );
      const bodyPartitionSignature = [...top, ...bottom]
        .filter(item => item.node.viewIndex >= 0)
        .map(item => `${item.position}:${item.node.id}`)
        .join("|");
      if (bodyPartitionSignature !== this.bodyPartitionSignature) {
        this.bodyPartitionSignature = bodyPartitionSignature;
        this.params.onBodyPartitionChanged();
      }
    }

    const stickyChanged = this.renderStickyOverlay(this.computeStickyStack(this.lastScrollTop), force);
    if (bandsChanged || stickyChanged) {
      this.refreshSelectionStyles();
      this.updateLayout();
    }

    this.topCount = top.length;
    this.bottomCount = bottom.length;
    if (heightChanged) this.params.onHeightChanged();
  }

  syncHorizontal(left: number, center: number, right: number): void {
    for (const band of [this.top, this.bottom, this.sticky]) {
      band.left.scrollLeft = left;
      band.center.scrollLeft = center;
      band.right.scrollLeft = right;
    }
  }

  updateLayout(): void {
    const model = this.params.core.getColumnModel();
    const leadingWidth = this.columnsWidth(model.getLeadingLeaves());
    const leftWidth = this.columnsWidth(model.getLeftLeaves());
    const centerWidth = this.columnsWidth(model.getCenterLeaves());
    const rightWidth = this.columnsWidth(model.getRightLeaves());

    for (const band of [this.top, this.bottom, this.sticky]) {
      // Sections are sized explicitly: sticky overlay rows are absolutely positioned, so they
      // contribute no intrinsic width to their host and flex auto-sizing would collapse them.
      this.sizeSection(band.leading, band.leadingHost, leadingWidth, leadingWidth);
      this.sizeSection(band.left, band.leftHost, leftWidth, leftWidth);
      this.sizeSection(band.right, band.rightHost, rightWidth, rightWidth);
      band.centerHost.style.width = `${centerWidth}px`;
      band.centerHost.style.minWidth = `${centerWidth}px`;
      band.leading.style.display = leadingWidth > 0 ? "block" : "none";
      band.left.style.display = leftWidth > 0 ? "block" : "none";
      band.right.style.display = rightWidth > 0 ? "block" : "none";
    }
  }

  refreshSelectionStyles(): void {
    const core = this.params.core;
    const active = core.getActiveCell();
    const range = core.getSelectionRange();
    const highlight = !!core.options.highlightActiveCell;
    const leaves = core.getColumnModel().getLeaves();
    const selectedColumnIDs = core.getSelectedColumnIds();
    const colSelectedAt = (idx: number): boolean => {
      const col = leaves[idx];
      return !!col && selectedColumnIDs.has(col.instanceID);
    };
    const bodyRangeRows = !!range && range.rowEnd >= range.rowStart;

    // Pinned bands paint their segment of the unified range. The border box is open on the side
    // facing the body when the range continues there — the range is one contiguous selection, so
    // a band-edge border would read as two stacked rectangles at the seam.
    for (const { band, position } of [
      { band: this.top, position: "top" as const },
      { band: this.bottom, position: "bottom" as const },
    ]) {
      const segment = position === "top" ? range?.pinnedTop : range?.pinnedBottom;
      const continuesBelow = position === "top" && (bodyRangeRows || !!range?.pinnedBottom);
      const continuesAbove = position === "bottom" && (bodyRangeRows || !!range?.pinnedTop);
      const bandLastRow = core.getDisplayedPinnedRowCount(position) - 1;
      band.root.querySelectorAll<HTMLElement>(".pte-cell").forEach(cell => {
        const row = cell.closest<HTMLElement>(".pte-row");
        const rowIndex = Number(row?.dataset.viewIdx);
        const colIndex = Number(cell.dataset.colIdx);
        const rangeSelected = !!segment && !!range
          && rowIndex >= segment.start && rowIndex <= segment.end
          && colIndex >= range.colStart && colIndex <= range.colEnd;
        // A selected column runs through the bands too. Like the body, it draws no top border
        // (the run starts under the header) and closes at the grid's visual bottom — which is the
        // bottom band's last row when that band exists.
        const colSelected = colSelectedAt(colIndex);
        const selected = rangeSelected || colSelected;
        const isActive = !!active
          && active.rowPinned === position
          && active.row === rowIndex
          && active.colIdx === colIndex;
        this.applyCellSelectionClasses(cell, {
          selected,
          top: rangeSelected && rowIndex === segment!.start && !continuesAbove,
          bottom: rangeSelected
            ? rowIndex === segment!.end && !continuesBelow
            : colSelected && position === "bottom" && rowIndex === bandLastRow,
          left: rangeSelected
            ? colIndex === range!.colStart
            : colSelected && !colSelectedAt(colIndex - 1),
          right: rangeSelected
            ? colIndex === range!.colEnd
            : colSelected && !colSelectedAt(colIndex + 1),
          active: isActive && highlight,
        });
      });
    }

    // Sticky mirrors cover their live body rows (even at rest), so range/column/focus styling must
    // appear on the mirror too or the covered body copy's would be invisible. Mirrors carry the
    // row's real view index and no rowPinned tag — body-range coordinates match directly.
    this.sticky.root.querySelectorAll<HTMLElement>(".pte-cell").forEach(cell => {
      const row = cell.closest<HTMLElement>(".pte-row");
      const rowIndex = Number(row?.dataset.viewIdx);
      const colIndex = Number(cell.dataset.colIdx);
      const rangeSelected = !!range
        && rowIndex >= range.rowStart && rowIndex <= range.rowEnd
        && colIndex >= range.colStart && colIndex <= range.colEnd;
      const colSelected = colSelectedAt(colIndex);
      const selected = rangeSelected || colSelected;
      const isActive = !!active
        && !active.rowPinned
        && active.row === rowIndex
        && colIndex === active.colIdx;
      this.applyCellSelectionClasses(cell, {
        selected,
        top: rangeSelected && rowIndex === range!.rowStart && !range!.pinnedTop,
        bottom: rangeSelected && rowIndex === range!.rowEnd && !range!.pinnedBottom,
        left: rangeSelected
          ? colIndex === range!.colStart
          : colSelected && !colSelectedAt(colIndex - 1),
        right: rangeSelected
          ? colIndex === range!.colEnd
          : colSelected && !colSelectedAt(colIndex + 1),
        active: isActive && highlight,
      });
    });
  }

  private applyCellSelectionClasses(cell: HTMLElement, state: {
    selected: boolean;
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
    active: boolean;
  }): void {
    cell.classList.toggle("selected", state.selected);
    cell.classList.toggle("selected-top", state.top);
    cell.classList.toggle("selected-bottom", state.bottom);
    cell.classList.toggle("selected-left", state.left);
    cell.classList.toggle("selected-right", state.right);
    cell.classList.toggle("pte-active-cell", state.active);
  }

  /** The rendered cell element of a band row (any section), e.g. for mounting a cell editor. */
  findCellElement(position: RowPinnedPosition, rowIndex: number, colIdx: number): HTMLDivElement | null {
    const band = position === "top" ? this.top : this.bottom;
    return band.root.querySelector<HTMLDivElement>(
      `.pte-pinned-row[data-view-idx='${rowIndex}'] .pte-cell[data-col-idx='${colIdx}']`,
    );
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
    this.destroyRendererMaps(this.stickyRendererMaps);
    this.top.root.remove();
    this.bottom.root.remove();
    this.sticky.root.remove();
    this.params.core.setDisplayedPinnedRows([], []);
    this.manualPinned.clear();
  }

  private createBand(kind: RowPinnedPosition | "sticky"): BandElements {
    const root = document.createElement("div");
    if (kind === "sticky") {
      root.className = "pte-sticky-rows";
    } else {
      root.className = `pte-pinned-rows pte-pinned-rows-${kind}`;
      root.dataset.pinned = kind;
    }

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
    if (kind !== "sticky") {
      for (const scroller of [band.leading, band.left, band.center, band.right, band.vertical]) {
        scroller.addEventListener("scroll", () => this.syncBandVertical(band, scroller));
      }
    }
    return band;
  }

  // Band order keeps the application-supplied data rows on the outer edges and runtime-pinned
  // model rows (isRowPinned / setRowPinned) adjacent to the body:
  // pinnedTopRowData → model-pinned top → body → model-pinned bottom → pinnedBottomRowData.
  private resolveAppRows(): { top: RenderedPinnedRow[]; bottom: RenderedPinnedRow[] } {
    const top = this.dataRows(this.params.core.options.pinnedTopRowData, "top");
    const dataBottom = this.dataRows(this.params.core.options.pinnedBottomRowData, "bottom");
    const modelBottom: RenderedPinnedRow[] = [];
    const topIds = new Set(top.map(item => item.node.id));
    const bottomIds = new Set(dataBottom.map(item => item.node.id));
    const model = this.params.core.getRowModel();
    const callback = this.params.core.options.isRowPinned;

    if (callback || this.manualPinned.size > 0) {
      for (let index = 0; index < model.getViewCount(); index++) {
        const source = model.getRowNodeAtViewIndex(index);
        if (!source) continue;
        const position = this.manualPinned.has(source.id)
          ? this.manualPinned.get(source.id)
          : callback?.({
            node: source,
            data: source.data,
            rowId: source.id,
            rowIndex: index,
            isGroup: !!source.isGroup,
          });
        if (!position) continue;
        const target = position === "top" ? top : modelBottom;
        const ids = position === "top" ? topIds : bottomIds;
        if (ids.has(source.id)) continue;
        target.push({ node: { ...source, rowPinned: position }, position });
        ids.add(source.id);
      }
    }
    return { top, bottom: modelBottom.concat(dataBottom) };
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

  /**
   * Resolve the sticky ancestor stack for this scroll position with position:sticky semantics:
   * every row stays in the body flow, and each ancestor is clamped between its slot below the
   * already-resolved stack and its block's end (which is what slides it out behind its parent as
   * the next sibling arrives). Positions are compacted for application-pinned model rows, which
   * are the only rows removed from the body flow.
   *
   * A header docks the moment its top TOUCHES its slot — including at scrollTop 0, where the
   * chain's mirrors sit exactly over their pixel-identical body rows. Docking at rest is what
   * kills the last flicker: composited wheel scrolling presents frames before the main thread
   * runs, and if the band only appeared after the first scroll event, its first frame would show
   * the headers scrolled un-pinned and then snapping back. With the band always present, the
   * compositor scrolls the body beneath an overlay that never has to "appear".
   */
  private computeStickyStack(scrollTop: number): StickyStackRow[] {
    const core = this.params.core;
    if (!core.options.groupRowsSticky) return [];
    const model = core.getRowModel();
    if (model.getType() !== "clientSide") return [];
    const total = model.getViewCount();
    const rowHeight = Math.max(1, this.params.rowHeight());
    if (total === 0) return [];

    const stack: StickyStackRow[] = [];
    let bottom = 0;
    for (let depth = 0; depth < 64; depth++) {
      // The deepest row starting at or above the current stack bottom resolves this depth's
      // anchor: its depth-`depth` hierarchy parent is the last such header, which is exactly the
      // sticky candidate (an arriving sibling becomes the anchor the moment it touches the edge).
      const edgeIndex = this.lastRowTouching(scrollTop + bottom, total, rowHeight);
      if (edgeIndex < 0) break;
      const edgeRow = model.getRowNodeAtViewIndex(edgeIndex);
      const anchor = edgeRow ? this.parentChainOf(edgeRow)[depth] : undefined;
      if (!anchor) break;
      const natural = this.compactTop(anchor.viewIndex, rowHeight) - scrollTop;
      if (natural > bottom) break; // header still below the stack in the body — nothing deeper sticks
      const lastDescendant = this.lastDescendantIndex(anchor, depth, total);
      if (lastDescendant <= anchor.viewIndex) break; // collapsed/childless: scrolls away naturally
      const blockEnd = this.compactTop(lastDescendant, rowHeight) + rowHeight - scrollTop;
      const top = Math.min(bottom, blockEnd - rowHeight);
      if (top + rowHeight <= 0) break;
      stack.push({ node: anchor, top });
      bottom = top + rowHeight;
    }
    return stack;
  }

  /**
   * Height of the sticky ancestor chain that will sit docked above this row once it is scrolled
   * to the top — i.e. how far the effective viewport top is inset for it. Scrolling that leaves a
   * row underneath the overlay would hide it, so ensure-visible scrolling subtracts this. The
   * row's own slot is excluded: a parent row scrolled to its slot is represented by its docked
   * mirror (which carries the active-cell styling).
   */
  stickyClearance(viewIndex: number): number {
    const core = this.params.core;
    if (!core.options.groupRowsSticky) return 0;
    const model = core.getRowModel();
    if (model.getType() !== "clientSide") return 0;
    const node = model.getRowNodeAtViewIndex(viewIndex);
    if (!node) return 0;
    const chain = this.parentChainOf(node);
    const ancestors = chain.length > 0 && chain[chain.length - 1].id === node.id
      ? chain.length - 1
      : chain.length;
    return ancestors * this.params.rowHeight();
  }

  /** Body-flow top (px, content space) of a view row, compacted for application-pinned rows. */
  private compactTop(viewIndex: number, rowHeight: number): number {
    return (viewIndex - this.params.core.getBodyPinnedRowCountBefore(viewIndex)) * rowHeight;
  }

  /** Last view index whose compacted top is at or above `contentY`, or -1. Tops are monotone. */
  private lastRowTouching(contentY: number, total: number, rowHeight: number): number {
    let low = 0;
    let high = total - 1;
    let result = -1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (this.compactTop(middle, rowHeight) <= contentY) {
        result = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return result;
  }

  /** True for nodes that can hold a slot in the sticky stack: synthetic group rows and tree-data
   * parents that actually own children. */
  private isStickyParent(node: IRowNode): boolean {
    return (node.isGroup || !!node.isTreeData) && !!node.children?.length;
  }

  /** Root-first chain of the hierarchy parents a row sits under, including the row itself when it
   * is a parent. Depth position in this chain — not the node's `level`, which stays 0 for leaf
   * data rows — is what indexes the sticky stack. */
  private parentChainOf(node: IRowNode): IRowNode[] {
    const model = this.params.core.getRowModel();
    const chain: IRowNode[] = [];
    if (this.isStickyParent(node)) chain.push(node);
    let parentId = node.parentId;
    while (parentId) {
      const parent = model.getRowNode(parentId);
      if (!parent) break;
      if (this.isStickyParent(parent)) chain.push(parent);
      parentId = parent.parentId;
    }
    return chain.reverse();
  }

  /** View index of the anchor's last visible descendant (its own index when it has none). A
   * parent's visible block is contiguous, so the membership predicate is binary-searchable. */
  private lastDescendantIndex(anchor: IRowNode, depth: number, total: number): number {
    const model = this.params.core.getRowModel();
    let low = anchor.viewIndex + 1;
    let high = total - 1;
    let result = anchor.viewIndex;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const node = model.getRowNodeAtViewIndex(middle);
      if (node && this.parentChainOf(node)[depth]?.id === anchor.id) {
        result = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return result;
  }

  /** Repaint the overlay DOM when the chain changes; reposition rows and the clip height every
   * frame (cheap transform/height writes — this is what animates the push-out). Returns whether
   * the chain itself changed. */
  private renderStickyOverlay(stack: StickyStackRow[], force: boolean): boolean {
    const rowHeight = this.params.rowHeight();
    const signature = this.signature(stack.map(item => item.node));
    const changed = force || signature !== this.stickySignature;
    if (changed) {
      this.stickySignature = signature;
      this.destroyRendererMaps(this.stickyRendererMaps);
      this.sticky.leadingHost.replaceChildren();
      this.sticky.leftHost.replaceChildren();
      this.sticky.centerHost.replaceChildren();
      this.sticky.rightHost.replaceChildren();
      stack.forEach((item, index) => this.renderRow(this.sticky, item.node, null, index));
    }
    if (stack.length === 0) {
      this.sticky.root.style.display = "none";
      return changed;
    }
    this.sticky.root.style.display = "flex";
    const bottom = stack.reduce((max, item) => Math.max(max, item.top + rowHeight), 0);
    this.sticky.root.style.height = `${Math.max(0, bottom)}px`;
    const hosts = [
      this.sticky.leadingHost,
      this.sticky.leftHost,
      this.sticky.centerHost,
      this.sticky.rightHost,
    ];
    stack.forEach((item, index) => {
      for (const host of hosts) {
        const element = host.children[index] as HTMLElement | undefined;
        if (!element) continue;
        element.style.transform = `translateY(${item.top}px)`;
        // Ancestors paint above descendants so an outgoing header slides up behind its parent.
        element.style.zIndex = String(stack.length - index);
      }
    });
    return changed;
  }

  private signature(rows: IRowNode[]): string {
    return rows.map(node =>
      `${node.id}:${node.isExpanded ? 1 : 0}:${node.childCount ?? ""}:${node.level}:${node.rowPinned ?? ""}`
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
    pinned: RowPinnedPosition | null,
    rowIndex: number,
  ): void {
    const rendererMap = new Map<string, RendererRecord>();
    this.mapsFor(band).add(rendererMap);
    const model = this.params.core.getColumnModel();
    const leading = this.createSectionRow(band.leadingHost, row, pinned, rowIndex);
    const left = this.createSectionRow(band.leftHost, row, pinned, rowIndex);
    const center = this.createSectionRow(band.centerHost, row, pinned, rowIndex);
    const right = this.createSectionRow(band.rightHost, row, pinned, rowIndex);

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
      return;
    }

    this.renderCells(leading, model.getLeadingLeaves(), row, rendererMap, rowIndex, pinned);
    this.renderCells(left, model.getLeftLeaves(), row, rendererMap, rowIndex, pinned);
    this.renderCells(center, model.getCenterLeaves(), row, rendererMap, rowIndex, pinned);
    this.renderCells(right, model.getRightLeaves(), row, rendererMap, rowIndex, pinned);
  }

  private createSectionRow(
    host: HTMLDivElement,
    row: IRowNode,
    pinned: RowPinnedPosition | null,
    rowIndex: number,
  ): HTMLDivElement {
    const element = document.createElement("div");
    element.className = "pte-row pte-pinned-row";
    element.style.height = `${this.params.rowHeight()}px`;
    element.setAttribute("row-id", row.id);
    element.dataset.rowId = row.id;
    if (pinned) {
      element.dataset.pinned = pinned;
      element.dataset.rowPinned = pinned;
      element.dataset.viewIdx = String(rowIndex);
    } else {
      // Sticky mirrors are the live body row: interactions resolve against its real view index,
      // and the zebra stripe matches so docking never changes a single pixel of the row.
      element.classList.add("pte-sticky-row");
      element.dataset.viewIdx = String(row.viewIndex);
      if (this.params.core.options.zebraRows && row.viewIndex % 2 === 1) {
        element.classList.add("pte-row-alt");
      }
    }
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
      rowPinned: pinned ?? undefined,
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
    pinned: RowPinnedPosition | null,
  ): void {
    // Application-pinned rows live outside the view sequence and show a blank row number; a sticky
    // mirror shows its body row's real number so the header docks without its cells changing.
    const rowNumber = pinned ? 0 : this.params.core.getRowNumberForViewIndex(row.viewIndex);
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
      this.params.bodyCellRenderer.renderCell(cell, row, column, rendererMap, row.viewIndex, rowNumber);
      if (pinned && column.isRowNumberColumn()) cell.textContent = "";
      width += column.computedWidth;
    }
    rowElement.style.width = `${width}px`;
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
    // section.style.width = `${visibleWidth}px`;
    // section.style.minWidth = `${visibleWidth}px`;
    // section.style.maxWidth = `${visibleWidth}px`;
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
    if (band === this.sticky) return this.stickyRendererMaps;
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
