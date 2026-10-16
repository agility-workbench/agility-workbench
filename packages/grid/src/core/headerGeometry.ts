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
  /** Height of the whole header: the sum of `levels` (`(levelCount - 1) * parentHeaderHeight +
   * leafHeaderHeight` unless measured content raised a level). */
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
  /**
   * The levels a cell's own content row (its container) occupies, top level first: `top` is the
   * cell's own level, `bottom` the lowest level above its children (the leaf level for a leaf).
   * Same arguments as {@link cellHeights}.
   */
  containerLevels(depth: number, levelsBelow: number): { top: number; bottom: number };
}

/**
 * `minLevelHeights` (top level first) raises individual levels above their configured height: a
 * level is `max(configured, minLevelHeights[i])`. It is how measured content (`ColDef.
 * autoHeaderHeight`, see {@link autoHeaderLevelHeights}) reaches the geometry, so every consumer —
 * wrapper, sections, cells, body frame — still reads one set of numbers. Entries past `levelCount`
 * are ignored; a missing or non-finite entry leaves its level at the configured height.
 */
export function headerGeometry(
  levelCount: number,
  heights: Pick<ResolvedHeaderHeights, "leafHeaderHeight" | "parentHeaderHeight">,
  minLevelHeights?: readonly (number | undefined)[] | null,
): HeaderGeometry {
  const count = Math.max(0, Math.floor(levelCount));
  const levels = Array.from({ length: count }, (_, i) => {
    const configured = i === count - 1 ? heights.leafHeaderHeight : heights.parentHeaderHeight;
    const min = minLevelHeights?.[i];
    return min != null && Number.isFinite(min) ? Math.max(configured, min) : configured;
  });
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
    containerLevels(depth, levelsBelow) {
      const span = Math.max(1, Math.min(count, levelsBelow));
      const top = count - span;
      const childLevels = Math.max(0, Math.min(span, depth) - 1);
      return { top, bottom: count - 1 - childLevels };
    },
  };
}

/** One measured header cell for {@link autoHeaderLevelHeights}. */
export interface HeaderContentRequirement {
  /** The cell's own level (see {@link HeaderGeometry.containerLevels}). */
  top: number;
  /** The lowest level its content row occupies; this is the level that grows. */
  bottom: number;
  /** The pixel height the cell's content row needs: content plus the container's padding/borders. */
  height: number;
}

/**
 * Per-level heights that fit measured header content (`ColDef.autoHeaderHeight`), top level
 * first, for {@link headerGeometry}'s `minLevelHeights`.
 *
 * A cell's content row spans levels `top..bottom`; when it needs more than they add up to, the
 * shortfall goes to `bottom` (the leaf level for a leaf, the group's own lowest level for a group).
 * Levels resolve top-down, so a cell spanning several levels only grows its bottom one by what the
 * (already resolved) levels above it leave short. A level never shrinks below its configured
 * height: the result is `max(configured, tallest requirement)` per level. Returns `null` when no
 * requirement is given, meaning "the configured heights".
 */
export function autoHeaderLevelHeights(
  base: HeaderGeometry,
  requirements: readonly HeaderContentRequirement[],
): number[] | null {
  if (requirements.length === 0) return null;
  const levels = base.levels.slice();
  for (let i = 0; i < levels.length; i++) {
    for (const req of requirements) {
      if (req.bottom !== i || !Number.isFinite(req.height)) continue;
      let above = 0;
      for (let j = Math.max(0, req.top); j < i; j++) above += levels[j];
      levels[i] = Math.max(levels[i], Math.ceil(req.height - above));
    }
  }
  return levels;
}
