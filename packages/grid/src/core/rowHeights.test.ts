import { describe, expect, it, vi } from "vitest";
import type { IRowNode } from "../interfaces/iRowNode";
import type { GetRowHeight } from "../interfaces/gridOptions";
import { RowHeightIndex, type RowHeightSource } from "./rowHeights";

function node(id: string, data: unknown = { id }): IRowNode {
  return { id, data } as unknown as IRowNode;
}

function source(nodes: Array<IRowNode | undefined>, opts: {
  getRowHeight?: GetRowHeight;
  pinned?: string[];
  defaultHeight?: number;
  autoHeight?: boolean;
} = {}) {
  const pinned = new Set(opts.pinned ?? []);
  const state = { nodes, getRowHeight: opts.getRowHeight, defaultHeight: opts.defaultHeight ?? 40, autoHeight: opts.autoHeight ?? false };
  const src: RowHeightSource = {
    defaultHeight: () => state.defaultHeight,
    getRowHeight: () => state.getRowHeight,
    hasAutoHeight: () => state.autoHeight,
    viewCount: () => state.nodes.length,
    nodeAt: (i) => state.nodes[i],
    isBodyPinned: (id) => pinned.has(id),
    pinnedCountBefore: (viewIndex) =>
      state.nodes.slice(0, Math.max(0, viewIndex)).filter(n => n && pinned.has(n.id)).length,
  };
  return { src, state };
}

const byId = (heights: Record<string, number>): GetRowHeight => ({ node }) => heights[node.id];

describe("RowHeightIndex", () => {
  it("answers arithmetically without getRowHeight, compacting pinned rows", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d")];
    const index = new RowHeightIndex(source(nodes, { pinned: ["b"] }).src);
    expect(index.isUniform()).toBe(true);
    expect(index.topOf(0)).toBe(0);
    expect(index.topOf(2)).toBe(40); // b holds no body place
    expect(index.topOf(4)).toBe(120);
    expect(index.heightAt(1)).toBe(0);
    expect(index.heightAt(2)).toBe(40);
    expect(index.totalHeight()).toBe(120);
    // The pre-index window arithmetic: floor(offset / rowHeight).
    expect(index.indexAt(85)).toBe(2);
    expect(index.minHeight()).toBe(40);
  });

  it("builds prefix sums from getRowHeight", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const index = new RowHeightIndex(source(nodes, { getRowHeight: byId({ a: 20, b: 100 }) }).src);
    expect(index.topOf(0)).toBe(0);
    expect(index.topOf(1)).toBe(20);
    expect(index.topOf(2)).toBe(120);
    expect(index.topOf(3)).toBe(160); // c falls back to rowHeight
    expect(index.heightAt(1)).toBe(100);
    expect(index.totalHeight()).toBe(160);
    expect(index.minHeight()).toBe(20);
  });

  it("finds the row drawn at an offset", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const index = new RowHeightIndex(source(nodes, { getRowHeight: byId({ a: 20, b: 100, c: 30 }) }).src);
    expect(index.indexAt(-5)).toBe(0);
    expect(index.indexAt(0)).toBe(0);
    expect(index.indexAt(19.9)).toBe(0);
    expect(index.indexAt(20)).toBe(1);
    expect(index.indexAt(119)).toBe(1);
    expect(index.indexAt(120)).toBe(2);
    expect(index.indexAt(10_000)).toBe(2);
  });

  it("skips zero-height pinned rows when resolving an offset", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const index = new RowHeightIndex(source(nodes, { getRowHeight: byId({ a: 20, c: 50 }), pinned: ["b"] }).src);
    expect(index.heightAt(1)).toBe(0);
    expect(index.topOf(2)).toBe(20);
    expect(index.indexAt(20)).toBe(2);
    expect(index.totalHeight()).toBe(70);
  });

  it("falls back to rowHeight for answers that are not positive finite numbers", () => {
    const nodes = ["a", "b", "c", "d", "e"].map(id => node(id));
    const heights: Record<string, unknown> = { a: 0, b: -5, c: Number.NaN, d: null, e: Infinity };
    const index = new RowHeightIndex(source(nodes, {
      getRowHeight: ({ node }) => heights[node.id] as number,
    }).src);
    expect(index.totalHeight()).toBe(200);
  });

  it("gives unloaded rows the default height without asking", () => {
    const getRowHeight = vi.fn(() => 10);
    const index = new RowHeightIndex(source([node("a"), undefined, node("c")], { getRowHeight }).src);
    expect(index.topOf(2)).toBe(50);
    expect(getRowHeight).toHaveBeenCalledTimes(2);
  });

  it("asks once per row and data object, and again after resetHeights", () => {
    const getRowHeight = vi.fn(() => 30);
    const nodes = [node("a"), node("b")];
    const { src, state } = source(nodes, { getRowHeight });
    const index = new RowHeightIndex(src);
    index.totalHeight();
    expect(getRowHeight).toHaveBeenCalledTimes(2);

    // A rebuild (sort) reuses the cache.
    state.nodes = [nodes[1], nodes[0]];
    index.invalidate();
    expect(index.topOf(1)).toBe(30);
    expect(getRowHeight).toHaveBeenCalledTimes(2);

    // A replaced data object is asked again.
    state.nodes = [nodes[1], node("a", { id: "a", note: "new" })];
    index.invalidate();
    index.totalHeight();
    expect(getRowHeight).toHaveBeenCalledTimes(3);

    index.resetHeights();
    index.totalHeight();
    expect(getRowHeight).toHaveBeenCalledTimes(5);
  });

  it("rebuilds when the view count changes even without an invalidate", () => {
    const { src, state } = source([node("a")], { getRowHeight: () => 25 });
    const index = new RowHeightIndex(src);
    expect(index.totalHeight()).toBe(25);
    state.nodes = [node("a"), node("b")];
    expect(index.totalHeight()).toBe(50);
  });

  it("extends past both ends of the view at the default height", () => {
    const index = new RowHeightIndex(source([node("a")], { getRowHeight: () => 10 }).src);
    expect(index.topOf(-2)).toBe(-80);
    expect(index.topOf(3)).toBe(10 + 2 * 40);
  });

  describe("measured heights (autoHeight)", () => {
    it("is not uniform while an autoHeight column shows, and grows rows to what they need", () => {
      const nodes = [node("a"), node("b"), node("c")];
      const { src, state } = source(nodes, { autoHeight: true });
      const index = new RowHeightIndex(src);
      expect(index.isUniform()).toBe(false);
      expect(index.totalHeight()).toBe(120);
      expect(index.setMeasured(nodes[1], 90, 1)).toBe(true);
      expect(index.heightAt(1)).toBe(90);
      expect(index.topOf(2)).toBe(130);
      expect(index.totalHeight()).toBe(170);
      // Never shorter than the configured height.
      expect(index.setMeasured(nodes[2], 10, 2)).toBe(false);
      expect(index.heightAt(2)).toBe(40);
      // Measurements stay while the column is hidden, unused.
      state.autoHeight = false;
      expect(index.isUniform()).toBe(true);
      expect(index.totalHeight()).toBe(120);
    });

    it("shifts the offsets below a measured row in place", () => {
      const nodes = Array.from({ length: 5 }, (_, i) => node(`r${i}`));
      const index = new RowHeightIndex(source(nodes, { autoHeight: true }).src);
      expect(index.topOf(4)).toBe(160);
      index.setMeasured(nodes[1], 100, 1);
      expect(index.topOf(1)).toBe(40);
      expect(index.topOf(2)).toBe(140);
      expect(index.topOf(4)).toBe(220);
      // A shrink back is applied too.
      index.setMeasured(nodes[1], 50, 1);
      expect(index.topOf(4)).toBe(170);
    });

    it("takes the larger of getRowHeight and the measurement", () => {
      const nodes = [node("a")];
      const index = new RowHeightIndex(source(nodes, { autoHeight: true, getRowHeight: () => 70 }).src);
      index.setMeasured(nodes[0], 60, 0);
      expect(index.heightAt(0)).toBe(70);
      index.setMeasured(nodes[0], 85, 0);
      expect(index.heightAt(0)).toBe(85);
    });

    it("ignores a measurement taken with a replaced data object, and forgets them on resetHeights", () => {
      const original = node("a");
      const { src, state } = source([original], { autoHeight: true });
      const index = new RowHeightIndex(src);
      index.setMeasured(original, 90, 0);
      expect(index.heightAt(0)).toBe(90);
      state.nodes = [node("a", { id: "a", replaced: true })];
      index.invalidate();
      expect(index.heightAt(0)).toBe(40);
      state.nodes = [original];
      index.invalidate();
      expect(index.heightAt(0)).toBe(90);
      index.resetHeights();
      expect(index.heightAt(0)).toBe(40);
    });

    it("moves no body offset for a band row", () => {
      const nodes = [node("a"), node("b")];
      const index = new RowHeightIndex(source(nodes, { autoHeight: true }).src);
      expect(index.totalHeight()).toBe(80);
      expect(index.setMeasured(node("band", {}), 120, -1)).toBe(true);
      expect(index.totalHeight()).toBe(80);
    });
  });
});
