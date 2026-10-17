// @vitest-environment happy-dom
// Every core event has a prop, bridged by a stable ref like the original event props: the new ones
// receive their events, and a re-render swaps a handler without recreating the grid or warning that
// a creation-only prop changed.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";
import type {
  GridEventBodyScrollParams,
  GridEventFirstDataRenderedParams,
  GridEventRowDataUpdatedParams,
  GridEventRowGroupOpenedParams,
  GridEventRowsChangedParams,
  IGridAPI,
} from "./index";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

afterEach(() => vi.restoreAllMocks());

const COLS: ReactColDef[] = [
  { colId: "id", key: "id", label: "ID" },
  { colId: "region", key: "region", label: "Region" },
];
const DATA = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, region: i % 2 ? "EMEA" : "AMER" }));

function host() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  return { container, root: createRoot(container), apiRef: React.createRef<IGridAPI | null>() };
}

describe("event props (React bridges)", () => {
  it("deliver the new events and follow a replaced handler", async () => {
    const warn = vi.spyOn(console, "warn");
    const { container, root, apiRef } = host();
    const firstData = vi.fn<(ev: GridEventFirstDataRenderedParams) => void>();
    const rowsChanged = vi.fn<(ev: GridEventRowsChangedParams) => void>();
    const bodyScroll = vi.fn<(ev: GridEventBodyScrollParams) => void>();
    const firstUpdate: GridEventRowDataUpdatedParams[] = [];
    const secondUpdate: GridEventRowDataUpdatedParams[] = [];
    const groupOpened: GridEventRowGroupOpenedParams[] = [];
    const render = (onRowDataUpdated: (ev: GridEventRowDataUpdatedParams) => void) => act(async () => {
      root.render(
        <Grid
          data={DATA} columnDefs={COLS} rowIdKey="id" ref={apiRef}
          onFirstDataRendered={firstData}
          onRowsChanged={rowsChanged}
          onBodyScroll={bodyScroll}
          onRowGroupOpened={(ev) => groupOpened.push(ev)}
          onRowDataUpdated={onRowDataUpdated}
        />,
      );
    });

    await render((ev) => firstUpdate.push(ev));
    const api = apiRef.current!;
    expect(firstData).toHaveBeenCalledTimes(1);
    expect(firstData).toHaveBeenCalledWith({ rowCount: 30 });
    expect(rowsChanged).toHaveBeenCalled();

    const body = container.querySelector<HTMLElement>(".pte-body")!;
    body.scrollTop = 120;
    body.dispatchEvent(new Event("scroll"));
    expect(bodyScroll).toHaveBeenCalledWith({ scrollTopPx: 120, scrollLeftPx: 0, direction: "vertical" });

    await act(async () => { api.applyTransaction({ remove: ["1"] }); });
    expect(firstUpdate.at(-1)).toEqual({ reason: "transaction", rowCount: 29 });

    await act(async () => {
      api.setRowGroupColumns(["region"]);
      api.setAllGroupsExpanded(true);
    });
    expect(groupOpened.at(-1)).toMatchObject({ expanded: true, source: "api" });

    // A new handler is live without a new grid, and the old one stops hearing events.
    const seenBeforeSwap = firstUpdate.length;
    await render((ev) => secondUpdate.push(ev));
    expect(apiRef.current).toBe(api);
    await act(async () => { api.applyTransaction({ remove: ["2"] }); });
    expect(firstUpdate).toHaveLength(seenBeforeSwap);
    expect(secondUpdate).toEqual([{ reason: "transaction", rowCount: expect.any(Number) }]);
    expect(firstData).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("onRowDataUpdated"));
    await unmountTestRoot(root);
  });
});
