import type { CellRendererParams, ICellRenderer } from "../renderer/renderer";
import { localeTextFromApi } from "../interfaces/locale";
import {
  INTERACTIVE_ATTR, isBlankValue, isRendererCellEditable, ownParams, rendererCellRef, rendererText,
} from "./interactiveTarget";

/** `cellRendererParams` for `RatingCellRenderer` (`cellRenderer: "rating"`). */
export interface RatingCellRendererParams {
  /** How many stars the scale has. Default 5. */
  max?: number;
  /**
   * On an editable cell, clicking the star that is already the value clears the rating to 0.
   * Default `false` (the click writes nothing).
   */
  allowClear?: boolean;
}

const DEFAULT_MAX = 5;
const STAR_ATTR = "data-pte-rating-star";

type StarFill = "full" | "half" | "empty";

/**
 * Built-in rating renderer (`cellRenderer: "rating"`): `max` stars (default 5) filled to the value,
 * with a half star for a fraction (x.25 up to x.75; above rounds up). A blank value shows empty
 * stars; values clamp to 0..max. The stars are one `role="img"` element labelled "3 of 5".
 *
 * Read-only unless the cell is editable (the column's `editable`, the row's `editable`
 * presentation, `pinnedRowsEditable` on pinned rows, and an `editTrigger` other than `"none"`, the
 * same rule as `BooleanCellRenderer`). Then a plain primary click on star N writes N through
 * `api.setCellValue`, so `onBeforeCellCommit`, `cellValueChanged`, undo and no-op suppression all
 * apply; clicking the star that is already the value clears to 0 only with `allowClear: true`. The
 * click never opens the editor, not even with `editTrigger: "singleClick"`; Enter/F2 still open the
 * column's editor (the number editor on a `ColumnType.NUMBER` column). Group rows show the group
 * cell value as text.
 */
export class RatingCellRenderer implements ICellRenderer {
  private eGui!: HTMLSpanElement;
  private stars: HTMLSpanElement[] = [];
  private params: CellRendererParams | null = null;
  private editable = false;
  private value = 0;

  init(params: CellRendererParams): void {
    this.eGui = document.createElement("span");
    this.eGui.className = "pte-cell-rating";
    this.eGui.addEventListener("click", this.onClick);
    this.eGui.addEventListener("dblclick", this.onDoubleClick);
    this.paint(params);
  }

  getGui(): HTMLElement {
    return this.eGui;
  }

  refresh(params: CellRendererParams): boolean {
    this.paint(params);
    return true;
  }

  destroy(): void {
    this.eGui?.removeEventListener("click", this.onClick);
    this.eGui?.removeEventListener("dblclick", this.onDoubleClick);
    this.params = null;
  }

  private paint(p: CellRendererParams) {
    this.params = p;
    const root = this.eGui;
    if (p.isGroup) {
      this.stars = [];
      this.editable = false;
      root.removeAttribute("role");
      root.removeAttribute("aria-label");
      root.removeAttribute(INTERACTIVE_ATTR);
      root.classList.remove("pte-cell-rating-editable");
      root.textContent = rendererText(p);
      return;
    }
    const own = ownParams<RatingCellRendererParams>(p);
    const max = typeof own.max === "number" && own.max >= 1 ? Math.floor(own.max) : DEFAULT_MAX;
    const num = isBlankValue(p.value) ? NaN : Number(p.value);
    const value = Number.isFinite(num) ? Math.min(max, Math.max(0, num)) : 0;
    this.value = value;
    this.editable = isRendererCellEditable(p);

    if (this.stars.length !== max || this.stars.some(s => s.parentNode !== root)) {
      this.stars = Array.from({ length: max }, (_, i) => {
        const star = document.createElement("span");
        star.className = "pte-cell-rating-star";
        star.setAttribute(STAR_ATTR, String(i + 1));
        return star;
      });
      root.replaceChildren(...this.stars);
    }
    const full = Math.floor(value);
    const rest = value - full;
    const roundUp = rest >= 0.75;
    const half = rest >= 0.25 && !roundUp;
    this.stars.forEach((star, i) => {
      const fill: StarFill = i < full || (i === full && roundUp) ? "full" : i === full && half ? "half" : "empty";
      star.classList.toggle("pte-cell-rating-star-full", fill === "full");
      star.classList.toggle("pte-cell-rating-star-half", fill === "half");
    });

    root.setAttribute("role", "img");
    // Blank reads as 0: the stars a sighted user sees are all empty too.
    root.setAttribute("aria-label", localeTextFromApi(p.api)("ratingValue", { value: Number(value.toFixed(2)), max }));
    root.classList.toggle("pte-cell-rating-editable", this.editable);
    if (this.editable) root.setAttribute(INTERACTIVE_ATTR, "");
    else root.removeAttribute(INTERACTIVE_ATTR);
  }

  private onClick = (e: MouseEvent) => {
    const p = this.params;
    // Modified clicks belong to selection (Shift extends a range, Ctrl/Cmd adds to it).
    if (!p || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const star = (e.target as Element | null)?.closest?.(`[${STAR_ATTR}]`);
    if (!star || !this.eGui.contains(star)) return;
    // Re-read editability: row presentation can change without the cell repainting.
    if (p.isGroup || !isRendererCellEditable(p)) return;
    const n = Number(star.getAttribute(STAR_ATTR));
    let next = n;
    if (n === this.value) {
      if (!ownParams<RatingCellRendererParams>(p).allowClear) return;
      next = 0;
    }
    p.api.setCellValue(rendererCellRef(p), next);
  };

  // Two quick clicks on editable stars are two ratings, not a request to open the editor over them.
  private onDoubleClick = (e: MouseEvent) => {
    if (this.editable) e.stopPropagation();
  };
}
