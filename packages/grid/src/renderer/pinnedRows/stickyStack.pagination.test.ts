// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../../core/core";
import type { IMenuAdapter } from "../../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../../interfaces/iTextMeasure";
import { initDomRenderer } from "../dom";

/**
 * The sticky ancestor stack under pagination. Client-side grouped views stamp `node.viewIndex` over
 * the whole flattened list while the body's slots are page-relative, so the stack must translate
 * (core.getPageViewIndex) or it docks nothing after page 1.
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

// 3 groups × 10 rows, all expanded: A(0) a0..a9(1-10) | B(11) b0..b9(12-21) | C(22) c0..c9(23-32).
// Page size 12 → page 2 holds flat 12..23: b0..b9, C, c0.
async function mount() {
  document.body.innerHTML = "";
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, {
    rowIdKey: "id",
    groupDisplayType: "groupRows",
    groupRowsSticky: true,
    pagination: true,
    pageSize: 12,
    pageSizes: [12],
  } as any);
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "group", key: "group", label: "Group" },
    { colId: "name", key: "name", label: "Name" },
  ]);
  const rows = ["A", "B", "C"].flatMap(group =>
    Array.from({ length: 10 }, (_, i) => ({ id: `${group.toLowerCase()}${i}`, group, name: `${group} ${i}` })));
  api.setRowData(rows);
  core.dispatch({ type: "rowGroupSet", colIds: ["group"] } as any);
  await raf();
  api.setAllGroupsExpanded(true);
  await raf();
  return { container, core, api };
}

async function scrollBody(container: HTMLElement, top: number) {
  const scroller = container.querySelector<HTMLElement>(".pte-body")!;
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event("scroll"));
  await raf();
  await raf();
}

/** Group keys of the docked mirrors, outermost first. */
function stack(container: HTMLElement, core: GridCore): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".pte-sticky-rows .pte-sticky-row"))
    .filter(row => row.parentElement?.classList.contains("pte-sticky-center") || true)
    .map(row => core.getRowModel().getRowNode(row.dataset.rowId!)?.groupKey ?? "?")
    .filter((key, index, all) => all.indexOf(key) === index);
}

describe("sticky ancestor stack after page 1", () => {
  it("docks the group of the page's first row, at rest and scrolled within the page", async () => {
    const { container, core } = await mount();
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 12 } as any);
    await raf();
    await scrollBody(container, 0);

    // Flat row 12 is b0: its group header B sat on page 1 (flat 11), so it docks here.
    const first = core.getRowModel().getRowNodeAtViewIndex(0)!;
    expect(first.id).toBe("b0");
    const groupB = core.getRowModel().getRowNode(first.parentId!)!;
    expect(core.getPageViewIndex(groupB)).toBe(-1);
    expect(stack(container, core)).toEqual(["B"]);

    // Three rows into the page: still inside B.
    const rowHeight = core.options.rowHeight;
    await scrollBody(container, 3 * rowHeight);
    expect(stack(container, core)).toEqual(["B"]);

    // C's header (page slot 10) reaches the top: C takes over.
    await scrollBody(container, 10 * rowHeight);
    expect(stack(container, core)).toEqual(["C"]);
  });

  it("page 1 is unchanged", async () => {
    const { container, core } = await mount();
    await scrollBody(container, 3 * core.options.rowHeight);
    expect(stack(container, core)).toEqual(["A"]);
  });
});
