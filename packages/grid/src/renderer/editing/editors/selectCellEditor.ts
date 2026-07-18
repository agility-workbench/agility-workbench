import { ICellEditor, ICellEditorParams, SelectCellEditorParams, SelectEditorOption } from "../cellEditor";

const SELECT_CLASS = "pte-cell-editor-select";

function normalizeOption(opt: SelectEditorOption): { value: any; label: string } {
  if (opt != null && typeof opt === "object" && "value" in opt) {
    return { value: opt.value, label: opt.label ?? String(opt.value) };
  }
  return { value: opt, label: String(opt) };
}

/**
 * Dropdown editor: a native <select>. Options come from cellEditorParams.values, which may be a
 * static array, "fromRows" (distinct column values), or an async loader. getValue() returns the
 * selected raw value. isParsed = true.
 *
 * While async/fromRows values load, the select shows a disabled "Loading…" option and is repopulated
 * (preserving the current value) once they arrive. The load is aborted on destroy.
 */
export class SelectCellEditor implements ICellEditor {
  private select!: HTMLSelectElement;
  private currentValue: any;
  private options: { value: any; label: string }[] = [];
  private abort = new AbortController();

  init(params: ICellEditorParams): void {
    this.currentValue = params.value;
    const select = document.createElement("select");
    select.className = SELECT_CLASS;
    this.select = select;

    const source = (params.editorParams as SelectCellEditorParams | undefined)?.values;

    if (Array.isArray(source)) {
      this.setOptions(source);
    } else if (source === "fromRows") {
      this.setOptions(params.getDistinctColumnValues());
    } else if (typeof source === "function") {
      this.renderLoading();
      const done = (values: SelectEditorOption[]) => {
        if (this.abort.signal.aborted) return;
        this.setOptions(values);
      };
      const fail = (err: any) => {
        if (this.abort.signal.aborted) return;
        console.error("Failed to load select editor values", err);
        this.setOptions([]);
      };
      try {
        const ret = source({ col: params.col, row: params.row, signal: this.abort.signal, success: done, error: fail });
        if (ret && typeof (ret as Promise<void>).catch === "function") {
          (ret as Promise<void>).catch(fail);
        }
      } catch (err) {
        fail(err);
      }
    } else {
      // No source configured — fall back to distinct column values so the editor is still usable.
      this.setOptions(params.getDistinctColumnValues());
    }
  }

  private renderLoading(): void {
    this.select.replaceChildren();
    const opt = document.createElement("option");
    opt.textContent = "Loading…";
    opt.disabled = true;
    opt.selected = true;
    this.select.appendChild(opt);
    this.select.disabled = true;
  }

  private setOptions(raw: SelectEditorOption[]): void {
    this.options = raw.map(normalizeOption);
    // Ensure the current value is selectable even if it's not in the provided set.
    if (this.currentValue != null && !this.options.some(o => o.value === this.currentValue)) {
      this.options.unshift({ value: this.currentValue, label: String(this.currentValue) });
    }

    this.select.disabled = false;
    this.select.replaceChildren();
    for (let i = 0; i < this.options.length; i++) {
      const o = this.options[i];
      const el = document.createElement("option");
      el.value = String(i); // index-based so non-string values round-trip exactly
      el.textContent = o.label;
      if (o.value === this.currentValue) el.selected = true;
      this.select.appendChild(el);
    }
  }

  getGui(): HTMLElement {
    return this.select;
  }

  getValue(): unknown {
    const idx = Number(this.select.value);
    const opt = this.options[idx];
    return opt ? opt.value : this.currentValue;
  }

  isParsed(): boolean {
    return true;
  }

  focus(): void {
    this.select.focus();
  }

  destroy(): void {
    this.abort.abort();
  }
}
