// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "./dom";

/**
 * The selection checkbox column (`rowSelection: { checkboxes: true }`): a dedicated leading
 * utility column, independent of `rowNumbers`. Body checkbox click toggles just that row
 * (additive, never clears the rest); Shift+click selects a range. The header hosts a tri-state
 * select-all checkbox covering the select-all scope. The checkbox visual is CSS-driven from the
 * cell's "selected" class; the row's aria-selected carries the semantics.
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

function mountGrid(options: Record<string, unknown> = {}, rowCount = 6) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowSelection: { checkboxes: true },
    ...options,
  });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach({ current: container });
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "name", key: "name", label: "Name" },
  ]);
  api.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: `r${i}`,
    region: i % 2 === 0 ? "AMER" : "EMEA",
    name: `Account ${i}`,
  })));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { container, core, api, renderer, root };
}

function checkboxCell(root: HTMLElement, viewIdx: number): HTMLElement {
  const row = root.querySelector<HTMLElement>(`.pte-leading-viewport .pte-row[data-view-idx="${viewIdx}"]`)
    ?? [...root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`)]
      .find(r => r.querySelector(".pte-checkbox-cell"))!;
  return row.querySelector<HTMLElement>(".pte-checkbox-cell")!;
}

function click(el: HTMLElement, mods: Partial<MouseEventInit> = {}) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, ...mods }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...mods }));
}

describe("checkbox column structure", () => {
  it("renders a leading checkbox column without requiring rowNumbers", () => {
    const { core, root } = mountGrid();
    expect(core.getOptions().rowSelection).toBe(true); // object form enables row selection
    const leading = core.getColumnModel().getLeadingLeaves();
    expect(leading).toHaveLength(1);
    expect(leading[0].isSelectionCheckboxColumn()).toBe(true);
    expect(root.querySelectorAll(".pte-checkbox-cell .pte-checkbox").length).toBeGreaterThan(0);
    expect(root.querySelector(".pte-hcell-checkbox .pte-select-all-checkbox")).not.toBeNull();
  });

  it("orders row numbers before checkboxes when both are enabled", () => {
    const { core } = mountGrid({ rowNumbers: true });
    const leading = core.getColumnModel().getLeadingLeaves();
    expect(leading.map(c => c.internalRole)).toEqual(["rowNumber", "selectionCheckbox"]);
  });

  it("stays out of column state, exports, and cell selection", () => {
    const { core, api, root } = mountGrid();
    expect(api.getColumnState().some(s => s.colId === "__pte_checkbox__")).toBe(false);
    // Clicking the checkbox cell never focuses/selects a cell.
    click(checkboxCell(root, 0));
    expect(core.getSelectionRange()).toBeNull();
  });
});

describe("body checkbox gestures", () => {
  it("click toggles a single row additively; shift-click unions a range in", () => {
    const { core, root } = mountGrid();
    click(checkboxCell(root, 1));
    expect([...core.getSelectedRowIds()]).toEqual(["r1"]);
    click(checkboxCell(root, 3)); // additive — r1 stays selected
    expect([...core.getSelectedRowIds()].sort()).toEqual(["r1", "r3"]);
    click(checkboxCell(root, 3)); // toggle off
    expect([...core.getSelectedRowIds()]).toEqual(["r1"]);

    click(checkboxCell(root, 3)); // re-select; anchor is now row 3
    click(checkboxCell(root, 5), { shiftKey: true }); // union 3..5 in — r1 is NOT cleared
    expect([...core.getSelectedRowIds()].sort()).toEqual(["r1", "r3", "r4", "r5"]);
  });

  it("paints the selected fill class on the checkbox cell (CSS drives the checkmark)", () => {
    const { root } = mountGrid();
    const cell = checkboxCell(root, 2);
    expect(cell.classList.contains("selected")).toBe(false);
    click(cell);
    expect(checkboxCell(root, 2).classList.contains("selected")).toBe(true);
  });
});

describe("header select-all checkbox", () => {
  it("toggles the full filtered set and reflects tri-state", () => {
    const { core, root } = mountGrid();
    const headerCell = root.querySelector<HTMLElement>(".pte-hcell-checkbox")!;
    const box = headerCell.querySelector<HTMLElement>(".pte-select-all-checkbox")!;
    expect(box.classList.contains("selected")).toBe(false);

    click(headerCell);
    expect(core.getSelectedRowIds().size).toBe(6);
    expect(box.classList.contains("selected")).toBe(true);
    expect(headerCell.getAttribute("aria-label")).toBe("Deselect all rows");

    // Removing one row → indeterminate.
    core.selectRowsById(["r0"], "remove");
    expect(box.classList.contains("selected")).toBe(false);
    expect(box.classList.contains("pte-checkbox-indeterminate")).toBe(true);
    expect(headerCell.getAttribute("aria-label")).toBe("Select all rows");

    // Click from indeterminate selects all; click from all clears.
    click(headerCell);
    expect(core.getSelectedRowIds().size).toBe(6);
    click(headerCell);
    expect(core.getSelectedRowIds().size).toBe(0);
    expect(box.classList.contains("pte-checkbox-indeterminate")).toBe(false);
  });

  it("headerCheckbox: false renders no header checkbox but keeps body checkboxes", () => {
    const { root } = mountGrid({ rowSelection: { checkboxes: true, headerCheckbox: false } });
    expect(root.querySelector(".pte-select-all-checkbox")).toBeNull();
    expect(root.querySelectorAll(".pte-checkbox-cell").length).toBeGreaterThan(0);
  });

  it("plain rowSelection: true renders no checkbox column (back-compat)", () => {
    const { core, root } = mountGrid({ rowSelection: true });
    expect(core.getColumnModel().getLeadingLeaves()).toHaveLength(0);
    expect(root.querySelector(".pte-checkbox-cell")).toBeNull();
  });
});
