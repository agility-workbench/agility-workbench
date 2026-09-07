import { QuickFilterBehavior } from "./gridOptions";

/**
 * One cell the quick-filter find matched. `colId` is the public ColDef id (not unique — see the
 * column-id precedence rules), `colInstanceId` the unique instance id the renderer addresses.
 */
export interface QuickFilterFindMatch {
  rowId: string;
  colId: string;
  colInstanceId: string;
}

/**
 * Live state of the quick filter's find behavior (`quickFilter.behavior: "find"`). Reported by
 * `api.getFindState()` and by every `quickFilterFindChanged` event.
 *
 * `matchCount` counts CELLS, not rows: a search term appearing in three columns of one row is three
 * matches, each separately reachable with `findNext()`. It covers the whole client-side view — all
 * pages, and rows hidden inside collapsed groups — so it does not depend on what is scrolled into
 * view. `activeIndex` is 1-based (0 = nothing active yet, which is the state after typing but
 * before the first `findNext()`).
 *
 * When `behavior` is "filter" the search filters rows instead and there is nothing to find, so
 * `matchCount` is 0 and `activeMatch` null.
 */
export interface QuickFilterFindState {
  /**
   * The behavior actually in force. This is the requested `quickFilter.behavior` unless finding is
   * unavailable (see `available`), in which case it reads "filter" — the search still does
   * something rather than going inert.
   */
  behavior: QuickFilterBehavior;
  /**
   * Whether the find behavior can operate at all right now: false on the server-side row model (the
   * grid does not hold the rows to search) and while the pivot layout is displayed (every displayed
   * row is a group row, and group cells are not find targets). Use it to disable an app-owned
   * find/filter toggle — the grid's own widget does.
   */
  available: boolean;
  text: string;
  matchCount: number;
  activeIndex: number;
  activeMatch: QuickFilterFindMatch | null;
}
