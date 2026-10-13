/**
 * Header geometry: how tall each header level is, and how tall a header cell and its content are.
 *
 * The header is `levelCount` levels deep (the column model's `maxHeaderDepth`). The deepest level is
 * the leaf level and is `leafHeaderHeight` tall; every level above it is a group level,
 * `parentHeaderHeight` tall. Both default to `headerHeight`, which defaults to the theme's
 * `headerHeight` param, then 43. The body row
 * height plays no part: one source of truth, so the header wrapper and the cells inside it can never
 * disagree.
 */

export const DEFAULT_HEADER_HEIGHT = 43;

/** The three header-height options as an application supplies them (any may be omitted). */
export interface HeaderHeightOptions {
  headerHeight?: number;
  leafHeaderHeight?: number;
  parentHeaderHeight?: number;
}

export type ResolvedHeaderHeights = Required<HeaderHeightOptions>;

/**
 * `headerHeight` = explicit ?? `themeHeaderHeight` (the theme's `headerHeight` param, read at
 * creation) ?? 43; `parentHeaderHeight` and `leafHeaderHeight` = explicit ?? `headerHeight`. A
 * specific level height always wins over the shared one.
 */
export function resolveHeaderHeights(
  options: HeaderHeightOptions,
  themeHeaderHeight?: number,
): ResolvedHeaderHeights {
  const headerHeight = options.headerHeight ?? themeHeaderHeight ?? DEFAULT_HEADER_HEIGHT;
  return {
    headerHeight,
    parentHeaderHeight: options.parentHeaderHeight ?? headerHeight,
    leafHeaderHeight: options.leafHeaderHeight ?? headerHeight,
  };
}

/** The pixel heights of one header cell: the whole cell and its own content row (its container). */
export interface HeaderCellHeights {
  /** The cell's outer height: every level from its own down to the leaf level. */
  cell: number;
  /** The cell's own label/menu row. A leaf's is the whole cell; a group's sits above its children. */
  container: number;
  /** How many levels the group's children occupy (0 for a leaf). */
  childLevels: number;
}

export interface HeaderGeometry {
  /** Number of header levels. */
  readonly levelCount: number;
  /** Per-level pixel heights, top level first; the last entry is the leaf level. */
  readonly levels: readonly number[];
  /** Height of the whole header: `(levelCount - 1) * parentHeaderHeight + leafHeaderHeight`. */
  readonly total: number;
  /** Sum of the levels `from`..`to`, inclusive (0 when the range is empty). */
  sumLevels(from: number, to: number): number;
  /**
   * Heights for a column of tree depth `depth` (1 for a leaf, 1 + its deepest child for a group)
   * whose cell spans the bottom `levelsBelow` levels (the whole header for a top-level column).
   *
   * A leaf spans every level it is given. A group's children take the bottom `depth - 1` levels, so
   * leaves always line up on the leaf level; the group's own content takes the rest. A group
   * shallower than the space it has (a two-level group beside a three-level one) therefore has a
   * taller label rather than taller children.
   */
  cellHeights(depth: number, levelsBelow: number): HeaderCellHeights;
}

export function headerGeometry(
  levelCount: number,
  heights: Pick<ResolvedHeaderHeights, "leafHeaderHeight" | "parentHeaderHeight">,
): HeaderGeometry {
  const count = Math.max(0, Math.floor(levelCount));
  const levels = Array.from({ length: count }, (_, i) =>
    i === count - 1 ? heights.leafHeaderHeight : heights.parentHeaderHeight);
  const sumLevels = (from: number, to: number): number => {
    let sum = 0;
    for (let i = Math.max(0, from); i <= Math.min(count - 1, to); i++) sum += levels[i];
    return sum;
  };
  const total = sumLevels(0, count - 1);
  return {
    levelCount: count,
    levels,
    total,
    sumLevels,
    cellHeights(depth, levelsBelow) {
      const span = Math.max(1, Math.min(count, levelsBelow));
      const start = count - span;
      const cell = sumLevels(start, count - 1);
      const childLevels = Math.max(0, Math.min(span, depth) - 1);
      const container = sumLevels(start, count - 1 - childLevels);
      return { cell, container, childLevels };
    },
  };
}
