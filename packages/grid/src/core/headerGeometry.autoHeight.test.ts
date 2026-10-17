import { describe, expect, it } from "vitest";
import { autoHeaderLevelHeights, headerGeometry } from "./headerGeometry";

const heights = { parentHeaderHeight: 30, leafHeaderHeight: 43 };

describe("headerGeometry minLevelHeights", () => {
  it("raises a level to its minimum and never lowers one", () => {
    const g = headerGeometry(3, heights, [50, 10, 80]);
    expect(g.levels).toEqual([50, 30, 80]);
    expect(g.total).toBe(160);
  });

  it("ignores missing, non-finite and surplus entries", () => {
    expect(headerGeometry(2, heights, [undefined, Number.NaN, 99]).levels).toEqual([30, 43]);
    expect(headerGeometry(2, heights, null).levels).toEqual([30, 43]);
  });

  it("feeds the raised levels into every cell height", () => {
    const g = headerGeometry(2, heights, [60, 70]);
    expect(g.cellHeights(2, 2)).toEqual({ cell: 130, container: 60, childLevels: 1 });
    expect(g.cellHeights(1, 1)).toEqual({ cell: 70, container: 70, childLevels: 0 });
    expect(g.cellHeights(1, 2)).toEqual({ cell: 130, container: 130, childLevels: 0 });
  });
});

describe("containerLevels", () => {
  it("names the levels a cell's own content row occupies", () => {
    const g = headerGeometry(3, heights);
    expect(g.containerLevels(1, 1)).toEqual({ top: 2, bottom: 2 }); // leaf under groups
    expect(g.containerLevels(1, 3)).toEqual({ top: 0, bottom: 2 }); // top-level leaf spans all
    expect(g.containerLevels(3, 3)).toEqual({ top: 0, bottom: 0 }); // three-level group
    expect(g.containerLevels(2, 3)).toEqual({ top: 0, bottom: 1 }); // shallower group, taller label
    expect(g.containerLevels(2, 2)).toEqual({ top: 1, bottom: 1 }); // nested group
  });
});

describe("autoHeaderLevelHeights", () => {
  const base = headerGeometry(2, heights);

  it("is null without requirements (the configured heights)", () => {
    expect(autoHeaderLevelHeights(base, [])).toBeNull();
  });

  it("takes the tallest requirement per level, never below the configured height", () => {
    expect(autoHeaderLevelHeights(base, [
      { top: 1, bottom: 1, height: 60 },
      { top: 1, bottom: 1, height: 75 },
      { top: 1, bottom: 1, height: 20 },
    ])).toEqual([30, 75]);
    expect(autoHeaderLevelHeights(base, [{ top: 1, bottom: 1, height: 10 }])).toEqual([30, 43]);
  });

  it("grows each level independently", () => {
    expect(autoHeaderLevelHeights(base, [
      { top: 0, bottom: 0, height: 50 },
      { top: 1, bottom: 1, height: 44 },
    ])).toEqual([50, 44]);
  });

  it("a spanning cell grows only its bottom level, by what the resolved levels above leave short", () => {
    // A top-level leaf spans both levels and needs 100: the parent level (grown to 50 by a group)
    // gives 50, so the leaf level needs 50.
    expect(autoHeaderLevelHeights(base, [
      { top: 0, bottom: 1, height: 100 },
      { top: 0, bottom: 0, height: 50 },
    ])).toEqual([50, 50]);
    // With the configured parent level it would need 70.
    expect(autoHeaderLevelHeights(base, [{ top: 0, bottom: 1, height: 100 }])).toEqual([30, 70]);
  });

  it("rounds fractional measurements up", () => {
    expect(autoHeaderLevelHeights(base, [{ top: 1, bottom: 1, height: 60.2 }])).toEqual([30, 61]);
  });
});
