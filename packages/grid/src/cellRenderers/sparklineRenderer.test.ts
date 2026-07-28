// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { SparklineRenderer } from "./sparklineRenderer";
import type { CellRendererParams } from "../renderer/renderer";

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
});
