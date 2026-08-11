// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "./dom";
import { MenuRenderer } from "./menuRenderer";

// Satellite ARIA (accessibility plan 6 PR 5): menu roles + the keyboard pattern that makes them
// truthful, tooltip aria-describedby, ActionFrame popup state, overlay aria-busy.

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const measurer: ITextMeasurer = { measure: (text: string) => text.length * 7 };
const menuAdapter: IMenuAdapter = {
  resolveMenuItems: (_ctx, defaults) => ({ items: defaults, cleanup: () => undefined }),
};
const raf = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

function buildRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    region: i % 2 === 0 ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  }));
}

function mountGrid(rowCount: number, options: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach({ current: container });
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "name", key: "name", label: "Name" },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
  ]);
  api.setRowData(buildRows(rowCount));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { container, core, api, root, renderer };
}

describe("menu roles and keyboard pattern", () => {
  function openItemMenu(items: any[] = [
    { label: "Sort ascending" },
    { isSeparator: true },
    { label: "Pin left" },
    { label: "Unavailable", disabled: true },
    { label: "More", subMenu: [{ label: "Nested one" }, { label: "Nested two" }] },
  ]) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const trigger = document.createElement("button");
    root.appendChild(trigger);
    trigger.focus();
    const menu = new MenuRenderer(root);
    menu.open({ clientX: 10, clientY: 10, items, ariaLabel: "Column menu" });
    const overlay = root.querySelector<HTMLElement>(".pte-menu")!;
    return { root, menu, overlay, trigger };
  }

  const itemsOf = (overlay: HTMLElement) =>
    [...overlay.querySelectorAll<HTMLElement>(".pte-menu-item")];

  it("exposes the overlay as a labelled menu of menuitems", () => {
    const { overlay, menu } = openItemMenu();
    expect(overlay.getAttribute("role")).toBe("menu");
    expect(overlay.getAttribute("aria-label")).toBe("Column menu");
    const items = itemsOf(overlay);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.getAttribute("role") === "menuitem")).toBe(true);
    // Items are out of the Tab order — the menu owns arrow-key navigation instead.
    expect(items.every(i => i.tabIndex === -1)).toBe(true);
    expect(overlay.querySelector(".pte-menu-separator")!.getAttribute("role")).toBe("separator");
    menu.close(0);
  });

  it("marks a disabled item both natively and for AT", () => {
    const { overlay, menu } = openItemMenu();
    const disabled = itemsOf(overlay).find(i => i.textContent?.includes("Unavailable"))!;
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    expect((disabled as HTMLButtonElement).disabled).toBe(true);
    menu.close(0);
  });

  it("moves focus into the menu on open and back to the trigger on close", () => {
    const { overlay, menu, trigger } = openItemMenu();
    // Without this the roles would be a lie: nothing could reach the items by keyboard.
    expect(document.activeElement).toBe(itemsOf(overlay)[0]);

    menu.close(0);
    expect(document.activeElement).toBe(trigger);
  });

  it("navigates with arrows, wraps, and honours Home/End while skipping disabled items", () => {
    const { overlay, menu } = openItemMenu();
    const enabled = itemsOf(overlay).filter(i => !(i as HTMLButtonElement).disabled);
    const press = (key: string) =>
      overlay.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

    expect(document.activeElement).toBe(enabled[0]);
    press("ArrowDown");
    expect(document.activeElement).toBe(enabled[1]);
    press("End");
    expect(document.activeElement).toBe(enabled[enabled.length - 1]);
    // Wraps past the end rather than dead-ending.
    press("ArrowDown");
    expect(document.activeElement).toBe(enabled[0]);
    press("ArrowUp");
    expect(document.activeElement).toBe(enabled[enabled.length - 1]);
    press("Home");
    expect(document.activeElement).toBe(enabled[0]);
    // The disabled item is never landed on.
    expect(enabled.some(i => i.textContent?.includes("Unavailable"))).toBe(false);
    menu.close(0);
  });

  it("opens a submenu with ArrowRight and returns with ArrowLeft", () => {
    const { root, overlay, menu } = openItemMenu();
    const press = (el: HTMLElement, key: string) =>
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

    const parent = itemsOf(overlay).find(i => i.textContent?.includes("More"))!;
    parent.focus();
    press(overlay, "ArrowRight");

    const submenu = root.querySelector<HTMLElement>(".pte-submenu")!;
    expect(submenu.getAttribute("role")).toBe("menu");
    expect(parent.getAttribute("aria-haspopup")).toBe("menu");
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    const subItems = itemsOf(submenu);
    expect(document.activeElement).toBe(subItems[0]);

    press(submenu, "ArrowLeft");
    expect(document.activeElement).toBe(parent);
    expect(parent.getAttribute("aria-expanded")).toBe("false");
    menu.close(0);
  });

  it("closes only the submenu on Escape, leaving the parent menu open", () => {
    const { root, overlay, menu } = openItemMenu();
    const parent = itemsOf(overlay).find(i => i.textContent?.includes("More"))!;
    parent.focus();
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const submenu = root.querySelector<HTMLElement>(".pte-submenu")!;

    submenu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(parent);
    expect(overlay.style.display).not.toBe("none");
    menu.close(0);
  });

  it("does not present a contentEl overlay as a menu", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const menu = new MenuRenderer(root);
    const form = document.createElement("div");
    form.innerHTML = "<input type='text' />";

    // Open as a real menu first, so the pooled overlay is reused for the contentEl open below.
    menu.open({ clientX: 0, clientY: 0, items: [{ label: "One" }] });
    expect(root.querySelector(".pte-menu")!.getAttribute("role")).toBe("menu");

    menu.open({ clientX: 0, clientY: 0, items: [], contentEl: form });
    const overlay = root.querySelector<HTMLElement>(".pte-menu")!;
    // A filter form is not a menu; a stale role="menu" here would misdescribe its contents.
    expect(overlay.hasAttribute("role")).toBe(false);
    expect(overlay.hasAttribute("aria-label")).toBe(false);
    menu.close(0);
  });

  it("leaves a contentEl overlay's own keyboard handling alone", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const menu = new MenuRenderer(root);
    const form = document.createElement("div");
    const input = document.createElement("input");
    form.appendChild(input);

    menu.open({ clientX: 0, clientY: 0, items: [], contentEl: form });
    input.focus();
    const overlay = root.querySelector<HTMLElement>(".pte-menu")!;
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    // Menu navigation must not hijack arrows inside a form field.
    expect(document.activeElement).toBe(input);
    menu.close(0);
  });
});

// Regressions found by manual testing of the PR-5 menu work. All four were invisible to the
// original suite because it drove the menu in isolation, where nothing else competes for the keys.
describe("menu keys do not leak to the grid", () => {
  function mountWithMenu() {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, { rowIdKey: "id" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach({ current: container });
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region", editable: true },
      { colId: "name", key: "name", label: "Name", editable: true },
    ]);
    api.setRowData(buildRows(20));
    const root = container.querySelector<HTMLElement>(".pte-root")!;
    return { container, core, api, root };
  }

  /** Open the real column menu the way a user does, so it lives inside the grid root. */
  function openColumnMenu(container: HTMLElement) {
    const btn = container.querySelector<HTMLElement>(".pte-hcell .pte-hcell-menu-menuBtn")!;
    expect(btn).not.toBeNull();
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const overlay = container.querySelector<HTMLElement>(".pte-menu[role='menu']");
    expect(overlay).not.toBeNull();
    return overlay!;
  }

  const press = (el: HTMLElement, key: string) =>
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

  it("does not move the grid's cell selection when arrow keys land on the menu", () => {
    const { container, core, root } = mountWithMenu();
    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 1, reason: "keyboard" } as any);
    const before = core.getActiveCell();

    const menu = openColumnMenu(container);
    // ArrowRight on an item with no submenu does nothing to the menu — but it must still be
    // consumed, or the grid moves the selection behind the open menu.
    press(root, "ArrowRight");
    press(root, "ArrowDown");

    expect(core.getActiveCell()).toEqual(before);
  });

  it("does not start editing the cell behind the menu when Enter activates an item", () => {
    const { container, core, root } = mountWithMenu();
    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 1, reason: "keyboard" } as any);

    const menu = openColumnMenu(container);
    const item = menu.querySelector<HTMLElement>(".pte-menu-item")!;
    item.focus();
    press(item, "Enter");

    // The grid's own handler treats Enter as "edit this cell" and calls preventDefault, which also
    // cancelled the button's activation — the cause of Enter behaving erratically over a menu.
    expect(core.getEditingCell()).toBeNull();
  });

  it("does not type into the cell behind the menu when Space activates an item", () => {
    const { container, core, root } = mountWithMenu();
    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 1, reason: "keyboard" } as any);

    const menu = openColumnMenu(container);
    const item = menu.querySelector<HTMLElement>(".pte-menu-item")!;
    item.focus();
    press(item, " ");

    expect(core.getEditingCell()).toBeNull();
  });

  it("closes the menu on Tab instead of leaving it open behind the focus", () => {
    const { container } = mountWithMenu();
    const menu = openColumnMenu(container);
    expect(menu.isConnected).toBe(true);

    press(menu, "Tab");
    expect(container.querySelector(".pte-menu[role='menu']")).toBeNull();
  });
});

describe("mouse and keyboard share one current item", () => {
  function open() {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const menu = new MenuRenderer(root);
    menu.open({
      clientX: 10,
      clientY: 10,
      items: [
        { label: "First" },
        { label: "Second" },
        { label: "Third" },
        { label: "Off limits", disabled: true },
      ],
    });
    const overlay = root.querySelector<HTMLElement>(".pte-menu")!;
    const items = [...overlay.querySelectorAll<HTMLElement>(".pte-menu-item")];
    const hover = (el: HTMLElement) => {
      const move = new MouseEvent("mousemove", { bubbles: true });
      Object.defineProperty(move, "target", { value: el });
      overlay.dispatchEvent(move);
    };
    const press = (key: string) =>
      overlay.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    return { root, menu, overlay, items, hover, press };
  }

  it("moves the keyboard position to the hovered item, so only one is ever current", () => {
    const { items, hover, menu } = open();
    expect(document.activeElement).toBe(items[0]);

    hover(items[2]);
    // The highlight is driven by :focus/:hover on the same element — if hover did not move focus,
    // the hovered item and the focused item would both paint.
    expect(document.activeElement).toBe(items[2]);
    menu.close(0);
  });

  it("continues arrow navigation from the hovered item, not from wherever focus was", () => {
    const { items, hover, press, menu } = open();
    hover(items[2]);
    press("ArrowDown");
    // Third → (Off limits is disabled and skipped) → wraps to First.
    expect(document.activeElement).toBe(items[0]);

    hover(items[1]);
    press("ArrowUp");
    expect(document.activeElement).toBe(items[0]);
    menu.close(0);
  });

  it("keeps the current item where it is when the mouse passes over a disabled one", () => {
    const { items, hover, menu } = open();
    hover(items[1]);
    expect(document.activeElement).toBe(items[1]);

    hover(items[3]); // disabled — unfocusable, and paints no highlight of its own
    expect(document.activeElement).toBe(items[1]);
    menu.close(0);
  });
});

describe("menu focus survives the mouse", () => {
  it("returns focus to the parent item when hovering elsewhere hides a submenu", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const menu = new MenuRenderer(root);
    menu.open({
      clientX: 10,
      clientY: 10,
      items: [
        { label: "Plain one" },
        { label: "More", subMenu: [{ label: "Nested one" }, { label: "Nested two" }] },
      ],
    });
    const overlay = root.querySelector<HTMLElement>(".pte-menu")!;
    const items = [...overlay.querySelectorAll<HTMLElement>(".pte-menu-item")];
    const parent = items.find(i => i.textContent?.includes("More"))!;
    const plain = items.find(i => i.textContent?.includes("Plain"))!;

    parent.focus();
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const submenu = root.querySelector<HTMLElement>(".pte-submenu")!;
    expect(document.activeElement).toBe(submenu.querySelector(".pte-menu-item"));

    // The mouse drifts onto a sibling item, which hides the submenu that currently holds focus.
    const move = new MouseEvent("mousemove", { bubbles: true });
    Object.defineProperty(move, "target", { value: plain });
    overlay.dispatchEvent(move);

    // Focus must not be stranded on <body>: from there, arrow keys reach nothing and only Escape
    // works, which is exactly what manual testing hit. It lands on the item the mouse moved to,
    // since hover now carries the keyboard position with it.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(plain);
    expect(submenu.isConnected).toBe(false);

    // And navigation continues from there rather than dying.
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(parent);
    menu.close(0);
  });
});

describe("ActionFrame popup state on the anchor cell", () => {
  function mountWithActionFrame() {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, { rowIdKey: "id" });
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach({ current: container });
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
      {
        colId: "name",
        key: "name",
        label: "Name",
        // Function form of the component contract: return the popover body for the cell.
        actionFrameComponent: (p: any) => `Frame for ${p.value}`,
      } as any,
    ]);
    api.setRowData(buildRows(20));
    return { container, core, api };
  }

  const cellAt = (container: HTMLElement, viewIdx: number, colIdx: number) =>
    container.querySelector<HTMLElement>(
      `.pte-viewport > .pte-row[data-view-idx='${viewIdx}'] .pte-cell[data-col-idx='${colIdx}']`,
    )!;

  it("marks the framed cell as an expanded dialog trigger, and clears it on close", async () => {
    const { container, core } = mountWithActionFrame();
    const rowId = core.getRowIdAtViewIndex(1)!;
    const colId = core.getColumnModel().getLeaves().find(c => c.colId === "name")!.instanceID;

    core.dispatch({ type: "actionFrameOpen", cell: { rowId, colId }, source: "keyboard" } as any);
    await raf();

    const framed = container.querySelector<HTMLElement>(".pte-action-frame");
    expect(framed).not.toBeNull();
    expect(framed).toBe(cellAt(container, 1, 1));
    expect(framed!.getAttribute("aria-haspopup")).toBe("dialog");
    expect(framed!.getAttribute("aria-expanded")).toBe("true");

    core.dispatch({ type: "actionFrameClose" } as any);
    await raf();
    expect(container.querySelectorAll("[aria-haspopup='dialog']").length).toBe(0);
    expect(cellAt(container, 1, 1).hasAttribute("aria-expanded")).toBe(false);
  });
});

describe("aria-busy while loading", () => {
  it("marks the grid busy for the duration of a load", async () => {
    const { core, root } = mountGrid(20);
    expect(root.hasAttribute("aria-busy")).toBe(false);

    core.dispatch({ type: "overlayShow", overlayType: "loading" } as any);
    expect(root.getAttribute("aria-busy")).toBe("true");

    core.dispatch({ type: "overlayShow", overlayType: "none" } as any);
    expect(root.hasAttribute("aria-busy")).toBe(false);
    await raf();
  });
});

describe("tooltip aria-describedby", () => {
  /**
   * Auto-truncation tooltips need real layout (scrollWidth vs clientWidth), which happy-dom does
   * not provide — a grid without an explicit tooltip resolves no content and shows nothing at all.
   * So configure a `tooltipValueGetter`, which resolves from data alone.
   */
  function mountWithTooltips() {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, { rowIdKey: "id", tooltip: true } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach({ current: container });
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
      {
        colId: "name",
        key: "name",
        label: "Name",
        tooltipValueGetter: (p: any) => `Full name: ${p.value}`,
      } as any,
    ]);
    api.setRowData(buildRows(20));
    return { container, core, renderer };
  }

  it("points the described cell at the tooltip while it is shown, and clears it after", async () => {
    const { container, renderer } = mountWithTooltips();
    const tooltipRenderer = (renderer as any)._bodyTooltipRenderer;
    const cell = container.querySelector<HTMLElement>(
      ".pte-viewport > .pte-row[data-view-idx='1'] .pte-cell[data-col-idx='1']",
    )!;
    expect(cell).not.toBeNull();

    tooltipRenderer.showBodyTooltip(1, 1);
    await raf();

    const describedBy = cell.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const tooltip = document.getElementById(describedBy!)!;
    expect(tooltip).not.toBeNull();
    // role="tooltip" alone is inert; the reference is what makes AT read it as the cell's description.
    expect(tooltip.getAttribute("role")).toBe("tooltip");
    expect(tooltip.textContent).toContain("Full name: Account 1");

    tooltipRenderer.hideNow();
    expect(cell.hasAttribute("aria-describedby")).toBe(false);
  });

  it("does not strand the reference on a cell when the tooltip moves to another one", async () => {
    const { container, renderer } = mountWithTooltips();
    const tooltipRenderer = (renderer as any)._bodyTooltipRenderer;
    const cellAt = (viewIdx: number) => container.querySelector<HTMLElement>(
      `.pte-viewport > .pte-row[data-view-idx='${viewIdx}'] .pte-cell[data-col-idx='1']`,
    )!;

    tooltipRenderer.showBodyTooltip(1, 1);
    await raf();
    expect(cellAt(1).hasAttribute("aria-describedby")).toBe(true);

    tooltipRenderer.hideNow();
    tooltipRenderer.showBodyTooltip(2, 1);
    await raf();
    // Exactly one cell describes the tooltip at any time.
    expect(cellAt(1).hasAttribute("aria-describedby")).toBe(false);
    expect(cellAt(2).hasAttribute("aria-describedby")).toBe(true);
    expect(container.querySelectorAll("[aria-describedby]").length).toBe(1);
    tooltipRenderer.hideNow();
  });
});
