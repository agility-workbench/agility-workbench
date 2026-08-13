// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { FloatingAnchor } from "./floatingAnchor";

describe("FloatingAnchor follow positioning", () => {
  it("moves an open floater without remounting its content", () => {
    const root = document.createElement("div");
    root.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: 400,
      width: 500,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(root);

    const content = document.createElement("div");
    content.textContent = "Pointer tooltip";
    const floating = new FloatingAnchor(root);
    const overlay = floating.show(content, {
      mode: { kind: "follow", x: 20, y: 30 },
      className: "pte-tooltip",
    });
    expect(overlay.style.left).toBe("28px");
    expect(overlay.style.top).toBe("38px");
    const replaceChildren = vi.spyOn(overlay, "replaceChildren");

    floating.updateFollowPosition(90, 110);

    expect(overlay.style.left).toBe("98px");
    expect(overlay.style.top).toBe("118px");
    expect(overlay.firstElementChild).toBe(content);
    expect(replaceChildren).not.toHaveBeenCalled();
    floating.destroy();
    root.remove();
  });
});
