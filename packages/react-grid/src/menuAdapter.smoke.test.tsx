// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { MenuItem } from "./menu";
import type { ReactColDef } from "./cellRenderer";
import type { IGridAPI } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

const COLS: ReactColDef[] = [
  { colId: "id", key: "id", label: "ID" },
  { colId: "name", key: "name", label: "Name" },
];
const DATA = [{ id: 1, name: "AAA" }, { id: 2, name: "BBB" }];

async function mount(props: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(<Grid apiRef={apiRef} rowData={DATA} columnDefs={COLS} rowIdKey="id" {...props} />);
  });
  return { container, apiRef, root };
}

function header(container: HTMLElement, api: IGridAPI, colId: string): HTMLElement {
  const instanceId = api.getColumnModel().getByColId(colId)!.instanceID;
  return container.querySelector<HTMLElement>(`.pte-hcell#${instanceId}`)!;
}

describe("getColumnMenuItems with React-node slots", () => {
  it("renders custom items whose left slot is a React element", async () => {
    const onClick = vi.fn();
    const getColumnMenuItems = ({ items }: { items: MenuItem[] }): MenuItem[] => [
      ...items,
      {
        id: "custom",
        label: "Custom item",
        left: <b className="react-menu-icon">R</b>,
        onClick,
      },
    ];
    const { container, apiRef, root } = await mount({ getColumnMenuItems });

    await act(async () => {
      header(container, apiRef.current!, "name")
        .querySelector<HTMLButtonElement>(".pte-hcell-menu-menuBtn")!
        .click();
    });

    const menu = container.querySelector<HTMLElement>(".pte-menu");
    expect(menu).not.toBeNull();
    expect(menu!.textContent).toContain("Custom item");
    // The left slot mounted as a real React element through the menu adapter.
    expect(menu!.querySelector(".react-menu-icon")?.textContent).toBe("R");

    await act(async () => {
      menu!.querySelector<HTMLElement>('[data-item-id="custom"]')!.click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
    await unmountTestRoot(root);
  });

  it("keeps the default items when the callback appends to them", async () => {
    let defaultCount = 0;
    const getColumnMenuItems = ({ items }: { items: MenuItem[] }): MenuItem[] => {
      defaultCount = items.length;
      return [...items, { id: "extra", label: "Extra", onClick: () => undefined }];
    };
    const { container, apiRef, root } = await mount({ getColumnMenuItems });

    await act(async () => {
      header(container, apiRef.current!, "name")
        .querySelector<HTMLButtonElement>(".pte-hcell-menu-menuBtn")!
        .click();
    });

    expect(defaultCount).toBeGreaterThan(0);
    const menu = container.querySelector<HTMLElement>(".pte-menu")!;
    expect(menu.querySelectorAll("[data-item-id]").length).toBeGreaterThan(1);
    expect(menu.textContent).toContain("Extra");
    await unmountTestRoot(root);
  });
});
