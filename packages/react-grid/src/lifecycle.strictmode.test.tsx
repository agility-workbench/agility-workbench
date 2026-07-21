// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import React, { useState } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { IGridAPI, IServerSideDataSource } from "@agility-workbench/grid";

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

    await act(async () => root.unmount());
    container.remove();
  });

  it("allows onGridReady to synchronously update parent React state without render-phase warnings", async () => {
    const container = createContainer();
    const root = createRoot(container);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
    expect(errorSpy.mock.calls.some((call) => String(call[0]).includes("Cannot update a component while rendering a different component"))).toBe(false);

    errorSpy.mockRestore();
    await act(async () => root.unmount());
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
    await act(async () => objectRoot.unmount());
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
    await act(async () => callbackRoot.unmount());
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
    await act(async () => root.unmount());
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

    await act(async () => root.unmount());
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

    await act(async () => root.unmount());
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

    await act(async () => root.unmount());
    container.remove();
  });
});
