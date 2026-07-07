import { ICellEditor, ICellEditorParams } from "../cellEditor";

const INPUT_CLASS = "pte-cell-editor-input";

/** Coerce a stored cell value (Date | string | number) to the yyyy-mm-dd string an <input type=date> wants. */
function toDateInputValue(value: any): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const s = String(value);
  // Already an ISO-ish date? take the yyyy-mm-dd prefix if valid.
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/**
 * Date editor: <input type="date">. getValue() returns the ISO yyyy-mm-dd string, or null when
 * blank. isParsed = true.
 *
 * editorParams: { min?, max? } (yyyy-mm-dd strings)
 */
export class DateCellEditor implements ICellEditor {
  private input!: HTMLInputElement;

  init(params: ICellEditorParams): void {
    const input = document.createElement("input");
    input.type = "date";
    input.className = INPUT_CLASS;
    const p = params.editorParams ?? {};
    if (p.min != null) input.min = String(p.min);
    if (p.max != null) input.max = String(p.max);
    input.value = toDateInputValue(params.value);
    this.input = input;
  }

  getGui(): HTMLElement {
    return this.input;
  }

  getValue(): unknown {
    const v = this.input.value;
    return v === "" ? null : v;
  }

  isParsed(): boolean {
    return true;
  }

  focus(): void {
    this.input.focus();
  }
}
