import type { CellRendererParams, ICellRenderer } from "../renderer/renderer";
import { isBlankValue, ownParams, rendererText } from "./interactiveTarget";

/** What `ProgressCellRendererParams.color` / `className` callbacks receive. */
export interface ProgressCellRendererCallbackParams extends CellRendererParams {
  /** The bar's fill as a fraction 0–1 after clamping, or `null` for a blank value. */
  fraction: number | null;
}

/** `cellRendererParams` for `ProgressCellRenderer` (`cellRenderer: "progress"`). */
export interface ProgressCellRendererParams {
  /**
   * The value that fills the bar. Without it the value is read as a fraction 0–1 (0.42 = 42%); with
   * it the bar shows `value / max` (`max: 100` for percentages).
   */
  max?: number;
  /** Print the formatted value beside the bar. Default `false`. */
  showValue?: boolean;
  /** Extra class(es) on the renderer's root, static or per cell (thresholds, states). */
  className?: string | ((params: ProgressCellRendererCallbackParams) => string | null | undefined);
  /** The bar's colour for this cell (any CSS colour); return nothing to keep the theme colour. */
  color?: (params: ProgressCellRendererCallbackParams) => string | null | undefined;
}

/**
 * Built-in progress renderer (`cellRenderer: "progress"`): a track with a bar filled to the value,
 * read as a fraction 0–1, or as `value / max` when `max` is given. Values outside the range clamp;
 * a blank or non-numeric value shows an empty track. `showValue: true` prints the formatted value
 * beside the bar. The colours come from `--pte-progress-track-color` / `--pte-progress-bar-color`,
 * and `color` / `className` callbacks colour individual cells (e.g. by threshold).
 *
 * The bar carries `role="progressbar"` with `aria-valuemin` 0, `aria-valuemax` (`max`, else 1),
 * `aria-valuenow` (omitted when blank), `aria-valuetext` (the formatted value) and an `aria-label`
 * from the column label. Group rows show the group cell value as text.
 */
export class ProgressCellRenderer implements ICellRenderer {
  private eGui!: HTMLSpanElement;
  private track!: HTMLSpanElement;
  private bar!: HTMLSpanElement;
  private label!: HTMLSpanElement;
  private extraClasses: string[] = [];

  init(params: CellRendererParams): void {
    this.eGui = document.createElement("span");
    this.eGui.className = "pte-cell-progress";
    this.track = document.createElement("span");
    this.track.className = "pte-cell-progress-track";
    this.track.setAttribute("role", "progressbar");
    this.bar = document.createElement("span");
    this.bar.className = "pte-cell-progress-bar";
    this.track.appendChild(this.bar);
    this.label = document.createElement("span");
    this.label.className = "pte-cell-progress-value";
    this.paint(params);
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  refresh(params: CellRendererParams): boolean {
    this.paint(params);
    return true;
  }

  destroy(): void {}

  private paint(p: CellRendererParams) {
    this.setExtraClasses([]);
    if (p.isGroup) {
      this.eGui.textContent = rendererText(p);
      return;
    }
    const own = ownParams<ProgressCellRendererParams>(p);
    const max = typeof own.max === "number" && own.max > 0 ? own.max : 1;
    const num = isBlankValue(p.value) ? NaN : Number(p.value);
    const blank = !Number.isFinite(num);
    const now = blank ? null : Math.min(max, Math.max(0, num));
    const fraction = now == null ? null : now / max;
    const text = rendererText(p);

    const track = this.track;
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(max));
    if (now == null) track.removeAttribute("aria-valuenow");
    else track.setAttribute("aria-valuenow", String(now));
    if (text !== "") track.setAttribute("aria-valuetext", text);
    else track.removeAttribute("aria-valuetext");
    track.setAttribute("aria-label", p.colDef?.label ?? "");
    this.bar.style.width = `${(fraction ?? 0) * 100}%`;

    const cbParams: ProgressCellRendererCallbackParams = { ...p, fraction };
    this.bar.style.backgroundColor = own.color?.(cbParams) ?? "";
    const cls = typeof own.className === "function" ? own.className(cbParams) : own.className;
    this.setExtraClasses(cls ? cls.split(/\s+/).filter(Boolean) : []);
    this.eGui.classList.toggle("pte-cell-progress-blank", blank);

    const children: Node[] = [track];
    if (own.showValue) {
      this.label.textContent = text;
      children.push(this.label);
    }
    const kids = this.eGui.childNodes;
    if (kids.length !== children.length || children.some((c, i) => kids[i] !== c)) {
      this.eGui.replaceChildren(...children);
    }
  }

  private setExtraClasses(next: string[]) {
    for (const c of this.extraClasses) if (!next.includes(c)) this.eGui.classList.remove(c);
    for (const c of next) this.eGui.classList.add(c);
    this.extraClasses = next;
  }
}
