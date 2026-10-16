// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { ColumnType } from "../../interfaces/column";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import type { GridEventColumnsChangedParams } from "../../events/events";
import { ColumnMenuService } from "../../menu/columnMenuService";
import { initDomRenderer } from "../dom";
import { findHeaderCell } from "./headerCellLookup";

/**
 * The renderer's gesture paths dispatch their column actions with `source: "user"`, so the events
 * an app persists column state from can tell a header click or menu pick from its own API calls.
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

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = "";
});

function mount() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id" });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" });
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", sortable: true },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER, sortable: true },
  ]);
  api.setRowData([{ id: "a", name: "A", total: 1 }, { id: "b", name: "B", total: 2 }]);
  cleanup = () => api.destroy();
  const events: GridEventColumnsChangedParams[] = [];
  api.on("columnsChanged", (ev) => events.push(ev));
  const leaf = (colId: string) => core.getColumnModel().getLeaves().find(c => c.colId === colId)!;
  return { core, api, container, events, leaf };
}

describe("column change source from UI gestures", () => {
  it("a header sort-icon click reports user; setSortModel reports api", () => {
    const { api, container, events, leaf } = mount();
    const cell = findHeaderCell(container, leaf("name").instanceID)!;
    const icon = cell.querySelector<HTMLElement>(".pte-hcell-sort")!;
    expect(icon).not.toBeNull();
    icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    api.setSortModel([]);
    expect(events.filter(ev => ev.reason === "sort").map(ev => ev.source)).toEqual(["user", "api"]);
  });

  it("column-menu pin and hide report user; applyColumnState reports api", () => {
    const { core, api, events, leaf } = mount();
    const service = new ColumnMenuService(core as any);
    const ctx = { trigger: "columnMenuButton" as const, targetColId: leaf("name").instanceID } as any;
    service.execute({ id: "pinLeft", label: "Pin Left", command: "column.pinMany", payload: { colIDs: [leaf("name").instanceID], pinned: "left" } }, ctx);
    service.execute({ id: "hide", label: "Hide", command: "column.hideMany", payload: { colIDs: [leaf("total").instanceID] } }, ctx);
    api.applyColumnState([{ colId: "total", hidden: false }]);
    expect(events.map(ev => [ev.reason, ev.source])).toEqual([
      ["pin", "user"],
      ["visibility", "user"],
      ["state", "api"],
    ]);
  });
});
