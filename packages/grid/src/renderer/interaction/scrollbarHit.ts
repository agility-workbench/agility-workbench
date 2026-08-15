/** True when a mouse event landed on the target element's own scrollbar gutter rather than on any
 * content inside it.
 *
 * The body is both the grid's single vertical scroll container and the element carrying the cell
 * mouse listeners, so pressing its scrollbar arrives with `target === body` — indistinguishable
 * from a click on empty body space, which clears the selection. The visible horizontal bar is a
 * separate proxy element mounted outside the body, which is why only the vertical one ever hit
 * this. The pinned-row bands have the same shape: their scrollable band sits inside an interaction
 * root, so its bar is caught here too.
 *
 * A classic (non-overlay) scrollbar occupies the gap between the padding box (`clientWidth` /
 * `clientHeight`) and the inside of the border box, so the gutter exists iff that gap is non-zero
 * and the pointer sits within it. Overlay scrollbars leave no gap, but browsers do not dispatch
 * mouse events to the page for those, so there is nothing to filter.
 */
export function isScrollbarGutterEvent(e: MouseEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el || el.nodeType !== 1 || typeof el.getBoundingClientRect !== "function") return false;
  const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (!style) return false;

  const borderLeft = parseFloat(style.borderLeftWidth) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const gutterX = el.offsetWidth - borderLeft - (parseFloat(style.borderRightWidth) || 0) - el.clientWidth;
  const gutterY = el.offsetHeight - borderTop - (parseFloat(style.borderBottomWidth) || 0) - el.clientHeight;
  if (gutterX <= 0 && gutterY <= 0) return false;

  const rect = el.getBoundingClientRect();
  const x = e.clientX - rect.left - borderLeft;
  const y = e.clientY - rect.top - borderTop;
  // Under RTL the vertical bar sits on the left edge, so the gutter is the leading band instead of
  // everything past the padding box.
  if (gutterX > 0 && (style.direction === "rtl" ? x < gutterX : x >= el.clientWidth)) return true;
  return gutterY > 0 && y >= el.clientHeight;
}
