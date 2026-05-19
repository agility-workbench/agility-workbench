import { GridCore } from "../core/core";
import {
  GridEventColumnsChangedParams,
  GridEventPaginationChangedParams,
  GridEventRowsChangedParams,
  GridEventViewportChangedParams,
  Unsubscribe,
} from "../events/events";

interface GridRendererCoreEventBinderParams {
  core: GridCore;
  setLoading: (isLoading: boolean) => void;
  buildPaginationControls: () => void;
  maybeUpdatePoolSize: (params: GridEventViewportChangedParams) => void;
  onColumnsChanged: (params: GridEventColumnsChangedParams) => void;
  onDataChanged: (params: GridEventRowsChangedParams) => void;
  updatePaginationControls: (params: GridEventPaginationChangedParams) => void;
}

export class GridRendererCoreEventBinder {
  private unsubscribers: Unsubscribe[] = [];

  constructor(private params: GridRendererCoreEventBinderParams) { }

  bind() {
    this.unsubscribers.push(
      this.params.core.on("overlayShow", (ev: { overlayType: "loading" | "noRows" | "none" }) => {
        this.params.setLoading(ev.overlayType === "loading" || ev.overlayType === "noRows");
      }),
      this.params.core.on("modelUpdated", () => {
        this.params.buildPaginationControls();
      }),
      this.params.core.on("viewportChanged", (params: GridEventViewportChangedParams) => {
        this.params.maybeUpdatePoolSize(params);
      }),
      this.params.core.on("columnsChanged", (params: GridEventColumnsChangedParams) => {
        this.params.onColumnsChanged(params);
      }),
      this.params.core.on("rowsChanged", (params: GridEventRowsChangedParams) => {
        this.params.onDataChanged(params);
      }),
      this.params.core.on("paginationChanged", (params: GridEventPaginationChangedParams) => {
        this.params.updatePaginationControls(params);
      }),
    );
  }

  destroy() {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }
}
