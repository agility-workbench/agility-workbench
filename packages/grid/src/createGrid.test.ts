// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "./createGrid";
import { GridAPI } from "./api";
import { GridCore } from "./core/core";
import { ColumnType } from "./interfaces/column";
import type { MenuItem } from "./interfaces/menuItem";
import { CanvasMeasurer } from "./renderer";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "600px";
  document.body.appendChild(host);
});

const columnDefs = [
  { key: "name", label: "Name", type: ColumnType.STRING },
  { key: "price", label: "Price", type: ColumnType.NUMBER },
];

describe("createGrid", () => {
  it("mounts, renders columns and rows, and returns a working API in one call", () => {
    const api = createGrid(host, {
      rowIdKey: "id",
      columnDefs,
      rowData: [
        { id: 1, name: "Widget", price: 9.99 },
        { id: 2, name: "Gadget", price: 4.5 },
      ],
    });

    expect(host.textContent).toContain("Name");
    expect(host.textContent).toContain("Widget");
    expect(host.textContent).toContain("Gadget");
    // The returned handle is the real API, not a stub.
    const seen: unknown[] = [];
    api.forEachNodeAfterFilterAndSort(node => seen.push(node));
    expect(seen).toHaveLength(2);

    api.destroy();
  });

  it("works with no options at all", () => {
    const api = createGrid(host);
    expect(host.childElementCount).toBeGreaterThan(0);
    api.destroy();
  });

  it("forwards GridOptions to the core", () => {
    const api = createGrid(host, { columnDefs, rowData: [{ name: "a" }], rowHeight: 61 });
    expect(host.innerHTML).toContain("61");
    api.destroy();
  });

  it("keeps caller-supplied columns authoritative when row data arrives later", () => {
    const api = createGrid(host, { columnDefs });
    // A schema inferred from this row would introduce an `extra` column; the caller's
    // definitions must win (this is why createGrid uses setColumnDefsFromProps).
    api.setRowData([{ name: "Widget", price: 1, extra: "should not become a column" }]);

    expect(host.textContent).toContain("Name");
    expect(host.textContent).not.toContain("extra");
    api.destroy();
  });

  it("wires both menu adapters internally, so built-in menus open with their default items", () => {
    const api = createGrid(host, { columnDefs, rowData: [{ name: "a", price: 1 }] });

    // Opening the real column menu exercises the internally supplied IMenuAdapter end to end;
    // without one, MenuCoordinator.openColumnMenu would throw on resolveMenuItems.
    // `.pte-hcell-menu-btn` also matches the filter button and group expander; the column
    // menu is specifically the menuBtn variant.
    const menuButton = host.querySelector<HTMLElement>(".pte-hcell-menu-menuBtn");
    expect(menuButton).not.toBeNull();
    menuButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const menu = document.querySelector(".pte-menu");
    expect(menu).not.toBeNull();
    // The built-in items are what a host without a framework should get.
    expect(menu!.querySelectorAll(".pte-menu-item").length).toBeGreaterThan(0);

    api.destroy();
  });

  it("wires the body menu adapter internally, so the body context menu opens", () => {
    const api = createGrid(host, { columnDefs, rowData: [{ name: "a", price: 1 }] });

    const cell = host.querySelector<HTMLElement>(".pte-cell");
    expect(cell).not.toBeNull();
    cell!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 5, clientY: 5 }));

    expect(document.querySelector(".pte-menu")).not.toBeNull();
    api.destroy();
  });

  it("detaches the renderer and empties the container on destroy", () => {
    const api = createGrid(host, { columnDefs, rowData: [{ name: "Widget", price: 1 }] });
    expect(host.textContent).toContain("Widget");

    api.destroy();

    expect(host.textContent).not.toContain("Widget");
    expect(host.childElementCount).toBe(0);
  });

  it("is idempotent on repeated destroy", () => {
    const api = createGrid(host, { columnDefs });
    api.destroy();
    expect(() => api.destroy()).not.toThrow();
    expect(() => api.destroy()).not.toThrow();
  });

  it("supports several independent grids on the page", () => {
    const second = document.createElement("div");
    second.style.height = "400px";
    document.body.appendChild(second);

    const a = createGrid(host, { columnDefs, rowData: [{ name: "Alpha", price: 1 }] });
    const b = createGrid(second, { columnDefs, rowData: [{ name: "Beta", price: 2 }] });

    expect(host.textContent).toContain("Alpha");
    expect(host.textContent).not.toContain("Beta");
    expect(second.textContent).toContain("Beta");

    // Destroying one must not disturb the other.
    a.destroy();
    expect(second.textContent).toContain("Beta");
    b.destroy();
  });

  it("rejects a missing container", () => {
    expect(() => createGrid(null as unknown as HTMLElement)).toThrow(/container element is required/);
  });
});

describe("menu adapters", () => {
  const rowData = [{ name: "a", price: 1 }];

  /** Adapter that appends one labelled item and reports what it was handed / when it was cleaned up. */
  function spyAdapter(label: string) {
    const calls: { defaults: string[] }[] = [];
    let cleanups = 0;
    return {
      calls,
      cleanups: () => cleanups,
      adapter: {
        resolveMenuItems: (_ctx: unknown, defaults: MenuItem[]) => {
          calls.push({ defaults: defaults.map(item => item.label ?? "") });
          return {
            items: [...defaults, { id: label, label, onClick: () => undefined }],
            cleanup: () => { cleanups += 1; },
          };
        },
      },
    };
  }

  function openColumnMenu(): void {
    const menuButton = host.querySelector<HTMLElement>(".pte-hcell-menu-menuBtn");
    expect(menuButton).not.toBeNull();
    menuButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  function openBodyMenu(): void {
    const cell = host.querySelector<HTMLElement>(".pte-cell");
    expect(cell).not.toBeNull();
    cell!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 5, clientY: 5 }));
  }

  function menuLabels(): string[] {
    return Array.from(document.querySelectorAll(".pte-menu-item"))
      .map(item => item.textContent?.trim() ?? "");
  }

  /** Re-opening closes the previous menu first, which is what runs its adapter's cleanup. */
  function closeMenu(): void {
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    document.querySelectorAll(".pte-menu").forEach(menu => menu.remove());
  }

  it("splices the menuAdapter option's items into the column menu", () => {
    const spy = spyAdapter("From adapter");
    const api = createGrid(host, { columnDefs, rowData, menuAdapter: spy.adapter });

    openColumnMenu();

    expect(menuLabels()).toContain("From adapter");
    // The adapter is handed the built-in items, so it can extend rather than replace them.
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0].defaults.length).toBeGreaterThan(0);
    expect(menuLabels().length).toBeGreaterThan(1);

    api.destroy();
  });

  it("runs the adapter's cleanup when the menu closes", () => {
    const spy = spyAdapter("From adapter");
    const api = createGrid(host, { columnDefs, rowData, menuAdapter: spy.adapter });

    openColumnMenu();
    expect(spy.cleanups()).toBe(0);
    closeMenu();
    expect(spy.cleanups()).toBe(1);

    api.destroy();
  });

  it("installs an adapter after creation, effective on the next open", () => {
    const api = createGrid(host, { columnDefs, rowData });

    openColumnMenu();
    const builtIn = menuLabels();
    expect(builtIn.length).toBeGreaterThan(0);
    expect(builtIn).not.toContain("Registered later");
    closeMenu();

    const spy = spyAdapter("Registered later");
    api.registerMenuAdapter(spy.adapter);

    openColumnMenu();
    expect(menuLabels()).toContain("Registered later");
    // Purely additive: the built-in items are still there.
    expect(menuLabels()).toEqual([...builtIn, "Registered later"]);

    api.destroy();
  });

  it("replaces an adapter supplied at creation", () => {
    const first = spyAdapter("First");
    const api = createGrid(host, { columnDefs, rowData, menuAdapter: first.adapter });

    api.registerMenuAdapter(spyAdapter("Second").adapter);
    openColumnMenu();

    expect(menuLabels()).toContain("Second");
    expect(menuLabels()).not.toContain("First");
    expect(first.calls).toHaveLength(0);

    api.destroy();
  });

  it("restores the built-in items when the adapter is removed with null", () => {
    const api = createGrid(host, { columnDefs, rowData, menuAdapter: spyAdapter("From adapter").adapter });

    openColumnMenu();
    const withAdapter = menuLabels();
    expect(withAdapter).toContain("From adapter");
    closeMenu();

    api.registerMenuAdapter(null);
    openColumnMenu();

    expect(menuLabels()).not.toContain("From adapter");
    expect(menuLabels()).toEqual(withAdapter.filter(label => label !== "From adapter"));

    api.destroy();
  });

  it("leaves the column and body slots independent", () => {
    const column = spyAdapter("Column item");
    const body = spyAdapter("Body item");
    const api = createGrid(host, {
      columnDefs,
      rowData,
      menuAdapter: column.adapter,
      bodyMenuAdapter: body.adapter,
    });

    openBodyMenu();
    expect(menuLabels()).toContain("Body item");
    expect(menuLabels()).not.toContain("Column item");
    expect(column.calls).toHaveLength(0);
    closeMenu();

    openColumnMenu();
    expect(menuLabels()).toContain("Column item");
    expect(body.calls).toHaveLength(1);

    api.destroy();
  });

  it("installs a body menu adapter after creation", () => {
    const api = createGrid(host, { columnDefs, rowData });

    openBodyMenu();
    const builtIn = menuLabels();
    expect(builtIn.length).toBeGreaterThan(0);
    closeMenu();

    api.registerBodyMenuAdapter(spyAdapter("Body item").adapter);
    openBodyMenu();
    expect(menuLabels()).toEqual([...builtIn, "Body item"]);

    api.destroy();
  });

  it("warns instead of throwing when an api has no menu wiring", () => {
    const api = new GridAPI(new GridCore(new CanvasMeasurer(), {}));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    api.registerMenuAdapter(spyAdapter("x").adapter);
    api.registerBodyMenuAdapter(spyAdapter("y").adapter);

    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
