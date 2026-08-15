import { GridCore } from "../../core/core";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { IRowNode } from "../../interfaces/iRowNode";
import type { RowPinnedPosition } from "../../interfaces/gridOptions";
import type { Column } from "../../column/column";
import type { RendererRecord } from "../renderer";
import { BodyCellRenderer } from "../body/cellRenderer";
import { applyDynamicClasses, applyDynamicStyles } from "../body/dynamicStyle";
import type { RowPresentation } from "../../interfaces/gridOptions";
import {
  mergeClassValues,
  mergeStyleValues,
  resolveRowPresentation,
} from "../body/rowPresentation";
import {
  ActiveDescendantTracker, markPresentational, setAriaSelected, stampGridCellAria, stampRowHierarchyAria, stitchAriaRow,
} from "../aria";

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
  activeDescendant: ActiveDescendantTracker;
  /** The body's non-scrolling frame. Bands sit either side of it and the sticky overlay hangs off
   * it — inside the scroller itself the overlay would scroll away with the rows it mirrors. */
  bodyFrame: HTMLDivElement;
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
  private bodyHasVerticalScrollbar = false;
  // Application-pinned rows only change through API/option/model events (which force-render), so
  // the O(rows) resolve is cached and scroll frames touch only the sticky overlay.
  private appRows: { top: RenderedPinnedRow[]; bottom: RenderedPinnedRow[] } | null = null;

  constructor(private params: PinnedRowsRendererParams) {
    this.top = this.createBand("top");
    this.bottom = this.createBand("bottom");
    this.sticky = this.createBand("sticky");
    this.params.root.insertBefore(this.top.root, this.params.bodyFrame);
    this.params.bodyFrame.insertAdjacentElement("afterend", this.bottom.root);
    this.params.bodyFrame.appendChild(this.sticky.root);
    // The overlay is not inside any grid scroller, so native wheel chaining would scroll the page.
    this.sticky.root.addEventListener("wheel", event => {
      if (!this.params.forwardWheel) return;
      event.preventDefault();
      this.params.forwardWheel(event.deltaX, event.deltaY);
    }, { passive: false });
  }

  getInteractionRoots(): HTMLDivElement[] {
    // The sticky overlay lives inside the body frame, so body-level listeners already cover it.
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
    if (!position) this.unpinDescendants(rowId);
    this.render(this.lastScrollTop, true);
  }

  // A band chain is one visual unit: derived ancestors exist only as context for a pinned
  // descendant, so unpinning any row of the chain also unpins the pinned descendants beneath it —
  // otherwise "Unpin" on a derived ancestor would be a no-op (the descendant would immediately
  // re-derive it). Rows a live isRowPinned callback still pins re-derive their chain; the callback
  // owns those.
  private unpinDescendants(rowId: string): void {
    const model = this.params.core.getRowModel();
    const callback = this.params.core.options.isRowPinned;
    for (const [id, position] of Array.from(this.manualPinned)) {
      if (id === rowId || !position) continue;
      const node = model.getRowNode(id);
      if (!node || !this.hasAncestor(node, rowId)) continue;
      if (callback) this.manualPinned.set(id, null);
      else this.manualPinned.delete(id);
    }
  }

  private hasAncestor(node: IRowNode, ancestorId: string): boolean {
    const model = this.params.core.getRowModel();
    let parentId = node.parentId;
    while (parentId) {
      if (parentId === ancestorId) return true;
      parentId = model.getRowNode(parentId)?.parentId;
    }
    return false;
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

  setBodyVerticalScrollbarVisible(visible: boolean): void {
    this.bodyHasVerticalScrollbar = visible;
    for (const band of [this.top, this.bottom, this.sticky]) {
      this.updateVerticalScrollbarLane(band);
    }
  }

  updateLayout(): void {
    const model = this.params.core.getColumnModel();
    const leadingWidth = this.columnsWidth(model.getLeadingLeaves());
    const leftWidth = this.columnsWidth(model.getLeftLeaves());
    const centerWidth = this.columnsWidth(model.getCenterLeaves());
    const rightWidth = this.columnsWidth(model.getRightLeaves());
    // Band sections carry the same constraints as the body scrollers: left/right clamp to 35% of
    // the grid and scroll horizontally in sync beyond that. The +1 covers the section's 1px border
    // (border-box), matching the headers and aggregates. In non-layout test/SSR environments
    // clientWidth is 0; leave the sections unclamped there.
    const rootWidth = this.params.root.clientWidth;
    const cap = rootWidth > 0 ? rootWidth * 0.35 : Infinity;
    const sectionWidth = (contentWidth: number, clamped: boolean) =>
      contentWidth > 0 ? Math.min(contentWidth + 1, clamped ? cap : Infinity) : 0;

    for (const band of [this.top, this.bottom, this.sticky]) {
      // Sections are sized explicitly: sticky overlay rows are absolutely positioned, so they
      // contribute no intrinsic width to their host and flex auto-sizing would collapse them.
      this.sizeSection(band.leading, band.leadingHost, sectionWidth(leadingWidth, false), leadingWidth);
      this.sizeSection(band.left, band.leftHost, sectionWidth(leftWidth, true), leftWidth);
      this.sizeSection(band.right, band.rightHost, sectionWidth(rightWidth, true), rightWidth);
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
      // The band cell holding focus, claimed as the root's aria-activedescendant below. Like the
      // body pool, a band releases only the pointer it still owns, so whichever of the two
      // renderers repaints second cannot clobber the other's claim.
      let focusedCellEl: HTMLElement | null = null;
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
        if (isActive) focusedCellEl = cell;
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
      if (focusedCellEl) this.params.activeDescendant.claim(focusedCellEl, band);
      else this.params.activeDescendant.release(band);
    }

    // Sticky mirrors cover their live body rows (even at rest), so range/column/focus styling must
    // appear on the mirror too or the covered body copy's would be invisible. Mirrors carry the
    // row's real view index and no rowPinned tag — body-range coordinates match directly.
    //
    // The mirror never claims aria-activedescendant: the whole sticky band is aria-hidden (it is a
    // second copy of a row the body pool still exposes), so naming a cell inside it would point AT
    // at a node that is not in the accessibility tree. The body copy's own paint claims it.
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
    // ARIA mirrors the paint, same rule as the body pool. Band cells carry no row-level selected
    // state because bands paint none: a band cell is selected only via a range or a column.
    setAriaSelected(cell, state.selected, cell.classList.contains("selected"));
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
    // ARIA: sticky bands mirror live body rows — the body copy stays exposed, so
    // the whole mirror is hidden from AT to avoid double announcement. Pinned bands hold the
    // only copy of their rows; their wrapper machinery is presentational and renderRow
    // stitches each row like the body pool does.
    if (kind === "sticky") {
      root.setAttribute("aria-hidden", "true");
    } else {
      markPresentational(
        root,
        leading.outer, left.outer, center.outer, right.outer,
        leading.host, left.host, center.host, right.host,
      );
      vertical.setAttribute("aria-hidden", "true");
    }
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
        // A pinned row carries its hierarchy context: every group/tree ancestor force-pins into the
        // same band, directly above it (derived here, never stored — unpinning the row releases
        // them). View-order iteration keeps shared ancestors above their first pinned descendant.
        for (const ancestor of this.parentChainOf(source)) {
          if (ancestor.id === source.id || ids.has(ancestor.id)) continue;
          target.push({ node: { ...ancestor, rowPinned: position }, position });
          ids.add(ancestor.id);
        }
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
      // A server-side edge slot may not be loaded yet; its ancestor chain is still resolvable
      // through the model's segment index (ancestors are always loaded before descendants).
      const edgeRow = model.getRowNodeAtViewIndex(edgeIndex);
      const chain = edgeRow ? this.parentChainOf(edgeRow) : this.ancestorChainAt(edgeIndex);
      const anchor = chain[depth];
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
    const node = model.getRowNodeAtViewIndex(viewIndex);
    if (!node) {
      // Unloaded server-side slot: every chain entry is an ancestor above it.
      return this.ancestorChainAt(viewIndex).length * this.params.rowHeight();
    }
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
   * parents that actually own children. Server-side group nodes never materialize a `children`
   * array (their children live in lazy blocks), so a group without one still counts. */
  private isStickyParent(node: IRowNode): boolean {
    if (node.isGroup) return node.children ? node.children.length > 0 : true;
    return !!node.isTreeData && !!node.children?.length;
  }

  /** Sticky-parent chain for a view slot whose row may not be loaded: the model resolves the
   * owning listing's ancestor group nodes from its store metadata. Empty on models without the
   * lookup (client-side, where every visible row is materialized anyway). */
  private ancestorChainAt(viewIndex: number): IRowNode[] {
    const model = this.params.core.getRowModel();
    const chain = model.getAncestorChainAtViewIndex?.(viewIndex) ?? [];
    return chain.filter(node => this.isStickyParent(node));
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

  /** View index of the anchor's last visible descendant (its own index when it has none). The
   * server-side model answers from its flattened spans (its rows may not be loaded, which would
   * derail a row scan); otherwise a parent's visible block is contiguous, so the membership
   * predicate is binary-searchable. */
  private lastDescendantIndex(anchor: IRowNode, depth: number, total: number): number {
    const model = this.params.core.getRowModel();
    const spanEnd = model.getSubtreeEndViewIndex?.(anchor.id);
    if (spanEnd != null) {
      return Math.min(Math.max(spanEnd, anchor.viewIndex), total - 1);
    }
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
      this.clearBandDescriptions(this.sticky);
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
    this.clearBandDescriptions(band);
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
    this.updateVerticalScrollbarLane(band);
    band.vertical.style.pointerEvents = overflows ? "auto" : "none";
    if (!overflows) this.syncBandVertical(band, band.vertical, 0);

    rows.forEach(({ node, position }, rowIndex) => {
      this.renderRow(band, node, position, rowIndex);
    });
  }

  private updateVerticalScrollbarLane(band: BandElements): void {
    // Application-pinned bands retain the lane when they need their own scrollbar. Otherwise all
    // pinned/sticky sections mirror the central body's live scrollbar visibility.
    const visible = this.bodyHasVerticalScrollbar || band.vertical.classList.contains("scrollable");
    band.vertical.classList.toggle("visible", visible);
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
    const rowPresentation = resolveRowPresentation(
      this.params.core, row, row.viewIndex, pinned ?? undefined,
    );
    const leading = this.createSectionRow(band.leadingHost, row, pinned, rowIndex, rowPresentation);
    const left = this.createSectionRow(band.leftHost, row, pinned, rowIndex, rowPresentation);
    const center = this.createSectionRow(band.centerHost, row, pinned, rowIndex, rowPresentation);
    const right = this.createSectionRow(band.rightHost, row, pinned, rowIndex, rowPresentation);

    if (!this.params.core.options.treeData
      && row.isGroup
      && this.params.core.options.groupDisplayType === "groupRows") {
      const cell = document.createElement("div");
      cell.className = "pte-cell pte-full-width-cell pte-group-cell";
      cell.dataset.colIdx = String(model.getLeadingLeaves().length);
      cell.style.display = "flex";
      cell.style.width = `${this.columnsWidth(model.getCenterLeaves())}px`;
      stampGridCellAria(cell);
      cell.setAttribute("aria-colindex", "1");
      cell.setAttribute("aria-colspan", String(model.leafColumnLookup.size));
      center.appendChild(cell);
      center.classList.add("pte-full-width-row");
      this.params.bodyCellRenderer.renderFullWidthCell(
        cell, row, rendererMap, row.viewIndex, 0, rowPresentation,
      );
      this.stitchBandRowAria(band, leading, left, center, right, pinned, rowIndex, row, rowPresentation);
      return;
    }

    this.renderCells(leading, model.getLeadingLeaves(), row, rendererMap, rowIndex, pinned, rowPresentation);
    this.renderCells(left, model.getLeftLeaves(), row, rendererMap, rowIndex, pinned, rowPresentation);
    this.renderCells(center, model.getCenterLeaves(), row, rendererMap, rowIndex, pinned, rowPresentation);
    this.renderCells(right, model.getRightLeaves(), row, rendererMap, rowIndex, pinned, rowPresentation);
    this.stitchBandRowAria(band, leading, left, center, right, pinned, rowIndex, row, rowPresentation);
  }

  // ARIA: band rows are stitched like body pool rows — center fragment is THE row,
  // owning every section's cells in visual order. Band rows carry no aria-rowindex: they sit
  // outside the view sequence and show a blank row number by design. Bands are rebuilt from
  // scratch on each render, so creation-time stamping stays correct.
  private stitchBandRowAria(
    band: BandElements,
    leading: HTMLDivElement,
    left: HTMLDivElement,
    center: HTMLDivElement,
    right: HTMLDivElement,
    pinned: RowPinnedPosition | null,
    rowIndex: number,
    row: IRowNode,
    rowPresentation?: RowPresentation,
  ): void {
    markPresentational(leading, left, right);
    const cells = [
      ...leading.children, ...left.children, ...center.children, ...right.children,
    ] as HTMLElement[];
    stitchAriaRow(center, cells, `${this.params.core.id}-${pinned ?? "sticky"}${rowIndex}`);
    stampRowHierarchyAria(center, row);
    const description = rowPresentation?.accessibility?.description;
    if (description != null && String(description).length > 0) {
      const descriptionEl = document.createElement("span");
      descriptionEl.className = "pte-row-description";
      descriptionEl.id = `${this.params.core.id}-${pinned ?? "sticky"}${rowIndex}-description`;
      descriptionEl.hidden = true;
      descriptionEl.textContent = String(description);
      // Keep the description outside section hosts: their child indexes are used to position
      // sticky rows and must contain rows only.
      band.root.appendChild(descriptionEl);
      center.setAttribute("aria-describedby", descriptionEl.id);
    }
    if (rowPresentation?.accessibility?.busy) center.setAttribute("aria-busy", "true");
  }

  private clearBandDescriptions(band: BandElements): void {
    for (const element of band.root.querySelectorAll(".pte-row-description")) element.remove();
  }

  private createSectionRow(
    host: HTMLDivElement,
    row: IRowNode,
    pinned: RowPinnedPosition | null,
    rowIndex: number,
    rowPresentation?: RowPresentation,
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
    applyDynamicClasses(element, mergeClassValues(
      getRowClass ? getRowClass(callbackParams) : null,
      rowPresentation?.rowClass,
    ));
    applyDynamicStyles(element, mergeStyleValues(
      getRowStyle ? getRowStyle(callbackParams) : null,
      rowPresentation?.rowStyle,
    ));
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
    rowPresentation?: RowPresentation,
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
      stampGridCellAria(cell, meta?.globalIndex);
      cell.style.flex = "0 0 auto";
      cell.style.width = `${column.computedWidth}px`;
      if (column.isComputableType()) cell.classList.add("pte-cell-right-aligned");
      if (column.isRowNumberColumn()) cell.classList.add("pte-row-number-cell");
      if (column.isSelectionCheckboxColumn()) cell.classList.add("pte-checkbox-cell");
      rowElement.appendChild(cell);
      this.params.bodyCellRenderer.renderCell(
        cell, row, column, rendererMap, row.viewIndex, rowNumber, "data", rowPresentation,
      );
      if (pinned && column.isRowNumberColumn()) cell.textContent = "";
      if (pinned && column.isSelectionCheckboxColumn()) cell.textContent = "";
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
    sectionWidth: number,
    contentWidth: number,
  ): void {
    section.style.width = `${sectionWidth}px`;
    section.style.minWidth = `${sectionWidth}px`;
    section.style.maxWidth = `${sectionWidth}px`;
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
