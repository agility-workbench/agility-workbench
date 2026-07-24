import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { CellRef } from "../../interfaces/selection";
import { IRowNode } from "../../interfaces/iRowNode";
import { GridEventEditingChangedParams } from "../../events/events";
import { RowPoolDef } from "../types";
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
  ensureCellVisible: (viewIdx: number, colIdx: number) => void;
  // Re-render a single cell's content in place (used to restore the cell when editing stops).
  repaintCell: (rowId: string, colId: string) => void;
  // Grid API reference passed to editors.
  api: () => any;
}

const EDITING_CELL_CLASS = "pte-cell-editing";

/**
 * Owns the inline cell editor DOM. Holds NO editing state — the core owns which cell is editing;
 * this renderer reacts to `editingChanged` events by resolving the column's editor, mounting its
 * GUI over the cell, and translating the editor's keys (Enter/Tab/Escape) and blur into
 * editCommit / editCancel actions. The committed value comes from `editor.getValue()`, and
 * `editor.isParsed()` decides whether the column's valueParser is skipped.
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

  constructor(private params: CellEditRendererParams) { }

  isEditing(): boolean {
    return this.editingCell != null;
  }

  onEditingChanged(params: GridEventEditingChangedParams) {
    if (params.state === "started") {
      if (params.cell) this.mount(params.cell, params.charPress ?? null);
      return;
    }
    // committed / cancelled / stopped — tear the editor down.
    this.teardown();
  }

  private mount(cell: CellRef, charPress: string | null) {
    this.teardown();

    const core = this.params.core;
    const col = core.getColumnModel().getById(cell.colId);
    const row = core.getRowModel().getRowNode(cell.rowId);
    if (!col || !row) return;

    const viewIdx = core.getViewIndexForRowId(cell.rowId);
    const lookup = this.params.leafColumnLookup().get(cell.colId);
    if (viewIdx == null || !lookup) return;

    this.params.ensureCellVisible(viewIdx, lookup.globalIndex);

    const cellEl = this.findCellEl(viewIdx, lookup.section, lookup.localIndex);
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

  private teardown() {
    if (!this.editingCell) return;
    this.tearingDown = true;

    const cell = this.editingCell;
    if (this.gui) {
      this.gui.removeEventListener("keydown", this.onEditorKeyDown);
      this.gui.removeEventListener("blur", this.onEditorBlur, true);
      this.gui.removeEventListener("mousedown", stopPropagation);
      this.gui.removeEventListener("dblclick", stopPropagation);
    }
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

    // Restore the cell's rendered content (for cancel, and to strip the editor on commit).
    this.params.repaintCell(cell.rowId, cell.colId);
    if (returnFocus) this.params.root.focus();
    this.tearingDown = false;
  }

  private onEditorKeyDown = (e: KeyboardEvent) => {
    // Keep the editor's keys away from the grid's navigation handler.
    e.stopPropagation();
    switch (e.key) {
      case "Enter":
        // In a textarea, plain Enter inserts a newline; Ctrl/Cmd+Enter commits.
        if (this.multiline && !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        this.commit();
        // moveAfterEdit: advance to the next row after committing (Shift+Enter goes up).
        this.moveAfterCommit(e.shiftKey ? "up" : "down");
        break;
      case "Tab":
        e.preventDefault();
        this.commit();
        // Tab advances horizontally after committing (Shift+Tab goes left).
        this.moveAfterCommit(e.shiftKey ? "left" : "right");
        break;
      case "Escape":
        e.preventDefault();
        this.cancel();
        break;
    }
  };

  private onEditorBlur = () => {
    // Ignore the blur we cause ourselves while tearing down.
    if (this.tearingDown) return;
    // Committing on blur is opt-out; when disabled, focus loss leaves the editor open.
    if (!this.params.core.options.stopEditingWhenCellsLoseFocus) return;
    this.commit();
  };

  // After an Enter/Tab commit, move the active cell one step so editing flows like a spreadsheet.
  // Gated by moveAfterEdit; no-op once the option is off (commit stays in place).
  private moveAfterCommit(dir: "up" | "down" | "left" | "right") {
    if (!this.params.core.options.moveAfterEdit) return;
    this.params.core.dispatch({ type: "navigate", dir });
  }

  private commit() {
    if (!this.editingCell || !this.editor) return;
    const cell = this.editingCell;
    const value = this.editor.getValue();
    const parsed = this.editor.isParsed?.() ?? false;
    this.params.core.dispatch({ type: "editCommit", cell, value, parsed });
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
    const cells = section === "left" ? slot.leftCellEls
      : section === "right" ? slot.rightCellEls
        : slot.cellEls;
    return cells?.[localIndex] ?? null;
  }
}

function stopPropagation(e: Event) {
  e.stopPropagation();
}
