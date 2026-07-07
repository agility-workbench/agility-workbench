import { ICellEditor, ICellEditorParams } from "../cellEditor";

const INPUT_CLASS = "pte-cell-editor-input";

/**
 * Numeric editor: <input type="number">. getValue() returns a number, or null when the field is
 * blank / not a valid number. isParsed = true, so the value is stored directly.
 *
 * editorParams: { min?, max?, step? }
 */
export class NumberCellEditor implements ICellEditor {
  private input!: HTMLInputElement;

  init(params: ICellEditorParams): void {
    const input = document.createElement("input");
    input.type = "number";
    input.className = INPUT_CLASS;
    const p = params.editorParams ?? {};
    if (p.min != null) input.min = String(p.min);
    if (p.max != null) input.max = String(p.max);
    if (p.step != null) input.step = String(p.step);
    const seed = params.charPress ?? (params.value == null ? "" : String(params.value));
    input.value = seed;
    this.input = input;
  }

  getGui(): HTMLElement {
    return this.input;
  }

  getValue(): unknown {
    const raw = this.input.value.trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }

  isParsed(): boolean {
    return true;
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }
}
