import { div } from "../element";

/**
 * FloatingAnchor — the shared geometry + mount layer for grid overlays that pin to a cell or the
 * pointer (tooltips today, ActionFrame later). It owns NO feature logic: callers supply the content
 * element and a way to locate the anchor, and this class handles mounting into a fixed-position
 * layer, computing placement, and clamping to the visible bounds.
 *
 * Mirrors the positioning approach in {@link MenuRenderer} (getBoundingClientRect → flip/clamp
 * against the root bounds) but is decoupled from menu semantics. Each consumer constructs its own
 * instance against the grid root so z-index bands don't collide.
 *
 * Virtualization note: the grid recycles row/cell DOM as it scrolls, so a floating element must
 * never retain a live `eCell` reference. The caller passes a `getAnchorRect()` thunk that re-derives
 * the rect on demand (from `{viewIdx, colIdx}` or similar); {@link reposition} re-invokes it.
 */

export type FloatingPlacement = "top" | "bottom" | "left" | "right" | "auto";

/** How the floating element is positioned relative to its trigger. */
export type FloatingMode =
  /** Pinned to an anchor rectangle (a cell). Stable; supports interactive content. */
  | { kind: "anchored"; getAnchorRect: () => DOMRect | null; placement?: FloatingPlacement }
  /** Follows the pointer. Display-only (you can't click a floater you're chasing). */
  | { kind: "follow"; x: number; y: number };

export interface FloatingShowOptions {
  mode: FloatingMode;
  /** Gap in px between the anchor/pointer and the floating element. Default 8. */
  offset?: number;
  /** Extra class(es) placed on the overlay root (e.g. "pte-tooltip"). */
  className?: string;
  /**
   * Mount into `document.body` instead of the grid root. Escape hatch for content that would clip
   * against `.pte-root { overflow:hidden }` near the grid edge. Default false (mount in root).
   */
  escapeRootClip?: boolean;
  /** Draw a small arrow pointing at the anchor. Anchored mode only. Default false. */
  arrow?: boolean;
  /**
   * Persistent anchoring (ActionFrame). When true, an anchored floater whose cell scrolls out of
   * view is *concealed* (hidden but retained) rather than torn down, and re-appears when the cell
   * scrolls back in on a later {@link reposition}. Default false — non-sticky floaters (tooltips)
   * fully hide when their anchor disappears.
   */
  sticky?: boolean;
}

/** Margin kept between the floating element and the clamp-bounds edge. */
const EDGE_MARGIN = 8;

export class FloatingAnchor {
  private overlay: HTMLDivElement | null = null;
  private arrowEl: HTMLDivElement | null = null;
  private current: FloatingShowOptions | null = null;
  private mountedInBody = false;

  /**
   * @param root  The grid root (`.pte-root`) — default mount target and clamp reference.
   * @param zIndex  Stacking level for the overlay. Tooltips sit *below* the menu band (menus use
   *   9999+), so the default is under that. ActionFrame can pass its own band.
   */
  constructor(private root: HTMLElement, private zIndex: number = 9800) {}

  /** True while a floating element is on screen. */
  isOpen(): boolean {
    return this.overlay != null;
  }

  /** The live overlay element (for hit-testing a grace bridge, aria wiring, etc.), or null. */
  getOverlay(): HTMLElement | null {
    return this.overlay;
  }

  /**
   * Mount `content` and position it per `opts`. Replaces any currently-shown content (a single
   * instance shows one floater at a time). Returns the overlay root.
   */
  show(content: HTMLElement, opts: FloatingShowOptions): HTMLElement {
    const overlay = this.ensureOverlay(opts);
    overlay.replaceChildren(content);
    if (opts.arrow && opts.mode.kind === "anchored") {
      this.arrowEl = div("pte-floating-arrow");
      overlay.appendChild(this.arrowEl);
    } else {
      this.arrowEl = null;
    }
    this.current = opts;
    this.position();
    return overlay;
  }

  /**
   * Recompute position from the current mode. For anchored mode this re-invokes `getAnchorRect()`,
   * so it is safe to call after layout changes; if the anchor has disappeared (scrolled out / cell
   * recycled) the floater is hidden.
   */
  reposition(): void {
    if (!this.overlay || !this.current) return;
    this.position();
  }

  /**
   * Move an already-open follow-mode floater to the latest pointer coordinates without remounting
   * its content. No-op for anchored or closed floaters.
   */
  updateFollowPosition(x: number, y: number): void {
    if (!this.overlay || !this.current || this.current.mode.kind !== "follow") return;
    this.current.mode = { kind: "follow", x, y };
    this.position();
  }

  /** Remove the floating element from the DOM and drop all state. Idempotent. */
  hide(): void {
    if (this.overlay && this.overlay.parentElement) {
      this.overlay.parentElement.removeChild(this.overlay);
    }
    this.overlay = null;
    this.arrowEl = null;
    this.current = null;
  }

  /**
   * Visually hide the overlay but KEEP it mounted and retain `current`, so a later
   * {@link reposition} can bring it back. Used for sticky floaters whose anchor cell has scrolled
   * out of view. No-op when there is nothing shown.
   */
  private conceal(): void {
    if (this.overlay) this.overlay.style.display = "none";
  }

  /** Tear down entirely. */
  destroy(): void {
    this.hide();
  }

  // ---------------- internals ----------------

  private ensureOverlay(opts: FloatingShowOptions): HTMLDivElement {
    const wantBody = !!opts.escapeRootClip;
    // If the mount target changed between shows, rebuild the overlay under the right parent.
    if (this.overlay && this.mountedInBody !== wantBody) {
      this.hide();
    }
    if (!this.overlay) {
      const overlay = div("pte-floating");
      overlay.style.position = "fixed";
      overlay.style.zIndex = String(this.zIndex);
      overlay.style.visibility = "hidden";
      (wantBody ? document.body : this.root).appendChild(overlay);
      this.overlay = overlay;
      this.mountedInBody = wantBody;
    }
    this.overlay.className = `pte-floating${opts.className ? ` ${opts.className}` : ""}`;
    return this.overlay;
  }

  /** The rectangle the floater is clamped inside: the root bounds (minus a margin) intersected with
   * the viewport, so a floater never escapes the grid on-root but also never leaves the screen when
   * mounted in body. */
  private getBounds() {
    const r = this.root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (this.mountedInBody) {
      return {
        left: EDGE_MARGIN,
        top: EDGE_MARGIN,
        right: vw - EDGE_MARGIN,
        bottom: vh - EDGE_MARGIN,
      };
    }
    return {
      left: Math.max(EDGE_MARGIN, r.left + EDGE_MARGIN),
      top: Math.max(EDGE_MARGIN, r.top + EDGE_MARGIN),
      right: Math.min(vw - EDGE_MARGIN, r.right - EDGE_MARGIN),
      bottom: Math.min(vh - EDGE_MARGIN, r.bottom - EDGE_MARGIN),
    };
  }

  private position(): void {
    const overlay = this.overlay;
    const opts = this.current;
    if (!overlay || !opts) return;

    const offset = opts.offset ?? 8;

    // Measure the overlay while hidden (like MenuRenderer does) so width/height are real.
    overlay.style.visibility = "hidden";
    overlay.style.display = "block";
    const size = overlay.getBoundingClientRect();
    const bounds = this.getBounds();

    let left: number;
    let top: number;
    // Null in follow mode — placement (and the arrow) only make sense when pinned to an anchor.
    let placedSide: FloatingPlacement | null = null;

    if (opts.mode.kind === "follow") {
      left = opts.mode.x + offset;
      top = opts.mode.y + offset;
    } else {
      const rect = opts.mode.getAnchorRect();
      if (!rect) {
        // Anchor gone (scrolled out / recycled): a sticky floater is concealed (retained so it can
        // re-appear when the cell scrolls back in); a transient one is torn down.
        if (opts.sticky) this.conceal();
        else this.hide();
        return;
      }
      const placement = opts.mode.placement ?? "auto";
      const resolved = this.resolveAnchored(rect, size, bounds, offset, placement);
      left = resolved.left;
      top = resolved.top;
      placedSide = resolved.side;
    }

    // Clamp to bounds (same order as MenuRenderer: right/left then bottom/top).
    if (left + size.width > bounds.right) left = bounds.right - size.width;
    if (left < bounds.left) left = bounds.left;
    if (top + size.height > bounds.bottom) top = bounds.bottom - size.height;
    if (top < bounds.top) top = bounds.top;

    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    if (placedSide) overlay.dataset.placement = placedSide;
    else delete overlay.dataset.placement;
    overlay.style.visibility = "visible";
  }

  /** Compute the top-left for an anchored placement. Preferred placements try their opposite side
   * first, then the perpendicular axis; "auto" tries bottom → top → right → left. */
  private resolveAnchored(
    rect: DOMRect,
    size: DOMRect,
    bounds: { left: number; top: number; right: number; bottom: number },
    offset: number,
    placement: FloatingPlacement,
  ): { left: number; top: number; side: FloatingPlacement } {
    const fitsBottom = rect.bottom + offset + size.height <= bounds.bottom;
    const fitsTop = rect.top - offset - size.height >= bounds.top;
    const fitsRight = rect.right + offset + size.width <= bounds.right;
    const fitsLeft = rect.left - offset - size.width >= bounds.left;

    const fits: Record<Exclude<FloatingPlacement, "auto">, boolean> = {
      bottom: fitsBottom,
      top: fitsTop,
      right: fitsRight,
      left: fitsLeft,
    };
    const candidates: Array<Exclude<FloatingPlacement, "auto">> = placement === "auto"
      ? ["bottom", "top", "right", "left"]
      : placement === "bottom"
        ? ["bottom", "top", "right", "left"]
        : placement === "top"
          ? ["top", "bottom", "right", "left"]
          : placement === "right"
            ? ["right", "left", "bottom", "top"]
            : ["left", "right", "bottom", "top"];
    const side = candidates.find(candidate => fits[candidate]) ?? candidates[0];

    // Center along the cross-axis; the outer clamp fixes any overflow.
    switch (side) {
      case "top":
        return { left: rect.left + rect.width / 2 - size.width / 2, top: rect.top - offset - size.height, side };
      case "left":
        return { left: rect.left - offset - size.width, top: rect.top + rect.height / 2 - size.height / 2, side };
      case "right":
        return { left: rect.right + offset, top: rect.top + rect.height / 2 - size.height / 2, side };
      case "bottom":
      default:
        return { left: rect.left + rect.width / 2 - size.width / 2, top: rect.bottom + offset, side };
    }
  }
}
