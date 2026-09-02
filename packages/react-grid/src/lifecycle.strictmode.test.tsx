// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import React, { useEffect, useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type {
  ActionFrameComponentParams,
  CellRendererParams,
  ICellEditorParams,
  IGridAPI,
  IServerSideDataSource,
  TooltipComponentParams,
} from "@agility-workbench/grid";
import type { ReactCellEditorHandle } from "./cellEditor";
import type { ReactColDef } from "./cellRenderer";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: string; name: string; price: number };

const rows: Row[] = [
  { id: "1", name: "Widget", price: 9.99 },
  { id: "2", name: "Gadget", price: 14.5 },
];

const columnDefs = [
  { colId: "name", key: "name", label: "Name" },
  { colId: "price", key: "price", label: "Price" },
];

function createContainer() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  return container;
}

function cellText(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>(".pte-cell"))
    .map((el) => el.textContent ?? "")
    .join(" ");
}

function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("Grid React lifecycle", () => {
  it("renders real grid cells under React.StrictMode", async () => {
    const container = createContainer();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <React.StrictMode>
          <Grid rowData={rows} columnDefs={columnDefs} rowIdKey="id" />
        </React.StrictMode>,
      );
    });

    expect(container.querySelector(".pte-root")).toBeTruthy();
    expect(container.querySelectorAll(".pte-cell").length).toBeGreaterThan(0);
    expect(cellText(container)).toContain("Widget");

    await unmountTestRoot(root);
    container.remove();
  });

  it("cleans nested renderer, tooltip, and action-frame roots during rapid StrictMode lifecycles", async () => {
    const lifecycle = {
      renderer: { mounted: 0, cleaned: 0 },
      tooltip: { mounted: 0, cleaned: 0 },
      actionFrame: { mounted: 0, cleaned: 0 },
      editor: { mounted: 0, cleaned: 0 },
      menu: { mounted: 0, cleaned: 0 },
    };

    function useLifecycle(kind: keyof typeof lifecycle) {
      useEffect(() => {
        lifecycle[kind].mounted += 1;
        return () => {
          lifecycle[kind].cleaned += 1;
        };
      }, [kind]);
    }

    function Renderer(params: CellRendererParams) {
      useLifecycle("renderer");
      return <span>{String(params.value)}</span>;
    }

    function Tooltip(params: TooltipComponentParams) {
      useLifecycle("tooltip");
      return <span>{String(params.value)}</span>;
    }

    function ActionFrame(params: ActionFrameComponentParams) {
      useLifecycle("actionFrame");
      return <span>{String(params.value)}</span>;
    }

    const Editor = React.forwardRef<ReactCellEditorHandle, ICellEditorParams>(
      function Editor(params, ref) {
        useLifecycle("editor");
        React.useImperativeHandle(ref, () => ({ getValue: () => params.value }), [params.value]);
        return <input defaultValue={String(params.value ?? "")} />;
      },
    );

    function MenuIcon() {
      useLifecycle("menu");
      return <span>R</span>;
    }

    const nestedColumns: ReactColDef[] = [
      {
        colId: "name",
        key: "name",
        label: "Name",
        editable: true,
        cellRenderer: Renderer,
        cellEditor: Editor,
        tooltipComponent: Tooltip,
        actionFrameComponent: ActionFrame,
      },
      { colId: "price", key: "price", label: "Price" },
    ];
    const container = createContainer();
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();

    await act(async () => {
      root.render(
        <React.StrictMode>
          <Grid
            ref={apiRef}
            rowData={rows}
            columnDefs={nestedColumns}
            rowIdKey="id"
            tooltip={{ showDelay: 0, hideDelay: 0 }}
            getColumnMenuItems={() => [{
              id: "lifecycle",
              label: "Lifecycle",
              left: <MenuIcon />,
              onClick: () => undefined,
            }]}
          />
        </React.StrictMode>,
      );
      await tick();
    });

    const colId = apiRef.current!.getColumnModel().getByColId("name")!.instanceID;
    for (let index = 0; index < 3; index += 1) {
      await act(async () => {
        apiRef.current!.showTooltip({ rowId: "1", colId });
        await tick();
      });
      await act(async () => {
        apiRef.current!.hideTooltip();
        await Promise.resolve();
      });
      await act(async () => {
        apiRef.current!.openActionFrame({ rowId: "1", colId });
        await tick();
      });
      await act(async () => {
        apiRef.current!.closeActionFrame();
        await Promise.resolve();
      });
      await act(async () => {
        apiRef.current!.startEditingCell({ rowId: "1", colId });
        await tick();
      });
      await act(async () => {
        apiRef.current!.cancelEditing();
        await Promise.resolve();
      });
      await act(async () => {
        const menuButton = document
          .getElementById(colId)
          ?.querySelector<HTMLButtonElement>(".pte-hcell-menu-menuBtn");
        menuButton!.click();
        await tick();
      });
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-item-id="lifecycle"]')!.click();
        await Promise.resolve();
      });
    }

    expect(lifecycle.renderer.mounted).toBeGreaterThan(0);
    expect(lifecycle.tooltip.mounted).toBeGreaterThan(0);
    expect(lifecycle.actionFrame.mounted).toBeGreaterThan(0);
    expect(lifecycle.editor.mounted).toBeGreaterThan(0);
    expect(lifecycle.menu.mounted).toBeGreaterThan(0);

    await unmountTestRoot(root);
    expect(lifecycle.renderer.cleaned).toBe(lifecycle.renderer.mounted);
    expect(lifecycle.tooltip.cleaned).toBe(lifecycle.tooltip.mounted);
    expect(lifecycle.actionFrame.cleaned).toBe(lifecycle.actionFrame.mounted);
    expect(lifecycle.editor.cleaned).toBe(lifecycle.editor.mounted);
    expect(lifecycle.menu.cleaned).toBe(lifecycle.menu.mounted);
    container.remove();
  });

  it("allows onGridReady to synchronously update parent React state without render-phase warnings", async () => {
    const container = createContainer();
    const root = createRoot(container);

    function Harness() {
      const [ready, setReady] = useState(false);

      return (
        <>
          <span data-testid="status">{ready ? "ready" : "waiting"}</span>
          <Grid
            rowData={rows}
            columnDefs={columnDefs}
            rowIdKey="id"
            onGridReady={() => {
              setReady(true);
            }}
          />
        </>
      );
    }

    await act(async () => {
      root.render(
        <React.StrictMode>
          <Harness />
        </React.StrictMode>,
      );
    });

    expect(container.querySelector("[data-testid='status']")?.textContent).toBe("ready");
    expect(cellText(container)).toContain("Gadget");
    await unmountTestRoot(root);
    container.remove();
  });

  it("announces onGridReady with the columns and rows already applied, once per instance", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();
    const seen: Array<{ cols: string[]; rowCount: number }> = [];

    await act(async () => {
      root.render(
        <React.StrictMode>
          <Grid
            apiRef={apiRef}
            rowData={rows}
            columnDefs={columnDefs}
            rowIdKey="id"
            onGridReady={(api) => {
              let rowCount = 0;
              api.forEachNodeAfterFilter(() => { rowCount++; });
              seen.push({
                cols: api.getColumnState().map((state) => state.colId),
                rowCount,
              });
              // Anything colId-addressed has to resolve here — while this fired from the creation
              // effect, calls like this one hit a column-less grid and were silently dropped.
              api.setRowGroupColumns(["name"]);
            }}
          />
        </React.StrictMode>,
      );
    });

    // StrictMode replays mount, so each created instance is announced exactly once.
    expect(seen.length).toBeGreaterThan(0);
    for (const announced of seen) {
      expect(announced.cols).toEqual(["name", "price"]);
      expect(announced.rowCount).toBe(rows.length);
    }
    expect(apiRef.current!.getRowGroupColumns()).toEqual(["name"]);

    await unmountTestRoot(root);
    container.remove();
  });

  it("leaves object and callback refs pointing at the final live API and clears them on unmount", async () => {
    const objectContainer = createContainer();
    const objectRoot = createRoot(objectContainer);
    const objectRef = React.createRef<IGridAPI | null>();

    await act(async () => {
      objectRoot.render(
        <React.StrictMode>
          <Grid ref={objectRef} rowData={rows} columnDefs={columnDefs} rowIdKey="id" />
        </React.StrictMode>,
      );
    });

    expect(objectRef.current).toBeTruthy();
    expect(objectRef.current!.getCore().getCellValue("1", "name")).toBe("Widget");
    await unmountTestRoot(objectRoot);
    expect(objectRef.current).toBeNull();
    objectContainer.remove();

    const callbackContainer = createContainer();
    const callbackRoot = createRoot(callbackContainer);
    const callbackValues: Array<IGridAPI | null> = [];
    const callbackRef = (api: IGridAPI | null) => {
      callbackValues.push(api);
    };

    await act(async () => {
      callbackRoot.render(
        <React.StrictMode>
          <Grid ref={callbackRef} rowData={rows} columnDefs={columnDefs} rowIdKey="id" />
        </React.StrictMode>,
      );
    });

    const liveApi = callbackValues.filter(Boolean).at(-1)!;
    expect(liveApi.getCore().getCellValue("2", "name")).toBe("Gadget");
    await unmountTestRoot(callbackRoot);
    expect(callbackValues.at(-1)).toBeNull();
    callbackContainer.remove();
  });

  it("cleans up renderer DOM and remounts without accumulating event handlers", async () => {
    const container = createContainer();
    let root = createRoot(container);
    const firstRef = React.createRef<IGridAPI | null>();

    await act(async () => {
      root.render(
        <React.StrictMode>
          <Grid ref={firstRef} rowData={rows} columnDefs={columnDefs} rowIdKey="id" rowNumbers rowSelection />
        </React.StrictMode>,
      );
    });

    expect(container.querySelector(".pte-root")).toBeTruthy();
    await unmountTestRoot(root);
    expect(firstRef.current).toBeNull();
    expect(container.querySelector(".pte-root")).toBeNull();

    root = createRoot(container);
    const secondRef = React.createRef<IGridAPI | null>();
    await act(async () => {
      root.render(
        <React.StrictMode>
          <Grid ref={secondRef} rowData={rows} columnDefs={columnDefs} rowIdKey="id" rowNumbers rowSelection />
        </React.StrictMode>,
      );
    });

    let selectionEvents = 0;
    const off = secondRef.current!.on("selectionChanged", () => {
      selectionEvents += 1;
    });
    await act(async () => secondRef.current!.selectAllRows());
    expect(selectionEvents).toBe(1);
    off();

    await unmountTestRoot(root);
    container.remove();
  });

  it("does not run server-side source setup for a client-side grid", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await act(async () => {
      root.render(
        <React.StrictMode>
          <Grid rowData={rows} columnDefs={columnDefs} rowIdKey="id" />
        </React.StrictMode>,
      );
    });

    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes("server-side"))).toBe(false);
    warnSpy.mockRestore();

    await unmountTestRoot(root);
    container.remove();
  });

  it("wires provided sources for a server-side grid", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const getRows = vi.fn();
    const dataSource: IServerSideDataSource = {
      getRows,
    };
    const apiRef = React.createRef<IGridAPI | null>();

    await act(async () => {
      root.render(
        <Grid
          ref={apiRef}
          rowModelType="serverSide"
          serverSideDataSource={dataSource}
          columnDefs={columnDefs}
          rowIdKey="id"
        />,
      );
    });

    expect(apiRef.current!.getCore().getRowModel().getType()).toBe("serverSide");
    expect(apiRef.current!.getCore().getRowModel().isValid()).toBe(true);

    await unmountTestRoot(root);
    container.remove();
  });
});
