import { RefObject } from "react";

export class RootAttachmentRenderer {
  private containerEl: HTMLElement = document.createElement("div");

  constructor(private root: HTMLElement) {}

  attach(container: RefObject<HTMLElement | null>) {
    if (!container.current) {
      throw new Error("Table container ref is not attached");
    }
    this.containerEl = container.current;
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
