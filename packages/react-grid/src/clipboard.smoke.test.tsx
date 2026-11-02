// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import { ColumnType } from "@agility-workbench/grid";
import type { ClipboardOptions, IGridAPI } from "@agility-workbench/grid";

/**
 * The `clipboard` prop through the React binding: it reaches the grid at creation, so copy uses its
 * delimiter, header row and cell hook, and `api.pasteText` splits on the same delimiter.
 */

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Row = { id: number; name: string; qty: number };

describe("React Grid clipboard prop", () => {
  it("shapes copy and pasteText", async () => {
    const writeText = vi.fn(async (_: string) => {});
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const apiRef = React.createRef<IGridAPI | null>();
    const data: Row[] = [
      { id: 1, name: "AAA", qty: 1 },
      { id: 2, name: "BBB", qty: 2 },
    ];
    const clipboard: ClipboardOptions<Row> = {
      delimiter: ";",
      copyHeaders: true,
      processCellForClipboard: ({ value, colId }) => (colId === "qty" ? `#${value}` : value),
    };
    const root = createRoot(container);
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
          clipboard={clipboard}
        />,
      );
    });
    const api = apiRef.current!;
    api.dispatch({ type: "rangeSelectSet", viewIdx: 0, colIdx: 0, mode: "start" });
    api.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 1, mode: "extend" });
    api.copySelection();
    expect(writeText).toHaveBeenLastCalledWith("Name;Qty\nAAA;#1\nBBB;#2");

    api.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 0, mode: "start" });
    let pasted = false;
    await act(async () => { pasted = api.pasteText("ZZZ;9"); });
    expect(pasted).toBe(true);
    expect(data[1]).toMatchObject({ name: "ZZZ", qty: 9 });
    await unmountTestRoot(root);
    container.remove();
  });
});
