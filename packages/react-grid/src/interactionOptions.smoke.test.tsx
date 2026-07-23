// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
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

type Row = { id: number; name: string; city: string };

interface Opts {
  cellSelection?: boolean;
  rangeSelection?: boolean;
  columnSelection?: boolean;
}

async function mountGrid(opts: Opts = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const data: Row[] = [
    { id: 1, name: "AAA", city: "NY" },
    { id: 2, name: "BBB", city: "LA" },
    { id: 3, name: "CCC", city: "SF" },
    { id: 4, name: "DDD", city: "BOS" },
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
          { colId: "city", key: "city", label: "City" },
        ]}
        rowIdKey="id"
        cellSelection={opts.cellSelection}
        rangeSelection={opts.rangeSelection}
        columnSelection={opts.columnSelection}
      />,
    );
  });

  return { container, apiRef, root };
}

/** Cells in the first row, in DOM order, excluding the row-number cell. */
function bodyCells(container: HTMLElement): HTMLElement[] {
  const row = container.querySelector<HTMLElement>(".pte-row[data-view-idx='0']")!;
  return Array.from(row.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-row-number-cell)"));
}

function mousedown(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
}

describe("cellSelection", () => {
  it("selects a cell on click by default", async () => {
    const { container, apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    await act(async () => { mousedown(bodyCells(container)[0]); });
    expect(api.getSelection().kind).toBe("cell");
    root.unmount();
  });

  it("does not select or focus a cell when cellSelection is false", async () => {
    const { container, apiRef, root } = await mountGrid({ cellSelection: false });
    const api = apiRef.current!;
    await act(async () => { mousedown(bodyCells(container)[0]); });
    expect(api.getSelection().kind).toBe("none");
    expect(api.getSelection().active).toBeNull();
    root.unmount();
  });
});

describe("rangeSelection", () => {
  it("extends a range with mouse drag by default", async () => {
    const { container, apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    const cells = bodyCells(container);
    await act(async () => {
      mousedown(cells[0]);
      cells[2].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    expect(api.getSelection().kind).toBe("range");
    root.unmount();
  });

  it("stays a single cell when rangeSelection is false", async () => {
    const { container, apiRef, root } = await mountGrid({ rangeSelection: false });
    const api = apiRef.current!;
    const cells = bodyCells(container);
    await act(async () => {
      mousedown(cells[0]);
      cells[2].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    // Click still selects the single starting cell, but the drag did not extend it.
    expect(api.getSelection().kind).toBe("cell");
    root.unmount();
  });

  it("does not extend with Shift+Arrow when rangeSelection is false", async () => {
    const { container, apiRef, root } = await mountGrid({ rangeSelection: false });
    const api = apiRef.current!;
    await act(async () => { mousedown(bodyCells(container)[0]); });
    const rootEl = container.querySelector<HTMLElement>("[data-pte-grid-id]")!;
    await act(async () => {
      rootEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }));
    });
    expect(api.getSelection().kind).toBe("cell");
    root.unmount();
  });
});

describe("columnSelection", () => {
  function clickHeader(container: HTMLElement, api: IGridAPI, colId: string) {
    const instanceId = api.getColumnModel().getByColId(colId)!.instanceID;
    const header = container.querySelector<HTMLElement>(`.pte-hcell#${instanceId}`)!;
    const content = header.querySelector<HTMLElement>(".pte-hcell-content") ?? header;
    content.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("selects a column on header click by default", async () => {
    const { container, apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    await act(async () => { clickHeader(container, api, "name"); });
    expect(api.getSelection().kind).toBe("column");
    root.unmount();
  });

  it("does not select a column when columnSelection is false", async () => {
    const { container, apiRef, root } = await mountGrid({ columnSelection: false });
    const api = apiRef.current!;
    await act(async () => { clickHeader(container, api, "name"); });
    expect(api.getSelection().kind).not.toBe("column");
    root.unmount();
  });
});
