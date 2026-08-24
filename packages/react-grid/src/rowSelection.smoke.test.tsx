// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { GridOptions, IGridAPI } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string };

type MountOptions = {
  rowSelection?: GridOptions["rowSelection"];
  rowNumbers?: boolean;
  selectAllRowsOnHeaderClick?: boolean;
  isRowSelectable?: GridOptions["isRowSelectable"];
};

async function mountGrid(opts: MountOptions = {}) {
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
  let currentOptions = opts;
  const render = async () => act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={data}
        columnDefs={[
          { colId: "id", key: "id", label: "ID" },
          { colId: "name", key: "name", label: "Name" },
        ]}
        rowIdKey="id"
        rowNumbers={currentOptions.rowNumbers ?? true}
        rowSelection={currentOptions.rowSelection ?? true}
        selectAllRowsOnHeaderClick={currentOptions.selectAllRowsOnHeaderClick ?? true}
        isRowSelectable={currentOptions.isRowSelectable}
      />,
    );
  });
  await render();

  return {
    container,
    apiRef,
    root,
    rerender: async (next: MountOptions) => {
      currentOptions = { ...currentOptions, ...next };
      await render();
    },
  };
}

function clickRowNumberHeader(container: HTMLElement) {
  const header = container.querySelector<HTMLElement>(".pte-hcell-row-number")!;
  // The renderer binds click on the grid root and routes it via onDocumentClick → onHeaderCellClick,
  // so a bubbling click on the header cell reaches the handler.
  header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("row selection end-to-end via Grid", () => {
  it("updates checkbox selection options without replacing the API", async () => {
    const { container, apiRef, root, rerender } = await mountGrid({
      rowNumbers: false,
      rowSelection: { mode: "multiple", checkboxes: true },
    });
    const api = apiRef.current!;
    api.selectRowsById(["1", "2"]);

    await rerender({
      rowSelection: {
        mode: "single",
        checkboxes: true,
        checkboxColumnPinned: "right",
        checkboxColumnPinnable: false,
      },
    });

    expect(apiRef.current).toBe(api);
    expect(api.getSelection().selectedRowIds).toEqual(["1"]);
    expect(container.querySelector(".pte-select-all-checkbox")).toBeNull();
    expect(container.querySelector(".pte-hcell-checkbox .pte-hcell-menu-menuBtn")).toBeNull();
    expect(api.getColumnModel().getRightLeaves()[0].isSelectionCheckboxColumn()).toBe(true);

    await unmountTestRoot(root);
  });

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

  it("applies and live-updates isRowSelectable without replacing the API", async () => {
    const { container, apiRef, root, rerender } = await mountGrid({
      rowNumbers: false,
      rowSelection: { checkboxes: true },
      isRowSelectable: (node) => (node.data as Row).name !== "BBB",
    });
    const api = apiRef.current!;

    // The disabled row is painted inert and excluded from select-all.
    expect(container.querySelectorAll(".pte-checkbox-cell-disabled")).toHaveLength(1);
    await act(async () => { api.selectAllRows(); });
    expect(api.getSelection().selectedRowIds.sort()).toEqual(["1", "3"]);
    expect(api.areAllRowsSelected()).toBe(true);

    // Swapping the predicate reconciles through updateGridOptions: repaint + prune.
    await act(async () => {
      await rerender({ isRowSelectable: (node) => (node.data as Row).name !== "AAA" });
    });
    expect(apiRef.current).toBe(api);
    expect(api.getSelection().selectedRowIds).toEqual(["3"]); // "1" pruned, "2" re-enabled
    const disabled = container.querySelectorAll<HTMLElement>(".pte-checkbox-cell-disabled");
    expect(disabled).toHaveLength(1);
    expect(disabled[0].getAttribute("aria-disabled")).toBe("true");

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
