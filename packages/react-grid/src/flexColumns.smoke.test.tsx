// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import type { ReactColDef } from "./cellRenderer";

// happy-dom has no layout: the centre section measures 600px, everything else 0.
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) { return this.classList.contains("pte-spacer") ? 600 : 0; },
  });
});
afterAll(() => {
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
});

const DATA = [{ id: 1, a: "a", b: "b", c: "c" }];

describe("flex columns (React)", () => {
  it("passes ColDef.flex through, live on a columnDefs change", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const apiRef = React.createRef<IGridAPI | null>();
    const root = createRoot(container);
    const cols = (bFlex: number): ReactColDef[] => [
      { colId: "a", key: "a", label: "A", width: 100 },
      { colId: "b", key: "b", label: "B", flex: bFlex },
      { colId: "c", key: "c", label: "C", flex: 1 },
    ];
    await act(async () => {
      root.render(<Grid apiRef={apiRef} data={DATA} columnDefs={cols(1)} rowIdKey="id" />);
    });
    const width = (colId: string) => apiRef.current!.getColumnModel().getByColId(colId)!.computedWidth;
    expect(width("b")).toBe(250);
    expect(width("c")).toBe(250);
    expect(apiRef.current!.getColumnState().find(s => s.colId === "b")!.flex).toBe(1);

    await act(async () => {
      root.render(<Grid apiRef={apiRef} data={DATA} columnDefs={cols(4)} rowIdKey="id" />);
    });
    expect(width("b")).toBe(400);
    expect(width("c")).toBe(100);
    await unmountTestRoot(root);
    container.remove();
  });
});
