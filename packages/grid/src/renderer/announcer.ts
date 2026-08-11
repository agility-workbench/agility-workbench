import { SortDir } from "../interfaces/sort";

/**
 * Screen-reader announcements for grid-level state changes (accessibility plan 6 PR 4).
 *
 * This is a SECOND live region, deliberately separate from `.pte-grid-announcer` (4.1). That one
 * is a visible toast for keyboard-navigation mode switches: it is `visibility: hidden` while idle,
 * which also hides it from AT, and making it AT-visible would mean either announcing nothing while
 * idle anyway or leaving a permanently visible box on screen. So the toast keeps doing its visual
 * job untouched and this region — permanently sr-only, never painted — does the AT one.
 *
 * Announcements are coalesced rather than queued. Dragging a selection dispatches
 * `selectionChanged` on every mousemove, and a queue would leave AT reading a trail of stale
 * intermediate sizes long after the user stopped. Collapsing to the latest message in a short
 * window means the user hears where the selection *ended up*. The same property is what makes
 * sorting announce cleanly: sorting clears the selection first, so both events fire together and
 * the sort message — the salient one — replaces "Selection cleared".
 */

const COALESCE_MS = 150;

/** Live selection state, in the terms the user would describe it. */
export interface SelectionSummary {
  /** Rows selected via the row-number gutter / row selection API. */
  rows: number;
  /** Whole columns selected via the header. */
  columns: number;
  /** The cell range, if one covers more than a single cell. */
  range: { rows: number; columns: number } | null;
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * Describe a selection, or `null` when there is nothing worth saying.
 *
 * A single focused cell returns `null` on purpose: `aria-activedescendant` already moves AT's
 * focus onto that cell and it gets read out, so announcing "1 cell selected" alongside it would
 * double up on every arrow keypress.
 */
export function describeSelection(summary: SelectionSummary): string | null {
  if (summary.rows > 0) return `${plural(summary.rows, "row")} selected`;
  if (summary.columns > 0) return `${plural(summary.columns, "column")} selected`;
  const range = summary.range;
  if (range && range.rows * range.columns > 1) {
    return `${plural(range.rows, "row")} by ${plural(range.columns, "column")} selected`;
  }
  return null;
}

/** Describe the sort model. An empty model means the user just removed the last sort. */
export function describeSort(items: Array<{ label: string; dir: SortDir }>): string {
  if (items.length === 0) return "Sorting cleared";
  const parts = items.map(item => `${item.label} ${item.dir === "asc" ? "ascending" : "descending"}`);
  return `Sorted by ${parts.join(", then ")}`;
}

export class GridAnnouncer {
  private readonly el: HTMLElement;
  private timer?: ReturnType<typeof setTimeout>;
  private pending: string | null = null;
  private last = "";
  private hadSelection = false;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "pte-grid-sr-announcer";
    this.el.setAttribute("role", "status");
    this.el.setAttribute("aria-live", "polite");
    this.el.setAttribute("aria-atomic", "true");
    root.appendChild(this.el);
  }

  /** Exposed for tests and for renderers that need to place the region in the DOM. */
  getElement(): HTMLElement {
    return this.el;
  }

  announce(message: string): void {
    this.pending = message;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const next = this.pending;
      this.pending = null;
      if (next == null) return;
      // An unchanged string mutates nothing, so AT would stay silent regardless; skipping makes
      // that explicit instead of relying on it.
      if (next === this.last) return;
      this.last = next;
      this.el.textContent = next;
    }, COALESCE_MS);
  }

  selectionChanged(summary: SelectionSummary): void {
    const message = describeSelection(summary);
    if (message) {
      this.hadSelection = true;
      this.announce(message);
      return;
    }
    // Only worth saying when something was actually lost. Without this, every click on an empty
    // area of a grid that never had a selection would announce "Selection cleared".
    if (this.hadSelection) {
      this.hadSelection = false;
      this.announce("Selection cleared");
    }
  }

  sortChanged(items: Array<{ label: string; dir: SortDir }>): void {
    this.announce(describeSort(items));
  }

  loadingChanged(isLoading: boolean, rowCount: number): void {
    this.announce(isLoading ? "Loading data" : `${plural(rowCount, "row")} loaded`);
  }

  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pending = null;
    this.el.remove();
  }
}
