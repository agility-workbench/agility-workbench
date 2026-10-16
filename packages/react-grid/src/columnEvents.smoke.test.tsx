// @vitest-environment happy-dom
// onColumnsChanged / onPaginationChanged / onError are bridged by stable refs like the other event
// props: a re-render swaps the handler without recreating the grid or warning that a creation-only
// prop changed.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";
import type {
  GridEventColumnsChangedParams,
  GridEventErrorParams,
  GridEventPaginationChangedParams,
  IGridAPI,
  IServerSideDataSource,
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
  { colId: "name", key: "name", label: "Name", sortable: true },
];
const DATA = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));

function host() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  return { root: createRoot(container), apiRef: React.createRef<IGridAPI | null>() };
}

describe("onColumnsChanged (React bridge)", () => {
  it("reports column changes with their source and follows a replaced handler", async () => {
    const warn = vi.spyOn(console, "warn");
    const { root, apiRef } = host();
    const first: GridEventColumnsChangedParams[] = [];
    const second: GridEventColumnsChangedParams[] = [];
    const render = (onColumnsChanged: (ev: GridEventColumnsChangedParams) => void) => act(async () => {
      root.render(
        <Grid data={DATA} columnDefs={COLS} rowIdKey="id" ref={apiRef} onColumnsChanged={onColumnsChanged} />,
      );
    });

    await render((ev) => first.push(ev));
    const api = apiRef.current!;
    await act(async () => { api.applyColumnState([{ colId: "name", pinned: "left" }]); });
    expect(first.at(-1)).toMatchObject({ reason: "state", changedColIds: ["name"], source: "api" });

    const seenBeforeSwap = first.length;
    await render((ev) => second.push(ev));
    expect(apiRef.current).toBe(api);
    await act(async () => { api.setSortModel([{ colId: "name", dir: "asc" }]); });
    expect(first).toHaveLength(seenBeforeSwap);
    expect(second.at(-1)).toMatchObject({ reason: "sort", changedColIds: ["name"], source: "api" });
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("onColumnsChanged"));
    await unmountTestRoot(root);
  });
});

describe("onPaginationChanged (React bridge)", () => {
  it("reports page and page-size changes with getPaginationInfo()", async () => {
    const onPaginationChanged = vi.fn<(ev: GridEventPaginationChangedParams) => void>();
    const { root, apiRef } = host();
    await act(async () => {
      root.render(
        <Grid
          data={DATA} columnDefs={COLS} rowIdKey="id" ref={apiRef}
          pagination pageSize={10} pageSizes={[10, 20]} onPaginationChanged={onPaginationChanged}
        />,
      );
    });
    const api = apiRef.current!;
    onPaginationChanged.mockClear();
    await act(async () => { api.setPagination({ pageIndex: 2 }); });
    expect(onPaginationChanged).toHaveBeenCalled();
    expect(onPaginationChanged.mock.calls.at(-1)![0]).toMatchObject({
      pageIndex: 2, pageSize: 10, totalRowCount: 30, totalPageCount: 3,
    });
    expect(onPaginationChanged.mock.calls.at(-1)![0]).toEqual(api.getPaginationInfo());
    await unmountTestRoot(root);
  });
});

describe("onError (React bridge)", () => {
  it("reports a failed server-side request", async () => {
    const onError = vi.fn<(ev: GridEventErrorParams) => void>();
    const failure = new Error("backend down");
    const source: IServerSideDataSource = {
      getRows: ({ error }) => { setTimeout(() => error(failure), 0); },
    };
    const { root } = host();
    await act(async () => {
      root.render(
        <Grid
          columnDefs={COLS} rowIdKey="id" rowModelType="serverSide" serverSideDataSource={source}
          onError={onError}
        />,
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ code: "row_model_error", message: "backend down", details: failure });
    await unmountTestRoot(root);
  });
});
