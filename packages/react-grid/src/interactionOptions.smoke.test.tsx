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

type Row = { id: number; name: string; city: string };

interface Opts {
  cellSelection?: boolean | "text";
  rangeSelection?: boolean;
  columnSelection?: boolean;
  rowNumbers?: boolean;
  rowSelection?: boolean;
  rowInsertionMenu?: {
    createRow: (params: any) => any;
    canInsert?: (params: any) => boolean;
  };
  bodyContextMenu?: boolean | ((params: { items: any[] }) => any[]);
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
  const render = async (nextOpts: Opts) => {
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
          cellSelection={nextOpts.cellSelection}
          rangeSelection={nextOpts.rangeSelection}
          columnSelection={nextOpts.columnSelection}
          rowNumbers={nextOpts.rowNumbers}
          rowSelection={nextOpts.rowSelection}
          rowInsertionMenu={nextOpts.rowInsertionMenu}
          bodyContextMenu={nextOpts.bodyContextMenu}
        />,
      );
    });
  };
  await render(opts);

  return { container, apiRef, root, render };
}

/** Cells in the first row, in DOM order, excluding the row-number cell. */
function bodyCells(container: HTMLElement): HTMLElement[] {
  const rows = Array.from(container.querySelectorAll<HTMLElement>(".pte-row[data-view-idx='0']"));
  return rows
    .map(row => Array.from(row.querySelectorAll<HTMLElement>(
      ".pte-cell[data-col-idx]:not(.pte-row-number-cell):not(.pte-checkbox-cell)",
    )))
    .find(cells => cells.length > 0) ?? [];
}

function rowNumberCell(container: HTMLElement, viewIdx: number): HTMLElement {
  return Array.from(container.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}']`))
    .map(row => row.querySelector<HTMLElement>(".pte-row-number-cell"))
    .find((cell): cell is HTMLElement => cell != null)!;
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
    await unmountTestRoot(root);
  });

  it("does not select or focus a cell when cellSelection is false", async () => {
    const { container, apiRef, root } = await mountGrid({ cellSelection: false });
    const api = apiRef.current!;
    await act(async () => { mousedown(bodyCells(container)[0]); });
    expect(api.getSelection().kind).toBe("none");
    expect(api.getSelection().active).toBeNull();
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
  });

  it("opens the body context menu on right-click by default (selecting the cell)", async () => {
    const { container, apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    const ev = await act(async () => contextmenu(bodyCells(container)[0]));
    expect(ev.defaultPrevented).toBe(true); // native menu suppressed
    expect(bodyMenuOpen(container)).toBe(true);
    expect(api.getSelection().kind).toBe("cell");
    await unmountTestRoot(root);
  });

  it("does not open the body menu or select on right-click when cellSelection is false", async () => {
    const { container, apiRef, root } = await mountGrid({ cellSelection: false });
    const api = apiRef.current!;
    const ev = await act(async () => contextmenu(bodyCells(container)[0]));
    expect(ev.defaultPrevented).toBe(false); // grid does not intercept
    expect(bodyMenuOpen(container)).toBe(false);
    expect(api.getSelection().kind).toBe("none");
    await unmountTestRoot(root);
  });

  it("lets the native context menu through (no grid menu, no selection) in 'text' mode", async () => {
    const { container, apiRef, root } = await mountGrid({ cellSelection: "text" });
    const api = apiRef.current!;
    const ev = await act(async () => contextmenu(bodyCells(container)[0]));
    expect(ev.defaultPrevented).toBe(false); // browser's own menu (Copy) appears
    expect(bodyMenuOpen(container)).toBe(false);
    expect(api.getSelection().kind).toBe("none");
    await unmountTestRoot(root);
  });
});

describe("row-number context menu", () => {
  it("selects the whole row on right-click even when ordinary cell selection is disabled", async () => {
    const { container, apiRef, root } = await mountGrid({
      cellSelection: false,
      rowNumbers: true,
      rowSelection: true,
    });
    const ev = await act(async () => contextmenu(rowNumberCell(container, 1)));
    expect(ev.defaultPrevented).toBe(true);
    expect(bodyMenuOpen(container)).toBe(true);
    expect(apiRef.current!.getSelection().selectedRowIds).toEqual(["2"]);
    await unmountTestRoot(root);
  });

  it("includes the row number in a full-row range and preserves that range on right-click", async () => {
    const { container, apiRef, root } = await mountGrid({ rowNumbers: true, rowSelection: true });
    const cells = bodyCells(container);
    const rowNumber = rowNumberCell(container, 0);
    await act(async () => { mousedown(cells[0]); });
    expect(rowNumber.classList.contains("selected")).toBe(false);

    await act(async () => {
      cells[cells.length - 1].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    expect(apiRef.current!.getSelection().range).toMatchObject({
      rowStart: 0,
      rowEnd: 0,
      colStart: 1,
      colEnd: 3,
    });
    expect(rowNumber.classList.contains("selected")).toBe(true);

    const before = apiRef.current!.getSelection().range;
    await act(async () => { contextmenu(rowNumber); });
    expect(apiRef.current!.getSelection().range).toEqual(before);
    expect(apiRef.current!.getSelection().selectedRowIds).toEqual([]);
    await unmountTestRoot(root);
  });

  it("shows the opt-in Insert submenu and executes insertion without cell or row selection", async () => {
    const { container, apiRef, root } = await mountGrid({
      cellSelection: false,
      rowNumbers: true,
      rowSelection: false,
      rowInsertionMenu: {
        createRow: ({ position, rowId }: any) => ({
          id: 10,
          name: `${position}-${rowId}`,
          city: "LDN",
        }),
      },
    });

    const ev = await act(async () => contextmenu(rowNumberCell(container, 1)));
    expect(ev.defaultPrevented).toBe(true);
    const insert = Array.from(document.querySelectorAll<HTMLElement>(".pte-menu-item"))
      .find(item => item.textContent?.includes("Insert"))!;
    await act(async () => { insert.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const above = Array.from(document.querySelectorAll<HTMLElement>(".pte-menu-item"))
      .find(item => item.textContent?.includes("1 row above"))!;
    expect(above).toBeTruthy();
    await act(async () => { above.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    const ids: string[] = [];
    apiRef.current!.forEachNodeAfterFilter(node => ids.push(node.id));
    expect(ids).toEqual(["1", "10", "2", "3", "4"]);
    expect(apiRef.current!.getSelection().kind).toBe("none");
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
  });

  it("does not select a column when columnSelection is false", async () => {
    const { container, apiRef, root } = await mountGrid({ columnSelection: false });
    const api = apiRef.current!;
    await act(async () => { clickHeader(container, api, "name"); });
    expect(api.getSelection().kind).not.toBe("column");
    await unmountTestRoot(root);
  });
});

describe("interaction options update live", () => {
  it("applies cell/range/column selection and native body-menu transitions in place", async () => {
    const { container, apiRef, root, render } = await mountGrid({
      cellSelection: true,
      rangeSelection: true,
      columnSelection: true,
      bodyContextMenu: true,
    });
    const originalApi = apiRef.current!;

    await act(async () => { mousedown(bodyCells(container)[0]); });
    expect(originalApi.getSelection().kind).toBe("cell");

    await render({
      cellSelection: "text",
      rangeSelection: false,
      columnSelection: false,
      bodyContextMenu: false,
    });
    expect(apiRef.current).toBe(originalApi);
    expect(originalApi.getSelection().kind).toBe("none");
    expect(container.querySelector("[data-pte-grid-id]")!.classList.contains("pte-text-selection")).toBe(true);
    expect(contextmenu(bodyCells(container)[0]).defaultPrevented).toBe(false);

    await render({
      cellSelection: true,
      rangeSelection: false,
      columnSelection: false,
      bodyContextMenu: true,
    });
    const cells = bodyCells(container);
    await act(async () => {
      mousedown(cells[0]);
      cells[2].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    expect(originalApi.getSelection().kind).toBe("cell");

    const nameId = originalApi.getColumnModel().getByColId("name")!.instanceID;
    const header = container.querySelector<HTMLElement>(`.pte-hcell#${nameId} .pte-hcell-content`)!;
    await act(async () => header.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(originalApi.getSelection().kind).not.toBe("column");

    await render({
      cellSelection: true,
      rangeSelection: true,
      columnSelection: true,
      bodyContextMenu: true,
    });
    const liveHeader = container.querySelector<HTMLElement>(`.pte-hcell#${nameId} .pte-hcell-content`)!;
    await act(async () => liveHeader.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(originalApi.getSelection().kind).toBe("column");

    await unmountTestRoot(root);
    container.remove();
  });
});
