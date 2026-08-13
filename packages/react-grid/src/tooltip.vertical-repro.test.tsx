// @vitest-environment happy-dom
// REPRO for: tooltips stop showing when moving slowly down a column.
// Vertical cell→cell moves cross the row's border-bottom band (owned by the .pte-row element,
// not any cell), producing mouseout/mouseover pairs whose locate() is null. Each of those calls
// scheduleHide(), and scheduleHide() overwrites this.hideTimer WITHOUT clearing the one already
// armed — orphaning a live timer that later fires hideNow() and kills the next cell's pending show.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";
import type { IGridAPI, TooltipOptions } from "@agility-workbench/grid";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

type Row = { id: number; name: string };
const DATA: Row[] = [
  { id: 1, name: "Ava" },
  { id: 2, name: "Liam" },
];

async function mountGrid(tooltip: TooltipOptions) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const columns: ReactColDef[] = [
    { colId: "name", key: "name", label: "Name", tooltipValueGetter: ({ rowId }) => `tip for row ${rowId}` },
  ];
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid apiRef={apiRef} data={DATA} columnDefs={columns} rowIdKey="id" tooltip={tooltip} />,
    );
  });
  return { container, root };
}

const tooltipEl = (c: HTMLElement) => c.querySelector<HTMLElement>(".pte-tooltip");
const cellAt = (c: HTMLElement, viewIdx: number) =>
  c.querySelector<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"] .pte-cell[data-col-idx="0"]`)!;
const rowAt = (c: HTMLElement, viewIdx: number) =>
  c.querySelector<HTMLElement>(`.pte-row[data-view-idx="${viewIdx}"]`)!;

const over = (target: HTMLElement, related: HTMLElement | null) =>
  target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10, relatedTarget: related ?? undefined }));
const out = (target: HTMLElement, related: HTMLElement | null) =>
  target.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, clientX: 10, clientY: 10, relatedTarget: related ?? undefined }));

describe("vertical traversal across the row border band", () => {
  it("still shows the next row's tooltip after crossing the row border", async () => {
    // hideDelay (10) < showDelay (30), like the real defaults (100 < 400).
    const { container, root } = await mountGrid({ showDelay: 30, hideDelay: 10 });
    const cellA = cellAt(container, 0);
    const cellB = cellAt(container, 1);
    const rowA = rowAt(container, 0);

    // 1. Hover row 0 and let its tooltip open.
    await act(async () => {
      over(cellA, null);
      await new Promise(r => setTimeout(r, 45));
    });
    expect(tooltipEl(container)?.textContent).toContain("tip for row 1");

    // 2. Move slowly DOWN into row 1, crossing row 0's border-bottom band. The border pixels
    //    belong to the .pte-row element (no cell), so the browser emits this exact sequence:
    await act(async () => {
      out(cellA, rowA);   // leave cell A into the border band
      over(rowA, cellA);  // enter the row element (locate() → null)
      out(rowA, cellB);   // leave the border band (locate(source) → null)
      over(cellB, rowA);  // enter cell B → schedules B's show
      // Wait past showDelay; also past the orphaned hide timers.
      await new Promise(r => setTimeout(r, 60));
    });

    // Expected: row 1's tooltip is visible. With the orphaned-hide-timer bug, an uncancelled
    // hideNow() fires at +10ms and destroys B's pending show → no tooltip at all.
    expect(tooltipEl(container)?.textContent).toContain("tip for row 2");

    await unmountTestRoot(root);
  });
});
