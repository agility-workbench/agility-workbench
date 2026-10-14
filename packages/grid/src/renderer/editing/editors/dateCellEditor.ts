import { canonicalKey, matchesAnyChord } from "../../interaction/keyChord";
import { isoFromLocal, toLocalDate } from "../../../column/parsers";
import { ICellEditor, ICellEditorParams } from "../cellEditor";

const INPUT_CLASS = "pte-cell-editor-input";

/**
 * Coerce a stored cell value (Date | epoch number | date text) to the yyyy-mm-dd an
 * <input type=date> wants: the LOCAL calendar date, the one the cell displays. (`toISOString` is
 * UTC — a local-midnight Date would show the day before east of Greenwich.)
 */
function toDateInputValue(value: unknown): string {
  if (value == null || value === "") return "";
  const d = toLocalDate(value);
  return d ? isoFromLocal(d) : "";
}

/**
 * Date editor. Two modes, decided by whether the column has a valueParser:
 *  - Without one (default): the native <input type="date"> calendar, seeded with the cell's local
 *    calendar date. getValue() returns the input's yyyy-mm-dd text ("" when blank) with
 *    isParsed = false, so the commit runs it through the column's built-in parse-by-type, which
 *    keeps the stored shape: a Date column stays Date-valued, an epoch column numeric, an ISO-text
 *    column text (blank commits null). editorParams `min`/`max` (yyyy-mm-dd strings) map onto the
 *    input's own bounds. A type-to-edit keystroke opens the calendar on the cell's date: a native
 *    date input cannot hold a partial date.
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
    return this.input.value;
  }

  // Never pre-parsed: in both modes the column parses the text — its valueParser in typed mode,
  // the built-in date parser (which preserves the stored shape) in native mode.
  isParsed(): boolean {
    return false;
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

  // Bare arrows only — see the same handler in numberCellEditor.
  private onKeyDown = (e: KeyboardEvent) => {
    if (!matchesAnyChord(e, ["arrowup", "arrowdown"])) return;
    e.preventDefault();
    this.stepBy(canonicalKey(e) === "arrowup" ? 1 : -1);
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
