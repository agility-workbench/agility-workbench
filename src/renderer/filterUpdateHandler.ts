import { GridCore } from "../core/core";

type FilterUpdateHandlerParams = {
  core: GridCore;
  setFilterIndicators: () => void;
  recomputeView: () => void;
  updateWindow: (forcePatch: boolean, scrollSrc?: HTMLDivElement) => void;
};

export class FilterUpdateHandler {
  constructor(private params: FilterUpdateHandlerParams) {}

  updateFilterIndicators() {
    this.params.setFilterIndicators();
  }

  onFilterModelChanged() {
    this.params.setFilterIndicators();
    if (this.params.core.getRowModel().getType() === "serverSide") {
      this.fetchServerSideRows("filterChanged");
      return;
    }
    this.params.recomputeView();
    this.params.updateWindow(true, undefined);
  }

  async fetchServerSideRows(_reason: string) {
    const rowModel = this.params.core.getRowModel();
    if (rowModel.getType() !== "serverSide" || !rowModel.isValid()) return;
    this.params.core.refreshRows("refresh");
  }
}
