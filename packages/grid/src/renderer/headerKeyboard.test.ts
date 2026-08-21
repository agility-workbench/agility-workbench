// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import { initDomRenderer } from "./dom";

/**
 * The header keyboard cursor. The header is row 0 of the grid: ArrowUp off the top row reaches it, arrows
 * move along it, ArrowDown hands the cursor back to the body. Every affordance that was pointer-only —
 * sort, menu, filter, column selection, select-all — has a key here, dispatching the same actions as the
 * mouse path so the two cannot drift.
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

function buildRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    region: i % 2 === 0 ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  }));
}

function mountGrid(rowCount = 10, options: Record<string, unknown> = {}, colDefs?: any[]) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", rowNumbers: true, ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(colDefs ?? [
    { colId: "region", key: "region", label: "Region" },
    { colId: "name", key: "name", label: "Name" },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
  ]);
  api.setRowData(buildRows(rowCount));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { container, core, api, renderer, root };
}

/** A keydown on the root itself — where the header cursor lives. */
function press(root: HTMLElement, key: string, mods: Partial<KeyboardEventInit> = {}) {
  root.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }));
}

const activeHeader = (root: HTMLElement) => root.querySelector<HTMLElement>(".pte-hcell-active");
const activeDescendantEl = (root: HTMLElement) => {
  const id = root.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id) : null;
};
const leafLabels = (core: GridCore) =>
  core.getColumnModel().getLeaves().map(c => c.label ?? c.colId ?? "");

describe("entering and leaving the header", () => {
  it("puts the cursor on the first actionable header cell when focus enters the grid", () => {
    const { core, root } = mountGrid();
    root.focus();

    expect(core.getHeaderFocusColIdx()).toBe(1); // inert row-number header is skipped
    const el = activeHeader(root);
    expect(el).not.toBeNull();
    // Named for AT as well as painted — a columnheader can be the activedescendant just as a
    // gridcell can.
    expect(activeDescendantEl(root)).toBe(el);
    expect(el!.getAttribute("role")).toBe("columnheader");
  });

  it("does not take the cursor back on re-entry once it is in the body", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "ArrowDown");
    expect(core.getHeaderFocusColIdx()).toBeNull();
    expect(core.getActiveCell()).not.toBeNull();

    // Tabbing away to the paginator and back must not throw the user back to the header.
    root.blur();
    root.focus();
    expect(core.getHeaderFocusColIdx()).toBeNull();
    expect(core.getActiveCell()?.row).toBe(0);
  });

  it("jumps to the first and last column with Ctrl/Cmd+Arrow, like Home/End", () => {
    const { core, root } = mountGrid();
    root.focus();
    const first = core.getHeaderFocusColIdx()!;

    press(root, "ArrowRight");
    expect(core.getHeaderFocusColIdx()).toBeGreaterThan(first);

    press(root, "ArrowLeft", { ctrlKey: true });
    expect(core.getHeaderFocusColIdx()).toBe(first);

    press(root, "ArrowRight", { ctrlKey: true });
    const last = core.getHeaderFocusColIdx();
    press(root, "End");
    expect(core.getHeaderFocusColIdx()).toBe(last);
    expect(last).toBeGreaterThan(first);
  });

  // Only a plain arrow crosses the header/body boundary. The body's Ctrl+ArrowUp block-jumps within
  // the body rather than reaching the header, so the header offers no modified way down either.
  it("does nothing on Ctrl/Cmd+ArrowDown, and does not leak the key to the body", () => {
    const { core, root } = mountGrid(12);
    root.focus();
    press(root, "ArrowRight");
    const colIdx = core.getHeaderFocusColIdx()!;

    press(root, "ArrowDown", { ctrlKey: true });
    expect(core.getHeaderFocusColIdx()).toBe(colIdx);
    // Consumed, not declined: falling through to the body's navigate binding would select a cell
    // while the header still holds the cursor, leaving two cursors on screen.
    expect(core.getActiveCell()).toBeNull();

    // ArrowDown then enters the body, where the body's own Ctrl+ArrowDown does the block jump.
    press(root, "ArrowDown");
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx, rowPinned: undefined });
    press(root, "ArrowDown", { ctrlKey: true });
    expect(core.getActiveCell()).toEqual({ row: 11, colIdx, rowPinned: undefined });
  });

  it("does nothing at all on Shift+Arrow while the cursor is on an unselected column", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    root.focus();
    const first = core.getHeaderFocusColIdx()!;

    // Shift+Arrow extends the column selection, so with nothing selected it is inert — deliberately
    // not "move the cursor like a plain arrow", which would look like movement that quietly starts
    // selecting. Still consumed: declining would move the body cursor behind the header.
    press(root, "ArrowRight", { shiftKey: true });
    expect(core.getHeaderFocusColIdx()).toBe(first);
    expect(core.getSelectedColumnIds().size).toBe(0);
    expect(core.getActiveCell()).toBeNull();
  });

  it("hands the cursor to the body on ArrowDown, in the same column", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "ArrowRight");
    press(root, "ArrowRight");
    const colIdx = core.getHeaderFocusColIdx()!;

    press(root, "ArrowDown");
    expect(core.getHeaderFocusColIdx()).toBeNull();
    expect(activeHeader(root)).toBeNull();
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx, rowPinned: undefined });
  });

  it("hands an enabled row-number header to a focus-only row-number body cell", () => {
    const { core, root } = mountGrid(10, {
      rowSelection: true,
      selectAllRowsOnHeaderClick: true,
    });
    root.focus();
    expect(core.getHeaderFocusColIdx()).toBe(0);

    press(root, "ArrowDown");
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 0, rowPinned: undefined });
    expect(core.getSelectionRange()).toBeNull();
    expect(root.querySelector(".pte-row-number-cell-focused")).not.toBeNull();

    press(root, "Enter");
    expect([...core.getSelectedRowIds()]).toEqual(["r0"]);
    expect(core.getActiveCell()?.colIdx).toBe(0);
  });

  it("skips the blank row-number slot when a pinned-top band follows the header", async () => {
    const { core, root } = mountGrid(10, {
      rowSelection: true,
      selectAllRowsOnHeaderClick: true,
      pinnedTopRowData: [{ id: "pt1", region: "TOP", name: "Pinned", total: 0 }],
    });
    await raf();
    root.focus();
    expect(core.getHeaderFocusColIdx()).toBe(0);

    press(root, "ArrowDown");
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 1, rowPinned: "top" });
    press(root, "ArrowLeft");
    expect(core.getActiveCell()?.colIdx).toBe(1); // blank pinned row-number slot is skipped
  });

  it("returns to the header on ArrowUp from the top row, same column", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "ArrowRight");
    press(root, "ArrowDown");
    const colIdx = core.getActiveCell()!.colIdx;

    press(root, "ArrowUp");
    expect(core.getHeaderFocusColIdx()).toBe(colIdx);
    expect(core.getActiveCell()).toBeNull();
    expect(activeHeader(root)).not.toBeNull();
  });

  it("puts a pinned top band between the header and the body, in both directions", async () => {
    const { core, root } = mountGrid(10, {
      pinnedTopRowData: [{ id: "pt1", region: "TOP", name: "Pinned", total: 0 }],
    });
    await raf();
    root.focus();

    // Down from the header lands on the row directly below it on screen, which is the band.
    press(root, "ArrowDown");
    expect(core.getActiveCell()?.rowPinned).toBe("top");
    press(root, "ArrowDown");
    expect(core.getActiveCell()?.rowPinned).toBeUndefined();

    // And back up the same way: body → band → header, one row at a time.
    press(root, "ArrowUp");
    expect(core.getHeaderFocusColIdx()).toBeNull();
    expect(core.getActiveCell()?.rowPinned).toBe("top");
    press(root, "ArrowUp");
    expect(core.getHeaderFocusColIdx()).not.toBeNull();
    expect(core.getActiveCell()).toBeNull();
  });

  it("clears a cell selection when the cursor enters the header", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "ArrowDown");
    expect(core.getSelectionRange()).not.toBeNull();

    press(root, "ArrowUp");
    // Leaving a painted range behind would both look wrong and leave Ctrl+C copying a selection the
    // user can no longer see the cursor in.
    expect(core.getSelectionRange()).toBeNull();
  });

  // The mirror of the rule above. Driven through a real mousedown rather than the `rangeSelectSet`
  // action, because the defect was that the click path did not know the header cursor existed —
  // dispatching the action would have tested the fix and missed the bug.
  it("takes the cursor out of the header when a body cell is clicked", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "ArrowRight");
    expect(core.getHeaderFocusColIdx()).toBe(2);

    const cell = root.querySelectorAll<HTMLElement>(".pte-viewport .pte-cell")[2];
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));

    expect(core.getHeaderFocusColIdx()).toBeNull();
    expect(activeHeader(root)).toBeNull();
    expect(core.getActiveCell()).not.toBeNull();
  });

  it("routes arrow keys to the body after a click, from the clicked cell", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "ArrowRight"); // cursor on the header, column 1

    const cells = [...root.querySelectorAll<HTMLElement>(".pte-viewport .pte-row")[2]
      .querySelectorAll<HTMLElement>(".pte-cell")];
    cells[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
    const clicked = core.getActiveCell()!;

    // The reported symptom: arrows kept walking the header instead of moving the clicked cell.
    press(root, "ArrowDown");
    expect(core.getHeaderFocusColIdx()).toBeNull();
    expect(core.getActiveCell()).toEqual({ ...clicked, row: clicked.row + 1 });
  });
});

describe("moving along the header", () => {
  it("skips an inert row-number header and does not let it select rows", () => {
    const { core, root } = mountGrid(10, {
      rowSelection: false,
      // Even an explicitly requested header gesture cannot enable selection by itself.
      selectAllRowsOnHeaderClick: true,
    });
    root.focus();
    expect(core.getHeaderFocusColIdx()).toBe(1);

    const rowNumber = root.querySelector<HTMLElement>(".pte-hcell-row-number .pte-hcell-content")!;
    rowNumber.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(core.getHeaderFocusColIdx()).toBe(1);
    expect(core.getSelectedRowIds().size).toBe(0);

    core.dispatch({ type: "headerFocusSet", colIdx: 0, reason: "api" });
    expect(core.getHeaderFocusColIdx()).toBe(1);
  });

  it("skips the row-number header when its select-all action is disabled", () => {
    const { core, root } = mountGrid(10, {
      rowSelection: true,
      selectAllRowsOnHeaderClick: false,
    });
    root.focus();
    expect(core.getHeaderFocusColIdx()).toBe(1);
    press(root, "Home");
    expect(core.getHeaderFocusColIdx()).toBe(1);
  });

  it("moves header and body cursors off row numbers when row selection is disabled at runtime", () => {
    const headerGrid = mountGrid(10, {
      rowSelection: true,
      selectAllRowsOnHeaderClick: true,
    });
    headerGrid.root.focus();
    expect(headerGrid.core.getHeaderFocusColIdx()).toBe(0);
    headerGrid.renderer.setRowSelectionOptions(false);
    expect(headerGrid.core.getHeaderFocusColIdx()).toBe(1);

    const bodyGrid = mountGrid(10, { rowSelection: true });
    bodyGrid.root.focus();
    press(bodyGrid.root, "ArrowDown");
    press(bodyGrid.root, "ArrowLeft");
    expect(bodyGrid.core.getActiveCell()?.colIdx).toBe(0);
    bodyGrid.renderer.setRowSelectionOptions(false);
    expect(bodyGrid.core.getActiveCell()?.colIdx).toBe(1);
    expect(bodyGrid.core.getSelectionRange()).not.toBeNull();
  });

  it("steps with arrows and clamps at both ends rather than wrapping", () => {
    const { core, root } = mountGrid();
    root.focus();
    const last = core.getColumnModel().getLeaves().length - 1;

    press(root, "ArrowLeft");
    expect(core.getHeaderFocusColIdx()).toBe(1); // clamped at the first actionable header

    for (let i = 0; i < last + 3; i++) press(root, "ArrowRight");
    expect(core.getHeaderFocusColIdx()).toBe(last);
  });

  it("jumps to the first and last column with Home and End", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "End");
    expect(core.getHeaderFocusColIdx()).toBe(core.getColumnModel().getLeaves().length - 1);
    press(root, "Home");
    expect(core.getHeaderFocusColIdx()).toBe(1);
  });

  it("paints exactly one cursor as it moves", () => {
    const { root } = mountGrid();
    root.focus();
    press(root, "ArrowRight");
    press(root, "ArrowRight");
    expect(root.querySelectorAll(".pte-hcell-active")).toHaveLength(1);
    expect(activeDescendantEl(root)).toBe(activeHeader(root));
  });
});

describe("a click on a header cell moves the cursor", () => {
  /** Click a leaf header cell's label, as a user reaching for that column would. */
  const clickHeader = (root: HTMLElement, core: GridCore, colId: string) => {
    const col = core.getColumnModel().getLeaves().find(c => c.colId === colId)!;
    const target = document.getElementById(col.instanceID)!
      .querySelector<HTMLElement>(".pte-hcell-content")!;
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    return core.getColumnModel().getLeaves().findIndex(c => c.colId === colId);
  };

  it("focuses the clicked cell instead of leaving the cursor where it was", () => {
    const { core, root } = mountGrid();
    root.focus();
    expect(core.getHeaderFocusColIdx()).toBe(1);

    const expected = clickHeader(root, core, "total");
    expect(core.getHeaderFocusColIdx()).toBe(expected);
    expect(activeHeader(root)?.id).toBe(core.getColumnModel().getLeaves()[expected].instanceID);
    expect(root.querySelectorAll(".pte-hcell-active")).toHaveLength(1);
  });

  it("resumes arrow navigation from the clicked cell", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "ArrowRight"); // cursor at 1, deliberately away from the click target

    const clicked = clickHeader(root, core, "total");
    press(root, "ArrowLeft");
    expect(core.getHeaderFocusColIdx()).toBe(clicked - 1);
  });

  // A header click replaces the *column* selection with the clicked column — long-standing mouse
  // behaviour, nothing to do with the cursor. What matters is that arrows carry on from there, so a
  // click plus arrows plus Ctrl+Space still builds a multi-column selection.
  it("lets arrows keep building a multi-column selection after a click", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    root.focus();

    clickHeader(root, core, "region");
    const colIds = () => [...core.getSelectedColumnIds()]
      .map(id => core.getColumnModel().getById(id)?.colId).sort();
    expect(colIds()).toEqual(["region"]);

    press(root, "ArrowRight"); // cursor onto "name" — navigating selects nothing by itself
    expect(colIds()).toEqual(["region"]);
    press(root, " ", { ctrlKey: true }); // additive
    expect(colIds()).toEqual(["name", "region"]);
  });

  // columnSelection off deliberately: with it on, the click's own column-select path clears the cell
  // range too, and this test would pass whether or not the cursor move did its job.
  it("takes the cursor off a body cell when a header is clicked", () => {
    const { core, root } = mountGrid(10, { columnSelection: false });
    root.focus();
    press(root, "ArrowDown"); // into the body
    expect(core.getActiveCell()).not.toBeNull();

    clickHeader(root, core, "name");
    // Same rule as entering the header with ArrowUp: the cell cursor cannot outlive the move, or
    // Ctrl+C would copy a range the user can no longer see the cursor in.
    expect(core.getActiveCell()).toBeNull();
    expect(core.getSelectionRange()).toBeNull();
    expect(core.getHeaderFocusColIdx()).not.toBeNull();
  });

  // Moving the cursor on *any* header click meant opening a column menu wiped the user's cell
  // selection. A button inside the header is a control, not a choice of cell — and Alt+ArrowDown opens
  // the menu for the column the cursor already occupies, so the keyboard route never moves it either.
  it("leaves the cursor and the cell selection alone when a header button is clicked", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "ArrowDown"); // cursor into the body, with a 1x1 range
    const active = core.getActiveCell();
    expect(active).not.toBeNull();

    const menuBtn = root.querySelector<HTMLElement>(".pte-header .pte-hcell-menu-menuBtn")!;
    menuBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    expect(core.getHeaderFocusColIdx()).toBeNull();
    expect(core.getActiveCell()).toEqual(active);
    expect(core.getSelectionRange()).not.toBeNull();

    // Close it again: an open menu owns the arrow keys, and these grids are never unmounted, so leaving
    // it open swallows the arrows of whichever test runs next.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.querySelector(".pte-menu")).toBeNull();
  });

  it("ignores a click on a parent group header, which the cursor cannot reach", () => {
    const { core, root } = mountGrid(10, {}, [
      { colId: "region", key: "region", label: "Region" },
      {
        colId: "grp", label: "Group", children: [
          { colId: "name", key: "name", label: "Name" },
          { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
        ],
      },
    ]);
    root.focus();
    // Away from leaf 0, so a cursor that wrongly snaps to the first column is visible here.
    press(root, "End");
    const before = core.getHeaderFocusColIdx();
    expect(before).toBe(3);

    const parent = [...root.querySelectorAll<HTMLElement>(".pte-hcell")]
      .find(h => !h.classList.contains("pte-hcell-leaf"))!;
    parent.querySelector<HTMLElement>(".pte-hcell-content")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    expect(core.getHeaderFocusColIdx()).toBe(before);
  });
});

describe("acting on the focused column", () => {
  const focusColumn = (root: HTMLElement, core: GridCore, colId: string) => {
    root.focus();
    const target = core.getColumnModel().getLeaves().findIndex(c => c.colId === colId);
    core.dispatch({ type: "headerFocusSet", colIdx: target, reason: "api" });
    return target;
  };

  it("sorts on Enter, cycling direction, and never on Space", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    focusColumn(root, core, "name");

    press(root, "Enter");
    expect(core.getSortModel().items.map(i => [i.col.colId, i.dir])).toEqual([["name", "asc"]]);
    press(root, "Enter");
    expect(core.getSortModel().items.map(i => i.dir)).toEqual(["desc"]);

    // Space is column selection now. Each key has one job, so Space cannot also advance the sort.
    press(root, " ");
    expect(core.getSortModel().items.map(i => i.dir)).toEqual(["desc"]);
  });

  it("adds to a multi-column sort with Ctrl/Cmd+Enter", () => {
    const { core, root } = mountGrid();
    focusColumn(root, core, "region");
    press(root, "Enter");
    focusColumn(root, core, "name");
    press(root, "Enter", { ctrlKey: true });

    expect(core.getSortModel().items.map(i => i.col.colId)).toEqual(["region", "name"]);

    // Plain Enter still replaces the whole sort.
    press(root, "Enter");
    expect(core.getSortModel().items.map(i => i.col.colId)).toEqual(["name"]);
  });

  it("sorts every selected column on Shift+Enter", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    focusColumn(root, core, "region");
    press(root, " ");
    focusColumn(root, core, "total");
    press(root, " ", { ctrlKey: true });
    const sorted = () => core.getSortModel().items.map(i => [i.col.colId, i.dir]);

    // One keystroke, the whole selection, one shared direction — the keyboard counterpart of the
    // multi-column menu's Sort Ascending.
    press(root, "Enter", { shiftKey: true });
    expect(sorted()).toEqual([["region", "asc"], ["total", "asc"]]);

    // The group direction advances together: all-ascending → descending for both.
    press(root, "Enter", { shiftKey: true });
    expect(sorted()).toEqual([["region", "desc"], ["total", "desc"]]);
  });

  it("degrades Shift+Enter to a plain sort when one column is selected", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    focusColumn(root, core, "region");
    press(root, "Enter"); // sort region ascending
    focusColumn(root, core, "name");
    press(root, " "); // select only "name"
    press(root, "Enter", { shiftKey: true });

    // A selection of one is just this column — and like plain Enter it replaces the sort.
    expect(core.getSortModel().items.map(i => [i.col.colId, i.dir])).toEqual([["name", "asc"]]);
  });

  it("selects the column with Space, and adds to the selection with Ctrl/Cmd+Space", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    const colIds = () => [...core.getSelectedColumnIds()]
      .map(id => core.getColumnModel().getById(id)?.colId);
    focusColumn(root, core, "name");
    press(root, " ");
    expect(colIds()).toEqual(["name"]);
    // Selecting a column is not sorting it.
    expect(core.getSortModel().items).toHaveLength(0);

    focusColumn(root, core, "total");
    press(root, " ", { ctrlKey: true });
    expect(colIds()).toEqual(["name", "total"]);
    // ...and Ctrl/Cmd+Space toggles, so pressing it again drops the column.
    press(root, " ", { ctrlKey: true });
    expect(colIds()).toEqual(["name"]);

    // Plain Space replaces.
    focusColumn(root, core, "region");
    press(root, " ");
    expect(colIds()).toEqual(["region"]);
  });

  it("toggles select-all from the row-number header, and never sorts it", () => {
    const { core, api, root } = mountGrid(10, { rowSelection: true, selectAllRowsOnHeaderClick: true });
    root.focus(); // lands on the row-number column, which is leaf 0
    expect(core.getColumnModel().getLeaves()[0].isRowNumberColumn()).toBe(true);

    press(root, "Enter");
    expect(api.getSelectedRows()).toHaveLength(10);
    press(root, "Enter");
    expect(api.getSelectedRows()).toHaveLength(0);
    expect(core.getSortModel().items).toHaveLength(0);
  });

  it("selects all rows from the row-number header on Space too, without selecting the column", () => {
    const { core, api, root } = mountGrid(10, {
      rowSelection: true, selectAllRowsOnHeaderClick: true, columnSelection: true,
    });
    root.focus();

    press(root, " ");
    expect(api.getSelectedRows()).toHaveLength(10);
    // Ctrl+A selects the body, not the headers — so a utility header must never seed a *column*
    // selection, which is also what keeps Shift+Arrow inert there.
    expect(core.getSelectedColumnIds().size).toBe(0);
  });

  it("opens the column menu with Alt+ArrowDown", () => {
    const { core, root } = mountGrid();
    focusColumn(root, core, "name");
    press(root, "ArrowDown", { altKey: true });

    const menu = document.querySelector<HTMLElement>(".pte-menu");
    expect(menu).not.toBeNull();
    expect(menu!.getAttribute("role")).toBe("menu");
    expect(menu!.querySelectorAll(".pte-menu-item").length).toBeGreaterThan(0);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  it("does not start a cell edit from the header", () => {
    const { core, root } = mountGrid();
    focusColumn(root, core, "name");

    // Enter is "edit this cell" in the body, and a printable key is type-to-edit. Neither should
    // happen because the user pressed a key on a column header.
    press(root, "Enter");
    press(root, "x");
    expect(core.getEditingCell()).toBeNull();
  });
});

/**
 * Shift+Arrow extends the column selection from the cursor's column — and does nothing at all,
 * cursor included, unless the cursor is already on a selected column. The anchor is what makes an
 * extension that reverses direction shrink instead of accumulating.
 */
describe("extending the column selection from the header", () => {
  const focusColumn = (root: HTMLElement, core: GridCore, colId: string) => {
    root.focus();
    const target = core.getColumnModel().getLeaves().findIndex(c => c.colId === colId);
    core.dispatch({ type: "headerFocusSet", colIdx: target, reason: "api" });
    return target;
  };
  const colIds = (core: GridCore) => [...core.getSelectedColumnIds()]
    .map(id => core.getColumnModel().getById(id)?.colId);

  it("grows with Shift+Arrow and shrinks again when the direction reverses", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    focusColumn(root, core, "total");
    press(root, " ");

    press(root, "ArrowLeft", { shiftKey: true });
    // Leaf order, not the order the range was built in.
    expect(colIds(core)).toEqual(["name", "total"]);
    press(root, "ArrowLeft", { shiftKey: true });
    expect(colIds(core)).toEqual(["region", "name", "total"]);

    // Back towards the anchor: the range is rebuilt from anchor..cursor every press, so reversing
    // shrinks it rather than starting a second range.
    press(root, "ArrowRight", { shiftKey: true });
    expect(colIds(core)).toEqual(["name", "total"]);
    expect(core.getColumnModel().getLeaves()[core.getHeaderFocusColIdx()!].colId).toBe("name");
  });

  it("extends past the anchor and back, keeping the anchor put", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    focusColumn(root, core, "name");
    press(root, " ");

    press(root, "ArrowRight", { shiftKey: true });
    expect(colIds(core)).toEqual(["name", "total"]);
    // Two steps left crosses the anchor: the range flips to the other side rather than spanning both.
    press(root, "ArrowLeft", { shiftKey: true });
    press(root, "ArrowLeft", { shiftKey: true });
    expect(colIds(core)).toEqual(["region", "name"]);
  });

  it("extends to the first and last selectable column with Shift+Home / Shift+End", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    focusColumn(root, core, "name");
    press(root, " ");

    press(root, "End", { shiftKey: true });
    expect(colIds(core)).toEqual(["name", "total"]);
    press(root, "Home", { shiftKey: true });
    // Home stops at the first *selectable* column: the row-number header is not one, so the range
    // steps over it instead of clamping short.
    expect(colIds(core)).toEqual(["region", "name"]);
    expect(core.getColumnModel().getLeaves()[core.getHeaderFocusColIdx()!].colId).toBe("region");
  });

  it("stays inert on a utility header, where no column is selected", () => {
    const { core, root } = mountGrid(10, {
      columnSelection: true, rowSelection: true, selectAllRowsOnHeaderClick: true,
    });
    root.focus(); // the row-number header, leaf 0
    const at = core.getHeaderFocusColIdx();

    press(root, "ArrowRight", { shiftKey: true });
    expect(core.getHeaderFocusColIdx()).toBe(at);
    expect(core.getSelectedColumnIds().size).toBe(0);
  });

  it("gives up the range when the cursor enters the body", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    focusColumn(root, core, "region");
    press(root, " ");
    press(root, "ArrowRight", { shiftKey: true });
    expect(colIds(core)).toEqual(["region", "name"]);

    press(root, "ArrowDown");
    expect(core.getSelectedColumnIds().size).toBe(0);
    // ...and the anchor goes with it: a fresh Space in the header starts over.
    expect(core.getActiveCell()).not.toBeNull();
  });

  it("does nothing when column selection is disabled", () => {
    const { core, root } = mountGrid(10, { columnSelection: false });
    focusColumn(root, core, "name");
    press(root, " ");
    const at = core.getHeaderFocusColIdx();

    press(root, "ArrowRight", { shiftKey: true });
    expect(core.getHeaderFocusColIdx()).toBe(at);
    expect(core.getSelectedColumnIds().size).toBe(0);
  });
});

describe("the cursor survives the header being rebuilt", () => {
  it("re-paints and re-points after a column change", async () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "ArrowRight");
    const before = core.getHeaderFocusColIdx();

    // Sorting rebuilds header cells, so the painted class and the activedescendant id would both be
    // left on detached elements.
    core.dispatch({ type: "columnDefsSet", defs: [
      { colId: "region", key: "region", label: "Region" },
      { colId: "name", key: "name", label: "Name" },
      { colId: "total", key: "total", label: "Total" },
    ] } as any);
    await raf();

    expect(core.getHeaderFocusColIdx()).toBe(before);
    const el = activeHeader(root);
    expect(el).not.toBeNull();
    expect(el!.isConnected).toBe(true);
    expect(activeDescendantEl(root)).toBe(el);
  });

  it("clamps the cursor when columns disappear beneath it", async () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "End");
    expect(core.getHeaderFocusColIdx()).toBe(leafLabels(core).length - 1);

    core.dispatch({ type: "columnDefsSet", defs: [
      { colId: "region", key: "region", label: "Region" },
    ] } as any);
    await raf();

    const leafCount = core.getColumnModel().getLeaves().length;
    expect(core.getHeaderFocusColIdx()).toBeLessThan(leafCount);
    expect(activeHeader(root)?.isConnected).toBe(true);
  });
});
