import React, { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import { GridProps } from "./interface";
import { GridOptions, GridRenderer } from "@agility-workbench/grid";
import type { IGridCore } from "@agility-workbench/grid";
import { createCore, getGridOptions } from "./factory";
import type { IGridAPI } from "@agility-workbench/grid";
import { ReactBodyMenuAdapter } from "./BodyMenuAdapter";
import { ReactMenuAdapter } from "./MenuAdapter";
import { initDomRenderer } from "@agility-workbench/grid";
import { isFalse } from "@agility-workbench/grid";
import { adaptReactColumnDefs } from "./cellRenderer";

export const Grid = React.forwardRef<IGridAPI | null, GridProps>(
  function Grid(props, forwardedRef) {
    const hostRef = useRef<HTMLDivElement | null>(null);

    // Instances live in refs so they survive renders without triggering re-renders.
    const coreRef = useRef<IGridCore | null>(null);
    const rendererRef = useRef<GridRenderer | null>(null);
    const apiRefLocal = useRef<IGridAPI | null>(null);

    // Expose API via forwardedRef (optional convenience)
    useImperativeHandle(forwardedRef, () => apiRefLocal.current!, []);

    // Expose API via props.apiRef (if provided)
    useImperativeHandle(props.apiRef ?? null, () => apiRefLocal.current!, []);

    // Create instances (core/renderer/api) exactly once.
    // useMemo is fine because we attach/destroy in layout effect; instances are stored in refs.
    useMemo(() => {
      // cleanup old instances if recreating
      if (coreRef.current || rendererRef.current || apiRefLocal.current) {
        try {
          rendererRef.current?.detach();
        } catch { }
        try {
          rendererRef.current?.destroy();
        } catch { }
        try {
          coreRef.current?.destroy();
        } catch { }
        try {
          apiRefLocal.current?.destroy?.();
        } catch { }
      }

      const core = createCore(getGridOptions(props));
      const { renderer, api } = initDomRenderer(
        core,
        new ReactMenuAdapter({ getColumnMenuItems: props.getColumnMenuItems }),
        new ReactBodyMenuAdapter({ getBodyMenuItems: props.getBodyMenuItems }),
      );

      coreRef.current = core;
      rendererRef.current = renderer;
      apiRefLocal.current = api;

      core.dispatch({ type: "init" });

      // Fire onGridReady synchronously on creation (before attach is also ok).
      props.onGridReady?.(api);

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Attach renderer to DOM host on mount, detach on unmount.
    useLayoutEffect(() => {
      const host = hostRef.current;
      const renderer = rendererRef.current;

      if (!hostRef || !host || !renderer) return;

      renderer.attach(hostRef);

      return () => {
        try {
          renderer.detach();
        } catch { }
      };
    }, []);

    // Forward data / columnDefs to core on change (NOT on scroll).
    useLayoutEffect(() => {
      const core = coreRef.current;
      if (!core) return;
      core.setColumnDefsFromProps(adaptReactColumnDefs(props.columnDefs));

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.columnDefs]);

    useLayoutEffect(() => {
      const core = coreRef.current;
      if (!core) return;
      if (props.rowModelType === "serverSide") return;
      core.dispatch?.({ type: "rowDataSet", rows: props.data || [] });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.data, props.rowModelType]);

    useLayoutEffect(() => {
      const core = coreRef.current;
      if (!core) return;
      core.setServerSideDataSource(props.serverSideDataSource ?? null);

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.serverSideDataSource]);

    useLayoutEffect(() => {
      const core = coreRef.current;
      if (!core) return;
      core.setServerSideAggregationSource(props.serverSideAggregationSource ?? null);

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.serverSideAggregationSource]);

    useLayoutEffect(() => {
      const core = coreRef.current;
      if (!core) return;

      core.dispatch({ type: "overlayShow", overlayType: props.loading ? "loading" : "none" });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.loading]);

    useLayoutEffect(() => {
      const core = coreRef.current;
      if (!core) return;

      core.dispatch({ type: "paginationSet", enabled: !isFalse(props.pagination), pageIndex: 0, pageSize: 100 });
    }, [props.pagination]);

    // Theme vars and icons are reconciled together: props.icons override any icons
    // carried by props.theme, so recompute the merged set whenever either changes.
    useLayoutEffect(() => {
      const renderer = rendererRef.current;
      if (!renderer) return;
      renderer.setThemeVars(props.theme);
      renderer.setIcons({ ...props.theme?.getIcons(), ...props.icons });
    }, [props.theme, props.icons]);

    // Full teardown on unmount (core + renderer + api)
    useLayoutEffect(() => {
      return () => {
        try {
          rendererRef.current?.detach();
        } catch { }
        try {
          rendererRef.current?.destroy();
        } catch { }
        try {
          coreRef.current?.destroy();
        } catch { }
        try {
          apiRefLocal.current?.destroy?.();
        } catch { }

        rendererRef.current = null;
        coreRef.current = null;
        apiRefLocal.current = null;
      };
    }, []);

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
