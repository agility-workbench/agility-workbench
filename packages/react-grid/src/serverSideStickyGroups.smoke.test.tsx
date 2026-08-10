// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { IGridAPI, IServerSideDataSource, IServerSideRequest } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

type Row = { id: string; region: string; country: string; sales: number };

// One region, two countries of 30 leaves each — the same shape as the client-side sticky test, so
// the docking expectations carry over; only the delivery is lazy per-parent blocks.
const ROWS: Row[] = Array.from({ length: 60 }, (_, index) => ({
  id: `sticky-${index}`,
  region: "EMEA",
  country: index < 30 ? "First" : "Second",
  sales: index,
}));

// Synchronous grouping server (contract-shaped): group rows above the leaf level, leaves within a
// path. totalRows always reported.
const dataSource: IServerSideDataSource = {
  getRows: ({ request, success }: { request: IServerSideRequest; success: (r: any) => void }) => {
    const subset = ROWS.filter(row =>
      request.groupKeys.every(k => (row as any)[k.key] === k.value));
    let rows: any[];
    if (request.groupKeys.length < request.groupBy.length) {
      const key = request.groupBy[request.groupKeys.length];
      const seen: string[] = [];
      for (const row of subset) {
        const value = String((row as any)[key]);
        if (!seen.includes(value)) seen.push(value);
      }
      rows = seen.map(value => ({ [key]: value, count: subset.filter(r => String((r as any)[key]) === value).length }));
    } else {
      rows = subset;
    }
    const start = request.startRow ?? 0;
    const end = request.endRow ?? rows.length;
    success({ rows: rows.slice(start, end), totalRows: rows.length });
  },
};

const COLUMNS = [
  { colId: "region", key: "region", label: "Region" },
  { colId: "country", key: "country", label: "Country" },
  { colId: "sales", key: "sales", label: "Sales" },
];

describe("sticky group rows on the server-side row model", () => {
  it("docks lazily loaded group headers, including over slots that have not loaded yet", async () => {
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
          columnDefs={COLUMNS}
          rowIdKey="id"
          rowModelType="serverSide"
          serverSideDataSource={dataSource}
          serverSideBlockSize={10}
          groupRowsSticky={true}
          groupDefaultExpanded={-1}
          getGroupChildCount={(row: any) => row.count}
        />,
      );
    });
    const core = apiRef.current!.getCore();
    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    });
    // Let the chained block loads settle (root groups → country groups → visible leaf blocks).
    await act(async () => {
      for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
    });

    const model = core.getRowModel();
    // Flattened: EMEA, First, 30 leaves, Second, 30 leaves.
    expect(model.getRowCount()).toBe(63);

    // The chain docks at rest, mirroring the two group headers.
    const overlay = container.querySelector<HTMLElement>(".pte-body .pte-sticky-rows")!;
    expect(overlay).toBeTruthy();
    expect(overlay.style.display).toBe("flex");
    const headerIds = () => Array.from(
      overlay.querySelectorAll<HTMLElement>(".pte-pinned-rows-center .pte-pinned-row.pte-group-row"),
    ).map(el => el.getAttribute("data-row-id"));
    const emeaId = model.getRowNodeAtViewIndex(0)!.id;
    const firstId = model.getRowNodeAtViewIndex(1)!.id;
    expect(headerIds()).toEqual([emeaId, firstId]);

    const scroller = container.querySelector<HTMLDivElement>(".pte-scroller")!;
    const secondId = model.getGroupNodes().find(n => n.groupKey === "Second")!.id;

    // Jump deep into Second's block, well past the loaded frontier (at rest only Second's first
    // leaf block, view 33-42, has loaded). The overlay recomputes on the first frame after the
    // scroll — before the jumped-to blocks resolve — so the edge slots are unloaded and the stack
    // is derived from the store's ancestor chain + subtree spans rather than row scans.
    expect(model.getRowNodeAtViewIndex(55)).toBeUndefined();
    await act(async () => {
      scroller.scrollTop = 55 * 43;
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise(resolve => requestAnimationFrame(resolve));
    });
    expect(headerIds()).toEqual([emeaId, secondId]);

    // After the blocks land the stack is unchanged — no flicker-inducing chain change.
    await act(async () => {
      for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(headerIds()).toEqual([emeaId, secondId]);
    expect(overlay.style.height).toBe("86px");

    await unmountTestRoot(root);
    container.remove();
  });
});
