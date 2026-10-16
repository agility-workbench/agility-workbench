// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource } from "../interfaces/serverSide";
import { initDomRenderer } from "./dom";

/**
 * `groupSelectsChildren`: a group row's checkbox stands for its subtree. Toggling it selects every
 * selectable descendant leaf (collapsed ones included, filtered-out and app-disabled ones never),
 * or clears them all when all are selected. Selection storage stays leaf ids; the group's checkbox
 * paints the derived tri-state (tick / dash, aria-checked true / mixed / false). Tree-data parents
 * are data rows and select themselves along with their descendants.
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

// r0..r3 are AMER (teams A, A, B, B), r4..r7 EMEA (A, A, B, B).
const ROWS = Array.from({ length: 8 }, (_, i) => ({
  id: `r${i}`,
  region: i < 4 ? "AMER" : "EMEA",
  team: i % 4 < 2 ? "A" : "B",
  name: `Account ${i}`,
}));

function mountGrid(options: Record<string, unknown> = {}, groupBy: string[] = ["region"]) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    rowSelection: { checkboxes: true },
    groupSelectsChildren: true,
    ...options,
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "team", key: "team", label: "Team" },
    { colId: "name", key: "name", label: "Name" },
  ]);
  api.setRowData(ROWS.map(row => ({ ...row })));
  if (groupBy.length > 0) core.dispatch({ type: "rowGroupSet", colIds: groupBy } as any);
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { container, core, api, root };
}

function checkboxCell(root: HTMLElement, viewIdx: number): HTMLElement {
  const row = root.querySelector<HTMLElement>(`.pte-leading-viewport .pte-row[data-view-idx="${viewIdx}"]`)
    ?? [...root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`)]
      .find(r => r.querySelector(".pte-checkbox-cell"))!;
  return row.querySelector<HTMLElement>(".pte-checkbox-cell")!;
}

function viewIdxOf(core: GridCore, predicate: (node: any) => boolean): number {
  for (let i = 0; i < core.getRowModel().getViewCount(); i++) {
    if (predicate(core.getRowModel().getRowNodeAtViewIndex(i))) return i;
  }
  throw new Error("no such row in view");
}

const groupIdx = (core: GridCore, key: string) =>
  viewIdxOf(core, node => node?.isGroup && node.groupKey === key);

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

function boxState(cell: HTMLElement) {
  return {
    checked: cell.classList.contains("selected"),
    dash: cell.querySelector(".pte-checkbox")!.classList.contains("pte-checkbox-indeterminate"),
    aria: cell.getAttribute("aria-checked"),
  };
}

const sorted = (ids: Iterable<string>) => [...ids].sort();

describe("groupSelectsChildren: group checkboxes", () => {
  it("selects every leaf of a collapsed group, and clears them when all are selected", () => {
    const { core, root } = mountGrid();
    const reasons: Array<string | undefined> = [];
    core.on("selectionChanged", event => reasons.push(event.reason));
    const amer = groupIdx(core, "AMER");
    expect(core.getRowModel().getRowNodeAtViewIndex(amer)!.isExpanded).toBe(false);

    click(checkboxCell(root, amer));
    // Collapsed descendants count; the group id itself is never stored.
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]);
    expect(reasons).toEqual(["mouse"]); // one event per gesture
    expect(boxState(checkboxCell(root, amer))).toEqual({ checked: true, dash: false, aria: "true" });
    expect(core.getSelectedRows().map((row: any) => row.id).sort()).toEqual(["r0", "r1", "r2", "r3"]);
    expect(core.getSelectedNodes().every(node => !node.isGroup)).toBe(true);

    click(checkboxCell(root, amer));
    expect(core.getSelectedRowIds().size).toBe(0);
    expect(boxState(checkboxCell(root, amer))).toEqual({ checked: false, dash: false, aria: "false" });
  });

  it("paints a partial group indeterminate, and its next click completes it", () => {
    const { core, root, api } = mountGrid();
    const amer = groupIdx(core, "AMER");
    api.selectRowsById(["r1"]);
    expect(boxState(checkboxCell(root, amer))).toEqual({ checked: false, dash: true, aria: "mixed" });
    // The row's own selected state stays off while partial.
    expect(checkboxCell(root, amer).closest(".pte-row")).toBeTruthy();

    click(checkboxCell(root, amer));
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]);
    expect(boxState(checkboxCell(root, amer))).toEqual({ checked: true, dash: false, aria: "true" });
  });

  it("nested groups: the inner group selects its leaves, the outer derives from all of them", () => {
    const { core, root, api } = mountGrid({}, ["region", "team"]);
    api.setAllGroupsExpanded(true);
    const amer = groupIdx(core, "AMER");
    const amerA = viewIdxOf(core, node => node?.isGroup && node.groupKey === "A"
      && node.parentId === core.getRowModel().getRowNodeAtViewIndex(amer)!.id);

    click(checkboxCell(root, amerA));
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1"]);
    expect(boxState(checkboxCell(root, amerA)).aria).toBe("true");
    expect(boxState(checkboxCell(root, amer))).toEqual({ checked: false, dash: true, aria: "mixed" });

    click(checkboxCell(root, amer)); // partial → complete
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]);
    expect(boxState(checkboxCell(root, amer)).aria).toBe("true");
    // A fully selected group row paints as selected (fill + aria-selected on its ARIA row).
    const amerRow = root.querySelector<HTMLElement>(`.pte-viewport > .pte-row[data-view-idx="${amer}"]`)!;
    expect(amerRow.getAttribute("aria-selected")).toBe("true");
  });

  it("skips filtered-out rows", () => {
    const { core, root } = mountGrid();
    const nameCol = core.getColumnModel().getByColId("name")!;
    core.setFilterModel([{
      col: nameCol, key: "name", filters: [{ type: "notContains" as any, values: ["Account 2"] }],
    }]);
    const amer = groupIdx(core, "AMER");
    click(checkboxCell(root, amer));
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r3"]);
    expect(boxState(checkboxCell(root, amer)).aria).toBe("true");
  });

  it("skips rows isRowSelectable refuses; they do not count toward the tri-state", () => {
    const { core, root } = mountGrid({ isRowSelectable: (node: any) => node.isGroup || node.data.id !== "r0" });
    const amer = groupIdx(core, "AMER");
    click(checkboxCell(root, amer));
    expect(sorted(core.getSelectedRowIds())).toEqual(["r1", "r2", "r3"]);
    expect(boxState(checkboxCell(root, amer))).toEqual({ checked: true, dash: false, aria: "true" });
    expect(core.areAllRowsSelected()).toBe(false); // EMEA is still unselected
  });

  it("disables the checkbox of a group with nothing selectable under it", () => {
    const { core, root } = mountGrid({ isRowSelectable: (node: any) => node.isGroup || node.data.region !== "EMEA" });
    const emea = groupIdx(core, "EMEA");
    const cell = checkboxCell(root, emea);
    expect(cell.classList.contains("pte-checkbox-cell-disabled")).toBe(true);
    expect(cell.getAttribute("aria-disabled")).toBe("true");
    click(cell);
    expect(core.getSelectedRowIds().size).toBe(0);
    const amer = checkboxCell(root, groupIdx(core, "AMER"));
    expect(amer.classList.contains("pte-checkbox-cell-disabled")).toBe(false);
  });

  it("Shift+click ranges: a group in the range contributes its subtree", () => {
    const { core, root } = mountGrid();
    const amerId = core.getRowModel().getRowNodeAtViewIndex(groupIdx(core, "AMER"))!.id;
    core.dispatch({ type: "groupToggleExpand", groupId: amerId } as any);
    // view: AMER, r0..r3, EMEA (collapsed)
    const r2 = viewIdxOf(core, node => node?.id === "r2");
    const emea = groupIdx(core, "EMEA");
    click(checkboxCell(root, r2));
    click(checkboxCell(root, emea), { shiftKey: true });
    expect(sorted(core.getSelectedRowIds())).toEqual(["r2", "r3", "r4", "r5", "r6", "r7"]);
  });

  it("header select-all covers leaves, never group ids, and reads the tri-state", () => {
    const { core, root } = mountGrid();
    const header = root.querySelector<HTMLElement>(".pte-hcell-checkbox")!;
    const box = header.querySelector<HTMLElement>(".pte-select-all-checkbox")!;
    click(header);
    expect(sorted(core.getSelectedRowIds())).toEqual(ROWS.map(r => r.id).sort());
    expect(core.areAllRowsSelected()).toBe(true);
    expect(box.classList.contains("selected")).toBe(true);
    expect(boxState(checkboxCell(root, groupIdx(core, "AMER"))).aria).toBe("true");

    click(checkboxCell(root, groupIdx(core, "EMEA"))); // clears EMEA's leaves
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]);
    expect(box.classList.contains("pte-checkbox-indeterminate")).toBe(true);
    expect(core.areAllRowsSelected()).toBe(false);
  });

  it("Space on a group row's checkbox cell toggles the subtree; arrows stop there in that column only", () => {
    const { core, root } = mountGrid({ highlightActiveCell: true });
    const checkboxColIdx = core.getColumnModel().getLeaves().findIndex(col => col.isSelectionCheckboxColumn());
    const amer = groupIdx(core, "AMER");
    const emea = groupIdx(core, "EMEA");
    core.dispatch({ type: "focusSet", viewIdx: amer, colIdx: checkboxColIdx, reason: "keyboard" });
    root.focus();
    expect(core.getActiveCell()?.row).toBe(amer);

    press(root, " ");
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]);

    // Group rows are checkbox-column stops: ArrowDown reaches the next group row's checkbox.
    press(root, "ArrowDown");
    expect(core.getActiveCell()).toEqual({ row: emea, colIdx: checkboxColIdx, rowPinned: undefined });
    press(root, "Enter");
    expect(core.getSelectedRowIds().size).toBe(8);

    // …but not cell-selection targets: the cursor cannot step sideways onto the group's data cells.
    press(root, "ArrowRight");
    expect(core.getActiveCell()?.colIdx).toBe(checkboxColIdx);
    expect(core.getSelectionRange()).toBeNull();
  });

  it("selectAllScope 'page' covers the page's groups' subtrees, collapsed leaves included", () => {
    const { core, root } = mountGrid({ selectAllScope: "page", pagination: true, pageSize: 1 });
    // Page 1 holds just the AMER group row (collapsed).
    expect(core.getRowModel().getViewCount()).toBe(1);
    click(root.querySelector<HTMLElement>(".pte-hcell-checkbox")!);
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]);
    expect(core.areAllRowsSelected()).toBe(true);
  });

  it("single-selection mode ignores the option: group rows select as before", () => {
    const { core, root } = mountGrid({ rowSelection: { checkboxes: true, mode: "single" } });
    click(checkboxCell(root, groupIdx(core, "AMER")));
    expect(core.getSelectedRowIds().size).toBe(0);
    expect(checkboxCell(root, groupIdx(core, "AMER")).hasAttribute("aria-checked")).toBe(false);
  });

  it("groupRowsSelectable keeps group rows cell targets, but their checkbox still selects the subtree", () => {
    const { core, root } = mountGrid({ groupRowsSelectable: true });
    const amer = groupIdx(core, "AMER");
    click(checkboxCell(root, amer));
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]);
    const nameColIdx = core.getColumnModel().getLeaves().findIndex(col => col.colId === "name");
    core.dispatch({ type: "focusSet", viewIdx: amer, colIdx: nameColIdx, reason: "mouse" });
    expect(core.getActiveCell()?.row).toBe(amer);
  });

  it("the row-number replace gesture selects a group's subtree, and clears it when repeated", () => {
    const { core, root } = mountGrid({ groupRowsSelectable: true, rowNumbers: true });
    const amer = groupIdx(core, "AMER");
    const rowNumber = [...root.querySelectorAll<HTMLElement>(`.pte-row[data-view-idx="${amer}"]`)]
      .map(r => r.querySelector<HTMLElement>(".pte-row-number-cell")).find(Boolean)!;
    core.selectRowsById(["r5"]);
    click(rowNumber);
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]); // replaces r5
    click(rowNumber);
    expect(core.getSelectedRowIds().size).toBe(0);
  });

  it("can be switched at runtime; turning it on drops stored group ids", () => {
    const { core, root } = mountGrid({ groupSelectsChildren: false, groupRowsSelectable: true });
    const amer = groupIdx(core, "AMER");
    const amerId = core.getRowModel().getRowNodeAtViewIndex(amer)!.id;
    click(checkboxCell(root, amer));
    expect([...core.getSelectedRowIds()]).toEqual([amerId]); // today's behaviour: the group row itself

    core.setGroupSelectsChildren(true);
    expect(core.getSelectedRowIds().size).toBe(0);
    click(checkboxCell(root, amer));
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]);
  });
});

describe("groupSelectsChildren off (default)", () => {
  it("leaves group checkboxes exactly as before", () => {
    const { core, root } = mountGrid({ groupSelectsChildren: undefined });
    const amer = groupIdx(core, "AMER");
    click(checkboxCell(root, amer));
    expect(core.getSelectedRowIds().size).toBe(0); // group rows are not checkable
    expect(checkboxCell(root, amer).hasAttribute("aria-checked")).toBe(false);
    click(root.querySelector<HTMLElement>(".pte-hcell-checkbox")!);
    expect(core.getSelectedRowIds().size).toBe(8);
    expect(checkboxCell(root, amer).querySelector(".pte-checkbox-indeterminate")).toBeNull();
  });
});

describe("groupSelectsChildren on full-width group rows (groupDisplayType: groupRows)", () => {
  it("keeps the checkbox beside the spanning host; it toggles the subtree and shows the mixed state", () => {
    const { core, root, api } = mountGrid({ groupDisplayType: "groupRows" });
    const amer = groupIdx(core, "AMER");
    expect(core.isFullWidthNode(core.getRowModel().getRowNodeAtViewIndex(amer))).toBe(true);
    const cell = checkboxCell(root, amer);
    expect(cell.style.display).not.toBe("none");
    expect(cell.style.visibility).toBe("");
    const fragment = cell.closest<HTMLElement>(".pte-row")!;
    expect(fragment.classList).toContain("pte-full-width-fragment");
    expect(fragment.hasAttribute("aria-hidden")).toBe(false);
    // Every other cell of that fragment keeps its box (so the checkbox keeps its x) but is invisible.
    for (const other of fragment.querySelectorAll<HTMLElement>(".pte-cell:not(.pte-checkbox-cell)")) {
      expect(other.style.visibility).toBe("hidden");
    }
    // The host's ARIA range starts after the checkbox column.
    const host = root.querySelector<HTMLElement>(`.pte-row[data-view-idx="${amer}"] .pte-full-width-cell`)!;
    const checkboxCol = core.getColumnModel().getLeaves().findIndex(c => c.isSelectionCheckboxColumn());
    expect(host.getAttribute("aria-colindex")).toBe(String(checkboxCol + 2));

    click(cell);
    expect(sorted(core.getSelectedRowIds())).toEqual(["r0", "r1", "r2", "r3"]);
    expect(boxState(checkboxCell(root, amer))).toEqual({ checked: true, dash: false, aria: "true" });
    api.selectRowsById(["r1"], "remove");
    expect(boxState(checkboxCell(root, amer))).toEqual({ checked: false, dash: true, aria: "mixed" });
  });

  it("restores the fragment when the option is off or the slot returns to a leaf", () => {
    const { core, root, api } = mountGrid({ groupDisplayType: "groupRows", groupSelectsChildren: false });
    const amer = groupIdx(core, "AMER");
    const fragment = checkboxCell(root, amer).closest<HTMLElement>(".pte-row")!;
    expect(checkboxCell(root, amer).style.display).toBe("none");
    expect(fragment.getAttribute("aria-hidden")).toBe("true");

    api.updateGridOptions({ groupSelectsChildren: true });
    expect(checkboxCell(root, amer).style.display).not.toBe("none");
    api.setAllGroupsExpanded(true);
    // Slot 1 now holds a leaf: every cell is back to normal.
    const leafFragment = root.querySelector<HTMLElement>(`.pte-leading-viewport .pte-row[data-view-idx="1"]`)
      ?? checkboxCell(root, 1).closest<HTMLElement>(".pte-row")!;
    for (const cell of leafFragment.querySelectorAll<HTMLElement>(".pte-cell")) {
      expect(cell.style.visibility).toBe("");
      expect(cell.style.display).not.toBe("none");
    }
  });

  it("a docked full-width group's mirror carries the checkbox too", async () => {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowSelection: { checkboxes: true },
      groupSelectsChildren: true,
      groupRowsSticky: true,
      groupDisplayType: "groupRows",
    } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach(container);
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
      { colId: "name", key: "name", label: "Name" },
    ]);
    api.setRowData(Array.from({ length: 200 }, (_, i) => ({
      id: `r${i}`, region: i < 100 ? "AMER" : "EMEA", name: `Account ${i}`,
    })));
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
    await raf();
    api.setAllGroupsExpanded(true);
    await raf();
    const scroller = container.querySelector<HTMLElement>(".pte-body")!;
    scroller.scrollTop = 5 * core.options.rowHeight;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();

    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
    const mirrorCell = container.querySelector<HTMLElement>(
      `.pte-sticky-rows .pte-sticky-row[data-row-id="${group.id}"] .pte-checkbox-cell`,
    );
    expect(mirrorCell).toBeTruthy();
    expect(mirrorCell!.querySelector(".pte-checkbox")).toBeTruthy();
    click(mirrorCell!);
    expect(core.getSelectedRowIds().size).toBe(100);
    expect(mirrorCell!.getAttribute("aria-checked")).toBe("true");
  });
});

describe("groupSelectsChildren with tree data", () => {
  const TREE = [
    { id: "a", name: "A", path: ["A"] },
    { id: "b", name: "B", path: ["A", "B"] },
    { id: "c", name: "C", path: ["A", "B", "C"] },
    { id: "d", name: "D", path: ["A", "D"] },
    { id: "e", name: "E", path: ["E"] },
  ];

  function mountTree(options: Record<string, unknown> = {}) {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowSelection: { checkboxes: true },
      groupSelectsChildren: true,
      treeData: { mode: "path", getPath: (row: any) => row.path },
      groupDefaultExpanded: -1,
      ...options,
    } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach(container);
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name" }]);
    api.setRowData(TREE.map(row => ({ ...row })));
    const root = container.querySelector<HTMLElement>(".pte-root")!;
    return { core, api, root };
  }

  const idx = (core: GridCore, id: string) => viewIdxOf(core, node => node?.id === id);

  it("a parent selects itself and every descendant; partial descendants read as mixed", () => {
    const { core, root } = mountTree();
    click(checkboxCell(root, idx(core, "a")));
    expect(sorted(core.getSelectedRowIds())).toEqual(["a", "b", "c", "d"]);
    expect(boxState(checkboxCell(root, idx(core, "a"))).aria).toBe("true");

    click(checkboxCell(root, idx(core, "c"))); // a leaf toggles itself
    expect(sorted(core.getSelectedRowIds())).toEqual(["a", "b", "d"]);
    // The parent itself is still selected, but its subtree is not complete: the dash, not the tick.
    expect(boxState(checkboxCell(root, idx(core, "a")))).toEqual({ checked: false, dash: true, aria: "mixed" });
    expect(boxState(checkboxCell(root, idx(core, "b"))).aria).toBe("mixed");

    click(checkboxCell(root, idx(core, "a"))); // partial → complete
    expect(sorted(core.getSelectedRowIds())).toEqual(["a", "b", "c", "d"]);
    click(checkboxCell(root, idx(core, "a")));
    expect(core.getSelectedRowIds().size).toBe(0);
  });

  it("includes collapsed descendants and leaves a parent kept only as an ancestor of a match", () => {
    const { core, root, api } = mountTree();
    const nameCol = core.getColumnModel().getByColId("name")!;
    core.setFilterModel([{
      col: nameCol, key: "name", filters: [{ type: "eq" as any, values: ["C"] }],
    }]);
    // "a" and "b" stay on screen only to reach "c".
    api.setAllGroupsExpanded(false);
    click(checkboxCell(root, idx(core, "a")));
    expect(sorted(core.getSelectedRowIds())).toEqual(["c"]);
    expect(core.areAllRowsSelected()).toBe(true);
  });
});

describe("groupSelectsChildren on the sticky mirror", () => {
  it("a docked group's checkbox toggles its subtree and paints its state", async () => {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowSelection: { checkboxes: true },
      groupSelectsChildren: true,
      groupRowsSticky: true,
    } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach(container);
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([
      { colId: "region", key: "region", label: "Region" },
      { colId: "name", key: "name", label: "Name" },
    ]);
    api.setRowData(Array.from({ length: 200 }, (_, i) => ({
      id: `r${i}`, region: i < 100 ? "AMER" : "EMEA", name: `Account ${i}`,
    })));
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
    await raf();
    api.setAllGroupsExpanded(true);
    await raf();
    const scroller = container.querySelector<HTMLElement>(".pte-body")!;
    scroller.scrollTop = 5 * core.options.rowHeight;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();

    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;
    const mirrorCell = container.querySelector<HTMLElement>(
      `.pte-sticky-rows .pte-sticky-row[data-row-id="${group.id}"] .pte-checkbox-cell`,
    );
    expect(mirrorCell).toBeTruthy();
    expect(mirrorCell!.querySelector(".pte-checkbox")).toBeTruthy();

    click(mirrorCell!);
    expect(core.getSelectedRowIds().size).toBe(100);
    expect(mirrorCell!.classList.contains("selected")).toBe(true);
    expect(mirrorCell!.getAttribute("aria-checked")).toBe("true");

    api.selectRowsById(["r3"], "remove");
    expect(mirrorCell!.getAttribute("aria-checked")).toBe("mixed");
    expect(mirrorCell!.querySelector(".pte-checkbox")!.classList.contains("pte-checkbox-indeterminate")).toBe(true);
  });
});

describe("groupSelectsChildren on the server-side model", () => {
  type Node = { id: string; name: string; kind: string; parent: string | null };
  const TREE: Node[] = [
    { id: "alpha", name: "alpha", kind: "folder", parent: null },
    { id: "loose", name: "loose", kind: "file", parent: null },
    ...Array.from({ length: 3 }, (_, i) => ({ id: `a${i}`, name: `a${i}`, kind: "file", parent: "alpha" })),
  ];
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
      await raf();
    }
  };

  it("affects only the loaded rows of the subtree", async () => {
    document.body.innerHTML = "";
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        const rows = TREE.filter(n => n.parent === (request.treeParent?.id ?? null));
        success({ rows: rows.map(r => ({ ...r })), totalRows: rows.length });
      },
    };
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      rowModelType: "serverSide",
      rowSelection: { checkboxes: true },
      groupSelectsChildren: true,
      treeData: { mode: "server", hasChildren: (row: any) => row.kind === "folder", getLabel: (row: any) => row.name },
    } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer } = initDomRenderer(core, menuAdapter);
    renderer.attach(container);
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([{ colId: "kind", key: "kind", label: "Kind", type: ColumnType.STRING }]);
    core.setServerSideDataSource(source);
    await settle();
    const root = container.querySelector<HTMLElement>(".pte-root")!;

    // Collapsed: nothing under "alpha" is loaded, so the parent selects only itself.
    click(checkboxCell(root, 0));
    expect([...core.getSelectedRowIds()]).toEqual(["alpha"]);
    click(checkboxCell(root, 0));
    expect(core.getSelectedRowIds().size).toBe(0);

    root.querySelector<HTMLElement>(`.pte-row[row-id="alpha"] .pte-group-toggle`)!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await settle();
    expect(core.getRowModel().getViewCount()).toBe(5);

    click(checkboxCell(root, 0));
    expect(sorted(core.getSelectedRowIds())).toEqual(["a0", "a1", "a2", "alpha"]);
    expect(checkboxCell(root, 0).getAttribute("aria-checked")).toBe("true");
  });
});
