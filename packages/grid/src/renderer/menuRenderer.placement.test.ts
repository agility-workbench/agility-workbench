// @vitest-environment happy-dom
/**
 * Menu placement, for the `top-*` positions used by anything anchored to a control at the BOTTOM of
 * the grid — the footer's overflow button, and the aggregate footer cell's function menu.
 *
 * Such a menu opens its own height above its anchor, which means the height has to be known before
 * the top is computed. It was read from `offsetHeight` while the overlay was still `display: none`,
 * so it came back as zero and the menu was placed with its TOP at the anchor: the footer's menu
 * opened *across* the footer it belongs to, covering the controls it was offering to replace.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { MenuRenderer } from "./menuRenderer";

const MENU_HEIGHT = 82;
const ROOT = { left: 0, top: 0, right: 600, bottom: 500 };

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
  // happy-dom has no layout: hand out the rects placement actually reads. The menu overlay reports
  // a height whether or not it is displayed, so a renderer that measures the hidden element still
  // sees zero — which is what makes this test discriminate.
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      if (this === root) return { ...ROOT, width: 600, height: 500 } as DOMRect;
      if (this.classList.contains("pte-menu")) {
        return { left: 0, top: 0, right: 220, bottom: MENU_HEIGHT, width: 220, height: MENU_HEIGHT } as DOMRect;
      }
      const anchor = this.dataset.anchorRect;
      if (anchor) {
        const [left, top, right, bottom] = anchor.split(",").map(Number);
        return { left, top, right, bottom, width: right - left, height: bottom - top } as DOMRect;
      }
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
    },
  });
});

function anchorAt(left: number, top: number, right: number, bottom: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.dataset.anchorRect = `${left},${top},${right},${bottom}`;
  root.appendChild(button);
  return button;
}

describe("menu placement", () => {
  it("opens a top-anchored menu above its anchor, clear of it", () => {
    const renderer = new MenuRenderer(root);
    // A footer button: 32px tall, sitting at the bottom of the grid.
    const anchorEl = anchorAt(500, 440, 542, 472);

    renderer.open({
      anchorEl,
      clientX: 542,
      clientY: 440,
      position: "top-right",
      items: [{ id: "a", label: "Rows per page" }, { id: "b", label: "Aggregate" }],
    });

    const overlay = document.querySelector<HTMLElement>(".pte-menu")!;
    // Its bottom edge sits 4px above the button's top, so the bar itself stays visible.
    expect(overlay.style.top).toBe(`${440 - 4 - MENU_HEIGHT}px`);
    expect(parseFloat(overlay.style.top) + MENU_HEIGHT).toBeLessThan(440);
    renderer.close(0);
  });

  it("still opens a bottom-anchored menu below its anchor", () => {
    const renderer = new MenuRenderer(root);
    const anchorEl = anchorAt(20, 40, 62, 72);

    renderer.open({
      anchorEl,
      clientX: 20,
      clientY: 72,
      position: "bottom-left",
      items: [{ id: "a", label: "Export" }],
    });

    const overlay = document.querySelector<HTMLElement>(".pte-menu")!;
    expect(overlay.style.top).toBe("76px");
    expect(overlay.style.left).toBe("20px");
    renderer.close(0);
  });
});
