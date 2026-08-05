import React, { useLayoutEffect, useRef } from "react";
import { GridProps } from "./interface";
import { GridRenderer } from "@agility-workbench/grid";
import type { IGridCore } from "@agility-workbench/grid";
import { createCore, getGridOptions } from "./factory";
import type { IGridAPI } from "@agility-workbench/grid";
import { ReactBodyMenuAdapter } from "./BodyMenuAdapter";
import { ReactMenuAdapter } from "./MenuAdapter";
import { initDomRenderer } from "@agility-workbench/grid";
import { adaptReactColumnDefs } from "./cellRenderer";

type GridInstance = {
  core: IGridCore;
  renderer: GridRenderer;
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

  try {
    instance.renderer.detach();
  } catch { }
  try {
    instance.renderer.destroy();
  } catch { }
  try {
    instance.core.destroy();
  } catch { }
  try {
    instance.api.destroy?.();
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

    onGridReadyRef.current = props.onGridReady;
    getColumnMenuItemsRef.current = props.getColumnMenuItems;
    bodyContextMenuRef.current = props.bodyContextMenu;
    onCellClickedRef.current = props.onCellClicked;
    onRowClickedRef.current = props.onRowClicked;
    onCellValueChangedRef.current = props.onCellValueChanged;
    onSelectionChangedRef.current = props.onSelectionChanged;
    onSortChangedRef.current = props.onSortChanged;

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

      const core = createCore(options);
      const { renderer, api } = initDomRenderer(
        core,
        new ReactMenuAdapter({
          getColumnMenuItems: (params) => getColumnMenuItemsRef.current?.(params) ?? params.items,
        }),
        new ReactBodyMenuAdapter({
          // Only the function arm customizes items here; boolean modes (default / native-menu) are
          // handled via core options forwarded by getGridOptions. Read the ref so the callback stays
          // reactive to prop changes without recreating the grid instance.
          getBodyMenuItems: (params) => {
            const opt = bodyContextMenuRef.current;
            return typeof opt === "function" ? opt(params) : params.items;
          },
        }),
      );
      const instance: GridInstance = { core, renderer, api, destroyed: false };
      instanceRef.current = instance;

      renderer.attach({ current: host });
      core.dispatch({ type: "init" });
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
      const core = instanceRef.current?.core;
      if (!core) return;
      core.setColumnDefsFromProps(adaptReactColumnDefs(props.columnDefs));

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.columnDefs]);

    useLayoutEffect(() => {
      const core = instanceRef.current?.core;
      if (!core) return;
      if (props.rowModelType === "serverSide") return;
      core.dispatch?.({ type: "rowDataSet", rows: props.rowData ?? props.data ?? [] });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.data, props.rowData, props.rowModelType]);

    // groupDisplayType changes the synthesized grouping columns and whether group nodes render as
    // full-width rows. Reconcile it explicitly so declarative prop changes do not require a key/remount.
    useLayoutEffect(() => {
      instanceRef.current?.core.setGroupDisplayType(props.groupDisplayType ?? "singleColumn");
    }, [props.groupDisplayType]);

    useLayoutEffect(() => {
      instanceRef.current?.core.setGroupSortMode(props.groupSortMode ?? "local");
    }, [props.groupSortMode]);

    useLayoutEffect(() => {
      instanceRef.current?.core.setGroupRowsSelectable(props.groupRowsSelectable ?? false);
    }, [props.groupRowsSelectable]);

    useLayoutEffect(() => {
      instanceRef.current?.core.setTreeDataKeyboardNavigationOptions(
        props.treeData?.keyboardNavigationMode ?? "grid",
        props.treeData?.enableKeyboardNavigationModeSwitch ?? false,
      );
    }, [
      props.treeData?.keyboardNavigationMode,
      props.treeData?.enableKeyboardNavigationModeSwitch,
    ]);

    useLayoutEffect(() => {
      instanceRef.current?.renderer.setPinnedRowOptions({
        pinnedTopRowData: props.pinnedTopRowData ?? [],
        pinnedBottomRowData: props.pinnedBottomRowData ?? [],
        isRowPinned: props.isRowPinned,
        groupRowsSticky: props.groupRowsSticky ?? false,
      });
    }, [
      props.pinnedTopRowData,
      props.pinnedBottomRowData,
      props.isRowPinned,
      props.groupRowsSticky,
    ]);

    useLayoutEffect(() => {
      instanceRef.current?.renderer.setRuntimeOptions({
        rowHover: props.rowHover ?? true,
        columnHover: props.columnHover ?? false,
        zebraRows: props.zebraRows ?? false,
        getRowClass: props.getRowClass,
        getRowStyle: props.getRowStyle,
        highlightActiveCell: props.highlightActiveCell ?? false,
        cellSelection: props.cellSelection ?? true,
        rangeSelection: props.rangeSelection ?? true,
        columnSelection: props.columnSelection ?? true,
        showColumnButtonsOnHover: props.showColumnButtonsOnHover ?? false,
        // Function-valued customization is resolved through bodyContextMenuRef by the adapter.
        // Core only owns whether the browser-native mode disables the grid menu entirely.
        bodyContextMenu: props.bodyContextMenu === false ? false : true,
        editTrigger: props.editTrigger ?? "doubleClick",
        pinnedRowsEditable: props.pinnedRowsEditable ?? false,
        rowPinningMenu: props.rowPinningMenu ?? false,
        suppressKeyboardEdit: props.suppressKeyboardEdit ?? false,
        suppressTypeToEdit: props.suppressTypeToEdit ?? false,
        moveAfterEdit: props.moveAfterEdit ?? true,
        commitOnBlur: props.commitOnBlur ?? true,
      });
    }, [
      props.rowHover,
      props.columnHover,
      props.zebraRows,
      props.getRowClass,
      props.getRowStyle,
      props.highlightActiveCell,
      props.cellSelection,
      props.rangeSelection,
      props.columnSelection,
      props.showColumnButtonsOnHover,
      props.bodyContextMenu,
      props.editTrigger,
      props.pinnedRowsEditable,
      props.rowPinningMenu,
      props.suppressKeyboardEdit,
      props.suppressTypeToEdit,
      props.moveAfterEdit,
      props.commitOnBlur,
    ]);

    useLayoutEffect(() => {
      const instance = instanceRef.current;
      if (!instance || props.rowModelType !== "serverSide") return;
      if (!props.serverSideDataSource) return;
      instance.renderer.setServerSideDataSource(props.serverSideDataSource);

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.rowModelType, props.serverSideDataSource]);

    useLayoutEffect(() => {
      const instance = instanceRef.current;
      if (!instance || props.rowModelType !== "serverSide") return;
      if (!props.serverSideAggregationSource) return;
      instance.renderer.setServerSideAggregation(props.serverSideAggregationSource);

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.rowModelType, props.serverSideAggregationSource]);

    useLayoutEffect(() => {
      const core = instanceRef.current?.core;
      if (!core) return;

      core.dispatch({ type: "overlayShow", overlayType: props.loading ? "loading" : "none" });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.loading]);

    useLayoutEffect(() => {
      const renderer = instanceRef.current?.renderer;
      if (!renderer) return;

      renderer.togglePagination(props.pagination ?? false);
    }, [props.pagination]);

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
      const renderer = instanceRef.current?.renderer;
      if (!renderer) return;
      renderer.setQuickFilterOptions(props.quickFilter);
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
      const renderer = instanceRef.current?.renderer;
      if (!renderer) return;
      renderer.setTooltipOptions(props.tooltip);
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
      instanceRef.current?.renderer.setColumnPanelOptions(props.columnPanel);
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
      instanceRef.current?.renderer.setToolbarOptions(props.toolbar);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolbarKey]);

    // Saved views are application-owned. Reconcile a new list/callback object in place so a
    // persistence update immediately refreshes the Views menu without remounting the grid.
    useLayoutEffect(() => {
      instanceRef.current?.renderer.setSavedViewsOptions(props.savedViews);
    }, [props.savedViews]);

    // Theme vars and icons are reconciled together: props.icons override any icons
    // carried by props.theme, so recompute the merged set whenever either changes.
    useLayoutEffect(() => {
      const renderer = instanceRef.current?.renderer;
      if (!renderer) return;
      renderer.setThemeVars(props.theme);
      renderer.setIcons({ ...props.theme?.getIcons(), ...props.icons });
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
