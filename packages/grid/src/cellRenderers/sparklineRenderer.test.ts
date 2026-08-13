// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { SparklineRenderer } from "./sparklineRenderer";
import type { CellRendererParams } from "../renderer/renderer";
import {
  RENDERER_TOOLTIP_TARGET_UPDATED,
  registerRendererTooltipTarget,
} from "../renderer/tooltip/rendererTooltipTarget";

describe("SparklineRenderer performance", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reuses measured dimensions while virtual rows are recycled", () => {
    let scheduled: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      scheduled = callback;
      return 1;
    });

    const renderer = new SparklineRenderer();
    const params = {
      value: [10, 20, 15],
      colDef: { colId: "trend", cellRendererParams: { showPoints: true } },
      registerTooltipTarget: () => () => {},
      refreshReason: "data",
    } as unknown as CellRendererParams;

    renderer.init(params);
    const svg = renderer.getGui().querySelector("svg")!;
    const measure = vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      width: 160,
      height: 32,
    } as DOMRect);

    expect(measure).not.toHaveBeenCalled();
    scheduled?.(0);
    expect(measure).toHaveBeenCalledTimes(1);

    renderer.refresh({ ...params, value: [20, 30, 25] });
    expect(measure).toHaveBeenCalledTimes(1);

    renderer.refresh({ ...params, refreshReason: "resize" });
    scheduled?.(1);
    expect(measure).toHaveBeenCalledTimes(2);

    renderer.destroy();
  });

  it("retains point tooltip targets and updates their content and anchors in place", () => {
    const registrations: Array<{
      target: Element;
      getContent: () => string | number | null | undefined;
      anchor?: Element;
      cleanup: ReturnType<typeof vi.fn>;
    }> = [];
    const registerTooltipTarget: CellRendererParams["registerTooltipTarget"] =
      (target, getContent, anchor) => {
        const dispose = registerRendererTooltipTarget(target, getContent, anchor);
        const cleanup = vi.fn(dispose);
        registrations.push({ target, getContent, anchor, cleanup });
        return cleanup;
      };
    const params = {
      value: [["Jan", 10], ["Feb", 20], ["Mar", 30]],
      colDef: { colId: "trend", cellRendererParams: {} },
      registerTooltipTarget,
      refreshReason: "data",
    } as unknown as CellRendererParams;
    const renderer = new SparklineRenderer();
    renderer.init(params);
    const gui = renderer.getGui();
    const initialTargets = [...gui.querySelectorAll(".pte-sparkline-tooltip-target")];
    const middleAnchor = registrations[1].anchor;
    const initialCy = middleAnchor?.getAttribute("cy");
    const updated = vi.fn();
    gui.addEventListener(RENDERER_TOOLTIP_TARGET_UPDATED, updated);

    renderer.refresh({
      ...params,
      value: [["Jan", 10], ["Feb", 28], ["Mar", 30]],
    });

    expect([...gui.querySelectorAll(".pte-sparkline-tooltip-target")]).toEqual(initialTargets);
    expect(registrations).toHaveLength(3);
    expect(registrations[1].anchor).toBe(middleAnchor);
    expect(middleAnchor?.getAttribute("cy")).not.toBe(initialCy);
    expect(registrations[1].getContent()).toBe("Feb: 28");
    expect(registrations.every(registration => !registration.cleanup.mock.calls.length)).toBe(true);
    expect(updated).toHaveBeenCalledTimes(1);
    expect((updated.mock.calls[0][0] as CustomEvent).detail.targets).toEqual(initialTargets);

    renderer.destroy();
    expect(registrations.every(registration => registration.cleanup.mock.calls.length === 1)).toBe(true);
  });
});
