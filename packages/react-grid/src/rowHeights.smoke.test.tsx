// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { GridOptions, IGridAPI } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string };
const data: Row[] = [{ id: 1, name: "AAA" }, { id: 2, name: "BBB" }, { id: 3, name: "CCC" }];

async function mountGrid(getRowHeight: GridOptions<Row>["getRowHeight"]) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI<Row> | null>();
  const root = createRoot(container);
  let current = getRowHeight;
  const render = async () => act(async () => {
    root.render(
      <Grid<Row>
        apiRef={apiRef}
        data={data}
        columnDefs={[{ colId: "name", key: "name", label: "Name" }]}
        rowIdKey="id"
        rowHeight={40}
        getRowHeight={current}
      />,
    );
  });
  await render();
  return {
    container,
    apiRef,
    root,
    rerender: async (next: GridOptions<Row>["getRowHeight"]) => {
      current = next;
      await render();
    },
  };
}

const spacerHeight = (container: HTMLElement) => container.querySelector<HTMLElement>(".pte-spacer")!.style.height;

describe("getRowHeight via Grid", () => {
  it("applies and live-updates getRowHeight without replacing the API", async () => {
    const { container, apiRef, root, rerender } = await mountGrid(({ data }) => (data?.name === "BBB" ? 100 : undefined));
    const api = apiRef.current!;
    expect(spacerHeight(container)).toBe("180px");

    await rerender(() => 20);
    expect(apiRef.current).toBe(api);
    expect(spacerHeight(container)).toBe("60px");

    await rerender(undefined);
    expect(spacerHeight(container)).toBe("120px");
    await unmountTestRoot(root);
  });
});
