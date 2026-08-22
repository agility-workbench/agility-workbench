// @vitest-environment happy-dom
/**
 * ColDef.columnMenu — the vanilla path for column-menu customization, mirroring how
 * GridOptions.bodyContextMenu works for the body menu.
 *
 *  - a function customizes the items for that column's own menu,
 *  - `defaultColDef` carries it to every column,
 *  - `false` is a hard veto over both entry points (button and right-click),
 *  - multi-column menus keep the built-in items, since no one column speaks for the set.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../createGrid";
import type { ColDef, DefaultColDef } from "../interfaces/column";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { MenuItem } from "../interfaces/menuItem";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;
let api: IGridAPI | undefined;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "800px";
  document.body.appendChild(host);
  api = undefined;
});

function mount(columnDefs: ColDef[], defaultColDef?: DefaultColDef): IGridAPI {
  api = createGrid(host, {
    columnDefs,
    defaultColDef,
    rowData: [{ name: "Widget", price: 1, qty: 2 }],
    columnSelection: true,
  });
  return api;
}

/** Click a column's ⋮ button and return the rendered menu overlay, if any. */
function openMenuFor(colIndex: number): HTMLElement | null {
  const buttons = host.querySelectorAll<HTMLElement>(".pte-hcell-menu-menuBtn");
  buttons[colIndex]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return document.querySelector<HTMLElement>(".pte-menu");
}

const labels = (menu: HTMLElement | null) =>
  [...(menu?.querySelectorAll(".pte-menu-item-text") ?? [])].map(el => el.textContent?.trim());

const cols: ColDef[] = [
  { key: "name", label: "Name" },
  { key: "price", label: "Price" },
];

describe("ColDef.columnMenu — item getter", () => {
  it("appends a simple label/icon/onClick item to the grid's own items", () => {
    const onClick = vi.fn();
    mount([
      {
        ...cols[0],
        columnMenu: ({ items }) => [...items, { label: "Audit", left: "my-icon", onClick }],
      },
      cols[1],
    ]);

    const menu = openMenuFor(0)!;
    expect(labels(menu)).toContain("Audit");
    // `left` as a string is applied as a CSS class on the item's icon span.
    expect(menu.querySelector(".pte-menu-item-icon-left.my-icon")).not.toBeNull();

    const audit = [...menu.querySelectorAll<HTMLElement>(".pte-menu-item")]
      .find(el => el.textContent?.includes("Audit"))!;
    audit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("receives the grid's built-in items so they can be filtered or replaced", () => {
    let received: MenuItem[] = [];
    mount([
      {
        ...cols[0],
        columnMenu: ({ items }) => {
          received = items;
          return [{ label: "Only mine" }];
        },
      },
      cols[1],
    ]);

    const menu = openMenuFor(0);
    expect(received.length).toBeGreaterThan(0);
    expect(labels(menu)).toEqual(["Only mine"]);
  });

  it("passes the resolved column, whose colId is the public one", () => {
    const seen: string[] = [];
    mount([
      {
        ...cols[0],
        colId: "name",
        columnMenu: ({ ctx, column, items }) => {
          seen.push(column.colId);
          // ctx.targetColId is the internal instance id — this is exactly why `column` is passed.
          expect(ctx.targetColId).toBe(column.instanceID);
          return items;
        },
      },
      cols[1],
    ]);

    openMenuFor(0);
    expect(seen).toEqual(["name"]);
  });

  it("opens no menu when the getter returns an empty array", () => {
    mount([{ ...cols[0], columnMenu: () => [] }, cols[1]]);

    expect(openMenuFor(0)).toBeNull();
  });

  it("applies to every column when set on defaultColDef", () => {
    mount(cols, { columnMenu: ({ items }) => [...items, { label: "Everywhere" }] });

    expect(labels(openMenuFor(0))).toContain("Everywhere");
    document.querySelector(".pte-menu")?.remove();
    expect(labels(openMenuFor(1))).toContain("Everywhere");
  });

  it("lets a column override the defaultColDef getter", () => {
    mount(
      [{ ...cols[0], columnMenu: ({ items }) => [...items, { label: "Mine" }] }, cols[1]],
      { columnMenu: ({ items }) => [...items, { label: "Default" }] },
    );

    const first = labels(openMenuFor(0));
    expect(first).toContain("Mine");
    expect(first).not.toContain("Default");

    document.querySelector(".pte-menu")?.remove();
    expect(labels(openMenuFor(1))).toContain("Default");
  });

  it("is not consulted when the menu targets several selected columns", () => {
    const getter = vi.fn(({ items }) => [...items, { label: "Single only" }]);
    const grid = mount([{ ...cols[0], colId: "name", columnMenu: getter }, { ...cols[1], colId: "price" }]);

    grid.selectColumn("name");
    grid.selectColumn("price", "toggle");
    const menu = openMenuFor(0);

    expect(getter).not.toHaveBeenCalled();
    expect(labels(menu)).not.toContain("Single only");
  });
});

describe("ColDef.columnMenu — false veto", () => {
  it("hides the ⋮ button for that column only", () => {
    mount([{ ...cols[0], columnMenu: false }, cols[1]]);

    // One button remains — the second column's.
    expect(host.querySelectorAll(".pte-hcell-menu-menuBtn")).toHaveLength(1);
  });

  it("lets the browser's native menu through on right-click", () => {
    mount([{ ...cols[0], columnMenu: false }, cols[1]]);

    const header = host.querySelector<HTMLElement>(".pte-hcell")!;
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    header.dispatchEvent(ev);

    // Not prevented => the native context menu appears instead of the grid's.
    expect(ev.defaultPrevented).toBe(false);
    expect(document.querySelector(".pte-menu")).toBeNull();
  });

  it("overrides showColumnMenu and columnContextMenu", () => {
    mount([
      { ...cols[0], columnMenu: false, showColumnMenu: true, columnContextMenu: true },
      cols[1],
    ]);

    expect(host.querySelectorAll(".pte-hcell-menu-menuBtn")).toHaveLength(1);

    const header = host.querySelector<HTMLElement>(".pte-hcell")!;
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    header.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("removes every column's menu when set on defaultColDef", () => {
    mount(cols, { columnMenu: false });

    expect(host.querySelectorAll(".pte-hcell-menu-menuBtn")).toHaveLength(0);
  });

  it("leaves the finer-grained flags working on their own", () => {
    mount([
      // Button hidden, right-click still opens the grid menu.
      { ...cols[0], showColumnMenu: false },
      cols[1],
    ]);

    expect(host.querySelectorAll(".pte-hcell-menu-menuBtn")).toHaveLength(1);

    const header = host.querySelector<HTMLElement>(".pte-hcell")!;
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    header.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
