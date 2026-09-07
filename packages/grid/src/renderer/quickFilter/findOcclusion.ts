/**
 * Geometry for getting the active find match out from under the floating quick-filter widget.
 *
 * In find mode the widget is not transient chrome the user dismisses once the search is typed: it is
 * a control surface they keep operating (next/previous, the match counter) while reading the cells
 * it is pointed at. So a match that lands underneath it is unreachable — "collapse the widget to
 * look" is exactly what find mode cannot afford.
 *
 * Scrolling is the preferred escape, and the reason it cannot be the only one is that it runs out:
 *  - the top row at `scrollTop: 0` has nowhere further to go — the content cannot move down;
 *  - the last column at maximum `scrollLeft` has nowhere further to go either;
 *  - pinned columns and rows mirrored into a frozen band do not move with the scrollers at all.
 * Those are precisely the cases the widget's default (top-right) placement covers, so when no scroll
 * clears the match the widget itself has to yield — see `QuickFilterWidget.dodge`.
 *
 * This module is the pure part: one axis at a time, in plain numbers, so the decision is testable
 * without layout. The renderer measures, this decides, the renderer applies.
 */

/** Fractional rects and scroll offsets are common; ignore sub-pixel overlaps and sub-pixel moves. */
const EPSILON = 0.5;

/**
 * One axis of the problem, all in the viewport coordinate space of that axis' scroller (px from the
 * viewport's leading edge, which is where a `getBoundingClientRect()` difference lands).
 */
export interface OcclusionAxis {
  /** Where the target (the match's row or column) starts right now. */
  targetStart: number;
  /** How far the target extends (row height, or column width). */
  targetSize: number;
  /** The scroller's visible extent along this axis. */
  viewportSize: number;
  /** The occluder's leading edge. May sit outside the viewport. */
  occluderStart: number;
  /** The occluder's trailing edge. */
  occluderEnd: number;
  /**
   * The scroll offset this axis can move the target with, or null when it cannot move at all — a
   * pinned column, or a row docked in a frozen band.
   */
  scroll: { current: number; max: number } | null;
}

/** What the renderer should do about an occluded match. */
export interface OcclusionPlan {
  /** Scroll this axis to `offset` to clear the occluder. Absent when only a dodge can. */
  scroll?: { axis: "vertical" | "horizontal"; offset: number };
  /** True when neither axis can scroll the match clear and the occluder has to move instead. */
  dodge: boolean;
}

/** Does the target overlap the occluder along this axis at all? */
function overlaps(axis: OcclusionAxis): boolean {
  return axis.targetStart + axis.targetSize > axis.occluderStart + EPSILON
    && axis.targetStart < axis.occluderEnd - EPSILON;
}

/**
 * The smallest scroll delta that moves the target wholly clear of the occluder along this axis while
 * keeping it inside the viewport, or null when neither side has the room. Scrolling by `+d` moves
 * the target's viewport position by `-d`.
 */
function escapeDelta(axis: OcclusionAxis): number | null {
  const { targetStart, targetSize, viewportSize, occluderStart, occluderEnd, scroll } = axis;
  if (!scroll) return null;
  const candidates: number[] = [];

  // Park the target before the occluder: its trailing edge reaches occluderStart. Feasible while the
  // target's leading edge stays in view (delta <= targetStart) and the scroller has that much left.
  const before = targetStart + targetSize - occluderStart;
  if (before <= targetStart + EPSILON && scroll.current + before <= scroll.max + EPSILON) {
    candidates.push(before);
  }

  // Or after it: the target's leading edge reaches occluderEnd. This delta is negative (scrolling
  // back), so it is bounded by the start of the range, and by the target's trailing edge staying in
  // view — which is what rules out squeezing a cell into the gutter beside an edge-anchored widget.
  const after = targetStart - occluderEnd;
  if (after >= targetStart + targetSize - viewportSize - EPSILON && scroll.current + after >= -EPSILON) {
    candidates.push(after);
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((best, d) => (Math.abs(d) < Math.abs(best) ? d : best));
}

/**
 * Decide how to reveal a match that the ordinary scroll-into-view left underneath the widget.
 *
 * Returns null when there is nothing to do — either the match is already clear of the occluder (they
 * only occlude when they overlap on BOTH axes, so a match that misses on one is visible), or the
 * caller could not work out where the match is, in which case leaving the grid alone beats guessing.
 */
export function planOcclusionEscape(
  vertical: OcclusionAxis | null,
  horizontal: OcclusionAxis | null,
): OcclusionPlan | null {
  if (!vertical || !horizontal) return null;
  if (!overlaps(vertical) || !overlaps(horizontal)) return null;

  const dh = escapeDelta(horizontal);
  const dv = escapeDelta(vertical);
  // Whichever moves the grid least. Ties go to the horizontal: the widget lives in the strip under
  // the header, so a vertical escape drags the match away from the top of the grid where the reveal
  // just put it, while a horizontal one keeps it on the same row.
  const useHorizontal = dh != null && (dv == null || Math.abs(dh) <= Math.abs(dv));
  if (useHorizontal) {
    return { scroll: { axis: "horizontal", offset: clampScroll(horizontal, dh as number) }, dodge: false };
  }
  if (dv != null) {
    return { scroll: { axis: "vertical", offset: clampScroll(vertical, dv) }, dodge: false };
  }
  return { dodge: true };
}

function clampScroll(axis: OcclusionAxis, delta: number): number {
  const scroll = axis.scroll as { current: number; max: number };
  return Math.max(0, Math.min(scroll.max, scroll.current + delta));
}
