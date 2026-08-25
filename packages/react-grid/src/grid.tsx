import React, { useLayoutEffect, useRef } from "react";
import { GridProps } from "./interface";
import { createGrid } from "@agility-workbench/grid";
import { getGridOptions } from "./factory";
import type { IGridAPI } from "@agility-workbench/grid";
import { ReactBodyMenuAdapter } from "./BodyMenuAdapter";
import { ReactMenuAdapter } from "./MenuAdapter";
import { adaptReactColumnDefs } from "./cellRenderer";
import { adaptReactGetRowPresentation } from "./cellRenderer";

type GridInstance = {
  api: IGridAPI;
  destroyed: boolean;
};

function assignRef<T>(ref: React.ForwardedRef<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

function destroyInstance(instance: GridInstance): void {
  if (instance.destroyed) return;
  instance.destroyed = true;

  // createGrid's api.destroy() performs the whole guarded teardown (detach → renderer.destroy →
  // core.destroy → api cleanup) in that order, exactly once. The flag above keeps this wrapper
  // idempotent too, since React can run the cleanup twice.
  try {
    instance.api.destroy();
  } catch { }
}

export const Grid = React.forwardRef<IGridAPI | null, GridProps>(
  function Grid(props, forwardedRef) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<GridInstance | null>(null);
    const onGridReadyRef = useRef(props.onGridReady);
    const getColumnMenuItemsRef = useRef(props.getColumnMenuItems);
    const bodyContextMenuRef = useRef(props.bodyContextMenu);
    const onCellClickedRef = useRef(props.onCellClicked);
    const onRowClickedRef = useRef(props.onRowClicked);
    const onCellValueChangedRef = useRef(props.onCellValueChanged);
    const onSelectionChangedRef = useRef(props.onSelectionChanged);
    const onSortChangedRef = useRef(props.onSortChanged);
    const onFilterChangedRef = useRef(props.onFilterChanged);
    const onHistoryChangedRef = useRef(props.onHistoryChanged);
    const onBeforeCellCommitRef = useRef(props.onBeforeCellCommit);

    onGridReadyRef.current = props.onGridReady;
    getColumnMenuItemsRef.current = props.getColumnMenuItems;
    bodyContextMenuRef.current = props.bodyContextMenu;
    onCellClickedRef.current = props.onCellClicked;
    onRowClickedRef.current = props.onRowClicked;
    onCellValueChangedRef.current = props.onCellValueChanged;
    onSelectionChangedRef.current = props.onSelectionChanged;
    onSortChangedRef.current = props.onSortChanged;
    onFilterChangedRef.current = props.onFilterChanged;
    onHistoryChangedRef.current = props.onHistoryChanged;
    onBeforeCellCommitRef.current = props.onBeforeCellCommit;

    // Create, attach, announce, and destroy the lifecycle-sensitive grid resources
    // from the layout effect so React render stays pure and StrictMode can replay it safely.
    useLayoutEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const options = getGridOptions(props);
      // Stable bridges keep the core subscriptions intact while always invoking the latest React
      // callback supplied by the parent.
      options.onCellClicked = (ev) => onCellClickedRef.current?.(ev);
      options.onRowClicked = (ev) => onRowClickedRef.current?.(ev);
      options.onCellValueChanged = (ev) => onCellValueChangedRef.current?.(ev);
      options.onSelectionChanged = (ev) => onSelectionChangedRef.current?.(ev);
      options.onSortChanged = (ev) => onSortChangedRef.current?.(ev);
      options.onFilterChanged = (ev) => onFilterChangedRef.current?.(ev);
      options.onHistoryChanged = (ev) => onHistoryChangedRef.current?.(ev);
      // Value-returning hook: an absent callback returns undefined, which core reads as "accept".
      options.onBeforeCellCommit = (params) => onBeforeCellCommitRef.current?.(params);

      // columnDefs / rowData are deliberately NOT passed to createGrid: the two mount effects below
      // apply them in this same commit (init → columnDefs → rowData, the order createGrid itself
      // uses), so mount and update share one code path.
      const api = createGrid(host, {
        ...options,
        menuAdapter: new ReactMenuAdapter({
          getColumnMenuItems: (params) => getColumnMenuItemsRef.current?.(params) ?? params.items,
        }),
        bodyMenuAdapter: new ReactBodyMenuAdapter({
          // Only the function arm customizes items here; boolean modes (default / native-menu) are
          // handled via core options forwarded by getGridOptions. Read the ref so the callback stays
          // reactive to prop changes without recreating the grid instance.
          getBodyMenuItems: (params) => {
            const opt = bodyContextMenuRef.current;
            return typeof opt === "function" ? opt(params) : params.items;
          },
        }),
      });
      const instance: GridInstance = { api, destroyed: false };
      instanceRef.current = instance;

      assignRef(forwardedRef, api);
      assignRef(props.apiRef, api);
      onGridReadyRef.current?.(api);

      return () => {
        if (instanceRef.current === instance) {
          instanceRef.current = null;
        }

        assignRef(forwardedRef, null);
        assignRef(props.apiRef, null);
        destroyInstance(instance);
      };
      // Only recreate the instance for true mount/unmount lifecycle changes.
      // Ordinary prop changes are synchronized by the effects below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useLayoutEffect(() => {
      const api = instanceRef.current?.api ?? null;
      assignRef(forwardedRef, api);
      assignRef(props.apiRef, api);

      return () => {
        assignRef(forwardedRef, null);
        assignRef(props.apiRef, null);
      };
    }, [forwardedRef, props.apiRef]);

    // Forward data / columnDefs to core on change (NOT on scroll).
    useLayoutEffect(() => {
      const api = instanceRef.current?.api;
      if (!api) return;
      // Presence-based: an undefined prop still carries the key, releasing caller ownership of the
      // schema exactly as setColumnDefsFromProps(undefined) did.
      api.updateGridOptions({ columnDefs: adaptReactColumnDefs(props.columnDefs) });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.columnDefs]);

    useLayoutEffect(() => {
      const api = instanceRef.current?.api;
      if (!api) return;
      if (props.rowModelType === "serverSide") return;
      api.setRowData(props.rowData ?? props.data ?? []);

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.data, props.rowData, props.rowModelType]);

    // groupDisplayType changes the synthesized grouping columns and whether group nodes render as
    // full-width rows. Reconcile it explicitly so declarative prop changes do not require a key/remount.
    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({ groupDisplayType: props.groupDisplayType });
    }, [props.groupDisplayType]);

    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({ groupSortMode: props.groupSortMode });
    }, [props.groupSortMode]);

    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({ groupRowsSelectable: props.groupRowsSelectable });
    }, [props.groupRowsSelectable]);

    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({ pivotColumnMoveMode: props.pivotColumnMoveMode });
    }, [props.pivotColumnMoveMode]);

    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({ isRowSelectable: props.isRowSelectable });
    }, [props.isRowSelectable]);

    const rowSelectionKey = JSON.stringify(props.rowSelection ?? null);
    const rowSelectionMountedRef = useRef(false);
    useLayoutEffect(() => {
      // Creation already applied the initial value; reconcile only subsequent content changes.
      if (!rowSelectionMountedRef.current) {
        rowSelectionMountedRef.current = true;
        return;
      }
      instanceRef.current?.api.updateGridOptions({ rowSelection: props.rowSelection });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowSelectionKey]);

    useLayoutEffect(() => {
      // Both keys are always supplied so each restates its current value rather than being read
      // back off the core (the API's presence-based contract).
      instanceRef.current?.api.setTreeDataKeyboardNavigationOptions({
        keyboardNavigationMode: props.treeData?.keyboardNavigationMode,
        enableKeyboardNavigationModeSwitch: props.treeData?.enableKeyboardNavigationModeSwitch ?? false,
      });
    }, [
      props.treeData?.keyboardNavigationMode,
      props.treeData?.enableKeyboardNavigationModeSwitch,
    ]);

    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({
        pinnedTopRowData: props.pinnedTopRowData,
        pinnedBottomRowData: props.pinnedBottomRowData,
        isRowPinned: props.isRowPinned,
        groupRowsSticky: props.groupRowsSticky,
      });
    }, [
      props.pinnedTopRowData,
      props.pinnedBottomRowData,
      props.isRowPinned,
      props.groupRowsSticky,
    ]);

    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({
        rowHover: props.rowHover ?? true,
        columnHover: props.columnHover ?? false,
        zebraRows: props.zebraRows ?? false,
        getRowClass: props.getRowClass,
        getRowStyle: props.getRowStyle,
        getRowPresentation: adaptReactGetRowPresentation(props.getRowPresentation),
        ariaLabel: props.ariaLabel,
        ariaLabelledBy: props.ariaLabelledBy,
        highlightActiveCell: props.highlightActiveCell ?? false,
        cellSelection: props.cellSelection ?? true,
        rangeSelection: props.rangeSelection ?? true,
        columnSelection: props.columnSelection ?? true,
        headerKeyboardNavigation: props.headerKeyboardNavigation ?? true,
        showColumnButtonsOnHover: props.showColumnButtonsOnHover ?? false,
        // Function-valued customization is resolved through bodyContextMenuRef by the adapter.
        // Core only owns whether the browser-native mode disables the grid menu entirely.
        bodyContextMenu: props.bodyContextMenu === false ? false : true,
        editTrigger: props.editTrigger ?? "doubleClick",
        readOnlyEdit: props.readOnlyEdit ?? false,
        pinnedRowsEditable: props.pinnedRowsEditable ?? false,
        rowPinningMenu: props.rowPinningMenu ?? false,
        rowInsertionMenu: props.rowInsertionMenu,
        suppressKeyboardEdit: props.suppressKeyboardEdit ?? false,
        suppressTypeToEdit: props.suppressTypeToEdit ?? false,
        moveAfterEdit: props.moveAfterEdit ?? true,
        commitOnBlur: props.commitOnBlur ?? true,
        asyncTransactionWaitMs: props.asyncTransactionWaitMs ?? 16,
      });
    }, [
      props.rowHover,
      props.columnHover,
      props.zebraRows,
      props.getRowClass,
      props.getRowStyle,
      props.getRowPresentation,
      props.ariaLabel,
      props.ariaLabelledBy,
      props.highlightActiveCell,
      props.cellSelection,
      props.rangeSelection,
      props.columnSelection,
      props.headerKeyboardNavigation,
      props.showColumnButtonsOnHover,
      props.bodyContextMenu,
      props.editTrigger,
      props.readOnlyEdit,
      props.pinnedRowsEditable,
      props.rowPinningMenu,
      props.rowInsertionMenu,
      props.suppressKeyboardEdit,
      props.suppressTypeToEdit,
      props.moveAfterEdit,
      props.commitOnBlur,
      props.asyncTransactionWaitMs,
    ]);

    useLayoutEffect(() => {
      const instance = instanceRef.current;
      if (!instance || props.rowModelType !== "serverSide") return;
      if (!props.serverSideDataSource) return;
      instance.api.updateGridOptions({ serverSideDataSource: props.serverSideDataSource });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.rowModelType, props.serverSideDataSource]);

    useLayoutEffect(() => {
      const instance = instanceRef.current;
      if (!instance || props.rowModelType !== "serverSide") return;
      if (!props.serverSideAggregationSource) return;
      instance.api.updateGridOptions({ serverSideAggregationSource: props.serverSideAggregationSource });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.rowModelType, props.serverSideAggregationSource]);

    useLayoutEffect(() => {
      const api = instanceRef.current?.api;
      if (!api) return;

      api.dispatch({ type: "overlayShow", overlayType: props.loading ? "loading" : "none" });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.loading]);

    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({ pagination: props.pagination });
    }, [props.pagination]);

    const paginationControlsKey = JSON.stringify(props.paginationControls ?? null);
    const paginationControlsMountedRef = useRef(false);
    useLayoutEffect(() => {
      if (!paginationControlsMountedRef.current) {
        paginationControlsMountedRef.current = true;
        return;
      }
      instanceRef.current?.api.updateGridOptions({ paginationControls: props.paginationControls });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paginationControlsKey]);

    // Reconfigure the quick filter live (anchor, clearOnClose, mode, popover controls, enable/disable)
    // without remounting the grid. Serialized so an inline-object `quickFilter` prop doesn't rebuild
    // the widget on every render — only when the config's contents actually change.
    const quickFilterKey = JSON.stringify(props.quickFilter ?? null);
    const quickFilterMountedRef = useRef(false);
    useLayoutEffect(() => {
      // Skip the mount run: the widget is already built with these options by the create effect.
      // Only a genuine post-mount change should trigger a rebuild.
      if (!quickFilterMountedRef.current) {
        quickFilterMountedRef.current = true;
        return;
      }
      instanceRef.current?.api.updateGridOptions({ quickFilter: props.quickFilter });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quickFilterKey]);

    // Reconfigure tooltips live (mode, interactivity, delays, enable/disable) without remounting.
    // Serialized so an inline-object `tooltip` prop doesn't reconfigure on every render — only when
    // the config's contents actually change. Skip the mount run (create effect already applied it).
    const tooltipKey = JSON.stringify(props.tooltip ?? null);
    const tooltipMountedRef = useRef(false);
    useLayoutEffect(() => {
      if (!tooltipMountedRef.current) {
        tooltipMountedRef.current = true;
        return;
      }
      instanceRef.current?.api.updateGridOptions({ tooltip: props.tooltip });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tooltipKey]);

    // The docked column panel can be enabled/disabled or resized without recreating the grid.
    const columnPanelKey = JSON.stringify(props.columnPanel ?? null);
    const columnPanelMountedRef = useRef(false);
    useLayoutEffect(() => {
      if (!columnPanelMountedRef.current) {
        columnPanelMountedRef.current = true;
        return;
      }
      instanceRef.current?.api.updateGridOptions({ columnPanel: props.columnPanel });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columnPanelKey]);

    // Toolbar sections are independently opt-in and reconcile in place. An empty/omitted config
    // removes the toolbar unless another feature (currently the Columns trigger) is hosted there.
    const toolbarKey = JSON.stringify(props.toolbar ?? null);
    const toolbarMountedRef = useRef(false);
    useLayoutEffect(() => {
      if (!toolbarMountedRef.current) {
        toolbarMountedRef.current = true;
        return;
      }
      instanceRef.current?.api.updateGridOptions({ toolbar: props.toolbar });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolbarKey]);

    // Saved views are application-owned. Reconcile a new list/callback object in place so a
    // persistence update immediately refreshes the Views menu without remounting the grid.
    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({ savedViews: props.savedViews });
    }, [props.savedViews]);

    // Sheet tabs are application-owned the same way: a new list/callback object re-syncs the tab
    // strip in place (no view state is applied by a sync — see SheetsOptions).
    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({ sheets: props.sheets });
    }, [props.sheets]);

    // Theme vars and icons are reconciled together: props.icons override any icons
    // carried by props.theme, so recompute the merged set whenever either changes. The merge is
    // done here (not left to the API's theme/icon resolution) because that resolution reads
    // creation-time icons off the core's options, not the current prop.
    useLayoutEffect(() => {
      instanceRef.current?.api.updateGridOptions({
        theme: props.theme,
        icons: { ...props.theme?.getIcons(), ...props.icons },
      });
    }, [props.theme, props.icons]);

    return (
      <div
        ref={hostRef}
        className={props.className}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          ...props.style,
        }}
      />
    );
  }
);
