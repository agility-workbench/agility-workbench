import { CellRendererParams, ICellRenderer } from "../renderer/renderer";
import type { CellRef } from "../interfaces/selection";

/** The tri-state a boolean cell shows: checked, unchecked, or `null` for no value. */
type CheckState = boolean | null;

/**
 * Read a stored value as a checkbox state. Booleans map directly; blank (null, undefined, "") is
 * the indeterminate state. Other values are coerced the way the boolean editor reads them, so a
 * column holding "yes"/1 shows the same tick the editor would open with.
 */
function toCheckState(value: unknown): CheckState {
  if (typeof value === "boolean") return value;
  if (value == null || value === "") return null;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
  }
  return !!value;
}

/** Marks an editable box, so other gesture handlers can recognize it (see isBooleanToggleTarget). */
const TOGGLE_ATTR = "data-pte-boolean-toggle";

/**
 * Whether a pointer event target is inside an editable `BooleanCellRenderer` box, i.e. a click
 * there toggles the value. The selection renderer uses it so `editTrigger: "singleClick"` does not
 * open the boolean editor over the box the user just clicked.
 */
export function isBooleanToggleTarget(target: EventTarget | null): boolean {
  return !!(target as Element | null)?.closest?.(`[${TOGGLE_ATTR}]`);
}

/**
 * The built-in checkbox renderer, and the default for `ColumnType.BOOLEAN` columns that set no
 * `cellRenderer` of their own (`cellRenderer: "text"` keeps the formatted text instead).
 *
 * `true` is a ticked box, `false` an empty one and a blank value (`null`/`undefined`) the
 * indeterminate dash the header's select-all checkbox uses. When the cell is editable (the column's
 * `editable`, the row's `editable` presentation, `pinnedRowsEditable` on pinned rows, and an
 * `editTrigger` other than `"none"`), a plain primary click on the box writes the opposite boolean
 * through `api.setCellValue`, so `onBeforeCellCommit`, `cellValueChanged`, undo and no-op
 * suppression all apply; a blank value toggles to `true`. The box never opens the boolean editor,
 * not even with `editTrigger: "singleClick"` — Enter/F2 (and the edit trigger on the rest of the
 * cell) still do. Otherwise the box is read-only.
 *
 * The box carries `role="checkbox"`, `aria-checked` (`"mixed"` when blank) and an `aria-label`:
 * the column's formatted value when a `valueFormatter` turns it into words ("Yes"/"No"), else the
 * column's label. Group rows show the group cell value as text, like a renderer-less column.
 */
export class BooleanCellRenderer implements ICellRenderer {
  private eGui!: HTMLSpanElement;
  private box!: HTMLSpanElement;
  private params: CellRendererParams | null = null;
  private state: CheckState = null;
  private editable = false;

  init(params: CellRendererParams): void {
    this.eGui = document.createElement("span");
    this.eGui.className = "pte-cell-boolean";
    this.box = document.createElement("span");
    this.box.className = "pte-checkbox pte-cell-boolean-box";
    this.box.setAttribute("role", "checkbox");
    this.box.addEventListener("click", this.onClick);
    this.box.addEventListener("dblclick", this.onDoubleClick);
    this.paint(params);
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  refresh(params: CellRendererParams): boolean {
    this.paint(params);
    return true;
  }

  destroy(): void {
    this.box?.removeEventListener("click", this.onClick);
    this.box?.removeEventListener("dblclick", this.onDoubleClick);
    this.params = null;
  }

  private paint(p: CellRendererParams) {
    this.params = p;
    const text = p.valueFormatted ?? (p.value == null ? "" : String(p.value));
    // A group row's value is an aggregate or a groupValueGetter result, not a row's flag: show it
    // as text, the same as a column without a renderer would.
    if (p.isGroup) {
      this.box.remove();
      this.box.removeAttribute(TOGGLE_ATTR);
      this.eGui.textContent = text;
      this.editable = false;
      return;
    }
    if (this.box.parentNode !== this.eGui) this.eGui.replaceChildren(this.box);

    const state = toCheckState(p.value);
    this.state = state;
    this.editable = this.isEditable(p);
    const box = this.box;
    box.classList.toggle("pte-checkbox-checked", state === true);
    box.classList.toggle("pte-checkbox-indeterminate", state === null);
    box.classList.toggle("pte-cell-boolean-readonly", !this.editable);
    box.setAttribute("aria-checked", state === null ? "mixed" : String(state));
    if (this.editable) {
      box.removeAttribute("aria-readonly");
      box.setAttribute(TOGGLE_ATTR, "");
    } else {
      box.setAttribute("aria-readonly", "true");
      box.removeAttribute(TOGGLE_ATTR);
    }
    // The formatted value names the state only when a formatter put it into words; the default
    // "true"/"false" would just repeat aria-checked, so the column label names the box instead.
    const worded = text !== "" && text !== String(p.value);
    box.setAttribute("aria-label", worded ? text : (p.colDef?.label ?? ""));
  }

  // Mirrors the core's editor-entry rule (column + row-presentation editability, the pinned-rows
  // gate) plus the edit trigger: `editTrigger: "none"` means the UI never edits, so neither does
  // the box. Direct API writes bypass editability, so this check is what keeps the click honest.
  private isEditable(p: CellRendererParams): boolean {
    const node = p.node;
    if (!node || node.isGroup || !p.colDef?.isCellEditable(node, p.rowPresentation)) return false;
    const options = p.api?.getCore?.().getOptions?.();
    if (options?.editTrigger === "none") return false;
    if (node.rowPinned && !options?.pinnedRowsEditable) return false;
    return true;
  }

  private onClick = (e: MouseEvent) => {
    const p = this.params;
    // Modified clicks belong to selection (Shift extends a range, Ctrl/Cmd adds to it).
    if (!p || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    // Re-read editability: row presentation can change without the cell repainting.
    if (p.isGroup || !this.isEditable(p)) return;
    const cell: CellRef = {
      rowId: p.rowId,
      colId: p.colDef.colId,
      colInstanceId: p.colDef.instanceID,
      ...(p.node?.rowPinned ? { rowPinned: p.node.rowPinned } : {}),
    };
    p.api.setCellValue(cell, this.state !== true);
  };

  // Two quick clicks on an editable box are two toggles, not a request to open the editor over it.
  // Only the box swallows the gesture; a double-click elsewhere in the cell is unchanged.
  private onDoubleClick = (e: MouseEvent) => {
    if (this.editable) e.stopPropagation();
  };
}
