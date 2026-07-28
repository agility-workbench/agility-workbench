export class BodyRowHoverRenderer {
  private handleMouseOver = (e: MouseEvent) => {
    this.body.querySelectorAll(".pte-row-hover").forEach(r => r.classList.remove("pte-row-hover"));
    const row = (e.target as HTMLElement)?.closest(".pte-row");
    if (!row) return;
    this.body.querySelectorAll(`.pte-row[row-id="${row.getAttribute("row-id")}"]`).forEach(r => {
      r.classList.add("pte-row-hover");
    });
  };

  constructor(private body: HTMLDivElement) { }

  bind() {
    document.addEventListener("mouseover", this.handleMouseOver);
  }

  destroy() {
    document.removeEventListener("mouseover", this.handleMouseOver);
    this.body.querySelectorAll(".pte-row-hover").forEach(r => r.classList.remove("pte-row-hover"));
  }
}
