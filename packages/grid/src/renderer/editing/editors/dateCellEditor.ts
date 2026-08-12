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

// Read a parsed (stored-form) value as a local calendar date. ISO yyyy-mm-dd strings are built
// from their parts — new Date("yyyy-mm-dd") means UTC midnight, which is yesterday in negative
// offsets — everything else goes through the Date constructor.
function toLocalDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function isoFromLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Date editor. Two modes, decided by whether the column has a valueParser:
 *  - Without one (default): the native <input type="date"> calendar. getValue() returns the ISO
 *    yyyy-mm-dd string, or null when blank, and isParsed = true (stored directly). editorParams
 *    `min`/`max` (yyyy-mm-dd strings) map onto the input's own bounds.
 *  - With one: typed-format entry — a text input seeded from the column's formatted display value
 *    (you edit what the cell displays, e.g. "12/25/2026"), and getValue() returns the raw string
 *    with isParsed = false so the commit path round-trips it through the parser (blank included —
 *    the parser decides what empty means). ArrowUp/ArrowDown step the date by `editorParams.step`
 *    days (default 1) when the current text parses to a date: parse → ±step days → format. The
 *    stepped value keeps the parsed value's stored shape (Date → Date, number → epoch ms,
 *    string → ISO yyyy-mm-dd). min/max are ignored in this mode — validation belongs to the parser.
 *
 * editorParams: { min?, max?, step? }
 */
export class DateCellEditor implements ICellEditor {
  private input!: HTMLInputElement;
  private params!: ICellEditorParams;
  private charSeeded = false;

  init(params: ICellEditorParams): void {
    this.params = params;
    const input = document.createElement("input");
    input.className = INPUT_CLASS;
    if (this.hasParser()) {
      input.type = "text";
      this.charSeeded = params.charPress != null;
      input.value = this.charSeeded ? params.charPress! : this.seedText();
      input.addEventListener("keydown", this.onKeyDown);
    } else {
      input.type = "date";
      const p = params.editorParams ?? {};
      if (p.min != null) input.min = String(p.min);
      if (p.max != null) input.max = String(p.max);
      input.value = toDateInputValue(params.value);
    }
    this.input = input;
  }

  getGui(): HTMLElement {
    return this.input;
  }

  getValue(): unknown {
    if (this.hasParser()) return this.input.value;
    const v = this.input.value;
    return v === "" ? null : v;
  }

  isParsed(): boolean {
    return !this.hasParser();
  }

  focus(): void {
    this.input.focus();
    if (!this.hasParser()) return;
    if (this.charSeeded) {
      // Caret at the end so the next keystroke appends to the seeding character.
      const end = this.input.value.length;
      this.input.setSelectionRange(end, end);
    } else {
      this.input.select();
    }
  }

  private hasParser(): boolean {
    return this.params.col.valueParser != null;
  }

  private seedText(): string {
    const { value, col, row } = this.params;
    if (value == null) return "";
    // Edit what the cell displays — the formatter/parser pair owns the round-trip.
    return col.formatValue(value, row);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    this.stepBy(e.key === "ArrowUp" ? 1 : -1);
  };

  private stepBy(dir: 1 | -1): void {
    const { col, row, value } = this.params;
    const p = this.params.editorParams ?? {};
    const step = Number(p.step) > 0 ? Math.trunc(Number(p.step)) : 1;
    // Blank steps from the cell's original value, else today (the native input's arrow-from-empty
    // behavior); non-blank text must parse to a date — don't guess a date to step from.
    const blank = this.input.value.trim() === "";
    const parsed = blank ? value : col.parseValue(this.input.value, row, value);
    const d = toLocalDate(parsed) ?? (blank ? new Date() : null);
    if (!d) return;
    d.setDate(d.getDate() + dir * step);
    const restored = parsed instanceof Date ? d
      : typeof parsed === "number" ? d.getTime()
        : isoFromLocal(d);
    this.input.value = col.formatValue(restored, row);
  }
}
