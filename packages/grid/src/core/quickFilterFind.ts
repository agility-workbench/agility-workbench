import { Column } from "../column/column";
import { cellTextMatches } from "../csrm/filter";
import { QuickFilterFindMatch } from "../interfaces/find";
import { QuickFilterMatchMode } from "../interfaces/gridOptions";
import { IRowModel } from "../interfaces/iRowModel";
import { IRowNode } from "../interfaces/iRowNode";

export interface QuickFilterFindDeps {
  getRowModel: () => IRowModel;
  /** Visible, non-internal leaf columns — the cells a find can highlight, in painted order. */
  getColumns: () => Column[];
  /**
   * Whether the current configuration has data-row cells to find in at all. False on the
   * server-side row model (the grid does not hold the rows) and while the pivot layout is displayed
   * (every displayed row is a group row, and group cells are not find targets).
   */
  canFind: () => boolean;
}

/**
 * The quick filter's find index: which CELLS the search text occurs in, in display order, plus
 * which one of them is currently active.
 *
 * A match is always scoped to ONE cell — a highlight has to land on a single cell — and compared
 * against that cell's formatted display value, honouring `caseSensitive`. Within that scope
 * `matchMode` picks the shape: every word present in this cell, one contiguous run, or the whole
 * cell equal to the search text. The cell-shaped comparisons live in `cellTextMatches` so the find
 * index and the row filter cannot drift on what a mode means; the one difference is that filtering
 * lets multiTerm's words land in *different* cells of a row, which no highlight could point at.
 *
 * Only data rows are searched. A synthetic group row's cells are a label, a blank or an aggregate
 * that the cell renderer derives, so they are not find targets (see IRowModel's
 * `forEachDataNodeInDisplayOrder`).
 *
 * Storage is the reason this is its own object: a search for "a" over a large grid can match nearly
 * every cell, so matches are held as ONE NUMBER each — `seq * columnCount + columnIndex`, where
 * `seq` is the row's position in the display-order walk — rather than as objects. The walked nodes
 * are kept in a parallel array so navigation resolves a match to its row in O(1); that array is
 * bounded by the row count, not the match count.
 */
export class QuickFilterFind {
  private text = "";
  private caseSensitive = false;
  private matchMode: QuickFilterMatchMode = "multiTerm";
  private enabled = false;
  /** Folded search needle, or null when nothing is being searched for. */
  private needle: string | null = null;
  /** The needle split into words — multiTerm only. Split once per rebuild, not once per cell. */
  private terms: string[] = [];

  // ---- Scan results ----
  // Data rows in display order; the index into this array is a match code's `seq`.
  private nodes: IRowNode[] = [];
  // The column set the codes are relative to. Snapshotted so a code decoded after a column change
  // can never name the wrong column — the scan is redone on such a change.
  private columns: Column[] = [];
  private codes: number[] = [];
  /** 1-based position of the active match in `codes`; 0 when none is active. */
  private activeOrdinal = 0;
  /** Identity of the active match, so a rebuild can keep it across sorts, edits and expansion. */
  private activeKey: string | null = null;

  constructor(private deps: QuickFilterFindDeps) {}

  /** Update the query. Returns whether anything about the find state changed. */
  setQuery(query: {
    text: string;
    caseSensitive: boolean;
    matchMode: QuickFilterMatchMode;
    enabled: boolean;
  }): boolean {
    const changed = query.text !== this.text
      || query.caseSensitive !== this.caseSensitive
      || query.matchMode !== this.matchMode
      || query.enabled !== this.enabled;
    if (!changed) return false;
    // A changed query starts a fresh search: the previous active cell is not meaningfully "the same
    // match" once what is being searched for changes, and Enter should walk from the top again.
    // Only `enabled` (a behavior flip) keeps it.
    const keepActive = query.text === this.text
      && query.caseSensitive === this.caseSensitive
      && query.matchMode === this.matchMode;
    this.text = query.text;
    this.caseSensitive = query.caseSensitive;
    this.matchMode = query.matchMode;
    this.enabled = query.enabled;
    this.rebuild(keepActive);
    return true;
  }

  /**
   * Re-scan after something the index depends on changed — row data, sorting, filtering, grouping,
   * column visibility. The active match is kept when its cell still matches.
   */
  invalidate(): void {
    this.rebuild(true);
  }

  isFinding(): boolean {
    return this.needle != null;
  }

  matchCount(): number {
    return this.codes.length;
  }

  activeIndex(): number {
    return this.activeOrdinal;
  }

  activeMatch(): QuickFilterFindMatch | null {
    return this.activeOrdinal === 0 ? null : this.matchAt(this.activeOrdinal);
  }

  /** Whether one rendered cell is a match — the painter's per-cell question. */
  matches(node: IRowNode | null | undefined, col: Column): boolean {
    if (this.needle == null || !node || node.isGroup) return false;
    return this.cellMatches(node, col);
  }

  /** Whether one rendered cell is THE active match (the one navigation last landed on). */
  isActiveMatch(rowId: string, colInstanceId: string): boolean {
    return this.activeKey != null && this.activeKey === keyOf(rowId, colInstanceId);
  }

  /** Step to the next match in display order, wrapping at the end. Null when there are none. */
  next(): QuickFilterFindMatch | null {
    if (this.codes.length === 0) return null;
    return this.goTo(this.activeOrdinal >= this.codes.length ? 1 : this.activeOrdinal + 1);
  }

  /** Step to the previous match, wrapping at the start. Null when there are none. */
  previous(): QuickFilterFindMatch | null {
    if (this.codes.length === 0) return null;
    return this.goTo(this.activeOrdinal <= 1 ? this.codes.length : this.activeOrdinal - 1);
  }

  private goTo(ordinal: number): QuickFilterFindMatch | null {
    const match = this.matchAt(ordinal);
    if (!match) return null;
    this.activeOrdinal = ordinal;
    this.activeKey = keyOf(match.rowId, match.colInstanceId);
    return match;
  }

  /** Decode the 1-based `ordinal`-th match. */
  private matchAt(ordinal: number): QuickFilterFindMatch | null {
    const code = this.codes[ordinal - 1];
    if (code == null) return null;
    const colCount = this.columns.length;
    const node = this.nodes[Math.floor(code / colCount)];
    const col = this.columns[code % colCount];
    if (!node || !col) return null;
    return { rowId: node.id, colId: col.colId, colInstanceId: col.instanceID };
  }

  private rebuild(keepActive: boolean): void {
    const previousKey = keepActive ? this.activeKey : null;
    const raw = this.text.trim();
    this.needle = this.enabled && raw !== "" && this.deps.canFind() ? this.fold(raw) : null;
    this.terms = this.needle != null && this.matchMode === "multiTerm"
      ? this.needle.split(/\s+/).filter(Boolean)
      : [];
    this.nodes = [];
    this.columns = [];
    this.codes = [];
    this.activeOrdinal = 0;
    this.activeKey = null;
    if (this.needle == null) return;

    const columns = this.deps.getColumns();
    if (columns.length === 0) return;
    this.columns = columns;
    const colCount = columns.length;
    const nodes = this.nodes;
    const codes = this.codes;

    this.deps.getRowModel().forEachDataNodeInDisplayOrder?.((node) => {
      const seq = nodes.length;
      nodes.push(node);
      for (let c = 0; c < colCount; c++) {
        const col = columns[c];
        if (!this.cellMatches(node, col)) continue;
        codes.push(seq * colCount + c);
        // Re-anchoring here (rather than in a second pass) keeps the whole rebuild to one walk:
        // the ordinal of the previously-active cell is simply how many matches had been found by
        // the time we reach it again.
        if (previousKey != null && previousKey === keyOf(node.id, col.instanceID)) {
          this.activeOrdinal = codes.length;
          this.activeKey = previousKey;
        }
      }
    });
  }

  private cellMatches(node: IRowNode, col: Column): boolean {
    const formatted = col.formatValue(col.getValue(node), node);
    if (!formatted) return false;
    return cellTextMatches(this.fold(formatted), this.needle!, this.matchMode, this.terms);
  }

  private fold(s: string): string {
    return this.caseSensitive ? s : s.toLowerCase();
  }
}

// Row/column pair identity. NUL cannot occur in a row id or a crypto.randomUUID() instance id, so
// the two halves can never run together into an ambiguous key.
function keyOf(rowId: string, colInstanceId: string): string {
  return `${rowId}\u0000${colInstanceId}`;
}
