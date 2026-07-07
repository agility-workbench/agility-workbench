import { Column } from "../../column/column";
import { GridCore } from "../../core/core";
import { CellRef } from "../../interfaces/selection";
import { GridEventEditingChangedParams } from "../../events/events";
import { RowPoolDef } from "../types";

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
}

const EDITING_CELL_CLASS = "pte-cell-editing";
const EDITOR_INPUT_CLASS = "pte-cell-editor-input";

/**
 * Owns the inline cell editor DOM. Holds NO editing state — the core owns which cell is editing;
 * this renderer reacts to `editingChanged` events by mounting/tearing down a text <input> over the
 * active cell and translates the editor's own keys (Enter/Tab/Escape) and blur back into
 * editCommit / editCancel actions dispatched to the core.
 */
export class CellEditRenderer {
  private input: HTMLInputElement | null = null;
  private cellEl: HTMLDivElement | null = null;
  private editingCell: CellRef | null = null;
  // Guards against the teardown-triggered blur re-dispatching a commit/cancel.
  private tearingDown = false;

  constructor(private params: CellEditRendererParams) { }

  isEditing(): boolean {
    return this.editingCell != null;
  }

  onEditingChanged(params: GridEventEditingChangedParams) {
    if (params.state === "started") {
      if (params.cell) this.mount(params.cell);
      return;
    }
    // committed / cancelled / stopped — tear the editor down.
    this.teardown();
  }

  private mount(cell: CellRef) {
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

    const rawValue = col.getValue(row);
    const input = document.createElement("input");
    input.type = "text";
    input.className = EDITOR_INPUT_CLASS;
    input.value = rawValue == null ? "" : String(rawValue);

    input.addEventListener("keydown", this.onInputKeyDown);
    input.addEventListener("blur", this.onInputBlur);
    input.addEventListener("mousedown", stopPropagation);
    input.addEventListener("dblclick", stopPropagation);

    cellEl.classList.add(EDITING_CELL_CLASS);
    cellEl.replaceChildren(input);

    this.input = input;
    this.cellEl = cellEl;
    this.editingCell = cell;

    input.focus();
    input.select();
  }

  private teardown() {
    if (!this.editingCell) return;
    this.tearingDown = true;

    const cell = this.editingCell;
    if (this.input) {
      this.input.removeEventListener("keydown", this.onInputKeyDown);
      this.input.removeEventListener("blur", this.onInputBlur);
      this.input.removeEventListener("mousedown", stopPropagation);
      this.input.removeEventListener("dblclick", stopPropagation);
    }
    this.cellEl?.classList.remove(EDITING_CELL_CLASS);

    // If the input still holds focus (keyboard commit/cancel), hand focus back to the grid root so
    // its keydown handler keeps receiving arrow keys. If focus already moved elsewhere (the user
    // clicked another element, causing a blur-commit), leave it alone.
    const returnFocus = this.input != null && document.activeElement === this.input;

    this.input = null;
    this.cellEl = null;
    this.editingCell = null;

    // Restore the cell's rendered content (for cancel, and to strip the input on commit).
    this.params.repaintCell(cell.rowId, cell.colId);
    if (returnFocus) this.params.root.focus();
    this.tearingDown = false;
  }

  private onInputKeyDown = (e: KeyboardEvent) => {
    // Keep the editor's keys away from the grid's navigation handler.
    e.stopPropagation();
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        this.commit();
        break;
      case "Tab":
        e.preventDefault();
        this.commit();
        break;
      case "Escape":
        e.preventDefault();
        this.cancel();
        break;
    }
  };

  private onInputBlur = () => {
    // Ignore the blur we cause ourselves while tearing down.
    if (this.tearingDown) return;
    this.commit();
  };

  private commit() {
    if (!this.editingCell || !this.input) return;
    const cell = this.editingCell;
    const value = this.input.value;
    this.params.core.dispatch({ type: "editCommit", cell, value });
  }

  private cancel() {
    if (!this.editingCell) return;
    this.params.core.dispatch({ type: "editCancel", cell: this.editingCell });
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
