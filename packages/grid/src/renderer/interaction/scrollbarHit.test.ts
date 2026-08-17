// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { isScrollbarGutterEvent } from "./scrollbarHit";

/** happy-dom does no layout, so stand the element's box metrics up by hand. A scroll container
 * with a classic scrollbar reports a client box narrower/shorter than its border box. */
function makeTarget(opts: {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  border?: number;
  direction?: "ltr" | "rtl";
}): HTMLElement {
  const el = document.createElement("div");
  const border = opts.border ?? 0;
  el.style.direction = opts.direction ?? "ltr";
  if (border) el.style.border = `${border}px solid black`;
  document.body.appendChild(el);
  Object.defineProperty(el, "offsetWidth", { value: opts.width, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: opts.height, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: opts.clientWidth, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: opts.clientHeight, configurable: true });
  el.getBoundingClientRect = () => ({
    left: 0, top: 0, right: opts.width, bottom: opts.height,
    width: opts.width, height: opts.height, x: 0, y: 0, toJSON: () => ({}),
  });
  return el;
}

function press(target: HTMLElement, clientX: number, clientY: number): MouseEvent {
  const e = new MouseEvent("mousedown", { clientX, clientY, bubbles: true });
  Object.defineProperty(e, "target", { value: target, configurable: true });
  return e;
}

describe("isScrollbarGutterEvent", () => {
  it("flags a press on the vertical bar of a scroll container", () => {
    // 300px wide box, 15px vertical scrollbar => content stops at x = 285.
    const el = makeTarget({ width: 300, height: 200, clientWidth: 285, clientHeight: 200 });
    expect(isScrollbarGutterEvent(press(el, 292, 100))).toBe(true);
    expect(isScrollbarGutterEvent(press(el, 285, 100))).toBe(true);
  });

  it("leaves presses on content alone", () => {
    const el = makeTarget({ width: 300, height: 200, clientWidth: 285, clientHeight: 200 });
    expect(isScrollbarGutterEvent(press(el, 284, 100))).toBe(false);
    expect(isScrollbarGutterEvent(press(el, 0, 0))).toBe(false);
  });

  it("flags a press on the horizontal bar", () => {
    const el = makeTarget({ width: 300, height: 200, clientWidth: 300, clientHeight: 185 });
    expect(isScrollbarGutterEvent(press(el, 100, 190))).toBe(true);
    expect(isScrollbarGutterEvent(press(el, 100, 184))).toBe(false);
  });

  it("does not mistake a border for a gutter", () => {
    // No scrollbar: the 1px border accounts for the whole border-box/client-box difference, so a
    // press on the border edge is still a content press.
    const el = makeTarget({ width: 300, height: 200, clientWidth: 298, clientHeight: 198, border: 1 });
    expect(isScrollbarGutterEvent(press(el, 299, 100))).toBe(false);
    expect(isScrollbarGutterEvent(press(el, 100, 199))).toBe(false);
  });

  it("reads the vertical bar off the left edge under RTL", () => {
    const el = makeTarget({ width: 300, height: 200, clientWidth: 285, clientHeight: 200, direction: "rtl" });
    expect(isScrollbarGutterEvent(press(el, 7, 100))).toBe(true);
    expect(isScrollbarGutterEvent(press(el, 20, 100))).toBe(false);
  });

  it("ignores elements with no scroll gutter at all", () => {
    const el = makeTarget({ width: 100, height: 24, clientWidth: 100, clientHeight: 24 });
    expect(isScrollbarGutterEvent(press(el, 99, 23))).toBe(false);
  });
});
