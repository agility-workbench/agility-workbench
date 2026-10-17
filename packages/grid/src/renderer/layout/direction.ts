/**
 * Inline-direction helpers shared by everything that reads or writes a horizontal offset.
 *
 * In a right-to-left scroll container the browser keeps `scrollLeft` at 0 at the START edge (the
 * right) and makes it NEGATIVE as the content scrolls towards the left (Chrome 85+, Firefox,
 * Safari). Code that reasons about "how far from the start edge" therefore goes through
 * `scrollStart` / `setScrollStart` and never touches `scrollLeft` with a sign of its own. Copying
 * one container's `scrollLeft` straight into another's (the scroll-sync echo) is fine either way:
 * both carry the same convention.
 *
 * `rtl` is passed in rather than measured here: `getComputedStyle` in a scroll handler is a layout
 * flush, and the grid's direction is fixed at creation (`enableRtl`), so every renderer caches it.
 */

/**
 * The root's resolved direction. `enableRtl` wins when set; otherwise the direction the root
 * inherits from the page, read from its computed style.
 *
 * Fallback for DOM shims (happy-dom, jsdom) that never map the `dir` attribute onto `direction`:
 * when the root computes `ltr` but its closest `[dir]` ancestor says `rtl`, that ancestor's own
 * computed value decides whether the environment honours the attribute. A real browser computes
 * `rtl` there, so an `ltr` root under it means the page overrode the direction in CSS between the
 * two and LTR is right; a shim computes `ltr` on the marked element too, and the attribute wins.
 */
export function resolveRtl(root: Element, enableRtl: boolean | undefined): boolean {
  if (enableRtl != null) return enableRtl;
  if (typeof getComputedStyle !== "function") return false;
  if (getComputedStyle(root).direction === "rtl") return true;
  const marked = root.closest("[dir]");
  if (!marked || marked.getAttribute("dir")?.trim().toLowerCase() !== "rtl") return false;
  return getComputedStyle(marked).direction !== "rtl";
}

/**
 * Is the grid that owns `el` right-to-left? The renderer writes the resolved direction onto the
 * root's `dir` attribute once (at construction when `enableRtl` forces it, at attach otherwise),
 * so every sub-renderer reads it from there: an attribute read, never a style flush. `el` is the
 * root itself or any element inside it.
 */
export function isRtl(el: Element | null | undefined): boolean {
  if (!el) return false;
  const root = el.classList.contains("pte-root") ? el : el.closest(".pte-root");
  return root?.getAttribute("dir") === "rtl";
}

/** Pixels scrolled from the inline-start edge, always ≥ 0. */
export function scrollStart(el: Element, rtl: boolean): number {
  return rtl ? Math.abs(el.scrollLeft) : el.scrollLeft;
}

/** Scroll `px` pixels from the inline-start edge. Clamping is the browser's. */
export function setScrollStart(el: Element, rtl: boolean, px: number): void {
  const value = Math.max(0, px);
  el.scrollLeft = rtl ? -value : value;
}

/** Scroll by a delta measured along the inline axis (positive = towards the inline end). */
export function scrollStartBy(el: Element, rtl: boolean, deltaPx: number): void {
  setScrollStart(el, rtl, scrollStart(el, rtl) + deltaPx);
}

/** A box's inline-start edge in viewport coordinates: `left` in LTR, `right` in RTL. */
export function inlineStart(rect: DOMRect, rtl: boolean): number {
  return rtl ? rect.right : rect.left;
}

/** A box's inline-end edge in viewport coordinates: `right` in LTR, `left` in RTL. */
export function inlineEnd(rect: DOMRect, rtl: boolean): number {
  return rtl ? rect.left : rect.right;
}

/** Distance of a viewport x from a box's inline-start edge, growing towards the inline end. */
export function inlineOffset(x: number, rect: DOMRect, rtl: boolean): number {
  return rtl ? rect.right - x : x - rect.left;
}

/** A pointer delta along the inline axis: positive when moving towards the inline end. */
export function inlineDelta(deltaX: number, rtl: boolean): number {
  return rtl ? -deltaX : deltaX;
}

/**
 * A physical arrow key mapped to the logical step it means: `ArrowRight` steps towards the inline
 * end in LTR and towards the inline START in RTL (the next column sits to the left there). Keys
 * other than the two horizontal arrows come back unchanged, so a binding table can map every key
 * through this once and keep its logical `"left"`/`"right"` ("previous"/"next") vocabulary.
 */
export function logicalArrowKey(key: string, rtl: boolean): string {
  if (!rtl) return key;
  if (key === "ArrowLeft") return "ArrowRight";
  if (key === "ArrowRight") return "ArrowLeft";
  return key;
}

/** Where a box of `width` sits so that its inline-start edge is at viewport x `start`. */
export function physicalLeftFromInlineStart(start: number, width: number, rtl: boolean): number {
  return rtl ? start - width : start;
}

/**
 * A key binding's physical direction mapped to the logical one the model steps in. The navigation
 * actions are logical (`"left"` = previous column, `"right"` = next column); ArrowLeft means
 * "towards the visual left", which is the NEXT column in RTL. Any other value passes through, so
 * `"up"`/`"down"`/`"home"`/`"end"` keep their meaning.
 */
export function mirrorHorizontal<T extends string>(dir: T, rtl: boolean): T {
  if (!rtl) return dir;
  if (dir === "left") return "right" as T;
  if (dir === "right") return "left" as T;
  return dir;
}
