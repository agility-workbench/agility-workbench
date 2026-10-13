// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import type { GridProps } from "./interface";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

const columnDefs = [
  { colId: "name", key: "name", label: "Name" },
  { colId: "price", key: "price", label: "Price" },
];
const data = [{ id: 1, name: "Widget", price: 1 }];

async function mountGrid(props: Partial<GridProps>) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  const render = (p: Partial<GridProps>) =>
    act(async () => {
      root.render(
        <Grid apiRef={apiRef} data={data} columnDefs={columnDefs} rowIdKey="id" columnSelection {...p} />,
      );
    });
  await render(props);
  return { container, apiRef, root, render };
}

/** Select both columns and open the menu from the first column's ⋮ button. */
async function openMultiColumnMenu(container: HTMLElement, api: IGridAPI): Promise<string[]> {
  document.querySelector(".pte-menu")?.remove();
  await act(async () => {
    api.selectColumn("name");
    api.selectColumn("price", "toggle");
  });
  await act(async () => {
    container
      .querySelector<HTMLElement>(".pte-hcell-menu-menuBtn")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return [...document.querySelectorAll(".pte-menu .pte-menu-item-text")].map(el => el.textContent ?? "");
}

describe("multiColumnMenu prop", () => {
  it("calls the getter when a multi-column menu opens, with the selected columns", async () => {
    const getter = vi.fn(({ items }) => [...items, { label: "Bulk audit" }]);
    const { container, apiRef, root } = await mountGrid({ multiColumnMenu: getter });

    const labels = await openMultiColumnMenu(container, apiRef.current!);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(getter.mock.calls[0][0].columns.map((c: { colId: string }) => c.colId).sort())
      .toEqual(["name", "price"]);
    expect(labels).toContain("Bulk audit");

    await unmountTestRoot(root);
    container.remove();
  });

  it("renders React-node slots returned by the getter", async () => {
    const { container, apiRef, root } = await mountGrid({
      multiColumnMenu: ({ items }) => [...items, { label: "Tagged", left: <b className="react-slot">!</b> }],
    });
    await openMultiColumnMenu(container, apiRef.current!);
    expect(document.querySelector(".pte-menu .react-slot")).not.toBeNull();
    await unmountTestRoot(root);
    container.remove();
  });

  it("calls the latest getter after a re-render", async () => {
    const first = vi.fn(({ items }) => items);
    const second = vi.fn(({ items }) => [...items, { label: "Second" }]);
    const { container, apiRef, root, render } = await mountGrid({ multiColumnMenu: first });
    await render({ multiColumnMenu: second });

    const labels = await openMultiColumnMenu(container, apiRef.current!);
    expect(first).not.toHaveBeenCalled();
    expect(labels).toContain("Second");
    await unmountTestRoot(root);
    container.remove();
  });

  it("false opens no multi-column menu", async () => {
    const { container, apiRef, root } = await mountGrid({ multiColumnMenu: false });
    const labels = await openMultiColumnMenu(container, apiRef.current!);
    expect(labels).toEqual([]);
    expect(document.querySelector(".pte-menu")).toBeNull();
    await unmountTestRoot(root);
    container.remove();
  });
});
