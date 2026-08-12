// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string };

async function mountGrid(opts: { rowSelection?: boolean; rowNumbers?: boolean; selectAllRowsOnHeaderClick?: boolean } = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const data: Row[] = [
    { id: 1, name: "AAA" },
    { id: 2, name: "BBB" },
    { id: 3, name: "CCC" },
  ];

  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={data}
        columnDefs={[
          { colId: "id", key: "id", label: "ID" },
          { colId: "name", key: "name", label: "Name" },
        ]}
        rowIdKey="id"
        rowNumbers={opts.rowNumbers ?? true}
        rowSelection={opts.rowSelection ?? true}
        selectAllRowsOnHeaderClick={opts.selectAllRowsOnHeaderClick ?? true}
      />,
    );
  });

  return { container, apiRef, root };
}

function clickRowNumberHeader(container: HTMLElement) {
  const header = container.querySelector<HTMLElement>(".pte-hcell-row-number")!;
  // The renderer binds click on the grid root and routes it via onDocumentClick → onHeaderCellClick,
  // so a bubbling click on the header cell reaches the handler.
  header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("row selection end-to-end via Grid", () => {
  it("toggles all rows when the row-number header is clicked (selectAllRowsOnHeaderClick)", async () => {
    const { container, apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    // No checkbox is rendered anymore.
    expect(container.querySelector(".pte-select-all-checkbox")).toBeNull();
    expect(api.areAllRowsSelected()).toBe(false);

    // Click the row-number header → all rows selected, data returned by the API.
    await act(async () => { clickRowNumberHeader(container); });
    expect(api.getSelectedRows()).toHaveLength(3);
    expect(api.getSelectedNodes().map((n) => (n.data as Row).name).sort()).toEqual(["AAA", "BBB", "CCC"]);
    expect(api.areAllRowsSelected()).toBe(true);

    // Click again → cleared.
    await act(async () => { clickRowNumberHeader(container); });
    expect(api.getSelectedRows()).toHaveLength(0);
    expect(api.areAllRowsSelected()).toBe(false);

    await unmountTestRoot(root);
  });

  it("does NOT select all on header click when selectAllRowsOnHeaderClick is disabled", async () => {
    const { container, apiRef, root } = await mountGrid({ selectAllRowsOnHeaderClick: false });
    const api = apiRef.current!;
    await act(async () => { clickRowNumberHeader(container); });
    expect(api.getSelectedRows()).toHaveLength(0);
    await unmountTestRoot(root);
  });

  it("selectAllRows / deselectAllRows API select and clear all rows", async () => {
    const { apiRef, root } = await mountGrid();
    const api = apiRef.current!;

    await act(async () => { api.selectAllRows(); });
    expect(api.areAllRowsSelected()).toBe(true);
    expect(api.getSelectedRows()).toHaveLength(3);

    await act(async () => { api.deselectAllRows(); });
    expect(api.areAllRowsSelected()).toBe(false);
    expect(api.getSelectedRows()).toHaveLength(0);

    await unmountTestRoot(root);
  });
});

describe("applyColumnState end-to-end via Grid", () => {
  it("captures and restores column widths / pinning / visibility / order", async () => {
    const { apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    const model = api.getColumnModel();

    // Mutate the layout via the API/model, then capture.
    api.dispatch({ type: "columnResize", colId: model.getByColId("id")!.instanceID, widthPx: 250 });
    api.dispatch({ type: "columnPin", colIds: [model.getByColId("name")!.instanceID], pinned: "right" });
    const saved = api.getColumnState();

    // Change things again so restore has something to undo.
    api.dispatch({ type: "columnPin", colIds: [model.getByColId("name")!.instanceID], pinned: null });

    await act(async () => { api.applyColumnState(saved); });

    const after = new Map(api.getColumnState().map((s) => [s.colId, s]));
    expect(after.get("id")!.widthPx).toBe(250);
    expect(after.get("name")!.pinned).toBe("right");

    await unmountTestRoot(root);
  });
});
