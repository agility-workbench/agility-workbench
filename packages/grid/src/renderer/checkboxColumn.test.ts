// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { ColumnMenuService } from "../menu/columnMenuService";
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
  renderer.attach(container);
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

function rowNumberCell(root: HTMLElement, viewIdx: number): HTMLElement {
  const row = root.querySelector<HTMLElement>(`.pte-leading-viewport .pte-row[data-view-idx="${viewIdx}"]`)
    ?? [...root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`)]
      .find(r => r.querySelector(".pte-row-number-cell"))!;
  return row.querySelector<HTMLElement>(".pte-row-number-cell")!;
}

function click(el: HTMLElement, mods: Partial<MouseEventInit> = {}) {
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, ...mods }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...mods }));
}

function press(el: HTMLElement, key: string, mods: Partial<KeyboardEventInit> = {}) {
  el.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    code: key === " " ? "Space" : key,
    bubbles: true,
    cancelable: true,
    ...mods,
  }));
}

describe("checkbox column structure", () => {
  it("renders a left-pinned checkbox column without requiring rowNumbers", () => {
    const { core, root } = mountGrid();
    expect(core.getOptions().rowSelection).toBe(true); // object form enables row selection
    expect(core.getColumnModel().getLeadingLeaves()).toHaveLength(0);
    const left = core.getColumnModel().getLeftLeaves();
    expect(left).toHaveLength(1);
    expect(left[0].isSelectionCheckboxColumn()).toBe(true);
    expect(root.querySelectorAll(".pte-checkbox-cell .pte-checkbox").length).toBeGreaterThan(0);
    expect(root.querySelector(".pte-hcell-checkbox .pte-select-all-checkbox")).not.toBeNull();
  });

  it("orders row numbers before checkboxes when both are enabled", () => {
    const { core } = mountGrid({ rowNumbers: true });
    expect(core.getColumnModel().getLeadingLeaves().map(c => c.internalRole)).toEqual(["rowNumber"]);
    expect(core.getColumnModel().getLeftLeaves().map(c => c.internalRole)).toEqual(["selectionCheckbox"]);
    expect(core.getColumnModel().getLeaves().slice(0, 2).map(c => c.internalRole))
      .toEqual(["rowNumber", "selectionCheckbox"]);
  });

  it("pins right, unpins, and pins left through the header menu commands", () => {
    const { core } = mountGrid();
    const checkbox = core.getColumnModel().getLeftLeaves()[0];
    const ctx = {
      trigger: "headerContextMenu" as const,
      targetColId: checkbox.instanceID,
      colIds: [checkbox.instanceID],
    };
    const service = new ColumnMenuService(core);
    const pinItems = () => service.buildDefaultColumnMenu(ctx)
      .find(item => item.id === "pinning")!.subMenu!;

    service.execute(pinItems().find(item => item.id === "pinRight")!, ctx);
    expect(checkbox.pinned).toBe("right");
    expect(core.getColumnModel().getRightLeaves()).toContain(checkbox);

    service.execute(pinItems().find(item => item.id === "unpinColumns")!, ctx);
    expect(checkbox.pinned).toBeNull();
    expect(core.getColumnModel().getCenterLeaves()[0]).toBe(checkbox);

    service.execute(pinItems().find(item => item.id === "pinLeft")!, ctx);
    expect(checkbox.pinned).toBe("left");
    expect(core.getColumnModel().getLeftLeaves()).toContain(checkbox);
  });

  it("configures initial pin separately from whether the checkbox column can be repinned", () => {
    const { core, root } = mountGrid({
      rowSelection: {
        checkboxes: true,
        checkboxColumnPinned: "right",
        checkboxColumnPinnable: false,
      },
    });
    const checkbox = core.getColumnModel().getRightLeaves()[0];
    expect(checkbox.isSelectionCheckboxColumn()).toBe(true);

    const ctx = {
      trigger: "headerContextMenu" as const,
      targetColId: checkbox.instanceID,
      colIds: [checkbox.instanceID],
    };
    const service = new ColumnMenuService(core);
    expect(service.buildDefaultColumnMenu(ctx).find(item => item.id === "pinning")).toBeUndefined();
    expect(root.querySelector(".pte-hcell-checkbox .pte-hcell-menu-menuBtn")).toBeNull();

    const contextMenuAllowed = root.querySelector<HTMLElement>(".pte-hcell-checkbox")!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(contextMenuAllowed).toBe(false);
    expect(root.querySelector(".pte-menu")).toBeNull();

    core.dispatch({ type: "columnPin", colIds: [checkbox.instanceID], pinned: null });
    expect(checkbox.pinned).toBe("right");
    expect(core.getColumnModel().getRightLeaves()).toContain(checkbox);
  });

  it("updates mode and checkbox-column options without replacing the grid", () => {
    const { core, api, renderer, root } = mountGrid();
    const coreIdentity = api.getCore();
    core.selectRowsById(["r1", "r3"]);

    renderer.setRowSelectionOptions({
      mode: "single",
      checkboxes: true,
      checkboxColumnPinned: "right",
      checkboxColumnPinnable: false,
    });

    expect(api.getCore()).toBe(coreIdentity);
    expect([...core.getSelectedRowIds()]).toEqual(["r1"]);
    expect(core.getColumnModel().getRightLeaves()[0].isSelectionCheckboxColumn()).toBe(true);
    expect(root.querySelector(".pte-select-all-checkbox")).toBeNull();
    expect(root.querySelector(".pte-hcell-checkbox .pte-hcell-menu-menuBtn")).toBeNull();

    renderer.setRowSelectionOptions({
      mode: "multiple",
      checkboxes: true,
      checkboxColumnPinned: null,
      checkboxColumnPinnable: true,
    });

    expect(api.getCore()).toBe(coreIdentity);
    expect(core.getColumnModel().getCenterLeaves()[0].isSelectionCheckboxColumn()).toBe(true);
    expect(core.getColumnModel().getCenterLeaves()[0].showColumnMenu).toBe(true);
    expect(root.querySelector(".pte-select-all-checkbox")).not.toBeNull();
    root.querySelector<HTMLElement>(".pte-hcell-checkbox")!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(root.querySelector(".pte-menu")).not.toBeNull();
    press(root, "Escape");
    expect(root.querySelector(".pte-menu")).toBeNull();
  });

  it("allows the checkbox column to start unpinned", () => {
    const { core } = mountGrid({
      rowSelection: { checkboxes: true, checkboxColumnPinned: null },
    });
    const checkbox = core.getColumnModel().getCenterLeaves()[0];
    expect(checkbox.isSelectionCheckboxColumn()).toBe(true);
    expect(checkbox.pinned).toBeNull();
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
  it("makes row numbers keyboard stops only when row selection is enabled", () => {
    const enabled = mountGrid({ rowSelection: true, rowNumbers: true, highlightActiveCell: true });
    enabled.root.focus();
    press(enabled.root, "ArrowDown"); // first data column
    press(enabled.root, "ArrowLeft");

    expect(enabled.core.getActiveCell()).toEqual({ row: 0, colIdx: 0, rowPinned: undefined });
    expect(rowNumberCell(enabled.root, 0).classList.contains("pte-row-number-cell-focused")).toBe(true);
    expect(enabled.core.getSelectionRange()).toBeNull();

    press(enabled.root, "Enter");
    expect([...enabled.core.getSelectedRowIds()]).toEqual(["r0"]);
    expect(enabled.core.getActiveCell()?.colIdx).toBe(0);

    press(enabled.root, "ArrowDown");
    press(enabled.root, "Enter", { ctrlKey: true });
    expect([...enabled.core.getSelectedRowIds()].sort()).toEqual(["r0", "r1"]);

    press(enabled.root, "ArrowDown");
    press(enabled.root, "Enter", { shiftKey: true });
    expect([...enabled.core.getSelectedRowIds()].sort()).toEqual(["r1", "r2"]);

    const disabled = mountGrid({ rowSelection: false, rowNumbers: true });
    disabled.root.focus();
    press(disabled.root, "ArrowDown");
    const before = disabled.core.getActiveCell();
    press(disabled.root, "ArrowLeft");
    expect(disabled.core.getActiveCell()).toEqual(before); // decorative gutter is skipped

    click(rowNumberCell(disabled.root, 2));
    expect(disabled.core.getActiveCell()).toEqual(before);
    expect(disabled.core.getSelectionRange()).not.toBeNull();
    expect(disabled.core.getSelectedRowIds().size).toBe(0);
  });

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

  it("preserves checkbox row selection when empty body space is clicked", () => {
    const { core, root } = mountGrid();
    click(checkboxCell(root, 2));
    expect([...core.getSelectedRowIds()]).toEqual(["r2"]);

    root.querySelector<HTMLElement>(".pte-body")!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    expect([...core.getSelectedRowIds()]).toEqual(["r2"]);
  });

  it("keeps the legacy empty-body clear for row-number selection", () => {
    const { core, root } = mountGrid({ rowSelection: true, rowNumbers: true });
    const rowNumber = root.querySelector<HTMLElement>(
      '.pte-row[data-view-idx="2"] .pte-row-number-cell',
    )!;
    click(rowNumber);
    expect([...core.getSelectedRowIds()]).toEqual(["r2"]);

    root.querySelector<HTMLElement>(".pte-body")!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    expect(core.getSelectedRowIds().size).toBe(0);
  });

  it("renders keyboard focus without checking the box and keeps it out of resolved data ranges", () => {
    const { core, root } = mountGrid(); // highlightActiveCell is false by default
    const checkbox = core.getColumnModel().getLeftLeaves()[0];
    core.dispatch({ type: "columnPin", colIds: [checkbox.instanceID], pinned: "right" });

    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 0 });
    core.dispatch({ type: "navigate", dir: "right" });
    expect(core.getActiveCell()?.colIdx).toBe(1);
    core.dispatch({ type: "navigate", dir: "right" });
    expect(core.getActiveCell()?.colIdx).toBe(2); // the trailing checkbox is a keyboard stop
    expect(core.getSelectedRowIds().size).toBe(0);
    const focusedCheckbox = checkboxCell(root, 0);
    expect(focusedCheckbox.classList.contains("pte-active-cell")).toBe(false);
    expect(focusedCheckbox.classList.contains("pte-checkbox-cell-focused")).toBe(true);
    expect(focusedCheckbox.classList.contains("selected")).toBe(false); // focus is not checked state

    core.dispatch({ type: "selectAll" });
    const cells = core.getSelectionSnapshot(true).rangeCells!;
    expect(cells).toHaveLength(12); // 6 rows × 2 data columns
    expect(cells.some(cell => cell.colId === "__pte_checkbox__")).toBe(false);
  });

  it("Enter and Space toggle the focused row and keep the checkbox cursor navigable", () => {
    const { core, root } = mountGrid({ highlightActiveCell: true });
    const checkboxColIdx = core.getColumnModel().getLeaves()
      .findIndex(col => col.isSelectionCheckboxColumn());
    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: checkboxColIdx, reason: "keyboard" });
    root.focus();

    expect(checkboxCell(root, 1).classList.contains("selected")).toBe(false);
    press(root, "Enter");
    expect([...core.getSelectedRowIds()]).toEqual(["r1"]);
    expect(core.getActiveCell()).toEqual({ row: 1, colIdx: checkboxColIdx, rowPinned: undefined });
    expect(checkboxCell(root, 1).classList.contains("selected")).toBe(true);

    press(root, "ArrowDown");
    expect(core.getActiveCell()?.row).toBe(2);
    expect([...core.getSelectedRowIds()]).toEqual(["r1"]); // moving the cursor keeps checked rows
    expect(checkboxCell(root, 2).classList.contains("selected")).toBe(false);

    press(root, " ");
    expect([...core.getSelectedRowIds()].sort()).toEqual(["r1", "r2"]);
    expect(core.getActiveCell()?.row).toBe(2);
  });

  it("single mode replaces selection for pointer, keyboard, select-all, and by-id API calls", () => {
    const { core, root } = mountGrid({
      rowSelection: { mode: "single", checkboxes: true },
    });
    expect(root.querySelector(".pte-select-all-checkbox")).toBeNull();

    click(checkboxCell(root, 1));
    click(checkboxCell(root, 3), { ctrlKey: true });
    expect([...core.getSelectedRowIds()]).toEqual(["r3"]);

    click(checkboxCell(root, 5), { shiftKey: true });
    expect([...core.getSelectedRowIds()]).toEqual(["r5"]);

    const checkboxColIdx = core.getColumnModel().getLeaves()
      .findIndex(col => col.isSelectionCheckboxColumn());
    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: checkboxColIdx, reason: "keyboard" });
    root.focus();
    press(root, "Enter");
    expect([...core.getSelectedRowIds()]).toEqual(["r2"]);
    expect(checkboxCell(root, 2).classList.contains("selected")).toBe(true);

    core.selectRowsById(["r4", "r0"], "add");
    expect([...core.getSelectedRowIds()]).toEqual(["r4"]);

    core.selectAllRows();
    expect([...core.getSelectedRowIds()]).toEqual(["r0"]);
  });
});

describe("header select-all checkbox", () => {
  it("toggles the full filtered set and reflects tri-state", () => {
    const { core, root } = mountGrid();
    const reasons: Array<string | undefined> = [];
    core.on("selectionChanged", event => reasons.push(event.reason));
    const headerCell = root.querySelector<HTMLElement>(".pte-hcell-checkbox")!;
    const box = headerCell.querySelector<HTMLElement>(".pte-select-all-checkbox")!;
    expect(box.classList.contains("selected")).toBe(false);

    click(headerCell);
    expect(core.getSelectedRowIds().size).toBe(6);
    expect(reasons).toEqual(["mouse"]);
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

  it("single mode hides the header checkbox even when headerCheckbox is true", () => {
    const { root } = mountGrid({
      rowSelection: { mode: "single", checkboxes: true, headerCheckbox: true },
    });
    expect(root.querySelector(".pte-select-all-checkbox")).toBeNull();
    expect(root.querySelectorAll(".pte-checkbox-cell").length).toBeGreaterThan(0);
  });

  it("plain rowSelection: true renders no checkbox column (back-compat)", () => {
    const { core, root } = mountGrid({ rowSelection: true });
    expect(core.getColumnModel().getLeadingLeaves()).toHaveLength(0);
    expect(root.querySelector(".pte-checkbox-cell")).toBeNull();
  });
});
