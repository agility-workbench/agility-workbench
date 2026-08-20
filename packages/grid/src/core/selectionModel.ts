import { Column } from "../column/column";
import { ColumnModel } from "../column/columnModel";
import { GridId } from "../interfaces/iGridCore";
import { IRowModel } from "../interfaces/iRowModel";
import { CellPos, CellRef, SelectionRange, SelectionSnapshot } from "../interfaces/selection";

export type NavDir = "up" | "down" | "left" | "right";
/**
 * Step size for navigate():
 *  - "edge"  = hard first/last (Home/End)
 *  - "block" = Excel data jump (Ctrl+Arrow)
 *  - "page"  = one viewport of rows (PageUp/PageDown); the row count is supplied by the renderer
 *              via opts.pageRows since only the renderer knows the viewport height.
 */
export type NavJump = "edge" | "block" | "page";

interface SelectionModelDeps {
  getRowModel: () => IRowModel;
  getColumnModel: () => ColumnModel;
  getRowIdAtViewIndex: (viewIdx: number) => GridId | null;
  getPageStartIdx: () => number;
  // Whether a view-index row can hold a cell selection / be a navigation target (group rows are
  // skipped unless groupRowsSelectable is enabled).
  isRowSelectable: (viewIdx: number) => boolean;
  // Row-number cells are keyboard stops only while row selection is enabled. Keep this dynamic so
  // a framework wrapper can change rowSelection without rebuilding the core/selection model.
  isRowNumberNavigable?: () => boolean;
  getPinnedRowCount?: (position: "top" | "bottom") => number;
  getPinnedRowNode?: (
    position: "top" | "bottom",
    rowIndex: number,
  ) => import("../interfaces/iRowNode").IRowNode | null;
}

/**
 * Core-owned selection state + logic. Holds cell/range, row, and column selection and all the
 * navigation / clamping / toggling logic. This class only mutates state — rendering happens in
 * the renderer, which reads these getters and repaints when the core emits selectionChanged /
 * focusChanged.
 *
 * Coordinates are hybrid: range/anchor/active live in view-index space (row = view index,
 * colIdx = global leaf index); row selection is keyed by stable rowId; column selection by colId.
 */
export class SelectionModel {
  private anchor: CellPos | null = null;
  private active: CellPos | null = null;
  private range: SelectionRange | null = null;
  private selectedColumnIds: Set<string> = new Set();
  private selectedRowIds: Set<string> = new Set();
  private rowAnchorViewIdx: number | null = null;

  constructor(private deps: SelectionModelDeps) { }

  // ---------------- Derived helpers ----------------
  private leafColumns(): Column[] {
    return this.deps.getColumnModel().getLeaves();
  }

  /** Production leaves are Column instances. The fallback keeps SelectionModel compatible with
   * structural/lightweight column models by recognizing their legacy leading section. */
  private isUtilityColumn(col: Column | undefined): boolean {
    if (!col) return false;
    if (typeof col.isLeadingUtilityColumn === "function") return col.isLeadingUtilityColumn();
    return this.deps.getColumnModel().getLeadingLeaves().includes(col);
  }

  private isRowNumberColumn(col: Column | undefined): boolean {
    if (!col) return false;
    if (typeof col.isRowNumberColumn === "function") return col.isRowNumberColumn();
    return this.deps.getColumnModel().getLeadingLeaves().includes(col);
  }

  private isCheckboxColumn(col: Column | undefined): boolean {
    return !!col && typeof col.isSelectionCheckboxColumn === "function"
      && col.isSelectionCheckboxColumn();
  }

  /** Row-number and checkbox cells can hold the keyboard cursor while remaining outside data
   * ranges, clipboard operations, editing, and column selection. Row numbers are enabled only
   * while row selection is enabled. */
  private isNavigableColumn(col: Column | undefined): boolean {
    if (!col) return false;
    if (this.isRowNumberColumn(col)) return this.deps.isRowNumberNavigable?.() ?? false;
    return true;
  }

  private firstNavigableColIdx(rowPinned?: "top" | "bottom"): number {
    const leaves = this.leafColumns();
    const index = leaves.findIndex(col => this.isNavigableColumn(col)
      && !(rowPinned && this.isRowNumberColumn(col)));
    return index >= 0 ? index : leaves.length;
  }

  private lastNavigableColIdx(): number {
    const leaves = this.leafColumns();
    for (let i = leaves.length - 1; i >= 0; i--) {
      if (this.isNavigableColumn(leaves[i])) return i;
    }
    return -1;
  }

  private firstDataColIdx(): number {
    const leaves = this.leafColumns();
    const index = leaves.findIndex(col => !this.isUtilityColumn(col));
    return index >= 0 ? index : leaves.length;
  }

  private lastDataColIdx(): number {
    const leaves = this.leafColumns();
    for (let i = leaves.length - 1; i >= 0; i--) {
      if (!this.isUtilityColumn(leaves[i])) return i;
    }
    return -1;
  }

  /** Walk horizontally through keyboard stops; blank row-number slots in pinned bands are skipped. */
  private stepNavigableColumn(
    colIdx: number,
    direction: 1 | -1,
    rowPinned?: "top" | "bottom",
  ): number | null {
    const leaves = this.leafColumns();
    for (let next = colIdx + direction; next >= 0 && next < leaves.length; next += direction) {
      if (this.isNavigableColumn(leaves[next])
        && !(rowPinned && this.isRowNumberColumn(leaves[next]))) return next;
    }
    return null;
  }

  private maxRow(): number {
    return this.deps.getRowModel().getViewCount() - 1;
  }

  // Pinned bands are only entered by a plain single arrow step from the body's content edge, so
  // first/last resolve to the BODY edge whenever body rows exist; jumps land there and it takes
  // one more arrow to hand navigation over to the band. Bands are the fallback for an empty body.
  /** Public so the header cursor can hand navigation back to the body's first row. */
  firstRowPosition(): CellPos | null {
    if (this.maxRow() >= 0) return { row: this.nearestSelectableRow(0, 1), colIdx: 0 };
    if ((this.deps.getPinnedRowCount?.("top") ?? 0) > 0) return { row: 0, colIdx: 0, rowPinned: "top" };
    if ((this.deps.getPinnedRowCount?.("bottom") ?? 0) > 0) return { row: 0, colIdx: 0, rowPinned: "bottom" };
    return null;
  }

  /** Public so the header cursor can hand navigation to the body's last row (Ctrl+ArrowDown). */
  lastRowPosition(): CellPos | null {
    if (this.maxRow() >= 0) return { row: this.nearestSelectableRow(this.maxRow(), -1), colIdx: 0 };
    const bottomCount = this.deps.getPinnedRowCount?.("bottom") ?? 0;
    if (bottomCount > 0) return { row: bottomCount - 1, colIdx: 0, rowPinned: "bottom" };
    const topCount = this.deps.getPinnedRowCount?.("top") ?? 0;
    if (topCount > 0) return { row: topCount - 1, colIdx: 0, rowPinned: "top" };
    return null;
  }

  private stepVertical(from: CellPos, direction: 1 | -1): CellPos {
    const topCount = this.deps.getPinnedRowCount?.("top") ?? 0;
    const bottomCount = this.deps.getPinnedRowCount?.("bottom") ?? 0;
    const bodyCount = this.maxRow() + 1;
    if (direction < 0) {
      if (from.rowPinned === "bottom") {
        if (from.row > 0) return { ...from, row: from.row - 1 };
        if (bodyCount > 0) return { row: this.nearestSelectableRow(bodyCount - 1, -1), colIdx: from.colIdx };
        if (topCount > 0) return { row: topCount - 1, colIdx: from.colIdx, rowPinned: "top" };
        return from;
      }
      if (!from.rowPinned) {
        const previous = this.nearestSelectableRow(from.row - 1, -1);
        if (from.row > 0 && previous < from.row) return { row: previous, colIdx: from.colIdx };
        if (topCount > 0) return { row: topCount - 1, colIdx: from.colIdx, rowPinned: "top" };
        return from;
      }
      return from.row > 0 ? { ...from, row: from.row - 1 } : from;
    }

    if (from.rowPinned === "top") {
      if (from.row + 1 < topCount) return { ...from, row: from.row + 1 };
      if (bodyCount > 0) return { row: this.nearestSelectableRow(0, 1), colIdx: from.colIdx };
      if (bottomCount > 0) return { row: 0, colIdx: from.colIdx, rowPinned: "bottom" };
      return from;
    }
    if (!from.rowPinned) {
      const next = this.nearestSelectableRow(from.row + 1, 1);
      if (from.row + 1 < bodyCount && next > from.row) return { row: next, colIdx: from.colIdx };
      if (bottomCount > 0) return { row: 0, colIdx: from.colIdx, rowPinned: "bottom" };
      return from;
    }
    return from.row + 1 < bottomCount ? { ...from, row: from.row + 1 } : from;
  }

  /** Whether two positions live in the same row region (body, pinned top, or pinned bottom). */
  private sameRegion(a: CellPos, b: CellPos): boolean {
    return (a.rowPinned ?? null) === (b.rowPinned ?? null);
  }

  /** Position of a row in the unified `pinned top → body → pinned bottom` row sequence. Ranges
   * are contiguous spans of this sequence, which is what lets them include pinned rows. */
  private rowOrdinal(pos: CellPos): number {
    const topCount = this.deps.getPinnedRowCount?.("top") ?? 0;
    if (pos.rowPinned === "top") return pos.row;
    if (pos.rowPinned === "bottom") return topCount + this.maxRow() + 1 + pos.row;
    return topCount + pos.row;
  }

  /** Build the rectangular range between two cells as segments of the unified row sequence. */
  private buildRange(a: CellPos, b: CellPos): SelectionRange {
    const topCount = this.deps.getPinnedRowCount?.("top") ?? 0;
    const bodyCount = this.maxRow() + 1;
    const startOrd = Math.min(this.rowOrdinal(a), this.rowOrdinal(b));
    const endOrd = Math.max(this.rowOrdinal(a), this.rowOrdinal(b));

    const segment = (regionStart: number, regionCount: number) => {
      const start = Math.max(startOrd - regionStart, 0);
      const end = Math.min(endOrd - regionStart, regionCount - 1);
      return start <= end ? { start, end } : null;
    };
    const top = segment(0, topCount);
    const body = segment(topCount, bodyCount);
    const bottom = segment(topCount + bodyCount, this.deps.getPinnedRowCount?.("bottom") ?? 0);

    return {
      rowStart: body ? body.start : 0,
      rowEnd: body ? body.end : -1,
      colStart: Math.min(a.colIdx, b.colIdx),
      colEnd: Math.max(a.colIdx, b.colIdx),
      pageStartIdx: this.deps.getPageStartIdx(),
      ...(top ? { pinnedTop: top } : {}),
      ...(bottom ? { pinnedBottom: bottom } : {}),
    };
  }

  // Page steps stay region-locked: only a plain single arrow at the content edge hands navigation
  // over to a pinned band.
  private moveVertical(from: CellPos, delta: number): CellPos {
    let next = from;
    const direction: 1 | -1 = delta < 0 ? -1 : 1;
    for (let i = 0; i < Math.abs(delta); i++) {
      const stepped = this.stepVertical(next, direction);
      if (stepped.row === next.row && stepped.rowPinned === next.rowPinned) break;
      if (!this.sameRegion(from, stepped)) break;
      next = stepped;
    }
    return next;
  }

  // ---------------- Reads ----------------
  getSelectionRange(): SelectionRange | null {
    if (!this.range) return null;
    if (this.range.pageStartIdx !== this.deps.getPageStartIdx()) return null;
    return this.range;
  }

  getAnchor(): CellPos | null {
    return this.anchor;
  }

  getActiveCell(): CellPos | null {
    return this.active;
  }

  getSelectedColumnIds(): Set<string> {
    return this.selectedColumnIds;
  }

  getSelectedRowIds(): Set<string> {
    return this.selectedRowIds;
  }

  isCellInActiveSelection(
    viewIdx: number,
    colIdx: number,
    rowId: string,
    colId: string,
    rowPinned?: "top" | "bottom",
  ): boolean {
    const r = this.range;
    const col = this.leafColumns()[colIdx];
    // A range spanning every data column is also a row-number selection when row selection is
    // enabled. The utility column remains outside the range itself (and therefore clipboard/export
    // column resolution), but behaves as part of the rectangle for paint and context-menu hit tests.
    const rangeCoversColumn = !!r && (
      (colIdx >= r.colStart && colIdx <= r.colEnd)
      || (this.isRowNumberColumn(col)
        && (this.deps.isRowNumberNavigable?.() ?? false)
        && this.rangeCoversAllDataColumns(r))
    );
    if (r && r.pageStartIdx === this.deps.getPageStartIdx() && rangeCoversColumn) {
      if (rowPinned) {
        // Band cells match against the range's pinned segment (band-local indices), never the
        // body rowStart/rowEnd — band-local index 0 is unrelated to body view index 0.
        const seg = rowPinned === "top" ? r.pinnedTop : r.pinnedBottom;
        if (seg && viewIdx >= seg.start && viewIdx <= seg.end) return true;
      } else if (viewIdx >= r.rowStart && viewIdx <= r.rowEnd) {
        return true;
      }
    }
    if (this.selectedRowIds.has(rowId)) return true;
    if (this.selectedColumnIds.has(colId)) return true;
    return false;
  }

  private rangeCoversAllDataColumns(range: SelectionRange): boolean {
    const first = this.firstDataColIdx();
    const last = this.lastDataColIdx();
    return last >= first && range.colStart <= first && range.colEnd >= last;
  }

  getSnapshot(resolveIds = false): SelectionSnapshot {
    const range = this.getSelectionRange();
    const snapshot: SelectionSnapshot = {
      kind: this.currentKind(range),
      range,
      anchor: this.anchor ? { ...this.anchor } : null,
      active: this.active ? { ...this.active } : null,
      selectedRowIds: Array.from(this.selectedRowIds),
      selectedColumnIds: Array.from(this.selectedColumnIds),
      selectedColIds: Array.from(this.selectedColumnIds)
        .map(id => this.deps.getColumnModel().getById(id)?.colId)
        .filter((id): id is string => id != null),
    };

    if (resolveIds) {
      snapshot.rangeCells = range ? this.resolveRangeCells(range) : null;
    }

    return snapshot;
  }

  private currentKind(range: SelectionRange | null): SelectionSnapshot["kind"] {
    if (this.selectedRowIds.size > 0) return "row";
    if (this.selectedColumnIds.size > 0) return "column";
    if (range) {
      const rowCount = Math.max(0, range.rowEnd - range.rowStart + 1)
        + (range.pinnedTop ? range.pinnedTop.end - range.pinnedTop.start + 1 : 0)
        + (range.pinnedBottom ? range.pinnedBottom.end - range.pinnedBottom.start + 1 : 0);
      const single = rowCount === 1 && range.colStart === range.colEnd;
      return single ? "cell" : "range";
    }
    if (this.active?.rowPinned) return "cell";
    return "none";
  }

  // Flatten the range rectangle to a row-major list of CellRefs in unified row order (pinned top,
  // body, pinned bottom). Rows not currently loaded (server-side sparse data) have no rowId and
  // are omitted, so this yields loaded cells only.
  private resolveRangeCells(range: SelectionRange): CellRef[] {
    const leaves = this.leafColumns();
    const colIds: { colId: string; colInstanceId: string }[] = [];
    for (let c = range.colStart; c <= range.colEnd; c++) {
      const col = leaves[c];
      if (col && !this.isUtilityColumn(col)) {
        colIds.push({ colId: col.colId, colInstanceId: col.instanceID });
      }
    }
    const cells: CellRef[] = [];
    const pushPinned = (position: "top" | "bottom", segment?: { start: number; end: number }) => {
      if (!segment) return;
      for (let r = segment.start; r <= segment.end; r++) {
        const node = this.deps.getPinnedRowNode?.(position, r);
        if (!node) continue;
        for (const ids of colIds) {
          cells.push({ rowId: node.id, ...ids, rowPinned: position });
        }
      }
    };
    pushPinned("top", range.pinnedTop);
    for (let r = range.rowStart; r <= range.rowEnd; r++) {
      const rowId = this.deps.getRowIdAtViewIndex(r);
      if (!rowId) continue;
      for (const ids of colIds) {
        cells.push({ rowId, ...ids });
      }
    }
    pushPinned("bottom", range.pinnedBottom);
    return cells;
  }

  // ---------------- Cell range selection ----------------
  startFromCell(location: {
    viewIdx: number;
    colIdx: number;
    rowPinned?: "top" | "bottom";
  }): boolean {
    const rowCount = location.rowPinned
      ? this.deps.getPinnedRowCount?.(location.rowPinned) ?? 0
      : this.deps.getRowModel().getViewCount();
    if (location.viewIdx < 0 || location.viewIdx >= rowCount) return false;
    if (location.colIdx < 0 || location.colIdx >= this.leafColumns().length) return false;
    const column = this.leafColumns()[location.colIdx];
    if (!this.isNavigableColumn(column)) return false;
    if (this.isRowNumberColumn(column)) {
      // Application-pinned rows deliberately render a blank gutter and are not part of the row-id
      // selection model, so their row-number slots are never actionable keyboard positions.
      if (location.rowPinned) return false;
      if (!location.rowPinned && !this.deps.isRowSelectable(location.viewIdx)) return false;
      this.focusUtilityCell({
        row: location.viewIdx,
        colIdx: location.colIdx,
        rowPinned: location.rowPinned,
      });
      return true;
    }
    if (this.isCheckboxColumn(column)) {
      this.focusUtilityCell({
        row: location.viewIdx,
        colIdx: location.colIdx,
        rowPinned: location.rowPinned,
      });
      return true;
    }
    this.clearRows();
    this.clearColumns();
    this.anchor = { row: location.viewIdx, colIdx: location.colIdx, rowPinned: location.rowPinned };
    this.active = { row: location.viewIdx, colIdx: location.colIdx, rowPinned: location.rowPinned };
    this.range = this.buildRange(this.anchor, this.active);
    return true;
  }

  updateRange(endRow: number, endCol: number, rowPinned?: "top" | "bottom"): boolean {
    if (!this.anchor) return false;
    const leafCount = this.leafColumns().length;
    const regionCount = rowPinned
      ? this.deps.getPinnedRowCount?.(rowPinned) ?? 0
      : this.deps.getRowModel().getViewCount();
    if (regionCount === 0 || leafCount === 0) {
      this.clearRange();
      return true;
    }

    const nextRow = Math.min(Math.max(endRow, 0), regionCount - 1);
    const nextCol = Math.min(Math.max(endCol, 0), leafCount - 1);

    this.active = { row: nextRow, colIdx: nextCol, rowPinned };
    this.range = this.buildRange(this.anchor, this.active);
    return true;
  }

  selectSingleCell(viewIdx: number, colIdx: number, rowPinned?: "top" | "bottom"): boolean {
    return this.startFromCell({ viewIdx, colIdx, rowPinned });
  }

  /** Focus a row-selection utility cell without treating focus as selection or clearing selected rows. */
  focusUtilityCell(location: CellPos): void {
    this.clearRange();
    this.clearColumns();
    this.active = { ...location };
  }

  /** Move a cursor off a utility column that became inert after a runtime option change. */
  reconcileActiveColumn(): boolean {
    if (!this.active) return false;
    const leaves = this.leafColumns();
    if (this.isNavigableColumn(leaves[this.active.colIdx])) return false;
    const candidates = leaves
      .map((col, idx) => this.isNavigableColumn(col) ? idx : -1)
      .filter(idx => idx >= 0);
    if (candidates.length === 0) {
      this.clearRange();
      return true;
    }
    const target = candidates.reduce((best, idx) =>
      Math.abs(idx - this.active!.colIdx) < Math.abs(best - this.active!.colIdx) ? idx : best);
    return this.selectSingleCell(this.active.row, target, this.active.rowPinned);
  }

  clearRange() {
    this.anchor = null;
    this.active = null;
    this.range = null;
  }

  /** Remove selected columns that no longer exist after a column-definition update. */
  retainSelectedColumns(validIds: Set<string>): boolean {
    let changed = false;
    for (const id of this.selectedColumnIds) {
      if (validIds.has(id)) continue;
      this.selectedColumnIds.delete(id);
      changed = true;
    }
    return changed;
  }

  private rowNodeAtPosition(position: CellPos) {
    return position.rowPinned
      ? this.deps.getPinnedRowNode?.(position.rowPinned, position.row) ?? null
      : this.deps.getRowModel().getRowNodeAtViewIndex(position.row);
  }

  private isEmptyPosition(position: CellPos): boolean {
    const node = this.rowNodeAtPosition(position);
    if (!node) return true;
    const col = this.leafColumns()[position.colIdx];
    if (!col) return true;
    const value = col.getValue(node);
    return value == null || value === "";
  }

  /** Excel-style Ctrl+Arrow scan across column section boundaries. Vertically it is region-locked
   * (stops at the body's content edge / the band's edge): pinned bands are only entered by a plain
   * single arrow step from the edge. */
  private blockJumpPosition(
    from: CellPos,
    dRow: number,
    dCol: number,
  ): CellPos {
    const minCol = this.firstNavigableColIdx(from.rowPinned);
    const maxCol = this.lastNavigableColIdx();
    const advance = (position: CellPos): CellPos | null => {
      if (dCol !== 0) {
        const colIdx = this.stepNavigableColumn(position.colIdx, dCol < 0 ? -1 : 1, position.rowPinned);
        return colIdx != null && colIdx >= minCol && colIdx <= maxCol ? { ...position, colIdx } : null;
      }
      const next = this.stepVertical(position, dRow < 0 ? -1 : 1);
      if (next.row === position.row && next.rowPinned === position.rowPinned) return null;
      if (!this.sameRegion(from, next)) return null;
      return this.rowNodeAtPosition(next) ? next : null;
    };

    const first = advance(from);
    if (!first) return from;
    const startEmpty = this.isEmptyPosition(from);
    const neighborEmpty = this.isEmptyPosition(first);

    if (!startEmpty && !neighborEmpty) {
      let current = from;
      while (true) {
        const ahead = advance(current);
        if (!ahead || this.isEmptyPosition(ahead)) break;
        current = ahead;
      }
      return current;
    }

    let current = from;
    let lastReachable = from;
    while (true) {
      const ahead = advance(current);
      if (!ahead) break;
      current = ahead;
      lastReachable = ahead;
      if (!this.isEmptyPosition(ahead)) return ahead;
    }
    return lastReachable;
  }

  /**
   * Arrow-key navigation. Returns the new active cell, or null if nothing changed.
   * `jump` controls the step size:
   *  - undefined → move one cell (plain Arrow).
   *  - "edge"    → hard edge, ignoring cell contents (Home/End): first/last column or top/bottom row.
   *  - "block"   → Excel-style data-block jump (Ctrl+Arrow), see blockJump.
   *  - "page"    → move by opts.pageRows rows (PageUp/PageDown); horizontal dirs fall back to
   *                a single-cell step. Column is unchanged.
   */
  navigate(dir: NavDir, opts: { extend: boolean; jump?: NavJump; pageRows?: number }): CellPos | null {
    const firstPosition = this.firstRowPosition();
    const referencePosition = this.active ?? firstPosition;
    const firstCol = this.firstNavigableColIdx(referencePosition?.rowPinned);
    const lastCol = this.lastNavigableColIdx();
    if (lastCol < firstCol || !firstPosition) return null;

    // Nothing selected yet: select the first selectable data cell.
    if (!this.active) {
      this.selectSingleCell(firstPosition.row, firstCol, firstPosition.rowPinned);
      return this.active;
    }

    const from = this.active;
    let nextPosition = { ...from };
    let nextCol = from.colIdx;

    if (opts.jump === "block") {
      // Excel-style Ctrl+Arrow: jump across data blocks based on cell contents.
      const delta = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] }[dir];
      nextPosition = this.blockJumpPosition(from, delta[0], delta[1]);
      nextCol = nextPosition.colIdx;
    } else if (opts.jump === "edge") {
      // Home/End: hard edge, regardless of cell contents. Region-locked vertically: within a
      // pinned band the edge is the band's first/last row, in the body it's the content edge.
      switch (dir) {
        case "left": nextCol = firstCol; break;
        case "right": nextCol = lastCol; break;
        case "up":
          nextPosition = from.rowPinned
            ? { ...from, row: 0 }
            : this.firstRowPosition() ?? nextPosition;
          break;
        case "down":
          nextPosition = from.rowPinned
            ? { ...from, row: Math.max(0, (this.deps.getPinnedRowCount?.(from.rowPinned) ?? 1) - 1) }
            : this.lastRowPosition() ?? nextPosition;
          break;
      }
    } else if (opts.jump === "page") {
      // PageUp/PageDown: move by one viewport of rows (supplied by the renderer). Horizontal
      // directions have no natural "page", so fall back to a single-cell step.
      const pageRows = Math.max(1, opts.pageRows ?? 1);
      switch (dir) {
        case "up": nextPosition = this.moveVertical(from, -pageRows); break;
        case "down": nextPosition = this.moveVertical(from, pageRows); break;
        case "left": nextCol = this.stepNavigableColumn(from.colIdx, -1, from.rowPinned) ?? from.colIdx; break;
        case "right": nextCol = this.stepNavigableColumn(from.colIdx, 1, from.rowPinned) ?? from.colIdx; break;
      }
    } else {
      switch (dir) {
        case "left": nextCol = this.stepNavigableColumn(from.colIdx, -1, from.rowPinned) ?? from.colIdx; break;
        case "right": nextCol = this.stepNavigableColumn(from.colIdx, 1, from.rowPinned) ?? from.colIdx; break;
        case "up": nextPosition = this.stepVertical(from, -1); break;
        case "down": nextPosition = this.stepVertical(from, 1); break;
      }
    }

    return this.moveActiveToPosition(
      { row: nextPosition.row, colIdx: nextCol, rowPinned: nextPosition.rowPinned },
      opts.extend,
    );
  }

  /** Jump the active cell to a grid corner (Ctrl+Home / Ctrl+End). Returns the new active cell. */
  navigateToCorner(corner: "topLeft" | "bottomRight", extend: boolean): CellPos | null {
    const position = corner === "topLeft" ? this.firstRowPosition() : this.lastRowPosition();
    const firstCol = this.firstNavigableColIdx(position?.rowPinned);
    const lastCol = this.lastNavigableColIdx();
    if (lastCol < firstCol || !position) return null;
    const nextCol = corner === "topLeft" ? firstCol : lastCol;
    return this.moveActiveToPosition({ ...position, colIdx: nextCol }, extend);
  }

  /** Select the entire grid: every row of the unified `pinned top → body → pinned bottom`
   * sequence across all data columns. Anchor at the very first cell, active at the very last. */
  selectAll(): CellPos | null {
    const firstCol = this.firstDataColIdx();
    const lastCol = this.lastDataColIdx();
    const maxRow = this.maxRow();
    const topCount = this.deps.getPinnedRowCount?.("top") ?? 0;
    const bottomCount = this.deps.getPinnedRowCount?.("bottom") ?? 0;
    if (lastCol < firstCol) return null;
    if (maxRow < 0 && topCount === 0 && bottomCount === 0) return null;

    const first: CellPos = topCount > 0
      ? { row: 0, colIdx: firstCol, rowPinned: "top" }
      : maxRow >= 0
        ? { row: 0, colIdx: firstCol }
        : { row: 0, colIdx: firstCol, rowPinned: "bottom" };
    const last: CellPos = bottomCount > 0
      ? { row: bottomCount - 1, colIdx: lastCol, rowPinned: "bottom" }
      : maxRow >= 0
        ? { row: maxRow, colIdx: lastCol }
        : { row: topCount - 1, colIdx: lastCol, rowPinned: "top" };

    this.clearRows();
    this.clearColumns();
    this.anchor = first;
    this.active = last;
    this.range = this.buildRange(first, last);
    return this.active;
  }

  // Resolve a target row to the nearest selectable row, skipping non-selectable (e.g. group) rows.
  // Scans in `preferDir` first (+1 down / -1 up), then the opposite direction as a fallback, so a
  // move never lands on a skipped row and never gets stuck. Returns the original row if nothing is
  // selectable (degenerate — all rows skipped).
  private nearestSelectableRow(target: number, preferDir: 1 | -1): number {
    const maxRow = this.maxRow();
    if (maxRow < 0) return target;
    const clamped = Math.min(Math.max(target, 0), maxRow);
    if (this.deps.isRowSelectable(clamped)) return clamped;
    for (const dir of [preferDir, -preferDir as 1 | -1]) {
      for (let r = clamped + dir; r >= 0 && r <= maxRow; r += dir) {
        if (this.deps.isRowSelectable(r)) return r;
      }
    }
    return clamped;
  }

  // Move the active cell to (row, col): extend the range from the existing anchor, or collapse
  // to a single cell. Shared by navigate() and navigateToCorner().
  private moveActiveTo(row: number, col: number, extend: boolean): CellPos | null {
    return this.moveActiveToPosition({ row, colIdx: col }, extend);
  }

  private moveActiveToPosition(position: CellPos, extend: boolean): CellPos | null {
    const column = this.leafColumns()[position.colIdx];
    const utilityTarget = this.isRowNumberColumn(column) || this.isCheckboxColumn(column);
    if (extend) {
      // Utility cells can hold the cursor but never belong to a data-cell range. A range gesture
      // stops at their boundary; plain navigation can still enter them.
      if (utilityTarget) return this.active;
      if (!this.anchor) {
        this.anchor = this.active ? { ...this.active } : { ...position };
      }
      this.updateRange(position.row, position.colIdx, position.rowPinned);
    } else {
      if (utilityTarget) this.focusUtilityCell(position);
      else this.selectSingleCell(position.row, position.colIdx, position.rowPinned);
    }
    return this.active;
  }

  clampToView() {
    if (this.active?.rowPinned) {
      if (this.active.row >= (this.deps.getPinnedRowCount?.(this.active.rowPinned) ?? 0)) this.clearRange();
      return;
    }
    if (!this.range) return;
    if (this.range.pageStartIdx !== this.deps.getPageStartIdx()) return;
    const viewCount = this.deps.getRowModel().getViewCount();
    const leafCount = this.leafColumns().length;
    if (leafCount === 0) {
      this.clearRange();
      return;
    }

    const clampSegment = (position: "top" | "bottom", segment?: { start: number; end: number }) => {
      if (!segment) return undefined;
      const count = this.deps.getPinnedRowCount?.(position) ?? 0;
      if (count === 0 || segment.start >= count) return undefined;
      return { start: segment.start, end: Math.min(segment.end, count - 1) };
    };
    const pinnedTop = clampSegment("top", this.range.pinnedTop);
    const pinnedBottom = clampSegment("bottom", this.range.pinnedBottom);
    const hasBody = viewCount > 0 && this.range.rowEnd >= this.range.rowStart;
    if (!hasBody && !pinnedTop && !pinnedBottom) {
      this.clearRange();
      return;
    }

    const maxRow = viewCount - 1;
    const maxCol = leafCount - 1;
    const rowStart = hasBody ? Math.min(this.range.rowStart, maxRow) : 0;
    const rowEnd = hasBody ? Math.min(this.range.rowEnd, maxRow) : -1;
    const colStart = Math.min(this.range.colStart, maxCol);
    const colEnd = Math.min(this.range.colEnd, maxCol);

    this.range = {
      rowStart: hasBody ? Math.min(rowStart, rowEnd) : 0,
      rowEnd: hasBody ? Math.max(rowStart, rowEnd) : -1,
      colStart: Math.min(colStart, colEnd),
      colEnd: Math.max(colStart, colEnd),
      pageStartIdx: this.range.pageStartIdx,
      ...(pinnedTop ? { pinnedTop } : {}),
      ...(pinnedBottom ? { pinnedBottom } : {}),
    };

    const clampPos = (pos: CellPos): CellPos => {
      if (pos.rowPinned) {
        const count = this.deps.getPinnedRowCount?.(pos.rowPinned) ?? 0;
        return {
          row: Math.min(Math.max(pos.row, 0), Math.max(count - 1, 0)),
          colIdx: Math.min(Math.max(pos.colIdx, 0), maxCol),
          rowPinned: pos.rowPinned,
        };
      }
      return {
        row: Math.min(Math.max(pos.row, 0), Math.max(maxRow, 0)),
        colIdx: Math.min(Math.max(pos.colIdx, 0), maxCol),
      };
    };
    if (this.anchor) this.anchor = clampPos(this.anchor);
    if (this.active) this.active = clampPos(this.active);
  }

  // ---------------- Column selection ----------------
  toggleColumn(colId: string, mode: "replace" | "toggle" = "toggle") {
    this.clearRange();
    this.clearRows();
    const columnModel = this.deps.getColumnModel();
    const col = columnModel.resolve(colId);
    if (!col || col.isInternal()) return;

    const leaves = col.getVisibleLeaves();
    const hasChildren = col.children.length > 0;
    const targetIds = hasChildren
      ? leaves.map(l => l.instanceID)
      : [col.instanceID];

    if (mode === "replace") {
      const allSelected = targetIds.every(id => this.selectedColumnIds.has(id))
        && this.selectedColumnIds.size === targetIds.length;
      this.selectedColumnIds.clear();
      if (!allSelected) {
        targetIds.forEach(id => this.selectedColumnIds.add(id));
      }
    } else {
      const allSelected = targetIds.every(id => this.selectedColumnIds.has(id));
      if (allSelected) {
        targetIds.forEach(id => this.selectedColumnIds.delete(id));
      } else {
        targetIds.forEach(id => this.selectedColumnIds.add(id));
      }
    }

    this.reconcileParentSelection();
  }

  clearColumns() {
    this.selectedColumnIds.clear();
  }

  pruneColumns() {
    const keep = new Set<string>();
    const visit = (cols: Column[]) => {
      for (const col of cols) {
        if (this.selectedColumnIds.has(col.instanceID)) keep.add(col.instanceID);
        if (col.children) visit(col.children);
      }
    };
    visit(this.deps.getColumnModel().getColumns());
    this.selectedColumnIds = keep;
  }

  private reconcileParentSelection() {
    const columnModel = this.deps.getColumnModel();
    const parents = new Map<string, Column>();
    for (const selectedColId of this.selectedColumnIds) {
      const col = columnModel.getById(selectedColId);
      if (!col) continue;
      if (col.children.length > 0) {
        parents.set(col.instanceID, col);
      } else {
        const tree = columnModel.getAncestors(selectedColId);
        if (tree.length > 1) {
          tree.slice(0, -1).forEach(p => parents.set(p.instanceID, p));
        }
      }
    }

    for (const parent of parents.values()) {
      const leaves = parent.getVisibleLeaves();
      const allSelected = leaves.length > 0
        && leaves.every(l => this.selectedColumnIds.has(l.instanceID));
      if (allSelected) {
        this.selectedColumnIds.add(parent.instanceID);
      } else {
        this.selectedColumnIds.delete(parent.instanceID);
      }
    }
  }

  // ---------------- Row selection ----------------
  toggleRow(viewIdx: number, mode: "replace" | "toggle" | "range" | "rangeAdd") {
    if (!this.deps.isRowSelectable(viewIdx)) return;
    const rowId = this.deps.getRowIdAtViewIndex(viewIdx);
    if (!rowId) return;

    // "range" replaces the selection with anchor..row (Excel-style, the row-number gesture);
    // "rangeAdd" unions it in (checkbox-style — shift-click never clears the rest).
    if ((mode === "range" || mode === "rangeAdd") && this.rowAnchorViewIdx != null) {
      const anchorIdx = this.rowAnchorViewIdx;
      const start = Math.min(anchorIdx, viewIdx);
      const end = Math.max(anchorIdx, viewIdx);
      if (mode === "range") this.selectedRowIds.clear();
      for (let i = start; i <= end; i++) {
        if (!this.deps.isRowSelectable(i)) continue;
        const id = this.deps.getRowIdAtViewIndex(i);
        if (id) this.selectedRowIds.add(id);
      }
      this.clearRange();
      this.clearColumns();
      return;
    }

    if (mode === "toggle") {
      if (this.selectedRowIds.has(rowId)) {
        this.selectedRowIds.delete(rowId);
      } else {
        this.selectedRowIds.add(rowId);
      }
      this.rowAnchorViewIdx = viewIdx;
      this.clearRange();
      this.clearColumns();
      return;
    }

    this.replaceRow(rowId, viewIdx);
  }

  /**
   * Programmatic row selection by stable row id (ids are validated by the caller). "set"
   * replaces the selection, "add"/"remove" adjust it. Clears the other selection kinds
   * (mutually exclusive) and drops the range anchor — by-id selection has no view position.
   */
  setSelectedRowIds(rowIds: Iterable<string>, mode: "set" | "add" | "remove"): void {
    this.clearRange();
    this.clearColumns();
    if (mode === "set") this.selectedRowIds.clear();
    for (const id of rowIds) {
      if (mode === "remove") this.selectedRowIds.delete(id);
      else this.selectedRowIds.add(id);
    }
    this.rowAnchorViewIdx = null;
  }

  // Select every selectable data row in the current view (group rows are skipped unless
  // groupRowsSelectable is enabled). Clears any cell-range / column selection first.
  selectAllRows() {
    this.clearRange();
    this.clearColumns();
    this.selectedRowIds.clear();
    const viewCount = this.deps.getRowModel().getViewCount();
    for (let i = 0; i < viewCount; i++) {
      if (!this.deps.isRowSelectable(i)) continue;
      const id = this.deps.getRowIdAtViewIndex(i);
      if (id) this.selectedRowIds.add(id);
    }
    this.rowAnchorViewIdx = null;
  }

  // Whether every selectable data row in the current view is selected. False when there are no
  // selectable rows. Used to decide the toggle direction for row-number header-click select-all.
  areAllRowsSelected(): boolean {
    const viewCount = this.deps.getRowModel().getViewCount();
    let selectable = 0;
    for (let i = 0; i < viewCount; i++) {
      if (!this.deps.isRowSelectable(i)) continue;
      selectable++;
      const id = this.deps.getRowIdAtViewIndex(i);
      if (!id || !this.selectedRowIds.has(id)) return false;
    }
    return selectable > 0;
  }

  private replaceRow(rowId: string, viewIdx: number) {
    const wasOnlySelected = this.selectedRowIds.size === 1 && this.selectedRowIds.has(rowId);
    this.selectedRowIds.clear();
    if (!wasOnlySelected) {
      this.selectedRowIds.add(rowId);
      this.rowAnchorViewIdx = viewIdx;
    } else {
      this.rowAnchorViewIdx = null;
    }
    this.clearRange();
    this.clearColumns();
  }

  clearRows() {
    if (this.selectedRowIds.size === 0 && this.rowAnchorViewIdx == null) return;
    this.selectedRowIds.clear();
    this.rowAnchorViewIdx = null;
  }

  clearAll() {
    this.clearRange();
    this.clearRows();
    this.clearColumns();
  }
}
