// @vitest-environment happy-dom
/**
 * Two related behaviours that keep a multi-column menu from being read as a single-column one:
 *
 *  - the ⋮ button and a header right-click settle the selection the same way, so both gestures
 *    open the same menu for the same state,
 *  - a multi-column menu names its scope in a `MenuItem.isLabel` caption.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../createGrid";
import type { ColDef } from "../interfaces/column";
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
  { colId: "total", key: "total", label: "Total" },
];

function mount(): IGridAPI {
  return createGrid(host, {
    columnDefs: cols,
    rowData: [{ name: "Widget", price: 1, qty: 2, total: 2 }],
    columnSelection: true,
  });
}

const closeMenu = () => document.querySelector(".pte-menu")?.remove();

function clickMenuButton(colIndex: number) {
  closeMenu();
  host.querySelectorAll<HTMLElement>(".pte-hcell-menu-menuBtn")[colIndex]
    ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function rightClickHeader(colIndex: number) {
  closeMenu();
  host.querySelectorAll<HTMLElement>(".pte-hcell")[colIndex]
    ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
}

const itemLabels = () =>
  [...document.querySelectorAll(".pte-menu .pte-menu-item-text")].map(el => el.textContent?.trim());

const captionEl = () => document.querySelector<HTMLElement>(".pte-menu .pte-menu-item-label");

describe("the ⋮ button and right-click open the same menu", () => {
  it("both act on the whole selection when opened from inside it", () => {
    const api = mount();
    api.selectColumn("name");
    api.selectColumn("price", "toggle");

    clickMenuButton(0);
    const fromButton = itemLabels();

    rightClickHeader(0);
    const fromRightClick = itemLabels();

    expect(fromButton).toEqual(fromRightClick);
    expect(fromButton).toContain("Hide Columns");
    api.destroy();
  });

  it("both narrow to the clicked column when opened from outside it", () => {
    const api = mount();
    api.selectColumn("price");
    api.selectColumn("qty", "toggle");

    clickMenuButton(0); // name — outside the selection
    const fromButton = itemLabels();
    expect(api.getSelection().selectedColIds).toEqual(["name"]);

    api.selectColumn("price");
    api.selectColumn("qty", "toggle");
    rightClickHeader(0);
    const fromRightClick = itemLabels();

    expect(fromButton).toEqual(fromRightClick);
    expect(fromButton).toContain("Hide Column");
    api.destroy();
  });

  it("both open the same group-wide menu from a group header", () => {
    // A group header's menu is inherently about its leaves. Before both gestures settled scope the
    // same way, its ⋮ button offered "Hide Column" where a right-click offered "Hide Columns".
    const api = createGrid(host, {
      columnDefs: [{
        colId: "financials", key: "financials", label: "Financials",
        children: [
          { colId: "price", key: "price", label: "Price" },
          { colId: "qty", key: "qty", label: "Qty" },
        ],
      }],
      rowData: [{ price: 1, qty: 2 }],
      columnSelection: true,
    });

    // The group header element contains its leaves' headers, so pick the button it owns itself.
    const groupHeader = host.querySelector<HTMLElement>(".pte-hcell")!;
    const groupButton = [...groupHeader.querySelectorAll<HTMLElement>(".pte-hcell-menu-menuBtn")]
      .find(b => b.closest(".pte-hcell") === groupHeader)!;

    closeMenu();
    groupButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const fromButton = itemLabels();

    api.clearSelection("columns");
    closeMenu();
    groupHeader.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const fromRightClick = itemLabels();

    expect(fromButton).toEqual(fromRightClick);
    expect(fromButton).toContain("Hide Columns");
    api.destroy();
  });

  it("leaves a cell selection alone when the button opens an ordinary menu", () => {
    // A header button is a control, not a choice of cell: opening a menu must not discard the
    // user's cell/row selection the way a column-selection gesture does.
    const api = mount();
    api.selectRange(0, 1);
    api.extendRangeTo(0, 2);
    const before = api.getSelection();
    expect(before.range, "precondition: a cell range exists").not.toBeNull();

    clickMenuButton(0);

    expect(api.getSelection().range).toEqual(before.range);
    api.destroy();
  });
});

describe("multi-column menus name their scope", () => {
  it("captions the menu with the column names while the list is short", () => {
    const api = mount();
    api.selectColumn("name");
    api.selectColumn("price", "toggle");
    clickMenuButton(0);

    expect(captionEl()?.textContent?.trim()).toBe("Name, Price");
    api.destroy();
  });

  it("falls back to a count once too many columns are selected", () => {
    const api = mount();
    api.selectColumn("name");
    api.selectColumn("price", "toggle");
    api.selectColumn("qty", "toggle");
    api.selectColumn("total", "toggle");
    clickMenuButton(0);

    expect(captionEl()?.textContent?.trim()).toBe("4 columns");
    api.destroy();
  });

  it("adds no caption to a single-column menu", () => {
    const api = mount();
    clickMenuButton(0);

    expect(captionEl()).toBeNull();
    api.destroy();
  });

  it("renders the caption as inert text, not a command", () => {
    const api = mount();
    api.selectColumn("name");
    api.selectColumn("price", "toggle");
    clickMenuButton(0);

    const caption = captionEl()!;
    // Not a button, not a menuitem, and outside the arrow-key ring.
    expect(caption.tagName).not.toBe("BUTTON");
    expect(caption.getAttribute("role")).toBe("presentation");
    expect(caption.hasAttribute("data-item-id")).toBe(false);
    expect(caption.matches("[tabindex]")).toBe(false);
    api.destroy();
  });

  it("carries the scope in the menu's accessible name too", () => {
    // The caption is role="presentation", so AT driving the menu by its items would never reach it.
    const api = mount();
    api.selectColumn("name");
    api.selectColumn("price", "toggle");
    clickMenuButton(0);

    expect(document.querySelector(".pte-menu")?.getAttribute("aria-label")).toBe("Column menu, 2 columns");

    api.clearSelection("columns");
    clickMenuButton(0);
    expect(document.querySelector(".pte-menu")?.getAttribute("aria-label")).toBe("Column menu");
    api.destroy();
  });

  it("lets an application relabel or drop the caption by its stable id", () => {
    const api = createGrid(host, {
      columnDefs: cols,
      rowData: [{ name: "a", price: 1, qty: 2, total: 3 }],
      columnSelection: true,
      multiColumnMenu: ({ columns, items }) =>
        items.map(item =>
          item.id === "selectionScope"
            ? { ...item, label: `Editing ${columns.length} fields` }
            : item,
        ),
    });
    api.selectColumn("name");
    api.selectColumn("price", "toggle");
    clickMenuButton(0);

    expect(captionEl()?.textContent?.trim()).toBe("Editing 2 fields");
    api.destroy();
  });
});

describe("MenuItem.isLabel as a general item category", () => {
  it("can be injected anywhere in the list, more than once", () => {
    const api = createGrid(host, {
      columnDefs: cols,
      rowData: [{ name: "a", price: 1, qty: 2, total: 3 }],
      defaultColDef: {
        columnMenu: () => [
          { isLabel: true, label: "Danger zone" },
          { label: "Reset", onClick: () => undefined },
          { isLabel: true, label: "Reporting", left: "my-icon" },
          { label: "Export", onClick: () => undefined },
        ],
      },
    });

    clickMenuButton(0);

    const captions = [...document.querySelectorAll(".pte-menu .pte-menu-item-label")]
      .map(el => el.textContent?.trim());
    expect(captions).toEqual(["Danger zone", "Reporting"]);
    // Only the real commands are focusable menu items.
    expect(itemLabels()).toEqual(["Danger zone", "Reset", "Reporting", "Export"]);
    expect(document.querySelectorAll(".pte-menu [role='menuitem']")).toHaveLength(2);
    // Icon slots work on a caption just as they do on a command.
    expect(document.querySelector(".pte-menu-item-label .my-icon")).not.toBeNull();
    api.destroy();
  });
});
