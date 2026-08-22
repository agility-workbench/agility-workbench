// @vitest-environment happy-dom
/**
 * Menu accelerators, end-to-end through a mounted grid's body context menu:
 *  - a built-in item whose `command` has a keyboard binding shows that binding's chord (Copy →
 *    Ctrl+C) with nothing written on the item;
 *  - `MenuItem.shortcut` renders as a display hint on application items;
 *  - an explicit `right` slot and the submenu arrow both win over the accelerator.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../createGrid";
import type { IGridAPI } from "../interfaces/iGridAPI";
import type { MenuItem } from "../interfaces/menuItem";
import { ColumnType } from "../interfaces/column";

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

function mount(bodyContextMenu?: (p: { items: MenuItem[] }) => MenuItem[]): IGridAPI {
  return createGrid(host, {
    rowIdKey: "id",
    columnDefs: [
      { key: "name", label: "Name", type: ColumnType.STRING },
      { key: "price", label: "Price", type: ColumnType.NUMBER },
    ],
    rowData: [{ id: 1, name: "Widget", price: 9.99 }],
    ...(bodyContextMenu ? { bodyContextMenu } : {}),
  });
}

function openBodyMenu(): void {
  const cell = host.querySelector<HTMLElement>(".pte-cell")!;
  cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
}

function menuItem(label: string): HTMLElement {
  const items = [...document.querySelectorAll<HTMLElement>(".pte-menu-item")];
  const item = items.find(el => el.querySelector(".pte-menu-item-text")?.textContent === label);
  expect(item, `menu item "${label}"`).toBeDefined();
  return item!;
}

function shortcutText(item: HTMLElement): string | null {
  return item.querySelector(".pte-menu-item-shortcut")?.textContent ?? null;
}

describe("menu accelerators", () => {
  it("shows a built-in binding's chord on the item carrying the same command", () => {
    mount();
    openBodyMenu();
    // happy-dom is not macOS, so the platform spelling is Ctrl+.
    expect(shortcutText(menuItem("Copy"))).toBe("Ctrl+C");
    // No binding carries this command (there is no copy-with-headers chord) — no accelerator.
    expect(shortcutText(menuItem("Copy with Headers"))).toBeNull();
  });

  it("renders MenuItem.shortcut as a display hint, losing to `right` and to the submenu arrow", () => {
    mount(({ items }) => [
      ...items,
      { id: "approve", label: "Approve", shortcut: "mod+shift+y", onClick: () => {} },
      { id: "flagged", label: "Flagged", shortcut: "mod+j", right: "icon-desc", onClick: () => {} },
      {
        id: "more", label: "More", shortcut: "mod+u",
        subMenu: [{ id: "child", label: "Child", onClick: () => {} }],
      },
    ]);
    openBodyMenu();

    expect(shortcutText(menuItem("Approve"))).toBe("Ctrl+Shift+Y");
    // An explicit right slot is the author's deliberate content; the hint yields.
    expect(shortcutText(menuItem("Flagged"))).toBeNull();
    expect(menuItem("Flagged").querySelector(".pte-menu-item-icon-right")).not.toBeNull();
    // A submenu item's right slot is the arrow; a chord on it would be incoherent anyway.
    expect(shortcutText(menuItem("More"))).toBeNull();
  });

  it("marks the accelerator aria-hidden so the item's accessible name stays the label", () => {
    mount();
    openBodyMenu();
    const shortcut = menuItem("Copy").querySelector(".pte-menu-item-shortcut")!;
    expect(shortcut.getAttribute("aria-hidden")).toBe("true");
  });
});
