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
  cellSelection?: boolean | "text";
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

/** Right-click a cell; returns the dispatched event so callers can inspect defaultPrevented. */
function contextmenu(el: HTMLElement): MouseEvent {
  const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  el.dispatchEvent(ev);
  return ev;
}

function bodyMenuOpen(container: HTMLElement): boolean {
  return !!container.ownerDocument.querySelector(".pte-menu");
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

  it("reverts to native text selection when cellSelection is 'text'", async () => {
    const { container, apiRef, root } = await mountGrid({ cellSelection: "text" });
    const api = apiRef.current!;
    // Grid selection stays off...
    await act(async () => { mousedown(bodyCells(container)[0]); });
    expect(api.getSelection().kind).toBe("none");
    // ...and the root opts cells into native text selection.
    const rootEl = container.querySelector<HTMLElement>("[data-pte-grid-id]")!;
    expect(rootEl.classList.contains("pte-text-selection")).toBe(true);
    root.unmount();
  });

  it("opens the body context menu on right-click by default (selecting the cell)", async () => {
    const { container, apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    const ev = await act(async () => contextmenu(bodyCells(container)[0]));
    expect(ev.defaultPrevented).toBe(true); // native menu suppressed
    expect(bodyMenuOpen(container)).toBe(true);
    expect(api.getSelection().kind).toBe("cell");
    root.unmount();
  });

  it("does not open the body menu or select on right-click when cellSelection is false", async () => {
    const { container, apiRef, root } = await mountGrid({ cellSelection: false });
    const api = apiRef.current!;
    const ev = await act(async () => contextmenu(bodyCells(container)[0]));
    expect(ev.defaultPrevented).toBe(false); // grid does not intercept
    expect(bodyMenuOpen(container)).toBe(false);
    expect(api.getSelection().kind).toBe("none");
    root.unmount();
  });

  it("lets the native context menu through (no grid menu, no selection) in 'text' mode", async () => {
    const { container, apiRef, root } = await mountGrid({ cellSelection: "text" });
    const api = apiRef.current!;
    const ev = await act(async () => contextmenu(bodyCells(container)[0]));
    expect(ev.defaultPrevented).toBe(false); // browser's own menu (Copy) appears
    expect(bodyMenuOpen(container)).toBe(false);
    expect(api.getSelection().kind).toBe("none");
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
