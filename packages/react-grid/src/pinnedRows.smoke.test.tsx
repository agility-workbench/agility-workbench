// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { IGridAPI } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

type Row = { id: string; region: string; country: string; sales: number };

const ROWS: Row[] = [
  { id: "1", region: "EMEA", country: "UK", sales: 10 },
  { id: "2", region: "EMEA", country: "UK", sales: 20 },
  { id: "3", region: "EMEA", country: "France", sales: 30 },
  { id: "4", region: "APAC", country: "Japan", sales: 40 },
  { id: "5", region: "APAC", country: "India", sales: 50 },
];

const COLUMNS = [
  { colId: "region", key: "region", label: "Region", pinned: "left" as const },
  { colId: "country", key: "country", label: "Country" },
  { colId: "sales", key: "sales", label: "Sales" },
];

async function mount(extra: Record<string, unknown> = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  Object.defineProperty(container, "clientWidth", { value: 900, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        rowData={ROWS}
        columnDefs={COLUMNS}
        rowIdKey="id"
        {...extra}
      />,
    );
  });
  return { container, apiRef, root };
}

describe("pinned and sticky rows", () => {
  it("anchors an always-on floating quick filter after the header without measuring layout", async () => {
    const { container, root } = await mount({
      pinnedTopRowData: [{ id: "target", region: "Target", country: "All", sales: 200 }],
      quickFilter: { mode: "always", debounceMs: 0 },
      toolbar: { sorting: true },
    });

    const gridRoot = container.querySelector<HTMLElement>(".pte-root")!;
    const toolbar = gridRoot.querySelector<HTMLElement>(".pte-grid-toolbar")!;
    const header = gridRoot.querySelector<HTMLElement>(".pte-header-wrapper")!;
    const floatingHost = gridRoot.querySelector<HTMLElement>(".pte-quick-filter-floating-host")!;
    const topBand = gridRoot.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    const body = gridRoot.querySelector<HTMLElement>(".pte-body")!;
    const filter = floatingHost.querySelector<HTMLElement>(".pte-quick-filter")!;
    const children = Array.from(gridRoot.children);

    expect(children.indexOf(toolbar)).toBeLessThan(children.indexOf(header));
    expect(children.indexOf(header)).toBeLessThan(children.indexOf(floatingHost));
    expect(children.indexOf(floatingHost)).toBeLessThan(children.indexOf(topBand));
    expect(children.indexOf(topBand)).toBeLessThan(children.indexOf(body));
    expect(filter.closest(".pte-grid-toolbar")).toBeNull();
    expect(filter.style.top).toBe("6px");

    await act(async () => {
      gridRoot.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
      );
    });
    expect(filter.style.top).toBe("6px");

    await act(async () => root.unmount());
    container.remove();
  });

  it("renders application-owned top/bottom rows and reconciles them through the API", async () => {
    const { container, apiRef, root } = await mount({
      pinnedTopRowData: [{ id: "target", region: "Target", country: "All", sales: 200 }],
      pinnedBottomRowData: [{ id: "total", region: "Total", country: "All", sales: 150 }],
    });

    const top = container.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    const bottom = container.querySelector<HTMLElement>(".pte-pinned-rows-bottom")!;
    expect(top.textContent).toContain("Target");
    expect(bottom.textContent).toContain("Total");
    expect(apiRef.current!.getCore().getRowModel().getViewCount()).toBe(ROWS.length);

    const targetRows = top.querySelectorAll<HTMLElement>(
      ".pte-pinned-row[data-row-id='p:top:target']",
    );
    expect(targetRows.length).toBeGreaterThan(1);
    await act(async () => {
      top.querySelector<HTMLElement>(
        ".pte-pinned-rows-left .pte-pinned-row[data-row-id='p:top:target'] .pte-cell",
      )!
        .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(Array.from(targetRows).every(row => row.classList.contains("pte-row-hover"))).toBe(true);

    await act(async () => {
      apiRef.current!.setPinnedTopRowData([
        { id: "forecast", region: "Forecast", country: "All", sales: 300 },
      ]);
      apiRef.current!.setPinnedBottomRowData([]);
    });
    expect(top.textContent).toContain("Forecast");
    expect(top.textContent).not.toContain("Target");
    expect(bottom.style.display).toBe("none");

    await act(async () => root.unmount());
    container.remove();
  });

  it("navigates top, body, and bottom row sections without changing column coordinates", async () => {
    const { container, apiRef, root } = await mount({
      cellSelection: true,
      pinnedTopRowData: [{ id: "target", region: "Target", country: "All", sales: 200 }],
      pinnedBottomRowData: [{ id: "total", region: "Total", country: "All", sales: 150 }],
    });
    const core = apiRef.current!.getCore();
    const gridRoot = container.querySelector<HTMLElement>(".pte-root")!;
    const body = gridRoot.querySelector<HTMLElement>(".pte-body")!;
    const pinnedCell = gridRoot.querySelector<HTMLElement>(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-cell",
    )!;

    expect(body.querySelector(".pte-pinned-rows")).toBeNull();
    expect(pinnedCell.closest(".pte-row")?.dataset.rowPinned).toBe("top");
    expect(pinnedCell.closest(".pte-row")?.dataset.viewIdx).toBe("0");
    expect(pinnedCell.dataset.colIdx).toBe("1");

    await act(async () => {
      pinnedCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 1, rowPinned: "top" });

    await act(async () => {
      gridRoot.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 1 });

    await act(async () => {
      for (let index = 1; index < ROWS.length; index++) {
        gridRoot.dispatchEvent(new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }));
      }
      gridRoot.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 1, rowPinned: "bottom" });

    await act(async () => root.unmount());
    container.remove();
  });

  it("gives top, bottom, and central body independent vertical scrollbars", async () => {
    const { container, apiRef, root } = await mount();
    const gridRoot = container.querySelector<HTMLElement>(".pte-root")!;
    Object.defineProperty(gridRoot, "clientHeight", { value: 300, configurable: true });
    const pinnedRows = Array.from({ length: 12 }, (_, index) => ({
      id: `pinned-${index}`,
      region: `Pinned ${index + 1}`,
      country: "All",
      sales: index,
    }));

    await act(async () => {
      apiRef.current!.setPinnedTopRowData(pinnedRows);
      apiRef.current!.setPinnedBottomRowData(pinnedRows);
    });

    const top = container.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    const bottom = container.querySelector<HTMLElement>(".pte-pinned-rows-bottom")!;
    const topVertical = top.querySelector<HTMLDivElement>(".pte-pinned-rows-vertical")!;
    const bottomVertical = bottom.querySelector<HTMLDivElement>(".pte-pinned-rows-vertical")!;
    const bodyVertical = container.querySelector<HTMLDivElement>(".pte-scroller-vertical-spacer")!;
    expect(top.style.height).toBe("90px");
    expect(bottom.style.height).toBe("90px");
    expect(topVertical.classList.contains("scrollable")).toBe(true);
    expect(bottomVertical.classList.contains("scrollable")).toBe(true);
    expect(topVertical).not.toBe(bottomVertical);
    expect(topVertical).not.toBe(bodyVertical);

    topVertical.scrollTop = 43;
    topVertical.dispatchEvent(new Event("scroll"));
    expect(top.querySelector<HTMLElement>(".pte-pinned-rows-center")!.scrollTop).toBe(43);
    expect(bottom.querySelector<HTMLElement>(".pte-pinned-rows-center")!.scrollTop).toBe(0);
    expect(container.querySelector<HTMLElement>(".pte-scroller")!.scrollTop).toBe(0);

    bottomVertical.scrollTop = 86;
    bottomVertical.dispatchEvent(new Event("scroll"));
    expect(bottom.querySelector<HTMLElement>(".pte-pinned-rows-center")!.scrollTop).toBe(86);
    expect(top.querySelector<HTMLElement>(".pte-pinned-rows-center")!.scrollTop).toBe(43);

    await act(async () => root.unmount());
    container.remove();
  });

  it("explicitly pins a generated group node and keeps its chevron connected to the live group", async () => {
    const { container, apiRef, root } = await mount();
    const core = apiRef.current!.getCore();
    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    });
    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;

    await act(async () => {
      core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1, reason: "keyboard" });
      apiRef.current!.setRowPinned(group.id, "top");
    });
    const topBand = container.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    const pinned = topBand.querySelector<HTMLElement>(
      `.pte-pinned-row[data-row-id='${group.id}']`,
    )!;
    expect(pinned).toBeTruthy();
    expect(topBand.textContent).toContain(group.groupKey);
    expect(container.querySelector(`.pte-body [row-id='${group.id}']`)).toBeNull();
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 1, rowPinned: "top" });

    const before = core.getRowModel().getViewCount();
    await act(async () => {
      topBand.querySelector<HTMLElement>(`.pte-group-toggle[data-group-id='${group.id}']`)!
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    expect(core.getRowModel().getViewCount()).toBeGreaterThan(before);
    expect(
      container.querySelector(".pte-pinned-rows-top .icon-group-expanded"),
    ).toBeTruthy();

    await act(async () => {
      apiRef.current!.setRowPinned(group.id, null);
    });
    expect(container.querySelector(
      `.pte-pinned-rows-top .pte-pinned-row[data-row-id='${group.id}']`,
    )).toBeNull();
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 0 });

    await act(async () => root.unmount());
    container.remove();
  });

  it("stacks the active generated group ancestry while the body scrolls", async () => {
    const groupedRows = Array.from({ length: 60 }, (_, index) => ({
      id: `sticky-${index}`,
      region: "EMEA",
      country: index < 30 ? "First" : "Second",
      sales: index,
    }));
    const { container, apiRef, root } = await mount({
      rowData: groupedRows,
      groupRowsSticky: true,
      groupDefaultExpanded: -1,
    });
    const core = apiRef.current!.getCore();
    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    });

    const leafIndex = Array.from(
      { length: core.getRowModel().getViewCount() },
      (_, index) => index,
    ).find(index => !core.getRowModel().getRowNodeAtViewIndex(index)?.isGroup)!;
    const leaf = core.getRowModel().getRowNodeAtViewIndex(leafIndex)!;
    expect(leaf.parentId).toBeTruthy();

    const scroller = container.querySelector<HTMLDivElement>(".pte-scroller")!;
    // The nested headers share the same compact top after their preceding parent headers leave the
    // body, so both join the sticky ancestry without leaving body copies.
    await act(async () => {
      scroller.scrollTop = 1;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(container.querySelectorAll(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-pinned-row.pte-group-row",
    ).length).toBe(2);
    const firstRoot = core.getRowModel().getRowNodeAtViewIndex(0)!;
    const firstChildGroup = core.getRowModel().getRowNodeAtViewIndex(1)!;
    expect(container.querySelector(
      `.pte-pinned-rows-top [data-row-id='${firstRoot.id}']`,
    )).toBeTruthy();
    expect(container.querySelector(
      `.pte-pinned-rows-top [data-row-id='${firstChildGroup.id}']`,
    )).toBeTruthy();
    expect(container.querySelector(
      `.pte-body [row-id='${firstRoot.id}']`,
    )).toBeNull();
    expect(container.querySelector(
      `.pte-body [row-id='${firstChildGroup.id}']`,
    )).toBeNull();

    await act(async () => {
      scroller.scrollTop = leafIndex * 43 + 1;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise(resolve => requestAnimationFrame(resolve));
    });

    const stickyRows = container.querySelectorAll(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-pinned-row.pte-group-row",
    );
    expect(stickyRows.length).toBe(2);
    // Sticky ancestry joins the same top row section as every other pinned-top row.
    const staticTopBand = container.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    expect(container.querySelector(".pte-sticky-group-rows")).toBeNull();
    expect(staticTopBand.parentElement).toBe(container.querySelector(".pte-root"));
    expect(container.querySelector(".pte-body .pte-pinned-rows")).toBeNull();
    expect(staticTopBand.style.display).toBe("flex");
    const bodyVertical = container.querySelector<HTMLElement>(".pte-scroller-vertical-spacer")!;
    expect(bodyVertical).toBeTruthy();
    expect(staticTopBand.contains(bodyVertical)).toBe(false);

    const stickyRowId = staticTopBand.querySelector<HTMLElement>(
      ".pte-pinned-row.pte-group-row",
    )!.dataset.rowId!;
    const stickyCopies = staticTopBand.querySelectorAll<HTMLElement>(
      `.pte-pinned-row[data-row-id='${stickyRowId}']`,
    );
    await act(async () => {
      staticTopBand.querySelector<HTMLElement>(
        `.pte-pinned-rows-center .pte-pinned-row[data-row-id='${stickyRowId}'] .pte-cell`,
      )!
        .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(Array.from(stickyCopies).every(row => row.classList.contains("pte-row-hover"))).toBe(true);

    // At a sibling boundary, keep the immediate parent pinned through the final pixel occupied by
    // its last child, then atomically replace it when the next parent's row reaches the top.
    const groups = Array.from(
      { length: core.getRowModel().getViewCount() },
      (_, index) => core.getRowModel().getRowNodeAtViewIndex(index)!,
    ).filter(node => node.isGroup && node.level === 1);
    let pairIndex = -1;
    groups.forEach((node, index) => {
      if (index + 1 < groups.length && groups[index + 1].parentId === node.parentId) {
        pairIndex = index;
      }
    });
    const currentParent = groups[pairIndex];
    const nextParent = groups[pairIndex + 1];
    expect(currentParent).toBeTruthy();
    expect(nextParent).toBeTruthy();

    const precedingParents = core.getRowModel().getGroupNodes()
      .filter(node => node.viewIndex >= 0
        && node.viewIndex < nextParent.viewIndex
        && node.children?.length)
      .length;
    const nextParentCompactTop = (nextParent.viewIndex - precedingParents) * 43;

    await act(async () => {
      scroller.scrollTop = nextParentCompactTop - 1;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(staticTopBand.querySelector(
      `.pte-pinned-rows-center [data-row-id='${currentParent.id}']`,
    )).toBeTruthy();
    expect(staticTopBand.querySelector(
      `.pte-pinned-rows-center [data-row-id='${nextParent.id}']`,
    )).toBeNull();
    const startIndex = Math.max(
      0,
      Math.floor(scroller.scrollTop / 43) - core.options.overscanRowCount,
    );
    const suppressedBeforeWindow = core.getBodyPinnedRowCountBefore(startIndex);
    expect(suppressedBeforeWindow).toBeGreaterThan(0);
    expect(container.querySelector<HTMLElement>(".pte-body .pte-viewport")!.style.transform)
      .toBe(`translateY(${(startIndex - suppressedBeforeWindow) * 43}px)`);

    await act(async () => {
      scroller.scrollTop = nextParentCompactTop;
      // Replaying the exact boundary must not alternate the two parents or change the band depth.
      for (let event = 0; event < 3; event++) {
        scroller.dispatchEvent(new Event("scroll"));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    });
    expect(staticTopBand.querySelectorAll(
      ".pte-pinned-rows-center .pte-pinned-row.pte-group-row",
    ).length).toBe(2);
    expect(staticTopBand.querySelector(
      `.pte-pinned-rows-center [data-row-id='${currentParent.id}']`,
    )).toBeNull();
    expect(staticTopBand.querySelector(
      `.pte-pinned-rows-center [data-row-id='${nextParent.id}']`,
    )).toBeTruthy();

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps application-pinned top rows outside the body when sticky ancestors are active", async () => {
    const { container, apiRef, root } = await mount({
      pinnedTopRowData: [{ id: "target", region: "Target", country: "All", sales: 200 }],
      groupRowsSticky: true,
      groupDefaultExpanded: -1,
    });
    await act(async () => {
      apiRef.current!.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
      const scroller = container.querySelector<HTMLDivElement>(".pte-scroller")!;
      scroller.scrollTop = 1;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise(resolve => requestAnimationFrame(resolve));
    });

    const gridRoot = container.querySelector<HTMLElement>(".pte-root")!;
    const body = gridRoot.querySelector<HTMLElement>(".pte-body")!;
    const topBand = gridRoot.querySelector<HTMLElement>(".pte-pinned-rows-top")!;

    expect(topBand.parentElement).toBe(gridRoot);
    expect(topBand.textContent).toContain("Target");
    expect(topBand.querySelector("[data-row-id='p:top:target']")).toBeTruthy();
    expect(topBand.querySelectorAll(
      ".pte-pinned-rows-center .pte-pinned-row.pte-group-row",
    ).length).toBe(2);
    expect(gridRoot.querySelector(".pte-sticky-group-rows")).toBeNull();
    expect(body.querySelector(".pte-pinned-rows")).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("supports callback-based group pinning and groupRows full-width display", async () => {
    const { container, apiRef, root } = await mount({
      groupDisplayType: "groupRows",
      isRowPinned: ({ node }: any) => node.isGroup && node.groupKey === "EMEA" ? "bottom" : null,
    });
    await act(async () => {
      apiRef.current!.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    });

    const pinnedGroup = container.querySelector<HTMLElement>(
      ".pte-pinned-rows-bottom .pte-pinned-row.pte-full-width-row",
    )!;
    expect(pinnedGroup).toBeTruthy();
    expect(pinnedGroup.textContent).toContain("EMEA");
    expect(pinnedGroup.querySelector(".pte-full-width-cell")).toBeTruthy();

    await act(async () => root.unmount());
    container.remove();
  });
});
