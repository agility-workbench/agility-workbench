// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";
import { findHeaderCell } from "./headerCellLookup";

/**
 * A grid mounted inside a shadow root. Header cells carry their column's instanceID as the element
 * id, and these paths used to find them with `document.getElementById`, which cannot see into a
 * shadow tree — so the sort icon, aria-sort, header cursor, filter indicator, keyboard menu anchor,
 * header tooltip reference and drag drop-anchors all silently did nothing there. Each now looks the
 * cell up inside the grid's own header (findHeaderCell).
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

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = "";
});

function mountInShadow(options: Record<string, unknown> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  shadow.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region", headerTooltip: "Sales region" },
    {
      colId: "grp", label: "Group", children: [
        { colId: "name", key: "name", label: "Name" },
        { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
      ],
    },
  ] as any);
  api.setRowData(Array.from({ length: 10 }, (_, i) => ({
    id: `r${i}`, region: i % 2 ? "EMEA" : "AMER", name: `Account ${i}`, total: i,
  })));
  cleanup = () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    api.destroy();
  };
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  const leaf = (colId: string) => core.getColumnModel().getLeaves().find(c => c.colId === colId)!;
  const hcell = (colId: string) => findHeaderCell(shadow, leaf(colId).instanceID)!;
  return { shadow, container, core, api, renderer, root, leaf, hcell };
}

describe("findHeaderCell", () => {
  it("finds a cell by an id that is not a valid CSS identifier, inside the given scope only", () => {
    const scope = document.createElement("div");
    // instanceIDs are crypto.randomUUID()s, which may start with a digit — invalid after `#`.
    const ids = ["1b4e28ba-2fa1-11d2-883f-0016d3cca427", "has space", "a.b#c"];
    for (const id of ids) {
      const el = document.createElement("div");
      el.className = "pte-hcell";
      el.id = id;
      scope.appendChild(el);
    }
    for (const id of ids) expect(findHeaderCell(scope, id)?.id).toBe(id);
    // A non-header element with the same id is not a header cell.
    const other = document.createElement("div");
    other.id = "plain";
    scope.appendChild(other);
    expect(findHeaderCell(scope, "plain")).toBeNull();
    // Out of scope: the document does not hold this detached tree.
    expect(findHeaderCell(document, ids[0])).toBeNull();
  });
});

describe("header inside a shadow root", () => {
  it("is invisible to document.getElementById (the premise)", () => {
    const { leaf, hcell } = mountInShadow();
    expect(hcell("name")).not.toBeNull();
    expect(document.getElementById(leaf("name").instanceID)).toBeNull();
  });

  it("updates the sort icon and aria-sort when the sort changes", () => {
    const { core, leaf, hcell } = mountInShadow();
    core.dispatch({ type: "headerAction", action: "toggleSort", colId: leaf("name").instanceID, additive: false } as any);
    const sortEl = hcell("name").querySelector(".pte-hcell-sort")!;
    expect(sortEl.classList.contains("pte-sort-asc")).toBe(true);
    expect(hcell("name").getAttribute("aria-sort")).toBe("ascending");
    expect(hcell("total").getAttribute("aria-sort")).toBe("none");
  });

  it("paints the keyboard header cursor on the focused cell", () => {
    const { core, root, hcell } = mountInShadow();
    root.focus();
    const idx = core.getColumnModel().getLeaves().findIndex(c => c.colId === "total");
    core.dispatch({ type: "headerFocusSet", colIdx: idx, reason: "api" } as any);
    expect(hcell("total").classList.contains("pte-hcell-active")).toBe(true);
    expect(root.querySelectorAll(".pte-hcell-active").length).toBe(1);
  });

  it("marks the filter button active while the column is filtered", () => {
    const { api, hcell } = mountInShadow();
    api.setFilterModel([{ colId: "name", filters: [{ type: "contains", values: ["1"] } as any] }]);
    expect(hcell("name").querySelector(".pte-hcell-menu-filterBtn")!.classList.contains("active")).toBe(true);
    expect(hcell("total").querySelector(".pte-hcell-menu-filterBtn")!.classList.contains("active")).toBe(false);
  });

  it("anchors the Alt+ArrowDown column menu on the cell's menu button", () => {
    const { core, root, hcell } = mountInShadow();
    root.focus();
    const idx = core.getColumnModel().getLeaves().findIndex(c => c.colId === "name");
    core.dispatch({ type: "headerFocusSet", colIdx: idx, reason: "api" } as any);
    const menuBtn = hcell("name").querySelector<HTMLElement>(".pte-hcell-menu-menuBtn")!;
    const rect = vi.spyOn(menuBtn, "getBoundingClientRect");
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    // The menu is placed against its anchor; with no anchor resolved it never measures the button.
    expect(rect).toHaveBeenCalled();
  });

  it("points the header cell at its tooltip while shown", async () => {
    const { renderer, leaf, hcell } = mountInShadow({ tooltip: true });
    const tooltips = (renderer as any)._bodyTooltipRenderer;
    tooltips.showFor({ kind: "header", colId: leaf("region").instanceID, clientX: 0, clientY: 0 });
    await raf();
    expect(hcell("region").getAttribute("aria-describedby")).toBeTruthy();
    tooltips.hideNow();
    expect(hcell("region").hasAttribute("aria-describedby")).toBe(false);
  });

  it("resolves the leaf cells under a group header as column-drag drop anchors", () => {
    const { renderer, hcell } = mountInShadow();
    const anchors: Array<{ col: { colId: string }; el: HTMLElement }> =
      (renderer as any)._columnInteractionRenderer.getDropAnchorHeaders("center");
    const byCol = new Map(anchors.map(a => [a.col.colId, a.el]));
    expect(byCol.get("name")).toBe(hcell("name"));
    expect(byCol.get("total")).toBe(hcell("total"));
  });
});
