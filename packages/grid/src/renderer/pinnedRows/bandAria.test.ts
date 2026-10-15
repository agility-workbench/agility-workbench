// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import { AggregateType } from "../../interfaces/aggregate";
import { ColumnType } from "../../interfaces/column";
import type { GridOptions } from "../../interfaces/gridOptions";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

/**
 * ARIA row numbering with application-pinned bands and the aggregate row. The header is row 1 and
 * body rows keep their absolute display number + 1; the top band, the bottom band and the aggregate
 * row follow the last body row in that order, and aria-rowcount counts every one of them. The sticky
 * overlay is aria-hidden and neither counted nor indexed.
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

async function mount(options: Partial<GridOptions> = {}, rowCount = 3) {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "name", key: "name", label: "Name", pinned: "left" },
    { colId: "region", key: "region", label: "Region" },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
  ]);
  api.setRowData(Array.from({ length: rowCount }, (_, i) => ({
    id: `r${i}`, name: `Account ${i}`, region: i % 2 ? "EMEA" : "AMER", total: i,
  })));
  await raf();
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { container, root, core, api };
}

function showAggregate(core: GridCore) {
  core.setAggregateModel([{ key: core.getColumnModel().getByColId("total")!.instanceID, type: AggregateType.SUM }]);
}

/** Every ARIA row in DOM order, keyed by where it lives. */
function rowIndexes(container: HTMLElement) {
  const index = (el: Element | null) => el?.getAttribute("aria-rowindex") ?? null;
  const centerRows = (selector: string) => Array.from(
    container.querySelectorAll<HTMLElement>(`${selector} .pte-pinned-rows-center .pte-row`),
  ).map(index);
  return {
    header: index(container.querySelector(".pte-header[role='row']")),
    body: Array.from(container.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row[role='row']"))
      .filter(row => row.style.display !== "none" && row.hasAttribute("aria-rowindex"))
      .map(index),
    top: centerRows(".pte-pinned-rows-top"),
    bottom: centerRows(".pte-pinned-rows-bottom"),
    aggregate: index(container.querySelector(".pte-aggregate-center [role='row']")),
  };
}

describe("ARIA row indexes for pinned bands and the aggregate row", () => {
  it("numbers 2 top, 3 body, 1 bottom and the aggregate row after the body, all inside aria-rowcount", async () => {
    const { container, root, core } = await mount({
      pinnedTopRowData: [{ id: "t0", name: "Top 0" }, { id: "t1", name: "Top 1" }],
      pinnedBottomRowData: [{ id: "b0", name: "Bottom 0" }],
    } as any);
    showAggregate(core);
    await raf();

    expect(container.querySelector<HTMLElement>(".pte-aggregate-row")!.style.display).toBe("flex");
    expect(rowIndexes(container)).toEqual({
      header: "1",
      body: ["2", "3", "4"],
      top: ["5", "6"],
      bottom: ["7"],
      aggregate: "8",
    });
    expect(root.getAttribute("aria-rowcount")).toBe("8");
  });

  it("follows band and aggregate changes", async () => {
    const { container, root, core, api } = await mount();
    expect(root.getAttribute("aria-rowcount")).toBe("4");

    api.setPinnedTopRowData([{ id: "t0", name: "Top 0" }]);
    expect(rowIndexes(container).top).toEqual(["5"]);
    expect(root.getAttribute("aria-rowcount")).toBe("5");

    showAggregate(core);
    await raf();
    expect(rowIndexes(container).aggregate).toBe("6");
    expect(root.getAttribute("aria-rowcount")).toBe("6");

    api.setPinnedBottomRowData([{ id: "b0", name: "Bottom 0" }, { id: "b1", name: "Bottom 1" }]);
    expect(rowIndexes(container)).toMatchObject({ top: ["5"], bottom: ["6", "7"], aggregate: "8" });
    expect(root.getAttribute("aria-rowcount")).toBe("8");

    // A model row pinned out of the body keeps its body slot's index (the body leaves 3 unused),
    // so the count does not change; the data rows after the body keep theirs.
    api.setRowPinned("r1", "top");
    expect(rowIndexes(container)).toEqual({
      header: "1", body: ["2", "4"], top: ["5", "3"], bottom: ["6", "7"], aggregate: "8",
    });
    expect(root.getAttribute("aria-rowcount")).toBe("8");

    core.setAggregateScope("none");
    await raf();
    expect(rowIndexes(container).aggregate).toBeNull();
    expect(root.getAttribute("aria-rowcount")).toBe("7");
  });

  it("keeps the sticky overlay aria-hidden, unindexed and out of the count", async () => {
    const { container, root, core, api } = await mount({ groupRowsSticky: true }, 40);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] } as any);
    api.setAllGroupsExpanded(true);
    await raf();
    const sticky = container.querySelector<HTMLElement>(".pte-sticky-rows")!;
    expect(sticky.querySelector(".pte-sticky-row")).toBeTruthy();
    expect(sticky.getAttribute("aria-hidden")).toBe("true");
    expect(sticky.querySelector("[aria-rowindex]")).toBeNull();
    // 2 groups + 40 leaves + header.
    expect(root.getAttribute("aria-rowcount")).toBe("43");
  });
});
