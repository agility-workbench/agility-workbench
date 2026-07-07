import { ICellEditor, ICellEditorParams } from "../cellEditor";

const INPUT_CLASS = "pte-cell-editor-input";

/**
 * Default text editor: a single-line <input>. Returns the raw string, so the column's valueParser
 * still runs on commit (isParsed = false).
 */
export class TextCellEditor implements ICellEditor {
  private input!: HTMLInputElement;

  init(params: ICellEditorParams): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = INPUT_CLASS;
    const seed = params.charPress ?? (params.value == null ? "" : String(params.value));
    input.value = seed;
    this.input = input;
  }

  getGui(): HTMLElement {
    return this.input;
  }

  getValue(): unknown {
    return this.input.value;
  }

  isParsed(): boolean {
    return false;
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }
}
