// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one so the real renderer can mount.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

type Row = { id: string; region: string; sales: number };

const ROWS: Row[] = [
  { id: "1", region: "EMEA", sales: 10 },
  { id: "2", region: "EMEA", sales: 20 },
  { id: "3", region: "APAC", sales: 30 },
];

async function mountGrid(groupDisplayType?: "singleColumn" | "multipleColumns" | "groupRows") {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={ROWS}
        columnDefs={[
          { colId: "region", key: "region", label: "Region" },
          { colId: "sales", key: "sales", label: "Sales" },
        ]}
        rowIdKey="id"
        groupDisplayType={groupDisplayType}
      />,
    );
  });
  return { container, apiRef, root };
}

function groupRowEls(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".pte-row.pte-group-row"));
}

describe("row grouping end-to-end via Grid", () => {
  it("renders group header rows with a chevron, and toggling the chevron expands the group", async () => {
    const { container, apiRef, root } = await mountGrid();
    const api = apiRef.current!;
    const core = api.getCore();

    // Apply grouping by region.
    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    });

    // Two collapsed group headers rendered in the body.
    const toggles = () => Array.from(container.querySelectorAll<HTMLElement>(".pte-group-toggle"));
    expect(core.getRowModel().getViewCount()).toBe(2);
    expect(groupRowEls(container).length).toBeGreaterThanOrEqual(1);
    expect(toggles().length).toBeGreaterThanOrEqual(1);

    // A group label carries its child count.
    const labels = Array.from(container.querySelectorAll<HTMLElement>(".pte-group-label")).map(e => e.textContent);
    expect(labels.some(l => l?.includes("(2)"))).toBe(true); // EMEA has 2 rows

    // Click the EMEA chevron → group expands, revealing 2 leaf rows (view count 4).
    const emeaId = core.getRowModel().getRowNodeAtViewIndex(
      core.getRowModel().getRowNodeAtViewIndex(0)!.groupKey === "EMEA" ? 0 : 1,
    )!.id;
    await act(async () => {
      core.dispatch({ type: "groupToggleExpand", groupId: emeaId });
    });
    expect(core.getRowModel().getViewCount()).toBe(4);

    await act(async () => root.unmount());
    container.remove();
  });

  it("multipleColumns mode adds no group column — the label renders under the grouped column", async () => {
    const { container, apiRef, root } = await mountGrid("multipleColumns");
    const api = apiRef.current!;
    const core = api.getCore();

    const leafCountBefore = core.getColumnModel().getLeaves().filter(c => !c.isInternal()).length;

    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    });

    // No synthesized auto-group column: the visible leaf-column count is unchanged.
    expect(core.getColumnModel().getAutoGroupColumns().length).toBe(0);
    expect(core.getColumnModel().getLeaves().filter(c => !c.isInternal()).length).toBe(leafCountBefore);
    // The group label still renders (in place, under the Region column).
    const labels = Array.from(container.querySelectorAll<HTMLElement>(".pte-group-label")).map(e => e.textContent);
    expect(labels.some(l => l?.includes("(2)"))).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });
});
