import { FilterController } from "../../filter/filterMenuController";
import { FilterPanelSpec, FilterRuntimeState } from "../../filter/types";
import { createElement, div } from "../element";
import { IFilterRenderer } from "../../interfaces/iFilterRenderer";
import { BasicFilterRenderer } from "./basicFilterRenderer";
import { SetFilterRenderer } from "./setFilterRenderer";

export class FilterRenderer {
  private root!: HTMLElement;

  private renderer: IFilterRenderer;

  private unsubscribeFn: (() => void);

  constructor(private controller: FilterController, private spec: FilterPanelSpec) {
    this.renderer = spec.kind === "set" ? new SetFilterRenderer(controller, spec) : new BasicFilterRenderer(controller, spec);
    this.createFilter();
    this.unsubscribeFn = this.controller.subscribe((state: FilterRuntimeState) => this.renderer.renderState(state));
  }

  destroy(): void {
    this.renderer?.destroy();
    this.unsubscribeFn();
  }

  getUi(): HTMLElement {
    return this.root;
  }

  onOpen(): void {
    this.renderer.onOpen();
  }

  private createRoot() {
    this.root = div("pte-filter-root");
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", `Filter ${this.spec.column.label ?? this.spec.column.key}`);
  }

  private createFilter() {
    this.createRoot();
    this.root.appendChild(this.renderer.getUi());
    const buttons = this.spec.params.buttons || [];
    if (buttons.length > 0) this.createActionsRow(buttons);
  }

  private createActionsRow(buttons: string[]) {
    const actionsRow = div("pte-filter-actions");
    for (const btn of buttons) {
      const button = createElement("button", "pte-filter-btn");
      button.innerText = btn;
      button.addEventListener("click", () => {
        switch (btn) {
          case "apply": return this.controller.apply();
          case "cancel": return this.controller.cancel();
          case "clear": return this.controller.clearAll();
          case "reset": return this.controller.reset();
        }
      });
      actionsRow.appendChild(button);
    }
    this.root.appendChild(actionsRow);
  }
}
