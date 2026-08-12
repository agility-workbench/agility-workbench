import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { isTrue } from "../../misc";
import { CellRef, SelectionRange } from "../../interfaces/selection";
import { ActiveDescendantTracker, setAriaSelected } from "../aria";
import { ClipboardRenderer } from "../clipboard/clipboardRenderer";
import { RowPoolDef } from "../types";

interface SelectionRendererParams {
  core: GridCore;
  root: HTMLDivElement;
  activeDescendant: ActiveDescendantTracker;
  clipboard: () => ClipboardRenderer;
  rowPool: () => RowPoolDef[];
  startIndex: () => number;
  leafColumns: () => Column[];
  ensureCellVisible: (viewIdx: number, colIdx: number, rowPinned?: "top" | "bottom") => void;
  // Number of fully-visible rows in the viewport — used to size PageUp/PageDown moves.
  viewportRows: () => number;
}

type NavDir = "up" | "down" | "left" | "right";

/**
 * Pure-view selection renderer. Holds NO selection state — it reads the core's selection
 * (getSelectionRange / getSelectedColumnIds / getSelectedRowIds) on the render hot path and
 * repaints when the core emits selectionChanged / focusChanged. User input is translated to
 * actions and dispatched to the core, which owns all selection logic.
 */
export class SelectionRenderer {
  // Transient input-gesture state (mouse drag in progress) — NOT selection state.
  private isSelecting = false;

  constructor(private params: SelectionRendererParams) { }

  // ---------------- Hot path: per-row styling ----------------
  applySelectionToSlot(slot: RowPoolDef, viewIndex: number | null) {
    const range = this.params.core.getSelectionRange();
    const selectedRowIDs = this.params.core.getSelectedRowIds();
    const selectedColumnIDs = this.params.core.getSelectedColumnIds();
    // The focused cell drives two independent things: the optional visual outline
    // (highlightActiveCell, off by default) and aria-activedescendant, which must track focus
    // in every configuration. So resolve focus unconditionally and gate only the class.
    const activeCell = this.params.core.getActiveCell();
    const highlight = !!this.params.core.options.highlightActiveCell;
    // The cell this slot paints as focused, if any — claimed as the root's activedescendant
    // once both the per-column and full-width passes below have had their say.
    let focusedCellEl: HTMLElement | null = null;
    const rangeRow = !!range && viewIndex != null && viewIndex >= range.rowStart && viewIndex <= range.rowEnd;
    const lastRow = viewIndex != null ? viewIndex === this.params.core.getRowModel().getViewCount() - 1 : false;
    const hasBottomBand = this.params.core.getDisplayedPinnedRowCount("bottom") > 0;
    const leaves = this.params.leafColumns();

    const rowId = viewIndex != null
      ? this.params.core.getRowIdAtViewIndex(viewIndex)
      : null;
    const rowSelected = !!rowId && selectedRowIDs.has(rowId);
    const prevRowSelected = this.isViewIndexRowSelected(viewIndex != null ? viewIndex - 1 : null, selectedRowIDs);
    const nextRowSelected = this.isViewIndexRowSelected(viewIndex != null ? viewIndex + 1 : null, selectedRowIDs);

    const apply = (cells: HTMLDivElement[] | undefined) => {
      if (!cells) return;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.style.display === "none") continue; // covered by a colSpan neighbour — nothing to paint
        const colIdxRaw = cell.dataset.colIdx;
        const colIdx = colIdxRaw == null ? NaN : Number(colIdxRaw);
        // A spanning cell covers the leaf-index interval [colIdx, colEnd]; a plain cell has colEnd = colIdx.
        //
        // KNOWN LIMITATION: the selection range is a rectangle in leaf-index space, but colSpan can
        // exist on some rows and not others, producing an L-shaped visual selection a rectangle can't
        // describe. E.g. select a cell that spans cols [2,3] on row 1, then drag to row 2 (where those
        // columns don't span): the range is [2,2], so row 1 paints across cols 2-3 (its own span) but
        // row 2's col 3 is outside the range and stays unbordered — leaving a gap under the spanned
        // portion. Fixing this would mean growing the range to absorb spans across all rows in the
        // selection (changing what is selected/copied); left as-is by design for now.
        const span = cell.dataset.colSpan ? Number(cell.dataset.colSpan) : 1;
        const colEnd = Number.isFinite(colIdx) ? colIdx + Math.max(1, span) - 1 : colIdx;
        const leafCol = Number.isFinite(colIdx) ? leaves[colIdx] : null;
        const colId = leafCol?.instanceID;
        const colSelected = colId ? selectedColumnIDs.has(colId) : false;

        // Range covers this cell if the range's column interval intersects [colIdx, colEnd].
        const rangeSelected = !!rangeRow && !!range && Number.isFinite(colIdx)
          && colIdx <= range.colEnd && colEnd >= range.colStart;
        const selected = rangeSelected || colSelected || rowSelected;

        const prevColSelected = this.neighborSelected(leaves, range, selectedColumnIDs, colIdx - 1);
        const nextColSelected = this.neighborSelected(leaves, range, selectedColumnIDs, colEnd + 1);

        // A range that continues into a pinned band (pinnedTop/pinnedBottom segment) is one
        // contiguous selection — the body edge facing the band draws no border, the band paints
        // the outer edge. Same for a selected column: with a bottom band, the column run closes
        // on the band's last row, not the body's.
        const isTop = rangeSelected
          ? (viewIndex === range?.rowStart && !range?.pinnedTop)
          : rowSelected
            ? !prevRowSelected
            : false;
        const isBottom = rangeSelected
          ? (viewIndex === range?.rowEnd && !range?.pinnedBottom)
          : rowSelected
            ? !nextRowSelected
            : (colSelected && lastRow && !hasBottomBand);
        const isLeft = rangeSelected
          ? (colIdx <= (range?.colStart ?? 0) && (range?.colStart ?? 0) <= colEnd)
          : rowSelected
            ? colIdx === 0
            : (colSelected && !prevColSelected);
        const isRight = rangeSelected
          ? (colIdx <= (range?.colEnd ?? 0) && (range?.colEnd ?? 0) <= colEnd)
          : rowSelected
            ? colEnd === leaves.length - 1
            : (colSelected && !nextColSelected);

        const isActive = !!activeCell && Number.isFinite(colIdx)
          && !activeCell.rowPinned
          && viewIndex === activeCell.row && activeCell.colIdx >= colIdx && activeCell.colIdx <= colEnd;
        if (isActive) focusedCellEl = cell;

        const cls = cell.classList;
        // ARIA mirrors the paint: `selected` is true for a cell inside the range, in a
        // selected column, or in a selected row — which is exactly "this cell is in the selection".
        // Read the class before toggling it to get the previous state, so the steady state (nothing
        // selected, scrolling) costs one class lookup per cell and no attribute writes at all.
        setAriaSelected(cell, selected, cls.contains("selected"));
        cls.toggle("selected", selected);
        cls.toggle("selected-top", selected && isTop);
        cls.toggle("selected-bottom", selected && isBottom);
        cls.toggle("selected-left", selected && isLeft);
        cls.toggle("selected-right", selected && isRight);
        cls.toggle("pte-active-cell", isActive && highlight);
      }
    };

    apply(slot.leadingCellEls);
    apply(slot.leftCellEls);
    apply(slot.cellEls);
    apply(slot.rightCellEls);

    focusedCellEl = this.applySelectionToFullWidthCell(slot, viewIndex, rangeRow, rowSelected, activeCell, highlight)
      ?? focusedCellEl;

    // Row-level selected state is net-new: row selection has always been painted per
    // cell, with no row element carrying it. It goes on the center fragment, which is the ARIA row.
    // Rows are never selected when rowSelection is off, so this needs no separate gate.
    setAriaSelected(slot.rowEl, rowSelected, slot.rowEl.getAttribute("aria-selected") === "true");

    // A slot releases only the pointer it still owns, so slots that lost the active cell cannot
    // undo the claim of the slot that gained it, whatever order the pool is walked in.
    if (focusedCellEl) this.params.activeDescendant.claim(focusedCellEl, slot);
    else this.params.activeDescendant.release(slot);
  }

  // Paint the single full-width host cell (group full-width rows, or isFullWidthRow rows). Column
  // position is meaningless for a one-cell row, so selection is purely row-scoped: the host is
  // "selected" when the row is row-selected or the active cell / cell-range falls on this view row.
  // When the host isn't shown (normal row) or carries no colIdx (non-group full-width row, which is
  // not cell-selectable), all selection classes are cleared.
  // Returns the host when it holds the focused cell, so the caller can name it as the root's
  // aria-activedescendant — in full-width layout it is the row's only visible cell.
  private applySelectionToFullWidthCell(
    slot: RowPoolDef,
    viewIndex: number | null,
    rangeRow: boolean,
    rowSelected: boolean,
    activeCell: { row: number; colIdx: number; rowPinned?: "top" | "bottom" } | null,
    highlight: boolean,
  ): HTMLElement | null {
    const host = slot.fullWidthCellEl;
    const cls = host.classList;
    const cellSelectable = host.style.display !== "none" && host.dataset.colIdx != null;
    if (!cellSelectable) {
      cls.remove("selected-top", "selected-bottom", "selected-left", "selected-right", "pte-active-cell");
      // Row selection still applies to a non-cell-selectable host (e.g. a full-width row selected via
      // the row-number checkbox); keep just the row-scoped "selected" fill.
      const fill = host.style.display !== "none" && rowSelected;
      setAriaSelected(host, fill, cls.contains("selected"));
      cls.toggle("selected", fill);
      return null;
    }

    const selected = rowSelected || rangeRow;
    const isActive = !!activeCell && !activeCell.rowPinned && viewIndex === activeCell.row;
    setAriaSelected(host, selected, cls.contains("selected"));
    cls.toggle("selected", selected);
    // A one-cell row is bordered on all four sides whenever selected.
    cls.toggle("selected-top", selected);
    cls.toggle("selected-bottom", selected);
    cls.toggle("selected-left", selected);
    cls.toggle("selected-right", selected);
    cls.toggle("pte-active-cell", isActive && highlight);
    return isActive ? host : null;
  }

  private isViewIndexRowSelected(viewIndex: number | null, selectedRowIDs: Set<string>): boolean {
    if (viewIndex == null || viewIndex < 0) return false;
    const id = this.params.core.getRowIdAtViewIndex(viewIndex);
    return !!id && selectedRowIDs.has(id);
  }

  private neighborSelected(leaves: Column[], range: SelectionRange | null, selectedColumnIDs: Set<string>, colIdx: number): boolean {
    if (!Number.isFinite(colIdx) || colIdx < 0) return false;
    if (range && colIdx >= range.colStart && colIdx <= range.colEnd) return true;
    const col = leaves[colIdx];
    return !!col && selectedColumnIDs.has(col.instanceID);
  }

  refreshSelectionStyles() {
    const rowPool = this.params.rowPool();
    const total = this.params.core.getRowModel().getViewCount();
    const startIndex = this.params.startIndex();
    for (let i = 0; i < rowPool.length; i++) {
      const viewIndex = startIndex + i;
      const slot = rowPool[i];
      if (viewIndex >= total) {
        this.applySelectionToSlot(slot, null);
        continue;
      }
      this.applySelectionToSlot(slot, viewIndex);
    }
  }

  applyColumnSelectionStyles() {
    const columnModel = this.params.core.getColumnModel();
    const selectedColumnIDs = this.params.core.getSelectedColumnIds();
    const leaves = columnModel.getLeaves();
    const leafIndexMap = new Map<string, number>();
    const selectedLeafIdx = new Set<number>();
    leaves.forEach((c, idx) => {
      leafIndexMap.set(c.instanceID, idx);
      if (selectedColumnIDs.has(c.instanceID)) selectedLeafIdx.add(idx);
    });

    const getRange = (col: Column | null): [number, number] | null => {
      if (!col || col.hidden) return null;
      if (!col.children || col.children.length === 0) {
        const idx = leafIndexMap.get(col.instanceID);
        return idx == null ? null : [idx, idx];
      }
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      const visit = (c: Column) => {
        if (isTrue(c.hidden)) return;
        if (!c.children || c.children.length === 0) {
          const idx = leafIndexMap.get(c.instanceID);
          if (idx == null) return;
          min = Math.min(min, idx);
          max = Math.max(max, idx);
          return;
        }
        for (const child of c.children) visit(child);
      };
      visit(col);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      return [min, max];
    };

    const headers = this.params.root.querySelectorAll<HTMLElement>(".pte-hcell");
    headers.forEach(h => {
      const col = columnModel.getById(h.id);
      const selected = !!col && selectedColumnIDs.has(col.instanceID);
      const range = col ? getRange(col) : null;
      const leftSelected = !!range && selectedLeafIdx.has(range[0] - 1);
      const rightSelected = !!range && selectedLeafIdx.has(range[1] + 1);

      let parent = false;
      if (selected && col) {
        const tree = columnModel.getAncestors(col.instanceID);
        if (tree.length > 1) {
          parent = selectedColumnIDs.has(tree[tree.length - 2].instanceID);
        }
      }

      h.classList.toggle("selected", selected);
      h.classList.toggle("selected-left", selected && !leftSelected);
      h.classList.toggle("not-selected-left", selected && leftSelected);
      h.classList.toggle("selected-right", selected && !rightSelected);
      h.classList.toggle("not-selected-right", selected && rightSelected);
      h.classList.toggle("selected-top", selected && !parent);
      h.classList.toggle("not-selected-top", selected && parent);

      const content = h.querySelector<HTMLElement>(".pte-hcell-content");
      if (content) content.classList.toggle("selected", selected);
    });
  }

  // ---------------- Event-driven repaint ----------------
  /** Called when core emits selectionChanged — repaint body + header. */
  onSelectionChanged() {
    this.refreshSelectionStyles();
    this.applyColumnSelectionStyles();
  }

  /** Called when core emits focusChanged — scroll the active cell into view and repaint so the
   * outline (when enabled) and the root's aria-activedescendant follow the focused cell. The
   * repaint is unconditional: with highlightActiveCell off there is nothing to draw, but the
   * ARIA pointer still has to move, and the paint pass is what re-derives it. */
  onFocusChanged(viewIdx?: number, colIdx?: number, rowPinned?: "top" | "bottom") {
    if (viewIdx == null || colIdx == null) return;
    this.params.ensureCellVisible(viewIdx, colIdx, rowPinned);
    this.refreshSelectionStyles();
  }

  // ---------------- DOM resolution ----------------
  getCellLocation(target: EventTarget | null): {
    viewIdx: number;
    colIdx: number;
    rowPinned?: "top" | "bottom";
  } | null {
    const cell = (target as HTMLElement | null)?.closest(".pte-cell") as HTMLDivElement | null;
    if (!cell || !this.params.root.contains(cell)) return null;
    if (cell.classList.contains("pte-row-number-cell")) return null;
    if (cell.classList.contains("pte-checkbox-cell")) return null;

    const rowEl = cell.closest(".pte-row") as HTMLDivElement | null;
    if (!rowEl) return null;
    // Group-row cells are only selectable when groupRowsSelectable is enabled. When disabled,
    // clicking a group cell resolves to no location (the click clears/keeps selection like empty
    // space). The chevron toggle is handled earlier in onCellMouseDown either way. Editing is
    // always blocked on group rows in the core's editStart.
    if (
      !rowEl.dataset.rowPinned
      && !this.params.core.options.groupRowsSelectable
      && rowEl.classList.contains("pte-group-row")
    ) return null;

    const viewIdx = Number(rowEl.getAttribute("data-view-idx"));
    const colIdx = Number(cell.dataset.colIdx);
    if (!Number.isFinite(viewIdx) || !Number.isFinite(colIdx)) return null;
    const rowPinned = rowEl.dataset.rowPinned;
    return {
      viewIdx,
      colIdx,
      rowPinned: rowPinned === "top" || rowPinned === "bottom" ? rowPinned : undefined,
    };
  }

  // ---------------- Input handlers (translate → dispatch) ----------------
  onKeyDown(e: KeyboardEvent) {
    // While a cell editor is open it owns the keyboard (Enter/Tab/Escape/arrows); the editor
    // input stops propagation for the keys it handles, but guard here too so navigation never
    // runs underneath an open editor.
    if (this.params.core.getEditingCell()) return;

    // Embedded form controls (column filter inputs, filter type/op <select>, join radios, the quick
    // filter box, etc.) live inside the grid root, so their keydowns bubble here. Let them own their
    // own keyboard — otherwise navigation/clipboard/edit shortcuts would steal Arrows, Home/End and
    // Backspace/Delete and these fields could only be typed into, never edited or cleared.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;

    // Optional fixed runtime mode switch. It is deliberately handled before all other grid
    // shortcuts, but only after the editor/form-control guards above.
    if (
      ctrl
      && e.shiftKey
      && !e.altKey
      && (e.key === " " || e.code === "Space")
      && this.params.core.options.treeData?.enableKeyboardNavigationModeSwitch
    ) {
      e.preventDefault();
      const next = this.params.core.getKeyboardNavigationMode() === "grid" ? "hierarchy" : "grid";
      this.params.core.dispatch({
        type: "keyboardNavigationModeSet",
        mode: next,
        source: "shortcut",
      });
      return;
    }

    // Hierarchy mode replaces Ctrl/Cmd block navigation only inside the generated hierarchy
    // column. Shift keeps its existing range/block semantics, and every other column is untouched.
    if (
      ctrl
      && !e.shiftKey
      && !e.altKey
      && this.params.core.getKeyboardNavigationMode() === "hierarchy"
      && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp")
    ) {
      const active = this.params.core.getActiveCell();
      const hierarchy = this.params.core.getColumnModel().getHierarchyColumn();
      const activeColumn = active
        ? this.params.core.getColumnModel().getLeaves()[active.colIdx]
        : undefined;
      if (hierarchy && activeColumn?.instanceID === hierarchy.instanceID) {
        e.preventDefault();
        this.params.core.dispatch({
          type: "treeNavigate",
          command: e.key === "ArrowRight"
            ? "expand"
            : e.key === "ArrowLeft"
              ? "collapse"
              : "parent",
        });
        return;
      }
    }

    // Shift-based range extension only applies when range selection is enabled; otherwise Shift is
    // ignored and navigation collapses to a single moving cell.
    const extend = e.shiftKey && this.params.core.options.rangeSelection;

    // Shift+F2 — open the ActionFrame on the focused cell (Excel/Sheets "edit comment" convention).
    // Core no-ops on a group row / when the column has no ActionFrame component. Checked before the
    // plain-F2 edit handler below so the shift chord isn't swallowed by it.
    if (e.key === "F2" && e.shiftKey) {
      const cell = this.activeCellRef();
      if (cell) {
        e.preventDefault();
        this.params.core.dispatch({ type: "actionFrameOpen", cell, source: "keyboard" });
      }
      return;
    }

    // F2 / Enter — begin editing the focused cell. (Core no-ops if the column isn't editable.)
    // Disabled by suppressKeyboardEdit; Enter still consumes the event to avoid stray behavior.
    if (e.key === "F2" || e.key === "Enter") {
      if (this.params.core.options.suppressKeyboardEdit) return;
      const cell = this.activeCellRef();
      if (cell) {
        e.preventDefault();
        this.params.core.dispatch({ type: "editStart", cell, source: "keyboard" });
      }
      return;
    }

    // Ctrl/Cmd+A — select all.
    if (ctrl && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      this.params.core.dispatch({ type: "selectAll" });
      return;
    }

    // Ctrl/Cmd+C / X / V — clipboard copy / cut / paste over the current selection.
    if (ctrl && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      this.params.clipboard().copy();
      return;
    }
    if (ctrl && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      this.params.clipboard().cut();
      return;
    }
    if (ctrl && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      void this.params.clipboard().paste();
      return;
    }

    // Undo / redo: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y to redo.
    if (ctrl && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      this.params.core.dispatch({ type: e.shiftKey ? "redo" : "undo" });
      return;
    }
    if (ctrl && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      this.params.core.dispatch({ type: "redo" });
      return;
    }

    // Delete / Backspace — clear the editable cells in the current selection.
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.params.clipboard().clearContents();
      return;
    }

    // Home / End — horizontal edge; with Ctrl/Cmd — jump to a grid corner.
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      if (ctrl) {
        this.params.core.dispatch({
          type: "navigateCorner",
          corner: e.key === "Home" ? "topLeft" : "bottomRight",
          extend,
        });
      } else {
        this.params.core.dispatch({
          type: "navigate",
          dir: e.key === "Home" ? "left" : "right",
          extend,
          jump: "edge",
        });
      }
      return;
    }

    // PageUp / PageDown — move by one viewport of rows.
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      this.params.core.dispatch({
        type: "navigate",
        dir: e.key === "PageUp" ? "up" : "down",
        extend,
        jump: "page",
        pageRows: this.params.viewportRows(),
      });
      return;
    }

    let dir: NavDir | null = null;
    switch (e.key) {
      case "ArrowUp": dir = "up"; break;
      case "ArrowDown": dir = "down"; break;
      case "ArrowLeft": dir = "left"; break;
      case "ArrowRight": dir = "right"; break;
      default:
        // Edit-on-typing: a printable character on the focused cell opens the editor seeded with
        // that character. (Modifier combos and non-printing keys fall through untouched.) Disabled
        // by suppressKeyboardEdit (all keyboard edit) or suppressTypeToEdit (just this trigger).
        const typeToEditOff = this.params.core.options.suppressKeyboardEdit
          || this.params.core.options.suppressTypeToEdit;
        if (!typeToEditOff && !ctrl && !e.altKey && isPrintableKey(e.key)) {
          const cell = this.activeCellRef();
          if (cell) {
            e.preventDefault();
            this.params.core.dispatch({ type: "editStart", cell, source: "keyboard", charPress: e.key });
          }
        }
        return;
    }
    // ArrowUp off the top row moves to the column header, row 0 of the grid. Not while extending a
    // range: Shift+ArrowUp is a selection gesture and the header holds nothing selectable.
    if (dir === "up" && !extend && !ctrl && this.params.core.tryEnterHeaderFromTop()) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    this.params.core.dispatch({
      type: "navigate",
      dir,
      extend,
      jump: ctrl ? "block" : undefined,
    });
  }

  onCellMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;

    // Clicking a group row's expand/collapse chevron toggles that group and consumes the event so
    // it doesn't also start a cell-range selection.
    const toggle = (e.target as HTMLElement | null)?.closest(".pte-group-toggle") as HTMLElement | null;
    if (toggle && this.params.root.contains(toggle)) {
      const rowEl = toggle.closest(".pte-row") as HTMLElement | null;
      const cellEl = toggle.closest(".pte-cell") as HTMLElement | null;
      const groupId = toggle.getAttribute("data-group-id")
        ?? rowEl?.getAttribute("data-group-id");
      if (groupId) {
        e.preventDefault();
        this.params.core.dispatch({ type: "groupToggleExpand", groupId });
        // The chevron consumes mousedown so it does not start a drag/range gesture. For tree data,
        // still make its hierarchy cell the active keyboard target after the synchronous reflow;
        // otherwise the subsequent mode-toggle / hierarchy keys are sent outside the grid or act
        // on a previously-focused cell.
        if ((this.params.core.options.treeData || rowEl?.dataset.rowPinned) && rowEl && cellEl) {
          const viewIdx = Number(rowEl.getAttribute("data-view-idx"));
          const colIdx = Number(cellEl.dataset.colIdx);
          if (Number.isFinite(viewIdx) && Number.isFinite(colIdx)) {
            this.params.core.dispatch({
              type: "focusSet",
              viewIdx,
              colIdx,
              rowPinned: rowEl.dataset.rowPinned === "top" || rowEl.dataset.rowPinned === "bottom"
                ? rowEl.dataset.rowPinned
                : undefined,
              reason: "mouse",
            });
          }
        }
        this.params.root.focus();
        return;
      }
    }

    // Checkbox cell: always additive — click toggles just this row, Shift+click selects a range
    // from the row anchor. Never clears the rest of the selection (that's the checkbox contract).
    const checkboxCell = (e.target as HTMLElement | null)?.closest(".pte-checkbox-cell") as HTMLDivElement | null;
    if (checkboxCell && this.params.root.contains(checkboxCell) && this.params.core.options.rowSelection) {
      const rowEl = checkboxCell.closest(".pte-row") as HTMLDivElement | null;
      const viewIdx = rowEl ? Number(rowEl.getAttribute("data-view-idx")) : NaN;
      if (!Number.isFinite(viewIdx)) return;
      e.preventDefault();
      this.params.core.dispatch({
        type: "rowSelectSet",
        viewIdx,
        mode: e.shiftKey ? "rangeAdd" : "toggle",
      });
      return;
    }

    const rowNumberCell = (e.target as HTMLElement | null)?.closest(".pte-row-number-cell") as HTMLDivElement | null;
    if (rowNumberCell && this.params.root.contains(rowNumberCell) && this.params.core.options.rowSelection) {
      const rowEl = rowNumberCell.closest(".pte-row") as HTMLDivElement | null;
      const viewIdx = rowEl ? Number(rowEl.getAttribute("data-view-idx")) : NaN;
      if (!Number.isFinite(viewIdx)) return;
      e.preventDefault();
      const mode: "replace" | "toggle" | "range" = e.shiftKey
        ? "range"
        : (e.ctrlKey || e.metaKey)
          ? "toggle"
          : "replace";
      this.params.core.dispatch({ type: "rowSelectSet", viewIdx, mode });
      return;
    }

    // Grid cell selection is only active when cellSelection === true. When it is false ("inert") or
    // "text" (native browser text selection), clicks neither select nor focus a cell — and we return
    // BEFORE preventDefault so the browser's own text selection can start in "text" mode. An
    // empty-space click can still clear an existing selection (e.g. one set via the API).
    if (this.params.core.options.cellSelection !== true) {
      if (!this.getCellLocation(e.target) && this.params.core.options.clearSelectionOnBodyClick) {
        this.params.core.dispatch({ type: "selectionClear", what: "all" });
      }
      return;
    }

    const location = this.getCellLocation(e.target);
    if (!location) {
      if (this.params.core.options.clearSelectionOnBodyClick) {
        this.params.core.dispatch({ type: "selectionClear", what: "all" });
      }
      return;
    }
    e.preventDefault();
    // Only arm drag-to-extend when range selection is allowed. The "start" dispatch collapses the
    // selection to this single cell either way.
    this.isSelecting = this.params.core.options.rangeSelection;
    this.params.core.dispatch({
      type: "rangeSelectSet",
      viewIdx: location.viewIdx,
      colIdx: location.colIdx,
      rowPinned: location.rowPinned,
      mode: "start",
    });
    this.params.root.focus();

    // Single-click editing: the same click that selects the cell also opens the editor. Core no-ops
    // for non-editable columns / group rows, so this is safe to always dispatch when enabled.
    if (this.params.core.options.editTrigger === "singleClick") {
      const cell = this.cellRefFromLocation(location.viewIdx, location.colIdx, location.rowPinned);
      if (cell) this.params.core.dispatch({ type: "editStart", cell, source: "mouse" });
    }
  }

  onCellDoubleClick(e: MouseEvent) {
    if (e.button !== 0) return;
    if (this.params.core.options.cellSelection !== true) return;
    if (this.params.core.options.editTrigger !== "doubleClick") return;
    const location = this.getCellLocation(e.target);
    if (!location) return;
    const cell = this.cellRefFromLocation(location.viewIdx, location.colIdx, location.rowPinned);
    if (!cell) return;
    e.preventDefault();
    this.params.core.dispatch({ type: "editStart", cell, source: "mouse" });
  }

  // Resolve a view-index/leaf-index cell position to a stable { rowId, colId } reference.
  private cellRefFromLocation(
    viewIdx: number,
    colIdx: number,
    rowPinned?: "top" | "bottom",
  ): CellRef | null {
    const rowId = rowPinned
      ? this.params.core.getDisplayedPinnedRow(rowPinned, viewIdx)?.id ?? null
      : this.params.core.getRowIdAtViewIndex(viewIdx);
    const col = this.params.leafColumns()[colIdx];
    if (!rowId || !col) return null;
    return { rowId, colId: col.instanceID, rowPinned };
  }

  private activeCellRef(): CellRef | null {
    const active = this.params.core.getActiveCell();
    if (!active) return null;
    return this.cellRefFromLocation(active.row, active.colIdx, active.rowPinned);
  }

  onCellMouseMove(e: MouseEvent) {
    if (!this.isSelecting) return;
    const location = this.getCellLocation(e.target);
    if (!location) return;
    this.params.core.dispatch({
      type: "rangeSelectSet",
      viewIdx: location.viewIdx,
      colIdx: location.colIdx,
      rowPinned: location.rowPinned,
      mode: "extend",
    });
  }

  onCellMouseUp() {
    if (!this.isSelecting) return;
    this.isSelecting = false;
  }

  /**
   * Body click → emit rowClicked (for any body row, including group rows) and, when the click landed
   * on a real data cell, cellClicked. These are notification-only events (they don't drive
   * selection, which happens on mousedown); consumers subscribe via api.on or the onRowClicked /
   * onCellClicked options. Fires regardless of cellSelection mode so plain-table / read-only grids
   * still get click callbacks.
   */
  onCellClick(e: MouseEvent) {
    if (e.button !== 0) return;
    const rowEl = (e.target as HTMLElement | null)?.closest(".pte-row") as HTMLDivElement | null;
    if (!rowEl || !this.params.root.contains(rowEl)) return;
    const viewIdx = Number(rowEl.getAttribute("data-view-idx"));
    if (!Number.isFinite(viewIdx)) return;
    const rowPinned = rowEl.dataset.rowPinned === "top" || rowEl.dataset.rowPinned === "bottom"
      ? rowEl.dataset.rowPinned
      : undefined;
    const pinnedNode = rowPinned
      ? this.params.core.getDisplayedPinnedRow(rowPinned, viewIdx)
      : null;
    const rowId = pinnedNode?.id ?? this.params.core.getRowIdAtViewIndex(viewIdx);
    if (!rowId) return;
    const rowNode = pinnedNode ?? this.params.core.getRowModel().getRowNode(rowId);
    const isGroup = !!rowNode?.isGroup;

    this.params.core.emit("rowClicked", { rowId, viewIdx, data: rowNode?.data, isGroup, event: e });

    // cellClicked only for a real data cell (not the row-number / checkbox utility cells).
    const cell = (e.target as HTMLElement | null)?.closest(".pte-cell") as HTMLDivElement | null;
    if (!cell || cell.classList.contains("pte-row-number-cell") || cell.classList.contains("pte-checkbox-cell")) return;
    const colIdx = Number(cell.dataset.colIdx);
    if (!Number.isFinite(colIdx)) return;
    const col = this.params.leafColumns()[colIdx];
    if (!col) return;
    const value = rowNode && !isGroup ? col.getValue(rowNode) : undefined;
    this.params.core.emit("cellClicked", {
      rowId, colId: col.colId, colInstanceId: col.instanceID, viewIdx, colIdx, data: rowNode?.data, value, event: e,
    });
  }
}

// A KeyboardEvent.key that represents a single printable character (letters, digits, punctuation,
// space). Named keys like "Enter", "Tab", "ArrowUp" are multi-character, so length === 1 excludes
// them; space (" ") is treated as printable so it can seed/replace a cell value.
function isPrintableKey(key: string): boolean {
  return key.length === 1;
}
