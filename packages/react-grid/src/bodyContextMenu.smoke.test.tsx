// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import type { MenuItem } from "./menu";
import type { BodyMenuContext } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: number; name: string };

async function mountGrid(bodyContextMenu?: boolean | ((p: { ctx: BodyMenuContext; items: MenuItem[] }) => MenuItem[])) {
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
        bodyContextMenu={bodyContextMenu}
      />,
    );
  });

  return { container, apiRef, root };
}

function firstCell(container: HTMLElement): HTMLElement {
  const row = container.querySelector<HTMLElement>(".pte-row[data-view-idx='0']")!;
  return row.querySelector<HTMLElement>(".pte-cell:not(.pte-row-number-cell)")!;
}

function rightClick(el: HTMLElement): MouseEvent {
  const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  el.dispatchEvent(ev);
  return ev;
}

function menuLabels(container: HTMLElement): string[] {
  return Array.from(container.ownerDocument.querySelectorAll(".pte-menu .pte-menu-item-text"))
    .map((el) => el.textContent ?? "");
}

function menuOpen(container: HTMLElement): boolean {
  return !!container.ownerDocument.querySelector(".pte-menu");
}

describe("bodyContextMenu", () => {
  it("shows the default body menu when omitted", async () => {
    const { container, root } = await mountGrid();
    const ev = await act(async () => rightClick(firstCell(container)));
    expect(ev.defaultPrevented).toBe(true);
    expect(menuOpen(container)).toBe(true);
    expect(menuLabels(container)).toContain("Copy");
    await unmountTestRoot(root);
  });

  it("shows the default body menu when true", async () => {
    const { container, root } = await mountGrid(true);
    await act(async () => rightClick(firstCell(container)));
    expect(menuOpen(container)).toBe(true);
    await unmountTestRoot(root);
  });

  it("lets the native menu through when false (no grid menu, no preventDefault)", async () => {
    const { container, root } = await mountGrid(false);
    const ev = await act(async () => rightClick(firstCell(container)));
    expect(ev.defaultPrevented).toBe(false);
    expect(menuOpen(container)).toBe(false);
    await unmountTestRoot(root);
  });

  it("renders exactly the items returned by a callback", async () => {
    const { container, root } = await mountGrid(({ items }) => [
      ...items,
      { id: "custom", label: "My action", onClick: () => {} },
    ]);
    const ev = await act(async () => rightClick(firstCell(container)));
    expect(ev.defaultPrevented).toBe(true);
    const labels = menuLabels(container);
    expect(labels).toContain("Copy");
    expect(labels).toContain("My action");
    await unmountTestRoot(root);
  });

  it("shows nothing (but suppresses the native menu) when the callback returns []", async () => {
    const { container, root } = await mountGrid(() => []);
    const ev = await act(async () => rightClick(firstCell(container)));
    // Grid still owns the gesture — native menu suppressed — but no menu is rendered.
    expect(ev.defaultPrevented).toBe(true);
    expect(menuOpen(container)).toBe(false);
    await unmountTestRoot(root);
  });
});
