// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import { ColumnType } from "@agility-workbench/grid";
import type { FillHandleOptions, FillOperationParams, FillOperationResult, IGridAPI } from "@agility-workbench/grid";

/**
 * The fill handle through the React binding: the `fillHandle` prop reaches the grid at creation and
 * reconciles live, and a drag writes through the same change event the app already listens to.
 */

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string; qty: number };

type FillOperation = (params: FillOperationParams) => FillOperationResult | undefined;

async function mountGrid(fillHandle?: boolean | FillHandleOptions, fillOperation?: FillOperation) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const data: Row[] = [
    { id: 1, name: "AAA", qty: 1 },
    { id: 2, name: "BBB", qty: 2 },
    { id: 3, name: "CCC", qty: 3 },
    { id: 4, name: "DDD", qty: 4 },
  ];
  const sources: string[] = [];
  const root = createRoot(container);
  const render = async (next?: boolean | FillHandleOptions, operation?: FillOperation) => {
    await act(async () => {
      root.render(
        <Grid
          apiRef={apiRef}
          data={data}
          columnDefs={[
            { colId: "name", key: "name", label: "Name", editable: true },
            { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
          ]}
          rowIdKey="id"
          fillHandle={next}
          fillOperation={operation}
          onCellValueChanged={(ev) => sources.push(ev.source)}
        />,
      );
    });
  };
  await render(fillHandle, fillOperation);
  return { container, apiRef, render, root, data, sources };
}

function cell(container: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  return container.querySelector<HTMLElement>(`.pte-row[data-view-idx='${viewIdx}'] .pte-cell[data-col-idx='${colIdx}']`)!;
}

describe("React Grid fill handle", () => {
  it("shows the handle on an editable selection and writes a fill with source \"fill\"", async () => {
    const { container, apiRef, root, data, sources } = await mountGrid();
    const api = apiRef.current!;
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    const handle = container.querySelector<HTMLElement>(".pte-fill-handle")!;
    expect(handle).not.toBeNull();
    expect(handle.parentElement).toBe(cell(container, 0, 0));

    handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    cell(container, 2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(data.map(r => r.name)).toEqual(["AAA", "AAA", "AAA", "DDD"]);
    expect(sources).toEqual(["fill", "fill"]);
    expect(api.getSelection().range).toMatchObject({ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 0 });
    await unmountTestRoot(root);
  });

  it("reconciles the prop live: off removes the handle, on restores it, and options apply", async () => {
    const { container, apiRef, render, root, data } = await mountGrid(false);
    const api = apiRef.current!;
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 1, mode: "start" });
    api.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 1, mode: "extend" });
    expect(container.querySelector(".pte-fill-handle")).toBeNull();

    await render({ mode: "copy" });
    const handle = container.querySelector<HTMLElement>(".pte-fill-handle")!;
    expect(handle.parentElement).toBe(cell(container, 1, 1));

    // Copy mode: 1, 2 repeats as 1, 2 rather than continuing to 3, 4.
    handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    cell(container, 3, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(data.map(r => r.qty)).toEqual([1, 2, 1, 2]);

    await render(false);
    expect(container.querySelector(".pte-fill-handle")).toBeNull();
    await unmountTestRoot(root);
  });

  it("bridges fillOperation through a ref: its value is written, and a new function applies without a remount", async () => {
    const { container, apiRef, render, root, data } = await mountGrid(true, ({ defaultValue }) => ({ value: `${defaultValue}!` }));
    const api = apiRef.current!;
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    const drag = (to: number) => {
      const handle = container.querySelector<HTMLElement>(".pte-fill-handle")!;
      handle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
      cell(container, to, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    };
    drag(1);
    expect(data.map(r => r.name)).toEqual(["AAA", "AAA!", "CCC", "DDD"]);

    await render(true, ({ rowId }) => (rowId === "3" ? { skipCell: true } : undefined));
    expect(apiRef.current).toBe(api);
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    drag(3);
    expect(data.map(r => r.name)).toEqual(["AAA", "AAA", "CCC", "AAA"]);
    await unmountTestRoot(root);
  });
});
