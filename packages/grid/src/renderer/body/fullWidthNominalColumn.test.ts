// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import type { ColDef } from "../../interfaces/column";
import type { GridEventCellClickedParams, GridEventRowClickedParams } from "../../events/events";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

/**
 * A groupRows group row renders one host cell, which stands in for the nominal column (the first
 * non-leading leaf). Body pool and sticky mirror both stamp it with that column's id and global
 * index, so clicks, menus and frames resolve the host to a real cell; click payloads carry the
 * node and the group cell's value.
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

const plainDefs: ColDef[] = [
  { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
  { colId: "region", key: "region", label: "Region" },
  { colId: "name", key: "name", label: "Name" },
];

async function mountGrouped(options: Partial<GridOptions> = {}, defs: ColDef[] = plainDefs, rowCount = 6) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", groupDisplayType: "groupRows", ...options } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps(defs);
  api.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: `r${i}`,
    region: i < rowCount / 2 ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  })));
  core.setAggregateModel([{ key: core.getColumnModel().getByColId("total")!.instanceID, type: AggregateType.SUM }]);
  core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
  await raf();
  return { container, core, api };
}

function nominal(core: GridCore) {
  const model = core.getColumnModel();
  const leaf = model.getFullWidthNominalLeaf()!;
  return { leaf, colIdx: model.leafColumnLookup.get(leaf.instanceID)!.globalIndex };
}

/** The visible full-width host of the body row at a view index. */
function bodyHost(container: HTMLElement, viewIdx: number): HTMLElement {
  const host = container.querySelector<HTMLElement>(
    `.pte-row:not(.pte-sticky-row)[data-view-idx="${viewIdx}"] .pte-full-width-cell`,
  );
  if (!host || host.style.display === "none") throw new Error(`no full-width host at ${viewIdx}`);
  return host;
}

function click(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
}

describe("getFullWidthNominalLeaf", () => {
  it("is the first non-leading leaf: past the row-number column, and the left-pinned leaf when there is one", async () => {
    const { core } = await mountGrouped({ rowNumbers: true }, [
      { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
      { colId: "region", key: "region", label: "Region" },
      { colId: "name", key: "name", label: "Name", pinned: "left" },
    ]);
    const model = core.getColumnModel();
    expect(model.getLeadingLeaves().length).toBeGreaterThan(0);
    expect(model.getFullWidthNominalLeaf()!.colId).toBe("name");
    expect(model.getFullWidthNominalLeaf()).toBe(model.getLeaves()[model.getLeadingLeaves().length]);
  });
});

describe("full-width group host column stamps", () => {
  it("stamps the body host with the nominal column's id and global index", async () => {
    const { container, core } = await mountGrouped({ rowNumbers: true });
    const { leaf, colIdx } = nominal(core);
    expect(leaf.colId).toBe("total");
    expect(colIdx).toBe(core.getColumnModel().getLeadingLeaves().length);

    const host = bodyHost(container, 0);
    expect(host.dataset.colId).toBe(leaf.instanceID);
    expect(host.dataset.colIdx).toBe(String(colIdx));
  });

  it("stamps the left-pinned leaf when one exists", async () => {
    const { container, core } = await mountGrouped({ rowNumbers: true }, [
      { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
      { colId: "region", key: "region", label: "Region" },
      { colId: "name", key: "name", label: "Name", pinned: "left" },
    ]);
    const { leaf, colIdx } = nominal(core);
    expect(leaf.colId).toBe("name");

    const host = bodyHost(container, 0);
    expect(host.dataset.colId).toBe(leaf.instanceID);
    expect(host.dataset.colIdx).toBe(String(colIdx));
  });

  it("clears both stamps when the slot is recycled to a leaf row", async () => {
    const { container, core, api } = await mountGrouped();
    // Collapsed: AMER at view 0, EMEA at view 1. Expanding AMER puts a leaf at view 1.
    const hosts = Array.from(container.querySelectorAll<HTMLElement>(".pte-row:not(.pte-sticky-row) .pte-full-width-cell"))
      .filter(h => h.style.display !== "none");
    expect(hosts.length).toBe(2);

    api.setAllGroupsExpanded(true);
    await raf();

    const leafIds = new Set(["r0", "r1", "r2", "r3", "r4", "r5"]);
    const recycled = hosts.filter(h => leafIds.has(h.closest(".pte-row")!.getAttribute("row-id") ?? ""));
    expect(recycled.length).toBeGreaterThan(0);
    for (const host of recycled) {
      expect(host.dataset.colId).toBeUndefined();
      expect(host.dataset.colIdx).toBeUndefined();
    }
    // The group rows that remain keep theirs.
    expect(bodyHost(container, 0).dataset.colId).toBe(nominal(core).leaf.instanceID);
  });

  it("stamps the docked sticky mirror's host the same way", async () => {
    const { container, core, api } = await mountGrouped({ groupRowsSticky: true, rowNumbers: true }, plainDefs, 200);
    api.setAllGroupsExpanded(true);
    await raf();
    const scroller = container.querySelector<HTMLElement>(".pte-body")!;
    scroller.scrollTop = 2 * core.options.rowHeight;
    scroller.dispatchEvent(new Event("scroll"));
    await raf();
    await raf();

    const host = container.querySelector<HTMLElement>(".pte-sticky-row .pte-full-width-cell");
    expect(host).not.toBeNull();
    const { leaf, colIdx } = nominal(core);
    expect(host!.dataset.colId).toBe(leaf.instanceID);
    expect(host!.dataset.colIdx).toBe(String(colIdx));
  });
});

describe("click payloads carry the node", () => {
  it("a group host click reports isGroup, the node, and the nominal column's aggregate", async () => {
    const { container, core } = await mountGrouped();
    const cells: GridEventCellClickedParams[] = [];
    const rows: GridEventRowClickedParams[] = [];
    core.on("cellClicked", e => cells.push(e));
    core.on("rowClicked", e => rows.push(e));

    click(bodyHost(container, 0));

    const amer = core.getRowModel().getRowNodeAtViewIndex(0)!;
    expect(amer.isGroup).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].node).toBe(amer);
    expect(rows[0].isGroup).toBe(true);
    expect(cells).toHaveLength(1);
    expect(cells[0].colId).toBe("total");
    expect(cells[0].isGroup).toBe(true);
    expect(cells[0].node).toBe(amer);
    // AMER holds r0..r2: totals 0 + 1 + 2.
    expect(cells[0].value).toBe(3);
    expect(cells[0].value).toBe(core.getGroupCellValue(nominal(core).leaf, amer).value);
  });

  it("a leaf cell click reports isGroup false, the node, and the cell's value", async () => {
    const { container, core, api } = await mountGrouped();
    api.setAllGroupsExpanded(true);
    await raf();
    const cells: GridEventCellClickedParams[] = [];
    const rows: GridEventRowClickedParams[] = [];
    core.on("cellClicked", e => cells.push(e));
    core.on("rowClicked", e => rows.push(e));

    const leafNode = core.getRowModel().getRowNodeAtViewIndex(1)!;
    expect(leafNode.isGroup).toBeFalsy();
    const nameIdx = core.getColumnModel().leafColumnLookup.get(core.getColumnModel().getByColId("name")!.instanceID)!.globalIndex;
    const cell = container.querySelector<HTMLElement>(`.pte-row[data-view-idx="1"] .pte-cell[data-col-idx="${nameIdx}"]`)!;
    click(cell);

    expect(rows).toHaveLength(1);
    expect(rows[0].node).toBe(leafNode);
    expect(cells).toHaveLength(1);
    expect(cells[0].isGroup).toBe(false);
    expect(cells[0].node).toBe(leafNode);
    expect(cells[0].value).toBe(leafNode.data.name);
  });
});
