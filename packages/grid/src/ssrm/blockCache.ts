// Least-recently-used bookkeeping for the server-side block cache (`serverSideMaxBlocks`). Kept
// apart from the row model so the eviction choice is a pure function of the cache's shape: which
// blocks are loaded, when each was last used, and which may not go.

/** One loaded `blockSize` range of a listing, as the eviction pass sees it. */
export interface CachedBlock {
  /** Listing (parent node id; "" for the root) the block belongs to. */
  listingId: string;
  /** First child index of the block (a multiple of the block size). */
  start: number;
  /** Use stamp: higher is more recent. */
  lastUse: number;
  /** In or next to the viewport, in flight, or holding an expanded parent / a parent whose
   * subtree has a fetch in flight. Counted toward the cap, never evicted. */
  pinned: boolean;
}

/**
 * The resolved cap: a positive whole number, or undefined for an unbounded cache. Anything that
 * is not a finite number (unset, null, NaN) keeps today's unbounded behaviour; a finite value is
 * floored and clamped to at least one block — a cache that may hold nothing could never show a row.
 */
export function resolveMaxBlocks(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.floor(value));
}

/**
 * Blocks to evict so that at most `maxBlocks` stay loaded: unpinned blocks, least recently used
 * first (ties by listing then start, so the choice is deterministic). Pinned blocks count toward
 * the cap but are never chosen, so when too many are pinned the cache stays over the cap rather
 * than dropping a block the view or a live subtree depends on.
 */
export function selectBlocksToEvict(blocks: readonly CachedBlock[], maxBlocks: number): CachedBlock[] {
  let excess = blocks.length - maxBlocks;
  if (excess <= 0) return [];
  const candidates = blocks
    .filter(block => !block.pinned)
    .sort((a, b) => a.lastUse - b.lastUse
      || (a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0)
      || a.start - b.start);
  const out: CachedBlock[] = [];
  for (const block of candidates) {
    if (excess <= 0) break;
    out.push(block);
    excess--;
  }
  return out;
}
