import { isInteractiveCellTarget } from "../../cellRenderers/interactiveTarget";

/**
 * Touch and pen input for the grid. The mouse path (mousedown / mousemove / mouseup in
 * eventBinder.ts) stays exactly as it is; this controller listens to pointer events and acts only
 * for `pointerType !== "mouse"`, translating each gesture into the same handler calls the mouse
 * path makes.
 *
 * Gesture contract:
 * - Tap (released within TOUCH_SLOP_PX, before the long-press delay) on a body cell runs the
 *   mousedown + mouseup path once, at pointerup: select / focus a cell, tick a selection checkbox,
 *   select a row number, open/close a group chevron, single-click editing. The browser's own
 *   `click` that follows a tap is left alone and drives rowClicked / cellClicked, the boolean box
 *   and the header (sort, select, menu buttons) as it always has.
 * - Double tap (a second tap within DOUBLE_TAP_MS and DOUBLE_TAP_RADIUS_PX) dispatches a
 *   `dblclick` at the second tap's target after its `click`, so editing on double click, the fill
 *   handle's fill-to-block and the resize handle's autosize all run through the existing dblclick
 *   handlers (and any renderer that stops dblclick propagation still does).
 * - Long press (LONG_PRESS_MS without leaving the slop) on a body or header cell dispatches a
 *   `contextmenu` at the touch point — what Chrome on Android does natively, and what iOS Safari
 *   never does — so the body menu and the column menu open through their existing handlers.
 * - A press on an element a renderer handles itself (isInteractiveCellTarget: the editable boolean
 *   box, a link, an editable rating star) is a tap only: no long press, no double tap — repeated
 *   taps are that control's own clicks, exactly as the mouse path treats them.
 * - A pan (leaving the slop before the long press) does nothing: the browser scrolls natively.
 * - The resize handle and the fill handle start their drag at pointerdown (both carry
 *   `touch-action: none`); a header cell starts a column drag once the finger leaves the slop
 *   horizontally (header cells carry `touch-action: pan-y`, so a vertical swipe still scrolls the
 *   page and the browser cancels the pointer).
 * - `pointercancel` (the browser took the gesture for a scroll or zoom), a second finger, or
 *   destroy() abort the gesture: the long-press timer is cleared, a column drag is torn down
 *   without a drop, a fill drag is cancelled without writing, and a resize settles at its current
 *   width (so the trailing `final: true` width event still arrives).
 *
 * Compatibility mouse events. After a tap the browser fires mousemove / mousedown / mouseup /
 * click at the same point; a pen fires the mouse events alongside its pointer events. The grid
 * already handled the gesture, so the mouse handlers drop those compatibility events
 * (isCompatMouseEvent): any mouse event while a touch / pen pointer is down, or within
 * COMPAT_WINDOW_MS of its release and COMPAT_RADIUS_PX of the release point, plus Chrome's
 * `sourceCapabilities.firesTouchEvents`. This filter is used rather than `preventDefault()` on
 * pointerdown because preventing pointerdown also stops the browser from focusing and from
 * starting native gestures on inputs inside the grid (an open editor, a filter field). When the
 * tap's own mouse path claimed the mousedown (preventDefault), the dropped compat mousedown is
 * prevented too, so its default focus move cannot blur an editor the tap just opened. `click` is
 * never filtered. The browser's own `dblclick` / `contextmenu` for a gesture the grid already
 * turned into one are swallowed at the root (capture phase), so nothing opens twice.
 */

/** Movement (px, either axis) a tap may drift before it becomes a pan or a drag. */
export const TOUCH_SLOP_PX = 10;
/** Hold time (ms) before a still press opens the context / column menu. */
export const LONG_PRESS_MS = 500;
/** Max gap (ms) between the first tap's release and the second tap's press. */
export const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_RADIUS_PX = 24;
/** How long after a touch / pen release its compatibility mouse events are expected. */
const COMPAT_WINDOW_MS = 800;
const COMPAT_RADIUS_PX = 32;

// ---------------- Input modality (shared across grids) ----------------

interface PointerRelease {
  at: number;
  x: number;
  y: number;
  /** The tap's mouse path prevented its mousedown, so the compat mousedown is prevented too. */
  preventMouseDown: boolean;
}

const modality: { down: Set<number>; lastRelease: PointerRelease | null } = {
  down: new Set(),
  lastRelease: null,
};

/** Events the controller dispatched itself (dblclick / contextmenu): never filtered or swallowed. */
const synthesized = new WeakSet<Event>();

/**
 * Whether a mouse event is a compatibility event the browser fired for a touch or pen gesture —
 * which the grid has already handled through pointer events. Mouse handlers return early on it.
 */
export function isCompatMouseEvent(e: MouseEvent): boolean {
  if (synthesized.has(e)) return false;
  if ((e as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents === true) {
    return true;
  }
  if (modality.down.size > 0) return true;
  const last = modality.lastRelease;
  if (!last || Date.now() - last.at > COMPAT_WINDOW_MS) return false;
  return Math.abs(e.clientX - last.x) <= COMPAT_RADIUS_PX && Math.abs(e.clientY - last.y) <= COMPAT_RADIUS_PX;
}

/**
 * isCompatMouseEvent, and when it is one, prevent the compat mousedown whose tap the grid's mouse
 * path claimed — its default focus move would otherwise blur an editor that tap just opened.
 */
export function dropCompatMouseEvent(e: MouseEvent): boolean {
  if (!isCompatMouseEvent(e)) return false;
  if (e.type === "mousedown" && modality.lastRelease?.preventMouseDown && e.cancelable) e.preventDefault();
  return true;
}

/** Tests only: forget every pointer seen so far. */
export function resetTouchModalityForTests(): void {
  modality.down.clear();
  modality.lastRelease = null;
}

// ---------------- Controller ----------------

export interface TouchGestureParams {
  root: HTMLElement;
  headerWrapper: HTMLElement;
  /** The body scroller plus every element whose rows take body gestures (bands, sticky overlay). */
  bodyRoots: () => HTMLElement[];
  /** A tap on a body row: the mousedown + mouseup path, given the pointerup. */
  bodyTap: (e: PointerEvent) => void;
  isFillHandle: (target: EventTarget | null) => boolean;
  /** Press on the fill handle: the mousedown path. Returns whether a fill drag began. */
  fillStart: (e: PointerEvent) => boolean;
  /** The finger is over `target` (hit-tested; touch keeps the pointer captured to the handle). */
  fillMove: (target: EventTarget | null) => void;
  fillEnd: (e: PointerEvent) => void;
  fillCancel: () => void;
  /** Press on a header cell: the header mousedown path (starts a resize or arms a column drag). */
  headerDown: (e: PointerEvent) => void;
  isResizing: () => boolean;
  resizeMove: (e: PointerEvent) => void;
  resizeEnd: () => void;
  columnDragMove: (e: PointerEvent) => void;
  columnDragEnd: () => void;
  columnDragCancel: () => void;
}

type GestureMode = "pending" | "pan" | "resize" | "fill" | "columnDrag" | "longPressed";

interface Gesture {
  pointerId: number;
  zone: "body" | "header";
  target: Element;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  downAt: number;
  mode: GestureMode;
  /** Left the slop at some point (a resize or fill that moved is not a tap). */
  moved: boolean;
  /** Pressed on an element a renderer handles itself (boolean box, link, rating star). */
  interactive: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export class TouchGestureController {
  private gesture: Gesture | null = null;
  /** Non-mouse pointers that went down while a gesture was active (a pinch): ignored until up. */
  private ignored = new Set<number>();
  private lastTap: { at: number; x: number; y: number; zone: "body" | "header" } | null = null;
  private pendingDoubleTap: { target: Element; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  /** A click to swallow: the one a long press or a resize tap leaves behind. */
  private swallowClick: { until: number; x: number; y: number } | null = null;
  /** The last long press the grid turned into a menu — so the browser's own contextmenu is not a second. */
  private longPress: { at: number; claimed: boolean } | null = null;
  /** The native dblclick of a double tap the grid already dispatched. */
  private swallowDblClickUntil = 0;
  private lastHandledEvent: Event | null = null;

  constructor(private readonly params: TouchGestureParams) { }

  bind(): void {
    const root = this.params.root;
    root.addEventListener("pointerdown", this.onPointerDown);
    root.addEventListener("click", this.onClickCapture, true);
    root.addEventListener("dblclick", this.onDblClickCapture, true);
    root.addEventListener("contextmenu", this.onContextMenuCapture, true);
  }

  destroy(): void {
    this.abort();
    this.flushDoubleTap(false);
    const root = this.params.root;
    root.removeEventListener("pointerdown", this.onPointerDown);
    root.removeEventListener("click", this.onClickCapture, true);
    root.removeEventListener("dblclick", this.onDblClickCapture, true);
    root.removeEventListener("contextmenu", this.onContextMenuCapture, true);
  }

  // ---------------- pointerdown ----------------

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") {
      // A real mouse after a touch: its events are not compatibility events.
      modality.lastRelease = null;
      return;
    }
    modality.down.add(e.pointerId);
    if (this.gesture) {
      // A second finger: this is a pinch or a two-finger pan, never a grid gesture.
      this.ignored.add(e.pointerId);
      this.abort();
      this.listen(true);
      return;
    }
    const target = e.target as Element | null;
    const zone = target ? this.zoneOf(target) : null;
    if (!target || !zone || isNativeControl(target)) {
      // Not the grid's to handle (toolbar, pager, an editor input): only track it for compat events.
      this.ignored.add(e.pointerId);
      this.listen(true);
      return;
    }

    const g: Gesture = {
      pointerId: e.pointerId,
      zone,
      target,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      downAt: Date.now(),
      mode: "pending",
      moved: false,
      interactive: zone === "body" && isInteractiveCellTarget(target),
      timer: null,
    };
    this.gesture = g;
    this.listen(true);

    if (zone === "body" && this.params.isFillHandle(target)) {
      if (this.params.fillStart(e)) {
        g.mode = "fill";
        return;
      }
    }
    if (zone === "header") {
      this.params.headerDown(e);
      if (this.params.isResizing()) {
        g.mode = "resize";
        return;
      }
    }
    // A renderer's own control (boolean box, link, rating star) takes its tap through its click,
    // as with the mouse; holding it is not a request for the grid's menu.
    if (g.interactive) return;
    g.timer = setTimeout(() => this.fireLongPress(), LONG_PRESS_MS);
  };

  private zoneOf(target: Element): "body" | "header" | null {
    if (this.params.headerWrapper.contains(target)) {
      return target.closest(".pte-hcell") ? "header" : null;
    }
    return this.params.bodyRoots().some(el => el.contains(target)) ? "body" : null;
  }

  // ---------------- move / up / cancel ----------------

  private listen(on: boolean): void {
    const root = this.params.root;
    const method = on ? "addEventListener" : "removeEventListener";
    // The root sees the real target (touch pointers are implicitly captured to the pressed element,
    // inside the root — and inside a shadow root, where a document listener would only see the
    // host). The document listeners finish a gesture whose capture was lost.
    for (const el of [root, document] as EventTarget[]) {
      el[method]("pointermove", this.onPointerMove as EventListener);
      el[method]("pointerup", this.onPointerUp as EventListener);
      el[method]("pointercancel", this.onPointerCancel as EventListener);
    }
  }

  private seen(e: Event): boolean {
    if (this.lastHandledEvent === e) return true;
    this.lastHandledEvent = e;
    return false;
  }

  private onPointerMove = (e: PointerEvent) => {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId || this.seen(e)) return;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const outside = Math.abs(dx) > TOUCH_SLOP_PX || Math.abs(dy) > TOUCH_SLOP_PX;
    if (outside) g.moved = true;

    switch (g.mode) {
      case "resize":
        this.params.resizeMove(e);
        return;
      case "fill":
        this.params.fillMove(this.hitTest(e));
        return;
      case "columnDrag":
        this.params.columnDragMove(e);
        return;
      case "pending":
        if (!outside) return;
        this.clearTimer(g);
        if (g.zone === "header" && Math.abs(dx) >= Math.abs(dy)) {
          g.mode = "columnDrag";
          this.params.columnDragMove(e);
          return;
        }
        // A pan: the browser scrolls. A header column drag armed at pointerdown never starts.
        g.mode = "pan";
        if (g.zone === "header") this.params.columnDragCancel();
        return;
      default:
        return;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.seen(e)) return;
    if (this.releaseIgnored(e)) return;
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    this.clearTimer(g);
    let preventMouseDown = false;
    let tap = false;

    switch (g.mode) {
      case "pending":
        tap = true;
        if (g.zone === "body") {
          this.params.bodyTap(e);
          preventMouseDown = e.defaultPrevented;
        } else {
          // The header acts on the click that follows; tear down the column drag armed at
          // pointerdown, which never moved.
          this.params.columnDragEnd();
        }
        break;
      case "resize":
        this.params.resizeEnd();
        this.swallowNextClick(e);
        tap = !g.moved;
        break;
      case "fill":
        this.params.fillEnd(e);
        tap = !g.moved;
        break;
      case "columnDrag":
        this.params.columnDragEnd();
        break;
      case "pan":
        break;
      case "longPressed":
        this.swallowNextClick(e);
        break;
    }

    this.finish(e, preventMouseDown);
    if (tap) this.noteTap(g, e);
  };

  private onPointerCancel = (e: PointerEvent) => {
    if (this.seen(e)) return;
    if (this.releaseIgnored(e)) return;
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return;
    this.abort();
    this.lastTap = null;
  };

  /** A pointer the controller is not following came up (a second finger, a toolbar tap). */
  private releaseIgnored(e: PointerEvent): boolean {
    if (!this.ignored.has(e.pointerId)) return false;
    this.ignored.delete(e.pointerId);
    modality.down.delete(e.pointerId);
    modality.lastRelease = { at: Date.now(), x: e.clientX, y: e.clientY, preventMouseDown: false };
    if (!this.gesture && this.ignored.size === 0) this.listen(false);
    return true;
  }

  /** Abort the active gesture without completing it (pointercancel, a second finger, destroy). */
  private abort(): void {
    const g = this.gesture;
    if (!g) return;
    this.clearTimer(g);
    switch (g.mode) {
      case "resize":
        // Settle at the current width: the drag's intermediate width events still get their final.
        this.params.resizeEnd();
        break;
      case "fill":
        this.params.fillCancel();
        break;
      case "pending":
      case "columnDrag":
        if (g.zone === "header") this.params.columnDragCancel();
        break;
      default:
        break;
    }
    modality.down.delete(g.pointerId);
    modality.lastRelease = { at: Date.now(), x: g.lastX, y: g.lastY, preventMouseDown: false };
    this.gesture = null;
    if (this.ignored.size === 0) this.listen(false);
  }

  private finish(e: PointerEvent, preventMouseDown: boolean): void {
    const g = this.gesture;
    if (g) modality.down.delete(g.pointerId);
    modality.lastRelease = { at: Date.now(), x: e.clientX, y: e.clientY, preventMouseDown };
    this.gesture = null;
    if (this.ignored.size === 0) this.listen(false);
  }

  private clearTimer(g: Gesture): void {
    if (g.timer == null) return;
    clearTimeout(g.timer);
    g.timer = null;
  }

  /** The element under the finger: a touch pointer stays targeted at the element it pressed. */
  private hitTest(e: PointerEvent): EventTarget | null {
    const scope = this.params.root.getRootNode() as Document | ShadowRoot;
    const hit = typeof scope.elementFromPoint === "function" ? scope.elementFromPoint(e.clientX, e.clientY) : null;
    return hit ?? e.target;
  }

  // ---------------- long press ----------------

  private fireLongPress(): void {
    const g = this.gesture;
    if (!g || g.mode !== "pending") return;
    g.timer = null;
    g.mode = "longPressed";
    // A header press armed a column drag; a long press is not one.
    if (g.zone === "header") this.params.columnDragCancel();
    this.lastTap = null;
    if (!g.target.isConnected) return;
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 2,
      clientX: g.lastX,
      clientY: g.lastY,
    });
    synthesized.add(event);
    g.target.dispatchEvent(event);
    this.longPress = { at: Date.now(), claimed: event.defaultPrevented };
  }

  // ---------------- double tap ----------------

  private noteTap(g: Gesture, e: PointerEvent): void {
    // Two taps on a renderer's own control are two of its clicks (two toggles, two star writes),
    // never a double tap that would open the cell editor over it.
    if (g.interactive) {
      this.lastTap = null;
      return;
    }
    const last = this.lastTap;
    const isDouble = !!last
      && last.zone === g.zone
      && g.downAt - last.at <= DOUBLE_TAP_MS
      && Math.abs(e.clientX - last.x) <= DOUBLE_TAP_RADIUS_PX
      && Math.abs(e.clientY - last.y) <= DOUBLE_TAP_RADIUS_PX;
    if (!isDouble) {
      this.lastTap = { at: Date.now(), x: e.clientX, y: e.clientY, zone: g.zone };
      return;
    }
    this.lastTap = null;
    const target = (e.target as Element | null)?.isConnected ? e.target as Element : g.target;
    this.flushDoubleTap(false);
    // Dispatched after the second tap's click, the order a mouse double-click arrives in; the
    // timer covers a click that never comes (a swallowed one, or a browser that skips it).
    this.pendingDoubleTap = {
      target,
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => this.flushDoubleTap(true), DOUBLE_TAP_MS),
    };
    document.addEventListener("click", this.onDocumentClick);
  }

  private onDocumentClick = () => {
    this.flushDoubleTap(true);
  };

  private flushDoubleTap(dispatch: boolean): void {
    const pending = this.pendingDoubleTap;
    if (!pending) return;
    this.pendingDoubleTap = null;
    clearTimeout(pending.timer);
    document.removeEventListener("click", this.onDocumentClick);
    if (!dispatch || !pending.target.isConnected) return;
    const event = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      detail: 2,
      clientX: pending.x,
      clientY: pending.y,
    });
    synthesized.add(event);
    this.swallowDblClickUntil = Date.now() + COMPAT_WINDOW_MS;
    pending.target.dispatchEvent(event);
  }

  // ---------------- root capture: the browser's duplicates ----------------

  private swallowNextClick(e: PointerEvent): void {
    this.swallowClick = { until: Date.now() + COMPAT_WINDOW_MS, x: e.clientX, y: e.clientY };
  }

  private onClickCapture = (e: MouseEvent) => {
    const s = this.swallowClick;
    if (!s) return;
    this.swallowClick = null;
    if (Date.now() > s.until) return;
    if (Math.abs(e.clientX - s.x) > COMPAT_RADIUS_PX || Math.abs(e.clientY - s.y) > COMPAT_RADIUS_PX) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // A double tap on the resize handle waits for this click.
    this.flushDoubleTap(true);
  };

  private onDblClickCapture = (e: MouseEvent) => {
    if (synthesized.has(e)) return;
    if (Date.now() <= this.swallowDblClickUntil || this.pendingDoubleTap || (isCompatMouseEvent(e) && this.lastTapWasRecent())) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  private lastTapWasRecent(): boolean {
    return !!this.lastTap && Date.now() - this.lastTap.at <= COMPAT_WINDOW_MS;
  }

  private onContextMenuCapture = (e: MouseEvent) => {
    if (synthesized.has(e)) return;
    const g = this.gesture;
    if (g) {
      if (g.mode === "pending") {
        // The browser's long press (Chrome on Android) beat the timer: it is the long press. Let it
        // through to the grid's handlers and make sure the timer does not open a second menu.
        this.clearTimer(g);
        g.mode = "longPressed";
        if (g.zone === "header") this.params.columnDragCancel();
        this.lastTap = null;
        return;
      }
      if (g.mode === "longPressed" && this.longPress?.claimed) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (g.mode === "resize" || g.mode === "fill" || g.mode === "columnDrag") {
        // A finger held still on a handle mid-drag is not a request for a menu.
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    // Some browsers fire it at release instead: still the same long press.
    const lp = this.longPress;
    if (lp && lp.claimed && Date.now() - lp.at <= COMPAT_WINDOW_MS + LONG_PRESS_MS) {
      this.longPress = null;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
}

/** Form controls and editable content keep their native touch behaviour (focus, caret, keyboard). */
function isNativeControl(target: Element): boolean {
  return !!target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], .pte-cell-editing");
}
