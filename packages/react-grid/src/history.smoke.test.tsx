// @vitest-environment happy-dom
// B8: the onHistoryChanged prop is bridged by a stable ref, so a re-render swaps the handler
// without recreating the grid, and undo/redo toolbar state arrives without polling.
import { beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";
import type { GridEventHistoryChangedParams, IGridAPI } from "./index";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string };
const COLS: ReactColDef[] = [
  { colId: "id", key: "id", label: "ID" },
  { colId: "name", key: "name", label: "Name", editable: true },
];
const DATA: Row[] = [{ id: 1, name: "AAA" }, { id: 2, name: "BBB" }];

async function mount(props: Record<string, unknown>) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const root = createRoot(container);
  const apiRef = React.createRef<IGridAPI | null>();
  await act(async () => {
    root.render(<Grid data={DATA} columnDefs={COLS} rowIdKey="id" ref={apiRef} {...props} />);
  });
  return { root, apiRef, container };
}

function nameCell(api: IGridAPI, rowId: string) {
  return { rowId, colId: api.getColumnModel().getByColId("name")!.instanceID };
}

describe("onHistoryChanged (React bridge)", () => {
  it("reports commit, undo, and redo with the stack snapshot", async () => {
    const onHistoryChanged = vi.fn<(ev: GridEventHistoryChangedParams) => void>();
    const { root, apiRef } = await mount({ onHistoryChanged });
    const api = apiRef.current!;

    await act(async () => { api.setCellValue(nameCell(api, "1"), "edited"); });
    expect(onHistoryChanged).toHaveBeenCalledTimes(1);
    expect(onHistoryChanged.mock.calls[0][0]).toMatchObject({
      reason: "commit", canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0,
    });

    await act(async () => { api.undo(); });
    expect(onHistoryChanged.mock.calls[1][0]).toMatchObject({
      reason: "undo", canUndo: false, canRedo: true,
    });

    await act(async () => { api.redo(); });
    expect(onHistoryChanged.mock.calls[2][0]).toMatchObject({ reason: "redo", canUndo: true });
    await unmountTestRoot(root);
  });

  it("fires once for a whole withUndoGroup scope, and not at all under withoutUndoHistory", async () => {
    const onHistoryChanged = vi.fn<(ev: GridEventHistoryChangedParams) => void>();
    const { root, apiRef } = await mount({ onHistoryChanged });
    const api = apiRef.current!;

    await act(async () => {
      api.withUndoGroup(() => {
        api.setCellValue(nameCell(api, "1"), "x");
        api.setCellValue(nameCell(api, "2"), "y");
      });
    });
    expect(onHistoryChanged).toHaveBeenCalledTimes(1);
    expect(api.getHistoryState().undoDepth).toBe(1);

    await act(async () => {
      api.withoutUndoHistory(() => api.setCellValue(nameCell(api, "1"), "external"));
    });
    expect(onHistoryChanged).toHaveBeenCalledTimes(1); // unchanged
    expect(api.getHistoryState().undoDepth).toBe(1);
    await unmountTestRoot(root);
  });

  it("picks up a replaced handler without recreating the grid", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const root = createRoot(container);
    const apiRef = React.createRef<IGridAPI | null>();

    const render = (handler: () => void) => act(async () => {
      root.render(
        <Grid
          data={DATA} columnDefs={COLS} rowIdKey="id" ref={apiRef}
          onHistoryChanged={handler}
        />,
      );
    });

    await render(first);
    const api = apiRef.current!;
    await render(second);
    expect(apiRef.current).toBe(api); // same instance across the re-render

    await act(async () => { api.setCellValue(nameCell(api, "1"), "edited"); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    await unmountTestRoot(root);
  });
});
