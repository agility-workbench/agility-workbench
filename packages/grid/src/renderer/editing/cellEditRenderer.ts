import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { CellRef } from "../../interfaces/selection";
import { IRowNode } from "../../interfaces/iRowNode";
import { GridEventEditingChangedParams } from "../../events/events";
import { anyModifiers, hasMod, matchesChord } from "../interaction/keyChord";
import { centerCellAt, RowPoolDef } from "../types";
import { ICellEditor } from "./cellEditor";
import { createEditorForColumn } from "./resolveEditor";

type SectionLookup = Map<string, { section: "left" | "center" | "right"; globalIndex: number; localIndex: number }>;

interface CellEditRendererParams {
  core: GridCore;
  // The grid root element that owns the keydown listener; focus must return here after editing
  // so keyboard navigation keeps working.
  root: HTMLDivElement;
  rowPool: () => RowPoolDef[];
  startIndex: () => number;
  leafColumnLookup: () => SectionLookup;
  leafColumns: () => Column[];
  ensureCellVisible: (viewIdx: number, colIdx: number, rowPinned?: "top" | "bottom") => void;
  // The rendered cell element of a pinned band row, for mounting an editor there.
  findPinnedCellEl?: (position: "top" | "bottom", rowIndex: number, colIdx: number) => HTMLDivElement | null;
  // Re-render a single cell's content in place (used to restore the cell when editing stops).
  repaintCell: (rowId: string, colId: string) => void;
  // Grid API reference passed to editors.
  api: () => any;
  // Screen-reader announcement (the grid's polite live region); the invalid-edit message uses it.
  announce?: (message: string) => void;
}

const EDITING_CELL_CLASS = "pte-cell-editing";
const INVALID_CELL_CLASS = "pte-cell-invalid";

/**
 * Owns the inline cell editor DOM. Holds NO editing state — the core owns which cell is editing;
 * this renderer reacts to `editingChanged` events by resolving the column's editor, mounting its
 * GUI over the cell, and translating the editor's keys (Enter/Tab/Escape) and blur into
 * editCommit / editCancel actions. The committed value comes from `editor.getValue()`, and
 * `editor.isParsed()` decides whether the column's valueParser is skipped.
 *
 * Invalid edits (#48): a commit the editor refuses (`getValidationMessage`), or the core refuses
 * (the column's parser or `onBeforeCellCommit`, reported as `editingChanged {state: "rejected"}`
 * while the core still holds the cell as editing), keeps the editor mounted with its text. The
 * cell gets `pte-cell-invalid` and `aria-invalid="true"` (on the cell and the editor's GUI), the
 * message becomes the GUI's `title` and is announced. Escape cancels; the next Enter/Tab/blur
 * retries. A refused blur commit takes focus back into the editor when focus moved elsewhere in
 * the grid (or nowhere), so the user is not left with an invisible open editor.
 */
export class CellEditRenderer {
  private editor: ICellEditor | null = null;
  private gui: HTMLElement | null = null;
  private cellEl: HTMLDivElement | null = null;
  private editingCell: CellRef | null = null;
  // Textarea editors keep Enter for newlines and commit on blur / Ctrl+Enter only.
  private multiline = false;
  // Guards against the teardown-triggered blur re-dispatching a commit/cancel.
  private tearingDown = false;
  // The open editor's last commit was refused; the GUI's title before we overwrote it.
  private invalid = false;
  private guiTitle: string | null = null;

  constructor(private params: CellEditRendererParams) { }

  isEditing(): boolean {
    return this.editingCell != null;
  }

  /**
   * Instance id of the column whose body cell holds the open editor, or null (no editor, or one
   * mounted in a pinned band). Column virtualization keeps that column rendered while it scrolls
   * out of view, so the editor is neither destroyed nor committed by a horizontal scroll.
   */
  getBodyEditColumnId(): string | null {
    const cell = this.editingCell;
    if (!cell || cell.rowPinned || !this.cellEl) return null;
    return this.cellEl.dataset.colId ?? null;
  }

  onEditingChanged(params: GridEventEditingChangedParams) {
    if (params.state === "started") {
      if (params.cell) this.mount(params.cell, params.charPress ?? null);
      return;
    }
    // A refused commit of the open editor: the core kept the cell editing, so keep the editor
    // (with its text) and mark it invalid.
    if (params.state === "rejected" && this.isOpenEditorCell(params.cell)
      && this.isOpenEditorCell(this.params.core.getEditingCell() ?? undefined)) {
      this.markInvalid(params.message);
      return;
    }
    // committed / cancelled / stopped / rejected (editor closing) — tear the editor down.
    this.teardown();
  }

  /**
   * Commit the open editor's value as Enter would (`api.stopEditing()`), without moving the active
   * cell. No-op when no editor is open.
   */
  commitEditor(): void {
    this.commit();
  }

  private isOpenEditorCell(cell: CellRef | undefined): boolean {
    const open = this.editingCell;
    if (!open || !cell) return false;
    return cell.rowId === open.rowId
      && (cell.colInstanceId ?? cell.colId) === (open.colInstanceId ?? open.colId);
  }

  /** Release an editor that is still open when the renderer itself is torn down. */
  destroy(): void {
    this.teardown(false);
  }

  private mount(cell: CellRef, charPress: string | null) {
    this.teardown();

    const core = this.params.core;
    const col = cell.colInstanceId
      ? core.getColumnModel().getById(cell.colInstanceId)
      : core.getColumnModel().resolve(cell.colId);
    // Application-pinned data rows never enter the row model; resolve them from the band.
    const pinnedRef = cell.rowPinned ? core.getDisplayedPinnedRowRef(cell.rowId) : null;
    const row = pinnedRef?.node ?? core.getRowModel().getRowNode(cell.rowId);
    if (!col || !row) return;

    const lookup = this.params.leafColumnLookup().get(col.instanceID);
    if (!lookup) return;

    let cellEl: HTMLDivElement | null;
    if (pinnedRef) {
      this.params.ensureCellVisible(pinnedRef.rowIndex, lookup.globalIndex, pinnedRef.position);
      cellEl = this.params.findPinnedCellEl?.(pinnedRef.position, pinnedRef.rowIndex, lookup.globalIndex) ?? null;
    } else {
      const viewIdx = core.getViewIndexForRowId(cell.rowId);
      if (viewIdx == null) return;
      this.params.ensureCellVisible(viewIdx, lookup.globalIndex);
      cellEl = this.findCellEl(viewIdx, lookup.section, lookup.localIndex);
    }
    if (!cellEl) return;

    const editor = createEditorForColumn(col);
    editor.init({
      value: col.getValue(row),
      row,
      col,
      editorParams: col.cellEditorParams,
      eCell: cellEl,
      api: this.params.api(),
      getDistinctColumnValues: () => this.distinctColumnValues(col),
      cellStartedEdit: true,
      charPress,
    });

    if (editor.isCancelBeforeStart?.()) {
      editor.destroy?.();
      core.dispatch({ type: "editCancel", cell });
      return;
    }

    const gui = editor.getGui();
    this.multiline = gui instanceof HTMLTextAreaElement;

    gui.addEventListener("keydown", this.onEditorKeyDown);
    gui.addEventListener("blur", this.onEditorBlur, true);
    gui.addEventListener("mousedown", stopPropagation);
    gui.addEventListener("dblclick", stopPropagation);

    cellEl.classList.add(EDITING_CELL_CLASS);
    cellEl.replaceChildren(gui);

    this.editor = editor;
    this.gui = gui;
    this.cellEl = cellEl;
    this.editingCell = cell;

    editor.focus?.();
  }

  private teardown(repaint = true) {
    if (!this.editingCell) return;
    this.tearingDown = true;

    const cell = this.editingCell;
    if (this.gui) {
      this.gui.removeEventListener("keydown", this.onEditorKeyDown);
      this.gui.removeEventListener("blur", this.onEditorBlur, true);
      this.gui.removeEventListener("mousedown", stopPropagation);
      this.gui.removeEventListener("dblclick", stopPropagation);
    }
    this.clearInvalid();
    this.cellEl?.classList.remove(EDITING_CELL_CLASS);

    // If the editor still holds focus (keyboard commit/cancel), hand focus back to the grid root so
    // its keydown handler keeps receiving arrow keys. If focus already moved elsewhere (the user
    // clicked another element, causing a blur-commit), leave it alone.
    const returnFocus = this.gui != null && this.gui.contains(document.activeElement);

    this.editor?.destroy?.();
    this.editor = null;
    this.gui = null;
    this.cellEl = null;
    this.editingCell = null;
    this.multiline = false;

    // Restore the cell's rendered content during ordinary editing. Grid teardown destroys the
    // row pool immediately afterwards, so repainting then would only create a replacement renderer
    // that also needs to be destroyed.
    if (repaint) this.params.repaintCell(cell.rowId, cell.colInstanceId ?? cell.colId);
    if (returnFocus) this.params.root.focus();
    this.tearingDown = false;
  }

  private onEditorKeyDown = (e: KeyboardEvent) => {
    // Keep the editor's keys away from the grid's navigation handler.
    e.stopPropagation();

    // Enter reads both modifiers: Mod commits from a textarea, Shift picks the direction to move.
    // Alt is not part of the chord, so Alt+Enter is left to the browser rather than committing.
    if (matchesChord(e, { key: "enter", mod: "any", shift: "any" })) {
      // In a textarea, plain Enter inserts a newline; Ctrl/Cmd+Enter commits.
      if (this.multiline && !hasMod(e)) return;
      e.preventDefault();
      // moveAfterEdit: advance to the next row after committing (Shift+Enter goes up). A refused
      // commit keeps the editor open and the active cell where it is.
      if (this.commit()) this.moveAfterCommit(e.shiftKey ? "up" : "down");
      return;
    }

    // Shift chooses the direction; Mod does not belong to this chord, so Ctrl+Tab stays the
    // browser's tab switch instead of committing the edit and moving the cursor.
    if (matchesChord(e, { key: "tab", shift: "any" })) {
      e.preventDefault();
      // Tab advances horizontally after committing (Shift+Tab goes left).
      if (this.commit()) this.moveAfterCommit(e.shiftKey ? "left" : "right");
      return;
    }

    // Dismissal: cancels whatever modifiers are held.
    if (matchesChord(e, anyModifiers("escape"))) {
      e.preventDefault();
      this.cancel();
    }
  };

  private onEditorBlur = (e: FocusEvent) => {
    // Ignore the blur we cause ourselves while tearing down.
    if (this.tearingDown) return;
    // Focus moving between elements of the editor's own GUI is not leaving the editor.
    const next = e.relatedTarget as Node | null;
    if (next && this.gui?.contains(next)) return;
    // Committing on blur is opt-out; when disabled, focus loss leaves the editor open.
    if (!this.params.core.options.commitOnBlur) return;
    if (this.commit()) return;
    // Refused: the editor stays open and invalid. Take focus back when it went elsewhere in the
    // grid (or nowhere); focus that left the grid for another control stays where the user put it.
    const editor = this.editor;
    if (!editor || (next && !this.params.root.contains(next))) return;
    setTimeout(() => {
      if (this.editor !== editor || !this.gui) return;
      if (editor.focus) editor.focus();
      else this.gui.focus();
    }, 0);
  };

  // After an Enter/Tab commit, move the active cell one step so editing flows like a spreadsheet.
  // Gated by moveAfterEdit; no-op once the option is off (commit stays in place).
  private moveAfterCommit(dir: "up" | "down" | "left" | "right") {
    if (!this.params.core.options.moveAfterEdit) return;
    this.params.core.dispatch({ type: "navigate", dir });
  }

  // Try to commit the open editor. Returns true when the editor closed (committed, or cancelled
  // by isCancelAfterEnd), false when the commit was refused and the editor stays open, invalid.
  private commit(): boolean {
    if (!this.editingCell || !this.editor) return false;
    const editor = this.editor;
    if (editor.isCancelAfterEnd?.()) {
      this.cancel();
      return true;
    }
    const message = editor.getValidationMessage?.();
    if (message) {
      this.markInvalid(message);
      return false;
    }
    const cell = this.editingCell;
    const value = editor.getValue();
    const parsed = editor.isParsed?.() ?? false;
    this.params.core.dispatch({ type: "editCommit", cell, value, parsed, fromEditor: true });
    return this.editor !== editor;
  }

  // Mark the open editor's cell invalid: class + aria-invalid on the cell and the GUI, the message
  // as the GUI's tooltip, and one announcement per refusal.
  private markInvalid(message: string | undefined) {
    const gui = this.gui;
    const cellEl = this.cellEl;
    if (!gui || !cellEl) return;
    const text = message || this.params.core.getLocaleText("invalidCellValue");
    if (!this.invalid) this.guiTitle = gui.getAttribute("title");
    this.invalid = true;
    cellEl.classList.add(INVALID_CELL_CLASS);
    cellEl.setAttribute("aria-invalid", "true");
    gui.setAttribute("aria-invalid", "true");
    gui.setAttribute("title", text);
    this.params.announce?.(text);
  }

  private clearInvalid() {
    if (!this.invalid) return;
    this.invalid = false;
    this.cellEl?.classList.remove(INVALID_CELL_CLASS);
    this.cellEl?.removeAttribute("aria-invalid");
    if (this.gui) {
      this.gui.removeAttribute("aria-invalid");
      if (this.guiTitle == null) this.gui.removeAttribute("title");
      else this.gui.setAttribute("title", this.guiTitle);
    }
    this.guiTitle = null;
  }

  private cancel() {
    if (!this.editingCell) return;
    this.params.core.dispatch({ type: "editCancel", cell: this.editingCell });
  }

  // Distinct non-null values of a column across the loaded rows, in first-seen order.
  private distinctColumnValues(col: Column): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    this.params.core.getRowModel().forEachNode((node: IRowNode) => {
      const v = col.getValue(node);
      if (v == null) return;
      const k = String(v);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(v);
    });
    return out;
  }

  private findCellEl(viewIdx: number, section: "left" | "center" | "right", localIndex: number): HTMLDivElement | null {
    const slot = this.params.rowPool()[viewIdx - this.params.startIndex()];
    if (!slot) return null;
    if (section === "center") return centerCellAt(slot, localIndex);
    const cells = section === "left" ? slot.leftCellEls : slot.rightCellEls;
    return cells?.[localIndex] ?? null;
  }
}

function stopPropagation(e: Event) {
  e.stopPropagation();
}
