import { GridCore } from "../core/core";
import {
  GridEventColumnsChangedParams,
  GridEventColumnWidthsChangedParams,
  GridEventAggregateChangedParams,
  GridEventCellsChangedParams,
  GridEventEditingChangedParams,
  GridEventFocusChangedParams,
  GridEventPaginationChangedParams,
  GridEventRowsChangedParams,
  GridEventSelectionChangedParams,
  GridEventViewportChangedParams,
  GridEventKeyboardNavigationModeChangedParams,
  Unsubscribe,
} from "../events/events";

interface GridRendererCoreEventBinderParams {
  core: GridCore;
  setLoading: (isLoading: boolean) => void;
  setEmpty: (isEmpty: boolean) => void;
  buildPaginationControls: () => void;
  maybeUpdatePoolSize: (params: GridEventViewportChangedParams) => void;
  onColumnsChanged: (params: GridEventColumnsChangedParams) => void;
  onColumnWidthsChanged: (params: GridEventColumnWidthsChangedParams) => void;
  onDataChanged: (params: GridEventRowsChangedParams) => void;
  onAggregateChanged: (params: GridEventAggregateChangedParams) => void;
  updatePaginationControls: (params: GridEventPaginationChangedParams) => void;
  renderAggregateRow: () => void;
  onSelectionChanged: (params: GridEventSelectionChangedParams) => void;
  onFocusChanged: (params: GridEventFocusChangedParams) => void;
  onEditingChanged: (params: GridEventEditingChangedParams) => void;
  onCellsChanged: (params: GridEventCellsChangedParams) => void;
  onKeyboardNavigationModeChanged: (params: GridEventKeyboardNavigationModeChangedParams) => void;
}

export class GridRendererCoreEventBinder {
  private unsubscribers: Unsubscribe[] = [];

  constructor(private params: GridRendererCoreEventBinderParams) { }

  bind() {
    this.unsubscribers.push(
      this.params.core.on("overlayShow", (ev: { overlayType: "loading" | "noRows" | "none" }) => {
        // Loading spinner responds only to the loading state. The empty ("noRows") state is driven
        // separately from the actual row count in rowsChanged, so a load-in-progress hides the
        // empty overlay until the data arrives.
        this.params.setLoading(ev.overlayType === "loading");
        if (ev.overlayType === "loading") this.params.setEmpty(false);
      }),
      this.params.core.on("modelUpdated", () => {
        this.params.buildPaginationControls();
        this.params.renderAggregateRow();
      }),
      this.params.core.on("viewportChanged", (params: GridEventViewportChangedParams) => {
        this.params.maybeUpdatePoolSize(params);
      }),
      this.params.core.on("columnsChanged", (params: GridEventColumnsChangedParams) => {
        this.params.onColumnsChanged(params);
      }),
      this.params.core.on("columnWidthsChanged", (params: GridEventColumnWidthsChangedParams) => {
        this.params.onColumnWidthsChanged(params);
      }),
      this.params.core.on("rowsChanged", (params: GridEventRowsChangedParams) => {
        this.params.onDataChanged(params);
        this.params.setEmpty(params.rowCount === 0);
      }),
      this.params.core.on("aggregateChanged", (params: GridEventAggregateChangedParams) => {
        this.params.onAggregateChanged(params);
      }),
      this.params.core.on("paginationChanged", (params: GridEventPaginationChangedParams) => {
        this.params.updatePaginationControls(params);
      }),
      this.params.core.on("selectionChanged", (params: GridEventSelectionChangedParams) => {
        this.params.onSelectionChanged(params);
      }),
      this.params.core.on("focusChanged", (params: GridEventFocusChangedParams) => {
        this.params.onFocusChanged(params);
      }),
      this.params.core.on("editingChanged", (params: GridEventEditingChangedParams) => {
        this.params.onEditingChanged(params);
      }),
      this.params.core.on("cellsChanged", (params: GridEventCellsChangedParams) => {
        this.params.onCellsChanged(params);
      }),
      this.params.core.on("keyboardNavigationModeChanged", (params) => {
        this.params.onKeyboardNavigationModeChanged(params);
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
