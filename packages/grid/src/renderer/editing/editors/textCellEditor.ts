import { ICellEditor, ICellEditorParams } from "../cellEditor";

const INPUT_CLASS = "pte-cell-editor-input";

/**
 * Default text editor: a single-line <input>. Returns the raw string, so the column's valueParser
 * still runs on commit (isParsed = false).
 */
export class TextCellEditor implements ICellEditor {
  private input!: HTMLInputElement;
  // Edit-on-typing: seeded from a keystroke → caret at end so the next key appends. Otherwise
  // select-all so a first keystroke replaces the existing value (spreadsheet behavior).
  private charSeeded = false;

  init(params: ICellEditorParams): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = INPUT_CLASS;
    this.charSeeded = params.charPress != null;
    input.value = this.charSeeded ? params.charPress! : (params.value == null ? "" : String(params.value));
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
    if (this.charSeeded) {
      const end = this.input.value.length;
      this.input.setSelectionRange(end, end);
    } else {
      this.input.select();
    }
  }
}
