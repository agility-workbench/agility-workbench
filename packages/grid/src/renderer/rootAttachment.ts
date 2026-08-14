export class RootAttachmentRenderer {
  private containerEl: HTMLElement = document.createElement("div");

  constructor(private root: HTMLElement) {}

  attach(container: HTMLElement) {
    if (!container) {
      throw new Error("Table container is not attached");
    }
    this.containerEl = container;
    this.containerEl.appendChild(this.root);
  }

  detach() {
    this.containerEl = document.createElement("div");
  }

  getContainerEl() {
    return this.containerEl;
  }

  destroy() {
    this.root.remove();
  }
}
