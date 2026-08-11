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
  renderer.attach({ current: container });
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
  it("puts the cursor on the first header cell when focus enters the grid", () => {
    const { core, root } = mountGrid();
    root.focus();

    expect(core.getHeaderFocusColIdx()).toBe(0);
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
    expect(core.getHeaderFocusColIdx()).toBe(1);

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
  it("steps with arrows and clamps at both ends rather than wrapping", () => {
    const { core, root } = mountGrid();
    root.focus();
    const last = core.getColumnModel().getLeaves().length - 1;

    press(root, "ArrowLeft");
    expect(core.getHeaderFocusColIdx()).toBe(0); // clamped, not wrapped to the end

    for (let i = 0; i < last + 3; i++) press(root, "ArrowRight");
    expect(core.getHeaderFocusColIdx()).toBe(last);
  });

  it("jumps to the first and last column with Home and End", () => {
    const { core, root } = mountGrid();
    root.focus();
    press(root, "End");
    expect(core.getHeaderFocusColIdx()).toBe(core.getColumnModel().getLeaves().length - 1);
    press(root, "Home");
    expect(core.getHeaderFocusColIdx()).toBe(0);
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
    expect(core.getHeaderFocusColIdx()).toBe(0);

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
  // click plus arrows plus Ctrl+Shift+Space still builds a multi-column selection.
  it("lets arrows keep building a multi-column selection after a click", () => {
    const { core, root } = mountGrid(10, { columnSelection: true });
    root.focus();

    clickHeader(root, core, "region");
    const colIds = () => [...core.getSelectedColumnIds()]
      .map(id => core.getColumnModel().getById(id)?.colId).sort();
    expect(colIds()).toEqual(["region"]);

    press(root, "ArrowRight"); // cursor onto "name" — navigating selects nothing by itself
    expect(colIds()).toEqual(["region"]);
    press(root, " ", { ctrlKey: true, shiftKey: true }); // additive
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
    press(root, "ArrowRight");
    press(root, "ArrowRight");
    const before = core.getHeaderFocusColIdx();
    expect(before).toBe(2);

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

  it("sorts on Enter and on Space, cycling direction", () => {
    const { core, root } = mountGrid();
    focusColumn(root, core, "name");

    press(root, "Enter");
    expect(core.getSortModel().items.map(i => [i.col.colId, i.dir])).toEqual([["name", "asc"]]);
    press(root, " ");
    expect(core.getSortModel().items.map(i => i.dir)).toEqual(["desc"]);
  });

  it("adds to a multi-column sort with the configured modifier", () => {
    const { core, root } = mountGrid(10, { multiSortKey: "shift" });
    focusColumn(root, core, "region");
    press(root, "Enter");
    focusColumn(root, core, "name");
    press(root, "Enter", { shiftKey: true });

    expect(core.getSortModel().items.map(i => i.col.colId)).toEqual(["region", "name"]);
  });

  it("selects the column with Ctrl+Space", () => {
    const { core, root } = mountGrid();
    focusColumn(root, core, "name");
    press(root, " ", { ctrlKey: true });

    const selected = [...core.getSelectedColumnIds()];
    expect(selected).toHaveLength(1);
    expect(core.getColumnModel().getById(selected[0])?.colId).toBe("name");
    // Selecting a column is not sorting it.
    expect(core.getSortModel().items).toHaveLength(0);
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
