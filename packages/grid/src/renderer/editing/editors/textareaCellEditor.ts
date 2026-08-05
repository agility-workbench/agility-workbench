import { ICellEditor, ICellEditorParams } from "../cellEditor";

const TEXTAREA_CLASS = "pte-cell-editor-textarea";

/**
 * Multi-line text editor: a <textarea>. Enter inserts a newline (Shift+Enter still commits via the
 * renderer's key handling is not used here — see CellEditRenderer, which treats textarea specially).
 * Returns a raw string, so the column's valueParser runs on commit (isParsed = false).
 */
export class TextareaCellEditor implements ICellEditor {
  private textarea!: HTMLTextAreaElement;
  private charSeeded = false;

  init(params: ICellEditorParams): void {
    const ta = document.createElement("textarea");
    ta.className = TEXTAREA_CLASS;
    const rows = params.editorParams?.rows;
    if (typeof rows === "number") ta.rows = rows;
    this.charSeeded = params.charPress != null;
    ta.value = this.charSeeded ? params.charPress! : (params.value == null ? "" : String(params.value));
    this.textarea = ta;
  }

  getGui(): HTMLElement {
    return this.textarea;
  }

  getValue(): unknown {
    return this.textarea.value;
  }

  isParsed(): boolean {
    return false;
  }

  focus(): void {
    this.textarea.focus();
    if (this.charSeeded) {
      const end = this.textarea.value.length;
      this.textarea.setSelectionRange(end, end);
    } else {
      this.textarea.select();
    }
  }
}
