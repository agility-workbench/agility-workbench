export function createLoadingOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "pte-loading-overlay hidden";

  const spinner = document.createElement("div");
  spinner.className = "pte-loading-spinner";

  const label = document.createElement("div");
  label.className = "pte-loading-label";
  label.textContent = "Loading data...";

  overlay.appendChild(spinner);
  overlay.appendChild(label);

  return overlay;
}

export class LoadingOverlayRenderer {
  private isLoading = false;
  private overlay: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.overlay = createLoadingOverlay();
    root.appendChild(this.overlay);
  }

  setLoading(isLoading: boolean) {
    this.isLoading = isLoading;
    this.update();
  }

  getLoading() {
    return this.isLoading;
  }

  update() {
    if (this.isLoading) {
      this.overlay.classList.remove("hidden");
    } else {
      this.overlay.classList.add("hidden");
    }
  }
}
