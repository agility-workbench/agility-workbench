// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { GridCore } from "../core/core";
import { ColumnType } from "../interfaces/column";
import type { IMenuAdapter } from "../interfaces/iMenuAdapter";
import type { ITextMeasurer } from "../interfaces/iTextMeasure";
import type { IServerSideDataSource } from "../interfaces/serverSide";
import { initDomRenderer } from "./dom";

/**
 * Naming and the row-count contract. Two defects the earlier ARIA suites could not have caught, because
 * every one of them ran an unpaginated, unfiltered, unnamed grid:
 *
 * 1. The focusable element carrying `role="grid"` had no accessible name and no option could give it one
 *    — the host page cannot supply it, since that element lives inside the container.
 * 2. `aria-rowcount` reported the current *page* while `aria-rowindex` counts absolutely across pages, so
 *    page 2 of 10 declared 11 rows and then numbered them 12–21.
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
const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

function buildRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    region: i % 2 === 0 ? "AMER" : "EMEA",
    name: `Account ${i}`,
    total: i,
  }));
}

function mountGrid(rowCount: number, options: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(container);
  const core = new GridCore(measurer, { rowIdKey: "id", ...options });
  core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
  const { renderer, api } = initDomRenderer(core, menuAdapter);
  renderer.attach(container);
  core.dispatch({ type: "init" });
  core.setColumnDefsFromProps([
    { colId: "region", key: "region", label: "Region" },
    { colId: "name", key: "name", label: "Name" },
    { colId: "total", key: "total", label: "Total", type: ColumnType.NUMBER },
  ]);
  if (rowCount > 0) api.setRowData(buildRows(rowCount));
  const root = container.querySelector<HTMLElement>(".pte-root")!;
  return { container, core, api, renderer, root };
}

const rowCountOf = (root: HTMLElement) => root.getAttribute("aria-rowcount");
const bodyRowIndices = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row[aria-rowindex]")]
    .map(r => Number(r.getAttribute("aria-rowindex")));

describe("the grid's accessible name", () => {
  it("is absent by default — there is nothing for the grid to invent", () => {
    const { root } = mountGrid(5);
    expect(root.getAttribute("role")).toBe("grid");
    expect(root.hasAttribute("aria-label")).toBe(false);
    expect(root.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("applies ariaLabel to the element that carries role=grid", () => {
    const { root } = mountGrid(5, { ariaLabel: "Open invoices" });
    expect(root.getAttribute("aria-label")).toBe("Open invoices");
  });

  it("applies ariaLabelledBy, and lets it win over ariaLabel", () => {
    const heading = document.createElement("h2");
    heading.id = "invoices-heading";
    heading.textContent = "Open invoices";
    document.body.appendChild(heading);

    const { root } = mountGrid(5, { ariaLabelledBy: "invoices-heading", ariaLabel: "Ignored" });
    expect(root.getAttribute("aria-labelledby")).toBe("invoices-heading");
    // Both at once would resolve to the labelledby text anyway; carrying the loser as well would
    // just be a second, contradictory name on the element.
    expect(root.hasAttribute("aria-label")).toBe(false);
  });

  it("follows a runtime option change, including back to unnamed", () => {
    const { renderer, root } = mountGrid(5, { ariaLabel: "First name" });
    const runtime = (label?: string) => ({
      ...(renderer as any).core.options,
      ariaLabel: label,
      ariaLabelledBy: undefined,
    });

    renderer.setRuntimeOptions(runtime("Second name"));
    expect(root.getAttribute("aria-label")).toBe("Second name");

    renderer.setRuntimeOptions(runtime(undefined));
    expect(root.hasAttribute("aria-label")).toBe(false);
  });
});

describe("aria-rowcount is the whole set, not the page", () => {
  it("counts every row plus the header when unpaginated", () => {
    const { root } = mountGrid(40);
    expect(rowCountOf(root)).toBe("41");
  });

  it("shrinks with a filter — the count is of the current view, not of loaded data", () => {
    // The trap this locks down: `getRowCount()` would look like the right source for a total, but it
    // reports every loaded node and would keep saying 41 here.
    const { core, root } = mountGrid(40, { quickFilter: true });
    core.dispatch({ type: "quickFilterSet", text: "AMER" } as any);
    expect(core.getRowModel().getViewTotalCount()).toBe(20);
    expect(rowCountOf(root)).toBe("21");

    core.dispatch({ type: "quickFilterSet", text: "" } as any);
    expect(rowCountOf(root)).toBe("41");
  });

  it("stays the full total across pages, so no row index exceeds it", async () => {
    const { core, root } = mountGrid(40, { pagination: true, pageSize: 10 });
    await raf();

    // Page 1: rows 1-10, ARIA indices 2-11 under a count of 41.
    expect(rowCountOf(root)).toBe("41");
    expect(bodyRowIndices(root)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 1, pageSize: 10 } as any);
    await raf();
    await raf();

    // Page 2: indices continue at 12. Before the fix the count here was 11 — every index on the
    // page was out of range, which is exactly what the spec forbids.
    const page2 = bodyRowIndices(root);
    expect(page2[0]).toBe(12);
    expect(rowCountOf(root)).toBe("41");
    expect(Math.max(...page2)).toBeLessThanOrEqual(Number(rowCountOf(root)));

    // Last page, the case where a wrong count is most visible: indices run to the very end.
    core.dispatch({ type: "paginationSet", enabled: true, pageIndex: 3, pageSize: 10 } as any);
    await raf();
    await raf();
    const lastPage = bodyRowIndices(root);
    expect(Math.max(...lastPage)).toBe(41);
    expect(rowCountOf(root)).toBe("41");
  });

  it("counts group rows too, since they occupy view rows", async () => {
    const { core, api, root } = mountGrid(10);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    await raf();
    expect(rowCountOf(root)).toBe("3"); // 2 collapsed groups + header

    api.setAllGroupsExpanded(true);
    await raf();
    expect(rowCountOf(root)).toBe("13"); // 2 groups + 10 leaves + header
  });
});

describe("aria-rowcount with a provisional server-side total", () => {
  const DATA = Array.from({ length: 6 }, (_, i) => ({ id: String(i + 1), name: `Row ${i + 1}` }));
  // Never reports totalRows, so the model's total stays an estimate until an empty block pins it.
  const openEnded: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      const start = request.startRow ?? 0;
      const end = request.endRow ?? DATA.length;
      success({ rows: DATA.slice(start, end) });
    },
  };

  it("reports -1 while the total is unknown rather than publishing the estimate", async () => {
    // Paginated with a small page so only the first block is ever requested: fetching past the end
    // returns a short block, which is what pins the total as exact.
    const { core, root } = mountGrid(0, {
      rowModelType: "serverSide",
      pagination: true,
      pageSize: 2,
      serverSideBlockSize: 2,
    });
    core.setServerSideDataSource(openEnded);
    await flush();
    await raf();

    expect(core.getRowModel().isTotalRowCountKnown?.()).toBe(false);
    // -1 is ARIA's "count unknown". Publishing the running estimate would tell AT the last row is
    // reachable when the server has not said where the end is.
    expect(rowCountOf(root)).toBe("-1");
  });

  it("switches to the exact count once the model knows it", async () => {
    // Paginated with a small page so only the first block is ever requested: fetching past the end
    // returns a short block, which is what pins the total as exact.
    const { core, root } = mountGrid(0, {
      rowModelType: "serverSide",
      pagination: true,
      pageSize: 2,
      serverSideBlockSize: 2,
    });
    core.setServerSideDataSource({
      getRows: ({ request, success }) => {
        const start = request.startRow ?? 0;
        const end = request.endRow ?? DATA.length;
        success({ rows: DATA.slice(start, end), totalRows: DATA.length });
      },
    });
    await flush();
    await raf();

    expect(core.getRowModel().isTotalRowCountKnown?.()).toBe(true);
    expect(rowCountOf(root)).toBe("7"); // 6 rows + header
  });
});

describe("controls that AT would otherwise meet unnamed", () => {
  it("hides the group chevron, whose state the row already carries", async () => {
    const { core, api, root } = mountGrid(10);
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    api.setAllGroupsExpanded(true);
    await raf();

    const toggles = [...root.querySelectorAll<HTMLElement>(".pte-group-toggle")];
    expect(toggles.length).toBeGreaterThan(0);
    // Mouse-only (expand/collapse dispatches from mousedown) and unnamed, so exposing it would add
    // an anonymous button AT cannot operate.
    expect(toggles.every(t => t.getAttribute("aria-hidden") === "true")).toBe(true);
    // The attribute stays for tests and client CSS, and the ARIA row is where AT reads the state.
    expect(toggles.every(t => t.hasAttribute("aria-expanded"))).toBe(true);
    const groupRows = [...root.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row[aria-expanded]")];
    expect(groupRows.length).toBe(toggles.length);
  });

  it("hides the tree-row chevron for the same reason", async () => {
    // renderTreeCell builds its own toggle, so it needs the same treatment — an easy one to miss.
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 400, configurable: true });
    document.body.appendChild(container);
    const core = new GridCore(measurer, {
      rowIdKey: "id",
      treeData: { mode: "path", getPath: (row: any) => row.path },
      groupDefaultExpanded: -1,
    } as any);
    core.dispatch({ type: "themeFontSet", headerFont: "12px sans", cellFont: "12px sans", reason: "test" } as any);
    const { renderer, api } = initDomRenderer(core, menuAdapter);
    renderer.attach(container);
    core.dispatch({ type: "init" });
    core.setColumnDefsFromProps([{ colId: "name", key: "name", label: "Name" }]);
    api.setRowData([
      { id: "paris", name: "Paris", path: ["World", "Europe", "France", "Paris"] },
      { id: "berlin", name: "Berlin", path: ["World", "Europe", "Germany", "Berlin"] },
    ]);
    await raf();

    const root = container.querySelector<HTMLElement>(".pte-root")!;
    const toggles = [...root.querySelectorAll<HTMLElement>(".pte-group-toggle")];
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles.every(t => t.getAttribute("aria-hidden") === "true")).toBe(true);
    // The label beside it is a sibling, not a child, so the row's text stays readable.
    expect(root.querySelector(".pte-group-label")?.textContent).toBeTruthy();
  });

  it("names the four icon-only pagination buttons and both selects", async () => {
    const { root } = mountGrid(40, { pagination: true, pageSize: 10 });
    await raf();

    const named = (selector: string) =>
      root.querySelector<HTMLElement>(selector)!.getAttribute("aria-label");
    expect(named(".pte-pagination-btn-first")).toBe("First page");
    expect(named(".pte-pagination-btn-prev")).toBe("Previous page");
    expect(named(".pte-pagination-btn-next")).toBe("Next page");
    expect(named(".pte-pagination-btn-last")).toBe("Last page");

    // The selects borrow their visible label rather than repeating the string, so the two can never
    // drift apart. Each id must resolve, or the name is empty.
    for (const selector of [".pte-pagination-select", ".pte-pagination-page-select"]) {
      const select = root.querySelector<HTMLElement>(selector)!;
      const labelId = select.getAttribute("aria-labelledby");
      expect(labelId, `${selector} has no aria-labelledby`).toBeTruthy();
      expect(document.getElementById(labelId!)?.textContent).toBeTruthy();
    }
  });

  it("draws each page-nav glyph in a child span, so the button can paint a focus ring", async () => {
    const { root } = mountGrid(40, { pagination: true, pageSize: 10 });
    await raf();

    // Load-bearing structure, not decoration: the glyph is a CSS mask, and a mask clips
    // every pixel its own element paints — background, border, shadow, outline. While the mask sat
    // on the <button> these four could not show a focus indicator at all, whatever CSS was applied.
    // Collapsing the span back into the button would silently reintroduce that.
    for (const cls of ["first", "prev", "next", "last"]) {
      const btn = root.querySelector<HTMLElement>(`.pte-pagination-btn-${cls}`)!;
      expect(btn, `.pte-pagination-btn-${cls} missing`).not.toBeNull();
      const icon = btn.querySelector<HTMLElement>(".pte-pagination-btn-icon");
      expect(icon, `.pte-pagination-btn-${cls} has no icon span`).not.toBeNull();
      // The glyph is decorative; the button owns the accessible name.
      expect(icon!.getAttribute("aria-hidden")).toBe("true");
      expect(btn.getAttribute("aria-label")).toBeTruthy();
      expect(icon!.textContent).toBe("");
    }
  });
});
