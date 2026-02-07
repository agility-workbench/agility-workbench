import { FilterRuntimeState } from "@grid/filter/types";

export interface IFilterRenderer {
  renderState(state: FilterRuntimeState): void;
  getUi(): HTMLElement;
  onOpen(): void;
  destroy(): void;
}
