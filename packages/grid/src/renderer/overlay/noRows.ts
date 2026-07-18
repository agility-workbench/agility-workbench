// Empty-state overlay shown when the view has zero rows (no data, or every row filtered out).
// Distinct from the loading spinner: the loading overlay covers "we're fetching", this covers
// "there is nothing to show". The two are mutually exclusive — loading suppresses this one.
export function createNoRowsOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "pte-norows-overlay hidden";

  const label = document.createElement("div");
  label.className = "pte-norows-label";
  label.textContent = "No rows to show";

  overlay.appendChild(label);
  return overlay;
}

export class NoRowsOverlayRenderer {
  private isEmpty = false;
  private overlay: HTMLDivElement;
  private label: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.overlay = createNoRowsOverlay();
    this.label = this.overlay.querySelector(".pte-norows-label") as HTMLDivElement;
    root.appendChild(this.overlay);
  }

  setEmpty(isEmpty: boolean) {
    this.isEmpty = isEmpty;
    this.update();
  }

  getEmpty() {
    return this.isEmpty;
  }

  // Override the displayed message (e.g. "No rows match "acme"").
  setMessage(message: string) {
    this.label.textContent = message;
  }

  private update() {
    this.overlay.classList.toggle("hidden", !this.isEmpty);
  }
}
