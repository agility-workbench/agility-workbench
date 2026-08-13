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

  it("repositions an anchored floater when async content changes its size", () => {
    let notifyResize: ResizeObserverCallback | undefined;
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) { notifyResize = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);

    const root = document.createElement("div");
    document.body.appendChild(root);
    let overlayHeight = 0;
    const rect = (left: number, top: number, width: number, height: number) => ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect);
    const getRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this === root) return rect(0, 0, 600, 400);
        if (this.classList.contains("pte-floating")) return rect(0, 0, 180, overlayHeight);
        return rect(0, 0, 0, 0);
      });

    const floating = new FloatingAnchor(root);
    const overlay = floating.show(document.createElement("div"), {
      mode: { kind: "anchored", getAnchorRect: () => rect(100, 100, 120, 40), placement: "right" },
      className: "pte-tooltip",
    });
    expect(overlay.style.top).toBe("120px");

    // Simulate a React/custom component committing its content after the initial empty-host measure.
    overlayHeight = 60;
    notifyResize?.([{ target: overlay } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    expect(overlay.style.top).toBe("90px");

    floating.destroy();
    getRect.mockRestore();
    vi.unstubAllGlobals();
    root.remove();
  });

  it("does not observe a detached floater when its anchor is already gone", () => {
    const observe = vi.fn();
    class TestResizeObserver {
      observe = observe;
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);

    const root = document.createElement("div");
    document.body.appendChild(root);
    const floating = new FloatingAnchor(root);
    const overlay = floating.show(document.createElement("div"), {
      mode: { kind: "anchored", getAnchorRect: () => null },
      className: "pte-tooltip",
    });

    expect(floating.isOpen()).toBe(false);
    expect(overlay.isConnected).toBe(false);
    expect(observe).not.toHaveBeenCalled();

    floating.destroy();
    vi.unstubAllGlobals();
    root.remove();
  });
});
