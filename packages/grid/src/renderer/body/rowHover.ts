import { isCompatMouseEvent } from "../interaction/touchGestures";

export class BodyRowHoverRenderer {
  private handleMouseOver = (e: MouseEvent) => {
    this.root.querySelectorAll(".pte-row-hover").forEach(r => r.classList.remove("pte-row-hover"));
    // The mouseover a tap leaves behind: there is no pointer resting on the row, so a highlight
    // would stick until the next tap elsewhere.
    if (isCompatMouseEvent(e)) return;
    const row = (e.target as HTMLElement)?.closest(".pte-row");
    if (!row || !this.root.contains(row)) return;
    const rowId = row.getAttribute("row-id") ?? row.getAttribute("data-row-id");
    if (rowId == null) return;
    this.root.querySelectorAll(".pte-row").forEach(candidate => {
      const candidateId = candidate.getAttribute("row-id")
        ?? candidate.getAttribute("data-row-id");
      if (candidateId === rowId) candidate.classList.add("pte-row-hover");
    });
  };

  constructor(private root: HTMLDivElement) { }

  bind() {
    document.addEventListener("mouseover", this.handleMouseOver);
  }

  destroy() {
    document.removeEventListener("mouseover", this.handleMouseOver);
    this.root.querySelectorAll(".pte-row-hover").forEach(r => r.classList.remove("pte-row-hover"));
  }
}
