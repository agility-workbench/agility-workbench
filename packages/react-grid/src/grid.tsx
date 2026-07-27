import React, { useLayoutEffect, useRef } from "react";
import { GridProps } from "./interface";
import { GridRenderer } from "@agility-workbench/grid";
import type { IGridCore } from "@agility-workbench/grid";
import { createCore, getGridOptions } from "./factory";
import type { IGridAPI } from "@agility-workbench/grid";
import { ReactBodyMenuAdapter } from "./BodyMenuAdapter";
import { ReactMenuAdapter } from "./MenuAdapter";
import { initDomRenderer } from "@agility-workbench/grid";
import { isFalse } from "@agility-workbench/grid";
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

    onGridReadyRef.current = props.onGridReady;
    getColumnMenuItemsRef.current = props.getColumnMenuItems;
    bodyContextMenuRef.current = props.bodyContextMenu;

    // Create, attach, announce, and destroy the lifecycle-sensitive grid resources
    // from the layout effect so React render stays pure and StrictMode can replay it safely.
    useLayoutEffect(() => {
      const host = hostRef.current;
      if (!host) return;

      const core = createCore(getGridOptions(props));
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
      const core = instanceRef.current?.core;
      if (!core) return;

      core.dispatch({ type: "paginationSet", enabled: !isFalse(props.pagination), pageIndex: 0, pageSize: 100 });
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
