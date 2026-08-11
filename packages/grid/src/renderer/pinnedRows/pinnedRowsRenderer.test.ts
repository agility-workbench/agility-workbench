// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import type { GridCore } from "../../core/core";
import type { IGridAPI } from "../../interfaces/iGridAPI";
import type { BodyCellRenderer } from "../body/cellRenderer";
import { ActiveDescendantTracker } from "../aria";
import { PinnedRowsRenderer } from "./pinnedRowsRenderer";

function createRenderer() {
  const root = document.createElement("div");
  const body = document.createElement("div");
  root.appendChild(body);
  const renderer = new PinnedRowsRenderer({
    core: {} as GridCore,
    api: {} as IGridAPI,
    root,
    activeDescendant: new ActiveDescendantTracker(root),
    body,
    rowHeight: () => 40,
    bodyCellRenderer: {} as BodyCellRenderer,
    onHeightChanged: () => undefined,
    onBodyPartitionChanged: () => undefined,
  });
  const lanes = Array.from(root.querySelectorAll<HTMLDivElement>(".pte-pinned-rows-vertical"));
  return { renderer, lanes };
}

describe("PinnedRowsRenderer vertical scrollbar lanes", () => {
  it("tracks the central body's vertical scrollbar visibility", () => {
    const { renderer, lanes } = createRenderer();

    renderer.setBodyVerticalScrollbarVisible(true);
    expect(lanes).toHaveLength(3);
    expect(lanes.every(lane => lane.classList.contains("visible"))).toBe(true);

    renderer.setBodyVerticalScrollbarVisible(false);
    expect(lanes.every(lane => !lane.classList.contains("visible"))).toBe(true);
  });

  it("retains an application-pinned lane that has its own vertical overflow", () => {
    const { renderer, lanes } = createRenderer();
    const topLane = lanes[0];
    topLane.classList.add("scrollable");

    renderer.setBodyVerticalScrollbarVisible(false);

    expect(topLane.classList.contains("visible")).toBe(true);
    expect(lanes[1].classList.contains("visible")).toBe(false);
  });
});
