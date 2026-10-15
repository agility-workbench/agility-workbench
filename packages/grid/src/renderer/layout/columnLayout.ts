import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { RowPoolDef } from "../types";
import { rootContentWidth } from "./pinnedSectionLayout";

interface ColumnLayoutRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  bodyFrame: HTMLDivElement;
  rowPool: () => RowPoolDef[];
  leadingViewport: HTMLDivElement;
  leftViewport: HTMLDivElement;
  centerViewport: HTMLDivElement;
  rightViewport: HTMLDivElement;
  leadingSpacer: HTMLDivElement;
  leftSpacer: HTMLDivElement;
  /** The centre body section. With the left and right spacers, the boxes the scrollbar strip's
   * lanes scroll: a section needs its lane exactly when its content outgrows one of these. */
  centerSpacer: HTMLDivElement;
  rightSpacer: HTMLDivElement;
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
  updateVerticalScrollLayout?: () => void;
  updatePinnedRowsLayout?: () => void;
  /** Last step of a width pass, for what sizes itself from the sections just laid out: the user
   * full-width rows (centre viewport wide) and the ActionFrame popover over a moved cell. */
  afterColumnWidths?: () => void;
  /** The body scroller — the element that actually owns the vertical scrollbar being compensated
   * for. Read directly rather than modelled, so the compensation cannot disagree with the scrollbar
   * it is compensating for. */
  bodyScroller?: () => HTMLElement;
  /** Fallback for when the body has no scrollbar to measure. Optional so tests can pin it. */
  verticalScrollbarGutter?: () => number;
}

const VERTICAL_SCROLLBAR_GUTTER_WIDTH = 15;

let measuredGutter: number | null = null;
let gutterInvalidationBound = false;

/** Browser zoom changes a scrollbar's width in CSS pixels, so a value probed once at startup is
 * wrong for the rest of the session after a single Ctrl+/-. Zoom also resizes the viewport, so
 * dropping the cache on `resize` re-probes on the next layout pass — which the root ResizeObserver
 * already triggers. Bound lazily so importing this module stays side-effect-free under SSR. */
function bindGutterInvalidation(): void {
  if (gutterInvalidationBound || typeof window === "undefined") return;
  gutterInvalidationBound = true;
  window.addEventListener("resize", () => { measuredGutter = null; }, { passive: true });
}

/**
 * Platform scrollbar gutter, for the bootstrap case where no live grid scrollbar exists to read.
 * Returns 0 where scrollbars overlay content instead of consuming width — macOS by default, and
 * Linux desktops with overlay scrollbars enabled.
 *
 * `host` must be an element INSIDE the grid, and getting that wrong is not a detail. A scrollbar's
 * width depends on the rules matching its scroller, and the grid deliberately puts its own
 * scrollers in a different regime from the page around them: the armored `scrollbar-color` makes
 * Chromium discard `::-webkit-scrollbar` styling, so a host stylesheet's
 * `*::-webkit-scrollbar { width: 4px }` governs the page but NOT the grid. Probed on `document.body`
 * this returned the host's 4px while the grid's own scrollbar was the platform's 15px, and every
 * compensation came out 11px short. Probing inside the grid puts the probe under the same rules as
 * the scroller it stands in for.
 */
export function measureVerticalScrollbarGutter(host?: HTMLElement): number {
  bindGutterInvalidation();
  if (measuredGutter !== null) return measuredGutter;
  const parent = host?.isConnected ? host : document.body;
  if (!parent) return VERTICAL_SCROLLBAR_GUTTER_WIDTH;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;top:-9999px;width:50px;height:50px;overflow-y:scroll;visibility:hidden";
  parent.appendChild(probe);
  const outer = probe.offsetWidth;
  const gutter = outer - probe.clientWidth;
  probe.remove();
  // `outer` is 0 only when the probe was never laid out — a detached or display:none ancestor —
  // which is NOT the same as a scrollbar that consumes no width. Distinguishing them matters:
  // caching an unmeasurable 0 would strand the grid with no compensation until the next resize.
  if (outer === 0) return VERTICAL_SCROLLBAR_GUTTER_WIDTH;
  measuredGutter = gutter;
  return gutter;
}

/** Write an inline style only when it differs, so a layout pass with unchanged inputs writes
 * nothing — the resize path runs from a ResizeObserver, and a pass that rewrites what it reads
 * is how a ResizeObserver loop starts. */
function setStyle(el: HTMLElement, prop: "display" | "height" | "paddingRight" | "width", value: string): void {
  if (el.style[prop] !== value) el.style[prop] = value;
}

export class ColumnLayoutRenderer {
  private hasVerticalScrollbar = false;
  private rightSectionWidth = 0;
  /** Content width of each section as the last width pass laid it out, so the scrollbar strip can
   * be re-decided on a resize without walking the row pool again. */
  private sectionContentWidths = { leading: 0, left: 0, center: 0, right: 0 };
  private bodyFrameHeight: string | null = null;

  constructor(private params: ColumnLayoutRendererParams) {}

  setVerticalScrollbarVisible(visible: boolean): void {
    this.hasVerticalScrollbar = visible;
    this.applyVerticalScrollbarCompensation();
  }

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

    this.sectionContentWidths.leading = maxWidth;
    this.params.leadingViewport.style.width = `${maxWidth}px`;
    this.applyAggregateColumnWidths(this.params.aggregateLeadingCells(), this.params.core.getColumnModel().getLeadingLeaves(), colIDs);
    this.params.leadingSpacer.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.leadingSpacer.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.leadingHeader.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.leadingHeader.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.aggregateLeading.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.aggregateLeading.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    // Border pixel included, like the header and body boxes above, so the lanes after it start where
    // the sections after it start.
    this.params.hScrollLeadingParent.style.width = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.hScrollLeadingParent.style.minWidth = `${maxWidth > 0 ? maxWidth + 1 : 0}px`;
    this.params.hScrollLeadingParent.style.display = maxWidth > 0 ? "block" : "none";

    if (maxWidth > 0) {
      this.params.leadingSpacer.classList.add("visible");
      this.params.leadingHeader.classList.add("visible");
      this.params.aggregateLeading.style.display = "block";
    } else {
      this.params.leadingSpacer.classList.remove("visible");
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
    this.sectionContentWidths.left = maxWidth;
    this.params.leftViewport.style.width = `${maxWidth}px`;
    this.applyAggregateColumnWidths(this.params.aggregateLeftCells(), this.params.core.getColumnModel().getLeftLeaves(), colIDs);
    // Every pinned-left box — header, aggregate section, scrollbar lane — mirrors the body spacer:
    // the content width plus its 1px border as an inline `width`, and never a `min-width`. The 35%
    // clamp is a `max-width` that PinnedSectionLayoutRenderer reapplies on every root resize, and a
    // `min-width` would outrank it, leaving the header at full width while the body clamped.
    const sectionWidth = maxWidth > 0 ? maxWidth + 1 : 0;
    this.params.hScrollerLeft.style.width = `${sectionWidth}px`;
    this.params.hScrollLeftParent.style.display = maxWidth > 0 ? "block" : "none";
    this.params.leftHeader.style.width = `${sectionWidth}px`;
    this.params.aggregateLeft.style.width = `${sectionWidth}px`;
    this.params.hScrollLeftParent.style.width = `${sectionWidth}px`;
    if (maxWidth > 0) {
      this.params.leftSpacer.classList.add("visible");
      this.params.leftHeader.classList.add("visible");
      this.params.aggregateLeft.style.display = "block";
    } else {
      this.params.leftSpacer.classList.remove("visible");
      this.params.leftHeader.classList.remove("visible");
      this.params.aggregateLeft.style.display = "none";
    }
    return maxWidth;
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
    this.sectionContentWidths.center = maxWidth;
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
    this.sectionContentWidths.right = maxWidth;
    this.params.rightViewport.style.width = `${maxWidth}px`;
    this.applyAggregateColumnWidths(this.params.aggregateRightCells(), this.params.core.getColumnModel().getRightLeaves(), colIDs);
    // Same contract as the left side: inline `width` only, clamped live by the resize observer's
    // `max-width`. The header's extra vertical-scrollbar lane is added in
    // applyVerticalScrollbarCompensation, and its max-width carries the same lane on top of the cap.
    const sectionWidth = maxWidth > 0 ? maxWidth + 1 : 0;
    this.params.hScrollerRight.style.width = `${sectionWidth}px`;
    this.params.hScrollRightParent.style.display = maxWidth > 0 ? "block" : "none";
    this.params.hScrollRightParent.style.width = `${sectionWidth}px`;
    this.params.aggregateRight.style.width = `${sectionWidth}px`;
    this.rightSectionWidth = maxWidth;
    if (maxWidth > 0) {
      this.params.rightSpacer.classList.add("visible");
      this.params.rightHeader.classList.add("visible");
      this.params.aggregateRight.style.display = "block";
    } else {
      this.params.rightSpacer.classList.remove("visible");
      this.params.rightHeader.style.width = "0px";
      this.params.rightHeader.classList.remove("visible");
      this.params.aggregateRight.style.display = "none";
    }
    this.applyVerticalScrollbarCompensation();
    return maxWidth;
  }

  updateColumnWidths(colIDs: string[] = []) {
    this.applyLeadingColumnWidths(colIDs);
    this.applyLeftColumnWidths(colIDs);
    this.applyCenterColumnWidths(colIDs);
    this.applyRightColumnWidths(colIDs);

    // Header cells are looked up inside the header, never through `document`: in a shadow-root
    // mount `document.getElementById` cannot see the grid, and the header would keep its build-time
    // widths over a resized body.
    const headerCells = new Map<string, HTMLElement>();
    this.params.headerWrapper.querySelectorAll<HTMLElement>(".pte-hcell").forEach(el => {
      if (el.id && !headerCells.has(el.id)) headerCells.set(el.id, el);
    });
    this.params.core.getColumnModel().walkColumns(col => {
      if (!col.isVisible()) return;
      const hcell = headerCells.get(col.instanceID);
      if (hcell) hcell.style.width = `${col.computedWidth}px`;
    });

    this.updateScrollStrip();
    this.params.updateVerticalScrollLayout?.();
    this.params.updatePinnedRowsLayout?.();
    this.params.afterColumnWidths?.();
  }

  /**
   * Decide whether the horizontal scrollbar strip shows, and give the body frame what the header
   * and the strip leave over. Runs after every width pass AND on every root/body resize (the
   * grid's resize path), because both inputs change without the columns changing: a narrower root
   * makes the centre overflow, an open column panel takes width as root padding.
   *
   * The decision reads only boxes whose size does not depend on the strip's own display: each
   * section's content width against the body section that scrolls it (the body is always laid out),
   * and the total against the root's content box. Reading the strip's own lanes made the answer
   * flip on every call, since a hidden strip's lanes measure 0.
   *
   * Idempotent: with unchanged inputs it writes nothing, so a ResizeObserver re-entry after the
   * strip toggles (which changes the body height) settles in one pass.
   */
  updateScrollStrip(): void {
    const { leading, left, center, right } = this.sectionContentWidths;
    const root = this.params.root;
    // An unlaid-out root (detached, or a display:none ancestor) measures 0 everywhere; deciding
    // from that would just be noise. The observer re-runs this when the grid is revealed.
    if (root.clientWidth > 0) {
      const totalWidth = leading + left + center + right;
      const needsSectionScroll =
        left > this.params.leftSpacer.clientWidth
        || center > this.params.centerSpacer.clientWidth
        || right > this.params.rightSpacer.clientWidth;
      const show = totalWidth > rootContentWidth(root) || needsSectionScroll;
      setStyle(this.params.hScrollContainer, "display", show ? "flex" : "none");
    }

    const headerHeight = this.params.headerWrapper.getBoundingClientRect().height;
    const stripShown = this.params.hScrollContainer.style.display === "flex";
    const hScrollHeight = stripShown ? this.params.hScrollContainer.getBoundingClientRect().height : 0;
    // Compared against the last string written, not the serialized value: a fractional header
    // height would never round-trip through the browser's calc() serialization.
    const frameHeight = `calc(100% - ${headerHeight + hScrollHeight}px)`;
    if (frameHeight !== this.bodyFrameHeight || !this.params.bodyFrame.style.height) {
      this.bodyFrameHeight = frameHeight;
      this.params.bodyFrame.style.height = frameHeight;
    }
  }

  /**
   * How much width the body's vertical scrollbar is taking, right now.
   *
   * Read off the live scroller whenever it has one, because that is the only number that cannot be
   * wrong: it is the scrollbar being compensated for, not a model of it. Any stand-in — a synthetic
   * probe, a constant, a `scrollbar-width` keyword translated to pixels — is a second source of
   * truth, and the two diverge the moment a host stylesheet, a theme or a zoom level touches one and
   * not the other. That divergence is exactly how the header came to sit 11px right of the body.
   *
   * The probe is only the bootstrap, for before the body has ever shown a scrollbar — the pinned-row
   * lane still needs a width to reserve then.
   */
  private measureGutter(): number {
    const body = this.params.bodyScroller?.();
    if (body) {
      const live = body.offsetWidth - body.clientWidth;
      if (live > 0) return live;
    }
    return this.params.verticalScrollbarGutter?.() ?? VERTICAL_SCROLLBAR_GUTTER_WIDTH;
  }

  private applyVerticalScrollbarCompensation(): void {
    const gutter = this.measureGutter();
    const gutterWidth = this.hasVerticalScrollbar ? gutter : 0;
    const hasRightSection = this.rightSectionWidth > 0;

    // Publish both numbers to the stylesheet so the lanes sized in CSS and the paddings sized here
    // cannot disagree. A lane width hardcoded in CSS is only ever right on the platform it was
    // written against: it reserves real estate that overlay scrollbars never claim, leaving the
    // header aligned to one edge and the rows to another.
    const rootStyle = this.params.root.style;
    if (rootStyle.getPropertyValue("--pte-scrollbar-gutter") !== `${gutter}px`) {
      rootStyle.setProperty("--pte-scrollbar-gutter", `${gutter}px`);
    }
    if (rootStyle.getPropertyValue("--pte-scrollbar-gutter-active") !== `${gutterWidth}px`) {
      rootStyle.setProperty("--pte-scrollbar-gutter-active", `${gutterWidth}px`);
    }

    setStyle(this.params.centerHeader, "paddingRight", `${hasRightSection ? 0 : gutterWidth}px`);
    setStyle(this.params.rightHeader, "paddingRight", `${hasRightSection ? gutterWidth : 0}px`);
    setStyle(this.params.hScrollContainer, "paddingRight", `${gutterWidth}px`);

    if (hasRightSection) {
      // The extra pixel covers the pinned section's border; the remaining width is the live
      // vertical-scrollbar lane, when present. No min-width: the resize observer's max-width (the
      // cap plus this same lane) has to be able to clamp it, exactly as it clamps the body.
      const headerWidth = this.rightSectionWidth + gutterWidth + 1;
      setStyle(this.params.rightHeader, "width", `${headerWidth}px`);
    }
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
