export class FilterOverlayRenderer {
  readonly overlay: HTMLDivElement;
  private filterColID: string | null = null;

  private handleDocumentMouseDown = (e: MouseEvent) => {
    if (this.overlay.style.display === "none") return;
    const target = e.target as Node | null;
    if (!this.overlay.contains(target)) this.close();
  };

  private handleDocumentKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
  };

  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.className = "pte-filter";
    this.overlay.style.position = "fixed";
    this.overlay.style.zIndex = "10000";
    this.overlay.style.display = "none";
  }

  bind() {
    document.body.appendChild(this.overlay);
    document.addEventListener("mousedown", this.handleDocumentMouseDown);
    document.addEventListener("keydown", this.handleDocumentKeyDown);
  }

  close() {
    this.filterColID = null;
    this.overlay.style.display = "none";
  }

  destroy() {
    document.removeEventListener("mousedown", this.handleDocumentMouseDown);
    document.removeEventListener("keydown", this.handleDocumentKeyDown);
    this.overlay.remove();
  }
}
