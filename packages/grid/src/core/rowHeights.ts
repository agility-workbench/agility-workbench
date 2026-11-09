import type { GridId } from "../interfaces/iGridCore";
import type { IRowNode } from "../interfaces/iRowNode";
import type { GetRowHeight } from "../interfaces/gridOptions";

/** What the index reads from the core. Every member is a live read: nothing is copied. */
export interface RowHeightSource {
  /** The grid's `rowHeight` (option, else theme, else 43). */
  defaultHeight(): number;
  getRowHeight(): GetRowHeight | undefined;
  /** Whether a displayed column is `autoHeight`: rows then take measured heights too. */
  hasAutoHeight(): boolean;
  viewCount(): number;
  nodeAt(viewIndex: number): IRowNode | undefined;
  /** Application-pinned model rows leave the body's flow, so they take no height there. */
  isBodyPinned(rowId: GridId): boolean;
  pinnedCountBefore(viewIndex: number): number;
}

/**
 * Body-row geometry in the rendered view's index space: each row's top and height, and the row at a
 * pixel offset. Offsets are in body-content space and compacted for application-pinned model rows,
 * which hold a view index but no place in the body flow.
 *
 * Without `getRowHeight` or an `autoHeight` column every row is `rowHeight` tall and the answers
 * are arithmetic, exactly as before the index existed. Otherwise the index keeps prefix sums over
 * the view, rebuilt lazily after `invalidate()` (any row or pin change); a row's height is asked once
 * per row id and data object and cached until `resetHeights()`, so a rebuild after sorting or
 * filtering calls nothing.
 *
 * `autoHeight` rows also carry a measured height (`setMeasured`, from the renderer once the row has
 * been drawn): the row is then `max(configured, measured)` tall. A measurement belongs to the data
 * object it was taken with, so a replaced row falls back to its configured height until it is
 * measured again. A measurement is overwritten whenever its row is drawn, so after a width, column,
 * theme or font change the drawn rows are re-measured and the rest are corrected as they scroll in.
 */
export class RowHeightIndex {
  /** tops[i] = compacted top of view row i; tops[count] = total height. Null while uniform or stale. */
  private tops: Float64Array | null = null;
  private dirty = true;
  private min = 0;
  private readonly cache = new Map<GridId, { data: unknown; height: number }>();
  private readonly measured = new Map<GridId, { data: unknown; height: number }>();

  constructor(private readonly source: RowHeightSource) { }

  /** The view or the pinned rows changed: offsets are recomputed on the next read. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Forget every cached height, so `getRowHeight` is asked again for each row. */
  resetHeights(): void {
    this.cache.clear();
    this.measured.clear();
    this.dirty = true;
  }

  /** Whether rows take measured heights (an `autoHeight` column is displayed). */
  measuresContent(): boolean {
    return this.source.hasAutoHeight();
  }

  isUniform(): boolean {
    return !this.source.getRowHeight() && !this.source.hasAutoHeight();
  }

  /** Height of a row wherever it is drawn (body, pinned band, sticky mirror). */
  heightOfNode(node: IRowNode | undefined): number {
    const configured = this.configuredHeight(node);
    if (!node || !this.source.hasAutoHeight()) return configured;
    const measured = this.measured.get(node.id);
    return measured && measured.data === node.data ? Math.max(configured, measured.height) : configured;
  }

  /**
   * Record the content height a drawn `autoHeight` row needs. Returns whether the row's height
   * changed. With the row's view index and fresh offsets, the offsets below it are shifted in place
   * (a scroll that measures a few new rows does not rebuild the whole view); otherwise they are
   * recomputed on the next read. A view index of -1 marks a row outside the body flow (a pinned
   * band row), whose height moves no body offset.
   */
  setMeasured(node: IRowNode, height: number, viewIndex?: number): boolean {
    const before = this.heightOfNode(node);
    this.measured.set(node.id, { data: node.data, height });
    const after = this.heightOfNode(node);
    if (after === before) return false;
    if (viewIndex === -1 || this.source.isBodyPinned(node.id)) return true;
    const tops = this.tops;
    if (!this.dirty && tops && viewIndex != null && viewIndex >= 0 && viewIndex < tops.length - 1
      && tops[viewIndex + 1] - tops[viewIndex] === before) {
      const delta = after - before;
      for (let i = viewIndex + 1; i < tops.length; i++) tops[i] += delta;
    } else {
      this.dirty = true;
    }
    return true;
  }

  /** `getRowHeight`'s answer for a row (cached), else `rowHeight`. */
  private configuredHeight(node: IRowNode | undefined): number {
    const fallback = this.source.defaultHeight();
    const getRowHeight = this.source.getRowHeight();
    if (!getRowHeight || !node) return fallback;
    const cached = this.cache.get(node.id);
    if (cached && cached.data === node.data) return cached.height;
    let height = fallback;
    const value = getRowHeight({ node, data: node.data });
    if (typeof value === "number" && Number.isFinite(value) && value > 0) height = value;
    this.cache.set(node.id, { data: node.data, height });
    return height;
  }

  /**
   * Re-read the heights of rows whose data may have been replaced (a pure transaction update, which
   * moves no row and so does not invalidate the view). Returns whether any height changed; the
   * offsets are then stale and recomputed on the next read.
   */
  refreshNodes(nodes: Iterable<IRowNode | undefined>): boolean {
    if (!this.source.getRowHeight()) return false;
    let changed = false;
    for (const node of nodes) {
      if (!node) continue;
      const before = this.cache.get(node.id)?.height;
      if (before !== undefined && this.configuredHeight(node) !== before) changed = true;
    }
    if (changed) this.dirty = true;
    return changed;
  }

  /** Height a view row takes in the body flow: 0 for an application-pinned row. */
  heightAt(viewIndex: number): number {
    if (this.isUniform()) {
      const node = this.source.nodeAt(viewIndex);
      return node && this.source.isBodyPinned(node.id) ? 0 : this.source.defaultHeight();
    }
    const tops = this.ensure();
    if (viewIndex < 0 || viewIndex >= tops.length - 1) return this.source.defaultHeight();
    return tops[viewIndex + 1] - tops[viewIndex];
  }

  /** Compacted top of a view row. `viewIndex` may equal the view count (the content's end). */
  topOf(viewIndex: number): number {
    if (this.isUniform()) {
      return (viewIndex - this.source.pinnedCountBefore(viewIndex)) * this.source.defaultHeight();
    }
    const tops = this.ensure();
    const count = tops.length - 1;
    if (viewIndex <= 0) return viewIndex < 0 ? viewIndex * this.source.defaultHeight() : 0;
    if (viewIndex > count) return tops[count] + (viewIndex - count) * this.source.defaultHeight();
    return tops[viewIndex];
  }

  /**
   * The view row drawn at a body-content offset: the last row whose top is at or above it. Offsets
   * past the content resolve to the last row; an empty view answers 0. Uniform grids keep the
   * pre-index arithmetic (it ignores compaction, which only widens the window's overscan above).
   */
  indexAt(offsetPx: number): number {
    if (this.isUniform()) {
      return Math.max(0, Math.floor(offsetPx / Math.max(1, this.source.defaultHeight())));
    }
    const tops = this.ensure();
    const count = tops.length - 1;
    if (count <= 0 || offsetPx <= 0) return 0;
    let low = 0;
    let high = count - 1;
    let result = 0;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (tops[middle] <= offsetPx) {
        result = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    // Zero-height (pinned) rows share their top with the next row; the drawn row is the first one
    // at that top that takes height.
    while (result < count - 1 && tops[result + 1] === tops[result]) result++;
    return result;
  }

  /** The body content's height: every row that takes a place in the flow. */
  totalHeight(): number {
    if (this.isUniform()) {
      const count = this.source.viewCount();
      return (count - this.source.pinnedCountBefore(count)) * this.source.defaultHeight();
    }
    const tops = this.ensure();
    return tops[tops.length - 1];
  }

  /** The smallest body-row height in the view (the default when none is smaller): it sizes the
   * row pool, which must hold every row a viewport can show. */
  minHeight(): number {
    if (this.isUniform()) return this.source.defaultHeight();
    this.ensure();
    return this.min;
  }

  private ensure(): Float64Array {
    const count = this.source.viewCount();
    if (!this.dirty && this.tops && this.tops.length === count + 1) return this.tops;
    const tops = new Float64Array(count + 1);
    const fallback = this.source.defaultHeight();
    let min = fallback;
    let y = 0;
    for (let i = 0; i < count; i++) {
      tops[i] = y;
      const node = this.source.nodeAt(i);
      if (node && this.source.isBodyPinned(node.id)) continue;
      const height = this.heightOfNode(node);
      if (height < min) min = height;
      y += height;
    }
    tops[count] = y;
    this.tops = tops;
    this.min = Math.max(1, min);
    this.dirty = false;
    return tops;
  }
}
