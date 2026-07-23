/**
 * Highlights every body cell in the column under the pointer (adds `.pte-col-hover`). Opt-in via
 * the `columnHover` grid option — `bind()` is only wired when enabled, so this is inert otherwise.
 * Mirrors {@link BodyRowHoverRenderer}, but keys off the cell's `data-col-idx` instead of row id.
 */
export class BodyColumnHoverRenderer {
  private handleMouseOver = (e: MouseEvent) => {
    this.body.querySelectorAll(".pte-col-hover").forEach(c => c.classList.remove("pte-col-hover"));
    const cell = (e.target as HTMLElement)?.closest(".pte-cell") as HTMLElement | null;
    const colIdx = cell?.dataset.colIdx;
    if (colIdx == null) return;
    this.body.querySelectorAll(`.pte-cell[data-col-idx="${colIdx}"]`).forEach(c => {
      c.classList.add("pte-col-hover");
    });
  };

  constructor(private body: HTMLDivElement) { }

  bind() {
    document.addEventListener("mouseover", this.handleMouseOver);
  }

  destroy() {
    document.removeEventListener("mouseover", this.handleMouseOver);
  }
}
