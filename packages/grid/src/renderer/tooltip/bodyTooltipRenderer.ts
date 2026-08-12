import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { IGridAPI } from "../../interfaces/iGridAPI";
import { ResolvedTooltipOptions, resolveColumnTooltipOptions } from "../../interfaces/gridOptions";
import { FloatingAnchor, FloatingMode } from "../floating/floatingAnchor";
import {
  TooltipComponent,
  TooltipComponentParams,
  createTooltipComponentRuntime,
  TooltipComponentRuntime,
} from "./tooltipComponent";
import {
  findRendererTooltipTarget,
  getRendererTooltipAnchor,
  getRendererTooltipContent,
  getRendererTooltipPlacement,
  RENDERER_TOOLTIP_TARGET_DISPOSED,
} from "./rendererTooltipTarget";

export interface BodyTooltipRendererParams {
  core: GridCore;
  api: IGridAPI;
  /** Grid root, used to delegate tooltips from grid-owned UI outside the body/header. */
  root: HTMLElement;
  /** The body element pointer events are delegated from and live cells are queried under. */
  body: HTMLElement;
  /** The header wrapper element, for header-cell tooltips. */
  headerWrapper: HTMLElement;
  /** The shared floating layer (tooltips sit below the menu band). */
  floating: FloatingAnchor;
  /** Current leaf columns, in colIdx order (matches `data-col-idx`). */
  leafColumns: () => Column[];
  /** Resolve a column by its instanceID (header cells carry it as their element id). */
  getColumnById: (id: string) => Column | null | undefined;
  /** Resolved tooltip config. */
  options: () => ResolvedTooltipOptions;
}

/** What a tooltip is anchored to: a body cell, header cell, or registered grid UI control. */
type TooltipTarget =
  | {
      kind: "body";
      viewIdx: number;
      colIdx: number;
      clientX: number;
      clientY: number;
      rendererTarget?: Element;
    }
  | { kind: "header"; colId: string; clientX: number; clientY: number }
  | { kind: "ui"; rendererTarget: Element; clientX: number; clientY: number };

function sameTarget(a: TooltipTarget | null, b: TooltipTarget | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "body" && b.kind === "body") {
    return (
      a.viewIdx === b.viewIdx &&
      a.colIdx === b.colIdx &&
      a.rendererTarget === b.rendererTarget
    );
  }
  if (a.kind === "header" && b.kind === "header") return a.colId === b.colId;
  if (a.kind === "ui" && b.kind === "ui") return a.rendererTarget === b.rendererTarget;
  return false;
}

/**
 * Drives grid tooltips for body and header cells: hover detection (delegated), content resolution
 * (custom component → value getter → field → grid defaults → auto-truncation), and handing the
 * content to the shared {@link FloatingAnchor} for positioning.
 *
 * Modeled on {@link BodyColumnHoverRenderer} (delegated `mouseover`, closest-cell hit-test) but adds
 * `mouseout`/`mousemove`, show/hide delays, interactivity (grace bridge) and header coverage.
 * Virtualization-safe: the anchor rect is re-derived from the live DOM on every reposition and the
 * tooltip hides on scroll (rows recycle).
 */
export class BodyTooltipRenderer {
  private showTimer: number | null = null;
  private hideTimer: number | null = null;
  /** The target currently shown (or pending show). */
  private active: TooltipTarget | null = null;
  /** True once the tooltip is actually on screen (vs. pending the show delay). */
  private shown = false;
  private runtime: TooltipComponentRuntime | null = null;
  /** The element currently carrying aria-describedby, remembered so it can be cleaned up exactly. */
  private describedEl: HTMLElement | null = null;

  private bound = false;

  constructor(private params: BodyTooltipRendererParams) {}

  // ---------------- event delegation ----------------

  bind() {
    if (this.bound) return;
    this.bound = true;
    this.params.body.addEventListener("mouseover", this.handleMouseOver);
    this.params.body.addEventListener("mouseout", this.handleMouseOut);
    this.params.body.addEventListener("mousemove", this.handleMouseMove);
    this.params.headerWrapper.addEventListener("mouseover", this.handleMouseOver);
    this.params.headerWrapper.addEventListener("mouseout", this.handleMouseOut);
    this.params.root.addEventListener("mouseover", this.handleUiMouseOver);
    this.params.root.addEventListener("mouseout", this.handleUiMouseOut);
    this.params.root.addEventListener(RENDERER_TOOLTIP_TARGET_DISPOSED, this.handleRendererTargetDisposed);
    // Rows recycle on scroll, so the safe v1 behavior is to dismiss. Scroll doesn't bubble; the
    // capture phase catches it from any inner scroller. Window resize invalidates positions too.
    document.addEventListener("scroll", this.handleScroll, true);
    window.addEventListener("resize", this.handleScroll);
    document.addEventListener("keydown", this.handleKeyDown, true);
  }

  /** Remove listeners and hide any open tooltip, but keep the instance reusable (bind() re-arms). */
  unbind() {
    if (!this.bound) return;
    this.bound = false;
    this.params.body.removeEventListener("mouseover", this.handleMouseOver);
    this.params.body.removeEventListener("mouseout", this.handleMouseOut);
    this.params.body.removeEventListener("mousemove", this.handleMouseMove);
    this.params.headerWrapper.removeEventListener("mouseover", this.handleMouseOver);
    this.params.headerWrapper.removeEventListener("mouseout", this.handleMouseOut);
    this.params.root.removeEventListener("mouseover", this.handleUiMouseOver);
    this.params.root.removeEventListener("mouseout", this.handleUiMouseOut);
    this.params.root.removeEventListener(RENDERER_TOOLTIP_TARGET_DISPOSED, this.handleRendererTargetDisposed);
    document.removeEventListener("scroll", this.handleScroll, true);
    window.removeEventListener("resize", this.handleScroll);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    this.clearTimers();
    this.hideNow();
  }

  destroy() {
    this.unbind();
  }

  private handleScroll = () => {
    if (this.active || this.showTimer != null) this.hideNow();
  };

  private handleRendererTargetDisposed = (event: Event) => {
    if (
      (this.active?.kind === "body" || this.active?.kind === "ui") &&
      this.active.rendererTarget === event.target
    ) {
      this.hideNow();
    }
  };

  /** Esc dismisses the tooltip (a11y). Guarded so it never steals Esc from an open editor/input:
   * when a tooltip is up we consume it, otherwise we leave the event alone. */
  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (!this.shown && this.active == null && this.showTimer == null) return;
    this.hideNow();
  };

  /**
   * Focus trigger: when the active cell changes via the keyboard, show its tooltip. Called by the
   * renderer on the core's `focusChanged`. Only fires for keyboard-driven focus (the core reports
   * `reason`), so the tooltip doesn't pop on every cell click.
   */
  onFocusChanged(viewIdx: number, colIdx: number, reason?: "mouse" | "keyboard" | "api") {
    if (reason !== "keyboard") return;
    if (!this.params.options().enabled) return;
    this.showBodyTooltip(viewIdx, colIdx);
  }

  // ---------------- programmatic API ----------------

  /** Show the tooltip for a body cell on demand (bypasses the show delay). */
  showBodyTooltip(viewIdx: number, colIdx: number) {
    if (!this.params.options().enabled) return;
    this.clearTimers();
    const rect = this.getCellRect(viewIdx, colIdx);
    const cx = rect ? rect.left + rect.width / 2 : 0;
    const cy = rect ? rect.top + rect.height / 2 : 0;
    this.showFor({ kind: "body", viewIdx, colIdx, clientX: cx, clientY: cy });
  }

  /** Hide any visible tooltip on demand. */
  hideTooltip() {
    this.hideNow();
  }

  /** Hide the tooltip immediately (called on scroll, viewport changes, teardown, Esc). */
  hideNow() {
    this.clearTimers();
    const wasShown = this.shown;
    const prev = this.active;
    this.active = null;
    this.shown = false;
    this.runtime?.destroy();
    this.runtime = null;
    this.clearDescription();
    this.params.floating.hide();
    if (wasShown && prev) {
      this.params.core.emit("tooltipHide", this.eventParams(prev));
    }
  }

  // ---------------- handlers ----------------

  private handleMouseOver = (e: MouseEvent) => {
    const opts = this.params.options();
    if (!opts.enabled) return;
    const loc = this.locate(e.target, e.clientX, e.clientY);
    if (!loc) {
      this.scheduleHide();
      return;
    }
    if (sameTarget(this.active, loc)) {
      if (this.hideTimer != null) this.cancelHide();
      return;
    }
    this.scheduleShow(loc);
  };

  private handleMouseOut = (e: MouseEvent) => {
    // Ignore moves between children of the same cell/header.
    const to = e.relatedTarget as HTMLElement | null;
    if (to) {
      const dest = this.locate(to, e.clientX, e.clientY);
      if (dest && sameTarget(dest, this.active)) return;
    }
    this.scheduleHide();
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.active || this.active.kind !== "body" || this.optionsForTarget(this.active).mode !== "follow") return;
    if (!this.params.floating.isOpen()) return;
    // Follow-mouse: re-position at the new pointer position (display-only path).
    const content = this.params.floating.getOverlay()?.firstElementChild as HTMLElement | null;
    if (!content) return;
    this.params.floating.show(content, this.floatingOptsFor(this.active, e.clientX, e.clientY));
  };

  private handleUiMouseOver = (e: MouseEvent) => {
    if (!this.params.options().enabled) return;
    const target = this.locateUi(e.target, e.clientX, e.clientY);
    if (!target) return;
    if (sameTarget(this.active, target)) {
      if (this.hideTimer != null) this.cancelHide();
      return;
    }
    this.scheduleShow(target);
  };

  private handleUiMouseOut = (e: MouseEvent) => {
    const source = this.locateUi(e.target, e.clientX, e.clientY);
    if (!source) return;
    const destination = this.locateUi(e.relatedTarget, e.clientX, e.clientY);
    if (destination && sameTarget(destination, source)) return;
    this.scheduleHide();
  };

  // ---------------- scheduling ----------------

  private scheduleShow(target: TooltipTarget) {
    this.clearTimers();
    const delay = this.params.options().showDelay;
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null;
      this.showFor(target);
    }, delay);
  }

  private scheduleHide() {
    if (this.showTimer != null) {
      window.clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (!this.params.floating.isOpen() && this.active == null) return;
    const delay = this.params.options().hideDelay;
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      this.hideNow();
    }, delay);
  }

  private cancelHide() {
    if (this.hideTimer != null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private clearTimers() {
    if (this.showTimer != null) window.clearTimeout(this.showTimer);
    if (this.hideTimer != null) window.clearTimeout(this.hideTimer);
    this.showTimer = null;
    this.hideTimer = null;
  }

  // ---------------- show ----------------

  private showFor(target: TooltipTarget) {
    const runtime = target.kind === "body"
      ? this.resolveBody(target)
      : target.kind === "header"
        ? this.resolveHeader(target)
        : this.resolveUi(target);
    if (!runtime) {
      this.hideNow();
      return;
    }
    this.runtime?.destroy();
    this.runtime = runtime;
    this.active = target;
    this.shown = true;
    const overlay = this.params.floating.show(runtime.gui, this.floatingOptsFor(target, target.clientX, target.clientY));
    overlay.setAttribute("role", "tooltip");
    this.describeTarget(target, overlay);
    this.params.core.emit("tooltipShow", this.eventParams(target));
    // Interactive tooltips: let the pointer enter the tooltip. Entering cancels the pending hide
    // (hideDelay is the grace window to cross the gap between cell and tooltip); leaving reschedules.
    if (this.optionsForTarget(target).interactive) {
      overlay.addEventListener("mouseenter", this.handleOverlayEnter);
      overlay.addEventListener("mouseleave", this.handleOverlayLeave);
    }
  }

  private handleOverlayEnter = () => this.cancelHide();
  private handleOverlayLeave = () => this.scheduleHide();

  /** Resolve the column a target belongs to (for reading per-column `tooltipOptions`). */
  private columnForTarget(target: TooltipTarget): Column | null | undefined {
    return target.kind === "body"
      ? this.params.leafColumns()[target.colIdx]
      : target.kind === "header"
        ? this.params.getColumnById(target.colId)
        : null;
  }

  /** Grid-level resolved options with the target column's `tooltipOptions` layered on top. */
  private optionsForTarget(target: TooltipTarget): ResolvedTooltipOptions {
    const options = resolveColumnTooltipOptions(
      this.params.options(),
      this.columnForTarget(target)?.tooltipOptions,
    );
    if (target.kind !== "ui") return options;
    const placement = getRendererTooltipPlacement(target.rendererTarget);
    return placement ? { ...options, placement } : options;
  }

  private floatingOptsFor(target: TooltipTarget, x: number, y: number) {
    const opts = this.optionsForTarget(target);
    // Headers never follow the mouse (they're not the interactive-form surface); always anchored.
    const followMode = target.kind === "body" && opts.mode === "follow";
    const mode: FloatingMode = followMode
      ? { kind: "follow", x, y }
      : { kind: "anchored", getAnchorRect: () => this.getTargetRect(target), placement: opts.placement };
    return {
      mode,
      className: opts.interactive ? "pte-tooltip pte-tooltip-interactive" : "pte-tooltip",
      escapeRootClip: opts.escapeRootClip,
      arrow: !followMode,
    };
  }

  // ---------------- content resolution ----------------

  private resolveBody(target: {
    kind: "body";
    viewIdx: number;
    colIdx: number;
    rendererTarget?: Element;
  }): TooltipComponentRuntime | null {
    const { core } = this.params;
    const col = this.params.leafColumns()[target.colIdx];
    if (!col) return null;

    const rowId = core.getRowIdAtViewIndex(target.viewIdx);
    if (!rowId) return null;
    const rowNode = core.getRowModel().getRowNode(rowId);
    if (!rowNode || rowNode.isGroup) return null;

    // A custom renderer may expose subtargets (for example, individual sparkline points). Their
    // content takes precedence over the owning column's cell-level tooltip configuration.
    if (target.rendererTarget) {
      const content = getRendererTooltipContent(target.rendererTarget);
      return content != null && String(content).length > 0
        ? this.textRuntime(String(content))
        : null;
    }

    const value = col.getValue(rowNode);
    const valueFormatted = col.formatValue(value, rowNode);
    const opts = this.params.options();

    const params: TooltipComponentParams = {
      value,
      valueFormatted,
      data: rowNode.data,
      rowId: String(rowId),
      rowIndex: target.viewIdx,
      colDef: col,
      location: "body",
      api: this.params.api,
      hide: () => this.hideNow(),
      ...(col.tooltipComponentParams ?? {}),
    };

    // 1. Custom component (grid-wide defaults arrive pre-merged via `defaultColDef`).
    const comp = col.tooltipComponent;
    if (comp) return createTooltipComponentRuntime(comp, params);

    // 2. Value getter.
    const getter = col.tooltipValueGetter;
    if (getter) {
      const text = getter(params);
      return text != null && String(text).length > 0 ? this.textRuntime(String(text)) : null;
    }

    // 3. Field on the row.
    if (col.tooltipField != null) {
      const text = rowNode.data?.[col.tooltipField];
      return text != null && String(text).length > 0 ? this.textRuntime(String(text)) : null;
    }

    // 4. Auto-truncation: show the full formatted value when the cell clips it.
    const suppressed = opts.suppressAutoTooltip || col.suppressAutoTooltip;
    if (!suppressed && this.isCellTruncated(target.viewIdx, target.colIdx)) {
      const text = valueFormatted != null && valueFormatted !== "" ? valueFormatted : value == null ? "" : String(value);
      if (text.length > 0) return this.textRuntime(text);
    }
    return null;
  }

  private resolveHeader(target: { kind: "header"; colId: string }): TooltipComponentRuntime | null {
    const col = this.params.getColumnById(target.colId);
    if (!col || col.headerTooltip == null) return null;
    const params: TooltipComponentParams = {
      colDef: col,
      location: "header",
      api: this.params.api,
      hide: () => this.hideNow(),
    };
    if (typeof col.headerTooltip === "string") {
      return col.headerTooltip.length > 0 ? this.textRuntime(col.headerTooltip) : null;
    }
    return createTooltipComponentRuntime(col.headerTooltip as TooltipComponent, params);
  }

  private resolveUi(target: { kind: "ui"; rendererTarget: Element }): TooltipComponentRuntime | null {
    const content = getRendererTooltipContent(target.rendererTarget);
    return content != null && String(content).length > 0
      ? this.textRuntime(String(content))
      : null;
  }

  /** A minimal text-only runtime (no destroy needed). */
  private textRuntime(text: string): TooltipComponentRuntime {
    const el = document.createElement("div");
    el.className = "pte-tooltip-text";
    el.textContent = text;
    return { gui: el, refresh: () => true, destroy: () => {} };
  }

  private eventParams(target: TooltipTarget) {
    if (target.kind === "body") {
      const col = this.params.leafColumns()[target.colIdx];
      return {
        location: "body" as const,
        colId: col?.colId ?? null,
        colInstanceId: col?.instanceID ?? null,
        rowId: this.params.core.getRowIdAtViewIndex(target.viewIdx),
        colIdx: target.colIdx,
        viewIdx: target.viewIdx,
      };
    }
    if (target.kind === "header") {
      // target.colId is the header element id = the column's instance id; report both spaces.
      const col = this.params.getColumnById(target.colId);
      return {
        location: "header" as const,
        colId: col?.colId ?? target.colId,
        colInstanceId: col?.instanceID ?? target.colId,
        rowId: null,
        colIdx: null,
        viewIdx: null,
      };
    }
    return { location: "ui" as const, colId: null, colInstanceId: null, rowId: null, colIdx: null, viewIdx: null };
  }

  // ---------------- DOM helpers ----------------

  private locate(target: EventTarget | null, clientX: number, clientY: number): TooltipTarget | null {
    const el = target as HTMLElement | null;
    if (!el) return null;

    // Header cell? (its element id is the column instanceID)
    const hcell = el.closest?.(".pte-hcell") as HTMLElement | null;
    if (hcell && this.params.headerWrapper.contains(hcell) && hcell.id) {
      return { kind: "header", colId: hcell.id, clientX, clientY };
    }

    // Body cell?
    const cell = el.closest?.(".pte-cell") as HTMLElement | null;
    if (!cell || !this.params.body.contains(cell)) return null;
    if (cell.classList.contains("pte-row-number-cell")) return null;
    if (cell.classList.contains("pte-checkbox-cell")) return null;
    const rowEl = cell.closest(".pte-row") as HTMLElement | null;
    if (!rowEl || rowEl.classList.contains("pte-group-row")) return null;
    const viewIdx = Number(rowEl.getAttribute("data-view-idx"));
    const colIdx = Number(cell.dataset.colIdx);
    if (!Number.isFinite(viewIdx) || !Number.isFinite(colIdx)) return null;
    const rendererTarget = findRendererTooltipTarget(el, cell) ?? undefined;
    return { kind: "body", viewIdx, colIdx, clientX, clientY, rendererTarget };
  }

  private locateUi(target: EventTarget | null, clientX: number, clientY: number): TooltipTarget | null {
    const el = target as HTMLElement | null;
    if (!el || this.params.body.contains(el) || this.params.headerWrapper.contains(el)) return null;
    const rendererTarget = findRendererTooltipTarget(el, this.params.root);
    return rendererTarget ? { kind: "ui", rendererTarget, clientX, clientY } : null;
  }

  private getTargetRect(target: TooltipTarget): DOMRect | null {
    if (target.kind === "body") {
      if (target.rendererTarget?.isConnected) {
        const anchor = getRendererTooltipAnchor(target.rendererTarget);
        if (anchor.isConnected) return anchor.getBoundingClientRect();
      }
      return this.getCellRect(target.viewIdx, target.colIdx);
    }
    if (target.kind === "header") {
      const hcell = document.getElementById(target.colId);
      return hcell ? hcell.getBoundingClientRect() : null;
    }
    if (!target.rendererTarget.isConnected) return null;
    const anchor = getRendererTooltipAnchor(target.rendererTarget);
    return anchor.isConnected ? anchor.getBoundingClientRect() : null;
  }

  /**
   * Point the element the tooltip describes at the tooltip, so AT reads the tooltip text as that
   * element's description — `role="tooltip"` alone is inert without the reference.
   *
   * The reference is torn down in hideNow rather than tracked across renders: the described
   * element is a pooled cell, and the tooltip already hides on scroll, so it cannot outlive the
   * element it points from. The described element is remembered (not re-derived) so the cleanup
   * cannot miss after recycling has moved things around.
   */
  private describeTarget(target: TooltipTarget, overlay: HTMLElement) {
    const anchor = this.anchorElFor(target);
    if (!anchor) return;
    if (!overlay.id) overlay.id = `${this.params.core.id}-tooltip`;
    anchor.setAttribute("aria-describedby", overlay.id);
    this.describedEl = anchor;
  }

  private clearDescription() {
    this.describedEl?.removeAttribute("aria-describedby");
    this.describedEl = null;
  }

  /** The element a tooltip target hangs off, for aria-describedby. */
  private anchorElFor(target: TooltipTarget): HTMLElement | null {
    if (target.kind === "body") return this.getCellEl(target.viewIdx, target.colIdx);
    if (target.kind === "header") return document.getElementById(target.colId);
    return target.rendererTarget as HTMLElement;
  }

  /** Find the live (recycled) cell element for a location, or null if scrolled out. A row slot
   * renders up to four section rows (leading/left/center/right) sharing one view-idx; the cell
   * lives in exactly one of them. */
  private getCellEl(viewIdx: number, colIdx: number): HTMLElement | null {
    const rowEls = this.params.body.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`);
    for (let i = 0; i < rowEls.length; i++) {
      const cell = rowEls[i].querySelector<HTMLElement>(`.pte-cell[data-col-idx="${colIdx}"]`);
      if (cell) return cell;
    }
    return null;
  }

  private getCellRect(viewIdx: number, colIdx: number): DOMRect | null {
    const el = this.getCellEl(viewIdx, colIdx);
    return el ? el.getBoundingClientRect() : null;
  }

  private isCellTruncated(viewIdx: number, colIdx: number): boolean {
    const el = this.getCellEl(viewIdx, colIdx);
    if (!el) return false;
    // The content may live in an inner span (custom renderer) or directly in the cell.
    const measure = (el.firstElementChild as HTMLElement | null) ?? el;
    return measure.scrollWidth > measure.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1;
  }
}
