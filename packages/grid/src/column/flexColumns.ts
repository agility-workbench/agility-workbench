/**
 * Flex (proportional) column sizing, the pure half: `ColDef.flex` columns share the centre width
 * the other centre columns leave over, in proportion to their flex values, each kept within its
 * bounds. No DOM, no grid state — the column model feeds it numbers and writes the result back.
 */

export interface FlexItem {
  /** The column's share weight; positive and finite (the caller filters the rest out). */
  flex: number;
  /** Lower bound in px. */
  min: number;
  /** Upper bound in px; `Infinity` for none. */
  max: number;
}

/** A `ColDef.flex` / `ColumnState.flex` value that turns flex on: a positive, finite number. */
export function normalizeFlex(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Split `available` px among `items` by flex weight, as whole pixels.
 *
 * The CSS flexbox "resolve flexible lengths" loop: every open item takes its share of what is left;
 * when some shares break a bound, the side with the larger total violation is frozen at its bounds
 * (all min violators when the clamped total grew, all max violators when it shrank), the frozen
 * widths come off the remaining space, and the rest re-split. A frozen item never moves again, so
 * this ends in at most `items.length` rounds.
 *
 * Rounding: each width is floored, then the pixels lost to flooring go one each to the items with
 * the largest fractional remainders (ties to the earlier item) that still have room under their
 * max — so whenever the bounds allow it the widths sum to exactly `floor(available)`, and the
 * same inputs always give the same widths (no 1px jitter between passes).
 *
 * Never below a min: when the mins alone exceed `available` the result overflows it, and when
 * every item sits at its max the result falls short of it.
 */
export function distributeFlexWidths(available: number, items: readonly FlexItem[]): number[] {
  const n = items.length;
  if (n === 0) return [];
  const total = Math.max(0, Math.floor(Number.isFinite(available) ? available : 0));
  // Integer bounds, so the rounding pass below can never step outside them. A max below the min
  // collapses onto the min (the min wins, as it does on the resize path).
  const mins = items.map(item => Math.max(0, Math.ceil(Number.isFinite(item.min) ? item.min : 0)));
  const maxs = items.map((item, i) => {
    const max = item.max == null || Number.isNaN(item.max) ? Infinity : Math.floor(item.max);
    return Math.max(mins[i], max);
  });

  const target = new Array<number>(n).fill(0);
  const frozen = new Array<boolean>(n).fill(false);
  for (let round = 0; round < n; round++) {
    const open: number[] = [];
    let remaining = total;
    for (let i = 0; i < n; i++) {
      if (frozen[i]) remaining -= target[i];
      else open.push(i);
    }
    if (open.length === 0) break;
    let flexSum = 0;
    for (const i of open) flexSum += items[i].flex;
    let violation = 0;
    for (const i of open) {
      const share = Math.max(0, remaining) * (items[i].flex / flexSum);
      const clamped = Math.min(Math.max(share, mins[i]), maxs[i]);
      target[i] = clamped;
      violation += clamped - share;
    }
    if (violation === 0) break;
    // Positive: mins pushed the total up, so freeze the min violators; negative: freeze the maxes.
    let froze = false;
    for (const i of open) {
      const atMin = target[i] === mins[i];
      const atMax = target[i] === maxs[i];
      const share = Math.max(0, remaining) * (items[i].flex / flexSum);
      if ((violation > 0 && atMin && share < mins[i]) || (violation < 0 && atMax && share > maxs[i])) {
        frozen[i] = true;
        froze = true;
      }
    }
    if (!froze) break;
  }

  const widths = target.map(t => Math.floor(t));
  let spare = total - widths.reduce((sum, w) => sum + w, 0);
  if (spare > 0) {
    const order = widths
      .map((w, i) => ({ i, frac: target[i] - w }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    // Usually one round hands out every lost pixel; more rounds only matter when the floors lost
    // more pixels than there are items with room, which the bounds can make happen.
    while (spare > 0) {
      let gave = false;
      for (const { i } of order) {
        if (spare <= 0) break;
        if (widths[i] + 1 > maxs[i]) continue;
        widths[i] += 1;
        spare -= 1;
        gave = true;
      }
      if (!gave) break;
    }
  }
  return widths;
}
