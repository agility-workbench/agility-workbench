// @vitest-environment happy-dom
/**
 * GridOptions.multiColumnMenu — the grid-level hook for the column menu opened over several
 * selected columns, where the built-in items act on the whole set and no single column's
 * ColDef.columnMenu applies.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createGrid } from "../createGrid";
import { GridCore } from "../core/core";
import { CanvasMeasurer, initDomRenderer } from "../renderer";
import { MenuCoordinator } from "./coordinator";
import { ColumnMenuService } from "./columnMenuService";
import type { MenuItem } from "../interfaces/menuItem";
import type { ColDef } from "../interfaces/column";
import type { CreateGridOptions } from "../createGrid";
import type { IGridAPI } from "../interfaces/iGridAPI";

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
  host.style.width = "900px";
  document.body.appendChild(host);
});

const cols: ColDef[] = [
  { colId: "name", key: "name", label: "Name" },
  { colId: "price", key: "price", label: "Price" },
  { colId: "qty", key: "qty", label: "Qty" },
];

function mount(options: Partial<CreateGridOptions> = {}): IGridAPI {
  return createGrid(host, {
    columnDefs: cols,
    rowData: [{ name: "Widget", price: 1, qty: 2 }],
    columnSelection: true,
    ...options,
  });
}

/** Click a column's ⋮ button and return the rendered menu overlay, if any. */
function openMenuFor(colIndex: number): HTMLElement | null {
  document.querySelector(".pte-menu")?.remove();
  const buttons = host.querySelectorAll<HTMLElement>(".pte-hcell-menu-menuBtn");
  buttons[colIndex]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return document.querySelector<HTMLElement>(".pte-menu");
}

const labels = (menu: HTMLElement | null) =>
  [...(menu?.querySelectorAll(".pte-menu-item-text") ?? [])].map(el => el.textContent?.trim());

describe("multiColumnMenu — getter", () => {
  it("customizes the menu when several columns are selected", () => {
    const api = mount({
      multiColumnMenu: ({ items }) => [...items, { label: "Bulk audit" }],
    });
    api.selectColumn("name");
    api.selectColumn("price", "toggle");

    expect(labels(openMenuFor(0))).toContain("Bulk audit");
    api.destroy();
  });

  it("is not consulted for a single-column menu", () => {
    const getter = vi.fn(({ items }) => items);
    const api = mount({ multiColumnMenu: getter });

    openMenuFor(0);
    expect(getter).not.toHaveBeenCalled();
    api.destroy();
  });

  it("receives the selection with the target first", () => {
    const seen: string[][] = [];
    const api = mount({
      multiColumnMenu: ({ columns, items }) => (seen.push(columns.map(c => c.colId)), items),
    });
    api.selectColumn("price");
    api.selectColumn("qty", "toggle");
    // Open from a column inside the selection: the menu is about the whole selection.
    openMenuFor(1);

    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe("price");
    expect([...seen[0]].sort()).toEqual(["price", "qty"].sort());
    api.destroy();
  });

  it("narrows to the clicked column when the ⋮ button is outside the selection", () => {
    // The ⋮ button reconciles the selection exactly as a header right-click does, so it can never
    // open a menu about columns the user did not click. This is what makes the two gestures agree.
    const getter = vi.fn(({ items }) => items);
    const api = mount({ multiColumnMenu: getter });

    api.selectColumn("price");
    api.selectColumn("qty", "toggle");
    openMenuFor(0); // name's button — outside the selection

    expect(getter).not.toHaveBeenCalled();
    expect(api.getSelection().selectedColIds).toEqual(["name"]);
    api.destroy();
  });

  it("opens no menu when the getter returns an empty array", () => {
    const api = mount({ multiColumnMenu: () => [] });
    api.selectColumn("name");
    api.selectColumn("price", "toggle");

    expect(openMenuFor(0)).toBeNull();
    api.destroy();
  });

  it("still runs the single-column ColDef.columnMenu getter for single-column menus", () => {
    const api = mount({
      columnDefs: [{ ...cols[0], columnMenu: ({ items }) => [...items, { label: "Just me" }] }, cols[1]],
      multiColumnMenu: ({ items }) => [...items, { label: "Bulk" }],
    });

    const single = labels(openMenuFor(0));
    expect(single).toContain("Just me");
    expect(single).not.toContain("Bulk");
    api.destroy();
  });
});

describe("multiColumnMenu — false", () => {
  it("opens nothing while several columns are selected", () => {
    const api = mount({ multiColumnMenu: false });
    api.selectColumn("name");
    api.selectColumn("price", "toggle");

    expect(openMenuFor(0)).toBeNull();
    api.destroy();
  });

  it("leaves single-column menus untouched", () => {
    const api = mount({ multiColumnMenu: false });

    expect(openMenuFor(0)).not.toBeNull();
    api.destroy();
  });

  it("is a hard veto the menu adapter cannot undo", () => {
    // A framework binding's adapter runs after an application getter, so `[]` from a getter can be
    // put back. `false` must not be recoverable that way.
    const resolveMenuItems = vi.fn(() => ({
      items: [{ label: "Adapter item" }],
      cleanup: () => undefined,
    }));

    const core = new GridCore(new CanvasMeasurer(), { multiColumnMenu: false, columnSelection: true });
    const { renderer, api } = initDomRenderer(core, { resolveMenuItems });

    renderer.attach(host);
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps(cols);
    api.setRowData([{ name: "a", price: 1, qty: 2 }]);

    api.selectColumn("name");
    api.selectColumn("price", "toggle");
    openMenuFor(0);

    expect(document.querySelector(".pte-menu")).toBeNull();
    expect(resolveMenuItems).not.toHaveBeenCalled();

    renderer.detach();
    renderer.destroy();
    core.destroy();
  });
});

describe("column group headers", () => {
  const grouped: ColDef[] = [
    {
      colId: "financials",
      key: "financials",
      label: "Financials",
      children: [
        { colId: "price", key: "price", label: "Price" },
        { colId: "qty", key: "qty", label: "Qty" },
      ],
    },
  ];

  it("routes a multi-leaf group header to the multi-column getter", () => {
    // Selecting a group expands to its visible leaves, so one gesture on one header still opens a
    // multi-column menu. The getter sees the group followed by its leaves.
    const seen: string[][] = [];
    const api = createGrid(host, {
      columnDefs: grouped,
      rowData: [{ price: 1, qty: 2 }],
      columnSelection: true,
      multiColumnMenu: ({ columns, items }) => (seen.push(columns.map(c => c.colId)), items),
    });

    const groupHeader = host.querySelector<HTMLElement>(".pte-hcell")!;
    groupHeader.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    expect(seen).toHaveLength(1);
    // The union still earns its keep here: selection holds the *leaves*, so the group — which is
    // the target, and which the built-in items also act on — is never among ctx.colIds.
    expect(seen[0][0]).toBe("financials");
    expect(seen[0]).toContain("price");
    expect(seen[0]).toContain("qty");
    api.destroy();
  });
});

describe("aggregate flyout", () => {
  /**
   * The flyout is built by running the whole column-menu pipeline and lifting the aggregate item's
   * subMenu out of the result. Handing that synthetic menu to an application getter let a getter
   * that replaces the items — rather than extending them — silently empty the flyout.
   */
  const passThrough = { resolveMenuItems: (_c: unknown, d: MenuItem[]) => ({ items: d, cleanup: () => undefined }) };

  function coordinatorFor(columnMenu: ColDef["columnMenu"]) {
    const core = new GridCore(new CanvasMeasurer(), { defaultColDef: { columnMenu } });
    core.setColumnDefsFromProps([{ colId: "price", key: "price", label: "Price" }]);
    const targetColId = core.getColumnModel().getByColId("price")!.instanceID;
    return {
      coordinator: new MenuCoordinator(new ColumnMenuService(core), passThrough, core),
      ctx: { trigger: "columnMenuButton" as const, targetColId, colIds: [targetColId] },
    };
  }

  it("keeps its built-in items when a getter would otherwise replace the whole menu", () => {
    const getter = vi.fn(() => [{ label: "Only mine" }]);
    const { coordinator, ctx } = coordinatorFor(getter);

    const session = coordinator.openColumnMenu({ ...ctx, __suppressAppMenuItems: true } as never);

    expect(getter).not.toHaveBeenCalled();
    // The aggregate item the flyout lifts its submenu from survived.
    expect(session.items.some(i => i.id === "aggregateColumns" || i.command === "aggregateColumns")).toBe(true);
    expect(session.items.map(i => i.label)).not.toContain("Only mine");
  });

  it("does not affect an ordinary column menu, which still reaches the getter", () => {
    const getter = vi.fn(() => [{ label: "Only mine" }]);
    const { coordinator, ctx } = coordinatorFor(getter);

    const session = coordinator.openColumnMenu(ctx);

    expect(getter).toHaveBeenCalledTimes(1);
    expect(session.items.map(i => i.label)).toEqual(["Only mine"]);
  });
});
