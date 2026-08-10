// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";
import type { ReactColDef } from "./cellRenderer";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

async function mountGrid(columnDefs: ReactColDef[], gridProps: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={[{ id: 1, name: "AAA" }, { id: 2, name: "BBB" }]}
        columnDefs={columnDefs}
        rowIdKey="id"
        {...gridProps}
      />,
    );
  });
  return { container, apiRef, root };
}

function headerFor(container: HTMLElement, api: IGridAPI, colId: string): HTMLElement {
  const instanceId = api.getColumnModel().getByColId(colId)!.instanceID;
  return container.querySelector<HTMLElement>(`.pte-hcell#${instanceId}`)!;
}

function menuBtn(header: HTMLElement): HTMLElement | null {
  return header.querySelector<HTMLElement>(".pte-hcell-menu-menuBtn");
}

const COLS: ReactColDef[] = [
  { colId: "id", key: "id", label: "ID" },
  { colId: "name", key: "name", label: "Name" },
];

describe("showColumnMenu", () => {
  it("renders the menu button by default", async () => {
    const { container, apiRef, root } = await mountGrid(COLS);
    expect(menuBtn(headerFor(container, apiRef.current!, "name"))).not.toBeNull();
    await unmountTestRoot(root);
  });

  it("omits the menu button when showColumnMenu is false", async () => {
    const { container, apiRef, root } = await mountGrid([
      { colId: "id", key: "id", label: "ID" },
      { colId: "name", key: "name", label: "Name", showColumnMenu: false },
    ]);
    const api = apiRef.current!;
    expect(menuBtn(headerFor(container, api, "name"))).toBeNull();
    // Other columns keep their button.
    expect(menuBtn(headerFor(container, api, "id"))).not.toBeNull();
    await unmountTestRoot(root);
  });
});

describe("columnContextMenu", () => {
  function rightClick(el: HTMLElement): MouseEvent {
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    el.dispatchEvent(ev);
    return ev;
  }
  function columnMenuOpen(container: HTMLElement): boolean {
    return !!container.ownerDocument.querySelector(".pte-menu");
  }

  it("opens the column menu on header right-click by default", async () => {
    const { container, apiRef, root } = await mountGrid(COLS);
    const header = headerFor(container, apiRef.current!, "name");
    const ev = await act(async () => rightClick(header));
    expect(ev.defaultPrevented).toBe(true);
    expect(columnMenuOpen(container)).toBe(true);
    await unmountTestRoot(root);
  });

  it("lets the native menu through when columnContextMenu is false", async () => {
    const { container, apiRef, root } = await mountGrid([
      { colId: "id", key: "id", label: "ID" },
      { colId: "name", key: "name", label: "Name", columnContextMenu: false },
    ]);
    const header = headerFor(container, apiRef.current!, "name");
    const ev = await act(async () => rightClick(header));
    expect(ev.defaultPrevented).toBe(false);
    expect(columnMenuOpen(container)).toBe(false);
    await unmountTestRoot(root);
  });
});

describe("showColumnButtonsOnHover", () => {
  it("adds the root class only when enabled", async () => {
    const off = await mountGrid(COLS);
    expect(off.container.querySelector("[data-pte-grid-id]")!.classList.contains("pte-column-buttons-on-hover")).toBe(false);
    await unmountTestRoot(off.root);

    const on = await mountGrid(COLS, { showColumnButtonsOnHover: true });
    expect(on.container.querySelector("[data-pte-grid-id]")!.classList.contains("pte-column-buttons-on-hover")).toBe(true);
    await unmountTestRoot(on.root);
  });
});
