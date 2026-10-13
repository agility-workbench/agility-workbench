import { describe, expect, it } from "vitest";
import { DEFAULT_HEADER_HEIGHT, headerGeometry, resolveHeaderHeights } from "./headerGeometry";

describe("resolveHeaderHeights", () => {
  it("defaults every level to 43", () => {
    expect(resolveHeaderHeights({})).toEqual({ headerHeight: 43, leafHeaderHeight: 43, parentHeaderHeight: 43 });
    expect(DEFAULT_HEADER_HEIGHT).toBe(43);
  });

  it("level heights follow headerHeight unless set", () => {
    expect(resolveHeaderHeights({ headerHeight: 60 }))
      .toEqual({ headerHeight: 60, leafHeaderHeight: 60, parentHeaderHeight: 60 });
    expect(resolveHeaderHeights({ headerHeight: 60, leafHeaderHeight: 80 }))
      .toEqual({ headerHeight: 60, leafHeaderHeight: 80, parentHeaderHeight: 60 });
    expect(resolveHeaderHeights({ parentHeaderHeight: 30 }))
      .toEqual({ headerHeight: 43, leafHeaderHeight: 43, parentHeaderHeight: 30 });
  });

  it("falls back to the theme's header height before 43, behind an explicit option", () => {
    expect(resolveHeaderHeights({}, 50)).toEqual({ headerHeight: 50, leafHeaderHeight: 50, parentHeaderHeight: 50 });
    expect(resolveHeaderHeights({ headerHeight: 30 }, 50).headerHeight).toBe(30);
    expect(resolveHeaderHeights({ leafHeaderHeight: 40 }, 50))
      .toEqual({ headerHeight: 50, leafHeaderHeight: 40, parentHeaderHeight: 50 });
  });

  it("keeps an explicit 0", () => {
    expect(resolveHeaderHeights({ headerHeight: 0 }).leafHeaderHeight).toBe(0);
  });
});

describe("headerGeometry", () => {
  const heights = { parentHeaderHeight: 30, leafHeaderHeight: 60 };

  it("puts the leaf height on the deepest level and the parent height above it", () => {
    expect(headerGeometry(1, heights).levels).toEqual([60]);
    expect(headerGeometry(3, heights).levels).toEqual([30, 30, 60]);
  });

  it("totals (levels - 1) * parent + leaf", () => {
    expect(headerGeometry(1, heights).total).toBe(60);
    expect(headerGeometry(2, heights).total).toBe(90);
    expect(headerGeometry(3, heights).total).toBe(120);
    expect(headerGeometry(0, heights).total).toBe(0);
  });

  it("sumLevels is inclusive and clamps to the header", () => {
    const g = headerGeometry(3, heights);
    expect(g.sumLevels(0, 0)).toBe(30);
    expect(g.sumLevels(1, 2)).toBe(90);
    expect(g.sumLevels(0, 2)).toBe(120);
    expect(g.sumLevels(2, 1)).toBe(0);
    expect(g.sumLevels(-1, 9)).toBe(120);
  });

  it("a leaf's cell and content span every level it is given", () => {
    const g = headerGeometry(3, heights);
    expect(g.cellHeights(1, 3)).toEqual({ cell: 120, container: 120, childLevels: 0 });
    expect(g.cellHeights(1, 2)).toEqual({ cell: 90, container: 90, childLevels: 0 });
    expect(g.cellHeights(1, 1)).toEqual({ cell: 60, container: 60, childLevels: 0 });
  });

  it("a full-depth group's content is one parent level and its children take the rest", () => {
    const g = headerGeometry(3, heights);
    expect(g.cellHeights(3, 3)).toEqual({ cell: 120, container: 30, childLevels: 2 });
    expect(g.cellHeights(2, 2)).toEqual({ cell: 90, container: 30, childLevels: 1 });
  });

  it("a shallow group keeps its children on the bottom levels and takes the extra itself", () => {
    const g = headerGeometry(3, heights);
    expect(g.cellHeights(2, 3)).toEqual({ cell: 120, container: 60, childLevels: 1 });
  });
});
