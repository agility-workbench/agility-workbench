import { div } from "./element";

export class Overlay {
  private static idCounter = 0;
  private overlayEl: HTMLElement;

  constructor(private text: string = '', public onOpen?: () => void, public onClose?: () => void) {
    this.overlayEl = div("pte-loading-overlay hidden")
    const spinner = document.createElement("div");
    spinner.className = "pte-loading-spinner";
    this.overlayEl.appendChild(spinner);

    if (text) {
      const label = document.createElement("div");
      label.className = "pte-loading-label";
      label.textContent = "Loading data…";
      this.overlayEl.appendChild(label);
    }
  }

  show() {
    this.overlayEl.classList.remove("hidden");
    if (this.onOpen) this.onOpen();
  }

  hide() {
    this.overlayEl.classList.add("hidden");
    if (this.onClose) this.onClose();
  }

  getUi() {
    return this.overlayEl;
  }
}
