import { REJECT } from "../../../interfaces/gridOptions";
import { canonicalKey, matchesAnyChord } from "../../interaction/keyChord";
import { ICellEditor, ICellEditorParams } from "../cellEditor";

const INPUT_CLASS = "pte-cell-editor-input";

/**
 * Numeric editor: a text input (inputmode="decimal") augmented with number-input behavior —
 * ArrowUp/ArrowDown step by `step`, clamped to min/max and quantized to the step's decimal
 * precision. Free text means any format the column's valueParser understands ("1,234.5", "45%",
 * "$50") can be typed, which type="number" physically rejects.
 *
 * Two commit modes, decided by whether the column has a valueParser:
 *  - Without one: getValue() reads the text with the column's built-in parser for its type
 *    (`Column.parseValue`, so `"1,234.5"`, `"12.5%"` in a percent column, `"12 kg"` in a unit
 *    column) — a number clamped to min/max, or null when blank — and isParsed = true, so the value
 *    is stored directly. Text the parser refuses (REJECT) is handed back raw with isParsed = false:
 *    the commit path parses it again, gets the same REJECT, and reports a rejected edit, keeping
 *    the cell's value — the outcome paste, fill and the API already have. The seed stays
 *    `String(value)`, which the parser reads back unchanged (a percent column's bare fraction, a
 *    unit column's bare number).
 *  - With one: the editor seeds from the column's formatted display value and getValue() returns
 *    the raw string with isParsed = false, so the commit path round-trips it through the parser
 *    (blank included — the parser decides what empty means). min/max then only bound arrow-key
 *    stepping, which goes parse → ±step → format; validation belongs to the parser.
 *
 * editorParams: { min?, max?, step? }
 */
export class NumberCellEditor implements ICellEditor {
  private input!: HTMLInputElement;
  private params!: ICellEditorParams;
  private charSeeded = false;
  // Set by getValue() when the built-in parser refused the text: isParsed() then hands the raw
  // text to the commit path, which owns reporting the rejection.
  private deferToCommit = false;

  init(params: ICellEditorParams): void {
    this.params = params;
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.className = INPUT_CLASS;
    this.charSeeded = params.charPress != null;
    input.value = this.charSeeded ? params.charPress! : this.seedText();
    input.addEventListener("keydown", this.onKeyDown);
    this.input = input;
  }

  getGui(): HTMLElement {
    return this.input;
  }

  getValue(): unknown {
    this.deferToCommit = false;
    if (this.hasParser()) return this.input.value;
    const raw = this.input.value.trim();
    if (raw === "") return null;
    const parsed = this.builtInNumeric(raw);
    if (parsed === REJECT) {
      this.deferToCommit = true;
      return this.input.value;
    }
    return parsed == null ? null : this.clamp(parsed);
  }

  isParsed(): boolean {
    return !this.hasParser() && !this.deferToCommit;
  }

  focus(): void {
    this.input.focus();
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
    // With a parser, edit what the cell displays — the formatter/parser pair owns the round-trip.
    return this.hasParser() ? col.formatValue(value, row) : String(value);
  }

  // Bare arrows only. A modified arrow has no stepping meaning here, so it keeps whatever the
  // browser gives it (Alt+Left/Right is history navigation) and stays free for a future
  // "step by a larger increment" chord.
  private onKeyDown = (e: KeyboardEvent) => {
    if (!matchesAnyChord(e, ["arrowup", "arrowdown"])) return;
    e.preventDefault();
    this.stepBy(canonicalKey(e) === "arrowup" ? 1 : -1);
  };

  private stepBy(dir: 1 | -1): void {
    const p = this.params.editorParams ?? {};
    const step = Number(p.step) > 0 ? Number(p.step) : 1;
    const blank = this.input.value.trim() === "";
    const base = blank ? 0 : this.currentNumeric();
    if (base == null) return; // unparseable text — don't guess a value to step from
    const next = this.clamp(quantize(base + dir * step, step, base));
    this.input.value = this.hasParser()
      ? this.params.col.formatValue(next, this.params.row)
      : String(next);
  }

  // The numeric reading of the current text, or null when it has none. With a parser, the text
  // is whatever format the parser understands, so ask it; step only when it yields a finite number.
  private currentNumeric(): number | null {
    if (this.hasParser()) {
      const parsed = this.params.col.parseValue(this.input.value, this.params.row, this.params.value);
      const n = typeof parsed === "number" ? parsed : Number(parsed);
      return Number.isFinite(n) ? n : null;
    }
    const parsed = this.builtInNumeric(this.input.value.trim());
    return typeof parsed === "number" ? parsed : null;
  }

  // The column's built-in reading of `text` (no valueParser): a finite number, null, or REJECT.
  // A column whose type does not parse to numbers (the editor set explicitly on a text column)
  // keeps the editor's original Number() reading, where invalid text is null.
  private builtInNumeric(text: string): number | null | typeof REJECT {
    const { col, row, value } = this.params;
    const parsed = col.parseValue(text, row, value);
    if (parsed === REJECT) return REJECT;
    if (parsed == null) return null;
    if (typeof parsed === "number") return Number.isFinite(parsed) ? parsed : REJECT;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  private clamp(n: number): number {
    const p = this.params.editorParams ?? {};
    const min = p.min != null ? Number(p.min) : null;
    const max = p.max != null ? Number(p.max) : null;
    if (min != null && Number.isFinite(min) && n < min) return min;
    if (max != null && Number.isFinite(max) && n > max) return max;
    return n;
  }
}

function decimalPlaces(n: number): number {
  const s = String(n);
  const dot = s.indexOf(".");
  return dot === -1 || s.includes("e") ? 0 : s.length - dot - 1;
}

// Rounds a stepped result to the precision of its inputs so 0.1-step accumulation never leaks
// float crumbs (0.1 + 0.2 → 0.30000000000000004) into the input.
function quantize(value: number, step: number, base: number): number {
  const dp = Math.min(12, Math.max(decimalPlaces(step), decimalPlaces(base)));
  return Number(value.toFixed(dp));
}
