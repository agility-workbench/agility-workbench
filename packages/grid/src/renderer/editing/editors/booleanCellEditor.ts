import { ICellEditor, ICellEditorParams } from "../cellEditor";

const WRAP_CLASS = "pte-cell-editor-boolean";

/** Coerce a stored value to a boolean (handles true/"true"/1/"1"/"yes"). */
function toBool(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
  }
  return false;
}

/**
 * Boolean editor: a checkbox. getValue() returns a boolean. isParsed = true. The checkbox is
 * wrapped so it can fill and center within the cell. Typing has no seed (charPress ignored).
 */
export class BooleanCellEditor implements ICellEditor {
  private wrap!: HTMLElement;
  private checkbox!: HTMLInputElement;

  init(params: ICellEditorParams): void {
    const wrap = document.createElement("span");
    wrap.className = WRAP_CLASS;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = toBool(params.value);
    wrap.appendChild(checkbox);
    this.wrap = wrap;
    this.checkbox = checkbox;
  }

  getGui(): HTMLElement {
    return this.wrap;
  }

  getValue(): unknown {
    return this.checkbox.checked;
  }

  isParsed(): boolean {
    return true;
  }

  focus(): void {
    this.checkbox.focus();
  }
}
