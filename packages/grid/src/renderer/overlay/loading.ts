/** The loading label shown when `loadingMessage` is not set. */
export const DEFAULT_LOADING_MESSAGE = "Loading data...";

export function createLoadingOverlay(): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.className = "pte-loading-overlay hidden";

  const spinner = document.createElement("div");
  spinner.className = "pte-loading-spinner";

  const label = document.createElement("div");
  label.className = "pte-loading-label";
  label.textContent = DEFAULT_LOADING_MESSAGE;

  overlay.appendChild(spinner);
  overlay.appendChild(label);

  return overlay;
}

export class LoadingOverlayRenderer {
  private isLoading = false;
  private overlay: HTMLDivElement;
  private label: HTMLDivElement;

  constructor(root: HTMLElement, message?: string) {
    this.overlay = createLoadingOverlay();
    this.label = this.overlay.querySelector(".pte-loading-label") as HTMLDivElement;
    if (message != null) this.setMessage(message);
    root.appendChild(this.overlay);
  }

  setLoading(isLoading: boolean) {
    this.isLoading = isLoading;
    this.update();
  }

  getLoading() {
    return this.isLoading;
  }

  /** Replace the label (the `loadingMessage` option changed on a mounted grid). */
  setMessage(message: string) {
    this.label.textContent = message;
  }

  update() {
    if (this.isLoading) {
      this.overlay.classList.remove("hidden");
    } else {
      this.overlay.classList.add("hidden");
    }
  }
}
