import React, { useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import { GridReactProps } from "./interface";
import "@grid/theme/table.css";
import { GridRenderer } from "@grid";
import { IGridCore } from "@grid/interfaces/iCore";
import { createApi, createCore, createRenderer } from "./factory";
import { IGridAPI } from "@grid/interfaces/IApi";

export const GridReact = React.forwardRef<IGridAPI | null, GridReactProps>(
  function GridReact(props, forwardedRef) {
    const hostRef = useRef<HTMLDivElement | null>(null);

    // Instances live in refs so they survive renders without triggering re-renders.
    const coreRef = useRef<IGridCore | null>(null);
    const rendererRef = useRef<GridRenderer | null>(null);
    const apiRefLocal = useRef<IGridAPI | null>(null);

    // Expose API via forwardedRef (optional convenience)
    useImperativeHandle(forwardedRef, () => apiRefLocal.current!, []);

    // Expose API via props.apiRef (if provided)
    useImperativeHandle(props.apiRef ?? null, () => apiRefLocal.current, []);

    // Decide whether we should recreate on options change.
    // By default, assume options are stable (recommended).
    const optionsKey = props.recreateOnOptionsChange ? props.options : null;

    // Create instances (core/renderer/api) exactly once (or when optionsKey changes if enabled).
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

      const core = createCore(props.options || {});
      const renderer = createRenderer(core);
      const api = createApi(core);

      coreRef.current = core;
      rendererRef.current = renderer;
      apiRefLocal.current = api;

      // Fire onGridReady synchronously on creation (before attach is also ok).
      props.onGridReady?.(api);

      core.dispatch({ type: "init" });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [optionsKey]);

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
    }, [optionsKey]);

    // Forward data / columnDefs to core on change (NOT on scroll).
    useLayoutEffect(() => {
      const core = coreRef.current;
      if (!core) return;

      // if (props.columnDefs && core.setColumnDefs) {
      //   core.setColumnDefs(props.columnDefs);
      // }
      // If you use dispatch instead:
      core.dispatch({ type: "columnDefsSet", defs: props.columnDefs || [] });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.columnDefs]);

    useLayoutEffect(() => {
      const core = coreRef.current;
      if (!core) return;

      // if (props.data && core.setRowData) {
      //   core.setRowData(props.data);
      // }
      // If you use dispatch instead:
      core.dispatch?.({ type: "rowDataSet", rows: props.data || [] });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.data]);

    useLayoutEffect(() => {
      const core = coreRef.current;
      if (!core) return;

      core.dispatch({ type: "overlayShow", overlayType: props.loading ? "loading" : "none" });

      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.loading]);

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
          // ensure the host can size properly for your renderer
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
