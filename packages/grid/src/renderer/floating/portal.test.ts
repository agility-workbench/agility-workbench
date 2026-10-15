// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { createTheme, themeDark } from "../../theme/theme";
import { initDomRenderer } from "../dom";
import { findHeaderCell } from "../header/headerCellLookup";
import { linkPortalTheme, resolvePortalContainer } from "./portal";

/**
 * Layers portaled out of `.pte-root` (escapeRootClip tooltips / ActionFrame popovers, the column
 * drag ghost) used to land in `document.body`: they lost the per-grid theme (inline `--pte-*` on the
 * root) and, under a shadow-root mount, the whole stylesheet. They now portal into the grid's own
 * shadow root when there is one and carry the root's inline custom properties.
 */

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
const flushObservers = () => new Promise<void>(resolve => setTimeout(resolve, 0));

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = "";
});

const Form = () => {
  const el = document.createElement("div");
  el.className = "portal-test-form";
  el.textContent = "form";
  return el;
};

async function mount(where: "shadow" | "light", options: Record<string, unknown> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadow = where === "shadow" ? host.attachShadow({ mode: "open" }) : null;
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  (shadow ?? host).appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    tooltip: { escapeRootClip: true },
    defaultColDef: { actionFrameOptions: { escapeRootClip: true } },
    ...options,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", tooltipValueGetter: () => "tip" },
    { colId: "total", key: "total", label: "Total", actionFrameComponent: Form },
  ] as any);
  api.setRowData(Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, name: `Account ${i}`, total: i })));
  await raf();
  cleanup = () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    api.destroy();
  };
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  const scope: ParentNode = shadow ?? document;
  const hcell = (colId: string) =>
    findHeaderCell(root, core.getColumnModel().getLeaves().find(c => c.colId === colId)!.instanceID)!;
  return { shadow, scope, core, api, renderer, root, hcell };
}

function startColumnDrag(renderer: any, header: HTMLElement) {
  const ci = renderer._columnInteractionRenderer;
  const evt = (x: number) => ({
    button: 0, target: header, clientX: x, clientY: 5,
    preventDefault() { }, stopPropagation() { },
  });
  ci.onHeaderMouseDown(evt(10));
  ci.onColumnDragMouseMove(evt(80));
  return () => ci.onColumnDragMouseUp();
}

describe("resolvePortalContainer", () => {
  it("is document.body in light DOM and the grid's shadow root under a shadow mount", () => {
    const light = document.createElement("div");
    document.body.appendChild(light);
    expect(resolvePortalContainer(light)).toBe(document.body);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const inner = document.createElement("div");
    shadow.appendChild(inner);
    expect(resolvePortalContainer(inner)).toBe(shadow);
  });
});

describe("linkPortalTheme", () => {
  it("copies the root's inline custom properties, follows later changes, and stops on unlink", async () => {
    const root = document.createElement("div");
    root.style.position = "relative";
    root.style.setProperty("--pte-tooltip-bg", "red");
    root.style.setProperty("--pte-gone", "1px");
    const el = document.createElement("div");
    const unlink = linkPortalTheme(root, el);
    expect(el.style.getPropertyValue("--pte-tooltip-bg")).toBe("red");
    expect(el.style.getPropertyValue("--pte-gone")).toBe("1px");
    // Only custom properties travel: the root's own layout styles are not the layer's.
    expect(el.style.position).toBe("");
    expect(el.style.fontFamily).toBe("var(--pte-font-family)");

    root.style.setProperty("--pte-tooltip-bg", "blue");
    root.style.removeProperty("--pte-gone");
    await flushObservers();
    expect(el.style.getPropertyValue("--pte-tooltip-bg")).toBe("blue");
    expect(el.style.getPropertyValue("--pte-gone")).toBe("");

    unlink();
    root.style.setProperty("--pte-tooltip-bg", "green");
    await flushObservers();
    expect(el.style.getPropertyValue("--pte-tooltip-bg")).toBe("blue");
  });
});

describe("portaled layers under a shadow-root mount with themeDark", () => {
  const dark = themeDark.toCssVars();

  it("mounts an escapeRootClip tooltip in the shadow root, carrying the dark theme", async () => {
    const { shadow, api, root } = await mount("shadow", { theme: themeDark });
    api.showTooltip({ rowId: "r1", colId: "name" });
    await raf();
    const tip = shadow!.querySelector<HTMLElement>(".pte-floating.pte-tooltip")!;
    expect(tip).not.toBeNull();
    expect(tip.parentNode).toBe(shadow);
    expect(root.contains(tip)).toBe(false);
    expect(document.body.querySelector(".pte-tooltip")).toBeNull();
    expect(tip.style.getPropertyValue("--pte-tooltip-bg")).toBe(dark["--pte-tooltip-bg"]);
    expect(tip.style.getPropertyValue("--pte-tooltip-text-color")).toBe(dark["--pte-tooltip-text-color"]);
    api.hideTooltip();
    expect(shadow!.querySelector(".pte-tooltip")).toBeNull();
  });

  it("mounts an escapeRootClip ActionFrame popover in the shadow root, carrying the dark theme", async () => {
    const { shadow, api, root } = await mount("shadow", { theme: themeDark });
    api.openActionFrame({ rowId: "r1", colId: "total" });
    await raf();
    const popover = shadow!.querySelector<HTMLElement>(".pte-floating.pte-action-frame-popover")!;
    expect(popover).not.toBeNull();
    expect(popover.parentNode).toBe(shadow);
    expect(root.contains(popover)).toBe(false);
    expect(popover.querySelector(".portal-test-form")).not.toBeNull();
    expect(popover.style.getPropertyValue("--pte-action-frame-popover-bg"))
      .toBe(dark["--pte-action-frame-popover-bg"]);
  });

  it("keeps the column menu inside the root, where the dark theme already reaches it", async () => {
    const { shadow, root, hcell } = await mount("shadow", { theme: themeDark });
    hcell("name").querySelector<HTMLElement>(".pte-hcell-menu-menuBtn")!.click();
    await raf();
    const menu = shadow!.querySelector<HTMLElement>(".pte-menu")!;
    expect(menu).not.toBeNull();
    expect(menu.closest(".pte-root")).toBe(root);
    expect(root.style.getPropertyValue("--pte-root-bg-color")).toBe(dark["--pte-root-bg-color"]);
  });

  it("mounts the column drag ghost in the shadow root, carrying the dark theme", async () => {
    const { shadow, renderer, hcell } = await mount("shadow", { theme: themeDark });
    const end = startColumnDrag(renderer, hcell("name"));
    const ghost = shadow!.querySelector<HTMLElement>(".pte-column-drag-ghost")!;
    expect(ghost).not.toBeNull();
    expect(ghost.parentNode).toBe(shadow);
    expect(document.body.querySelector(".pte-column-drag-ghost")).toBeNull();
    expect(ghost.style.getPropertyValue("--pte-column-drag-ghost-bg")).toBe(dark["--pte-column-drag-ghost-bg"]);
    end();
  });

  it("follows a theme change while a portaled layer is open", async () => {
    const { shadow, api, renderer } = await mount("shadow", { theme: themeDark });
    api.openActionFrame({ rowId: "r1", colId: "total" });
    await raf();
    const popover = shadow!.querySelector<HTMLElement>(".pte-action-frame-popover")!;
    renderer.setTheme(createTheme({ actionFramePopoverBackgroundColor: "#123456" }));
    await flushObservers();
    expect(popover.style.getPropertyValue("--pte-action-frame-popover-bg")).toBe("#123456");
    // A dark-only variable the new theme does not set is dropped, as it is from the root.
    expect(popover.style.getPropertyValue("--pte-tooltip-bg")).toBe("");
  });
});

describe("portaled layers in light DOM with a createTheme param", () => {
  const theme = createTheme({
    tooltipBackgroundColor: "#ff00aa",
    actionFramePopoverWidth: "420px",
  });
  const vars = theme.toCssVars();

  it("mounts the tooltip in document.body carrying tooltipBackgroundColor", async () => {
    const { api, root } = await mount("light", { theme });
    api.showTooltip({ rowId: "r1", colId: "name" });
    await raf();
    const tip = document.querySelector<HTMLElement>(".pte-floating.pte-tooltip")!;
    expect(tip.parentNode).toBe(document.body);
    expect(root.contains(tip)).toBe(false);
    expect(tip.style.getPropertyValue("--pte-tooltip-bg")).toBe("#ff00aa");
    expect(tip.style.getPropertyValue("--pte-tooltip-bg")).toBe(vars["--pte-tooltip-bg"]);
  });

  it("mounts the ActionFrame popover in document.body carrying actionFramePopoverWidth", async () => {
    const { api } = await mount("light", { theme });
    api.openActionFrame({ rowId: "r1", colId: "total" });
    await raf();
    const popover = document.querySelector<HTMLElement>(".pte-floating.pte-action-frame-popover")!;
    expect(popover.parentNode).toBe(document.body);
    expect(popover.style.getPropertyValue("--pte-action-frame-popover-width")).toBe("420px");
  });

  it("mounts the drag ghost in document.body carrying the theme", async () => {
    const { renderer, hcell } = await mount("light", { theme });
    const end = startColumnDrag(renderer, hcell("name"));
    const ghost = document.querySelector<HTMLElement>(".pte-column-drag-ghost")!;
    expect(ghost.parentNode).toBe(document.body);
    expect(ghost.style.getPropertyValue("--pte-tooltip-bg")).toBe("#ff00aa");
    end();
  });
});
