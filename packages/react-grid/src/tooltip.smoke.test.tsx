// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { ReactColDef } from "./cellRenderer";
import type { IGridAPI, TooltipOptions, TooltipComponentParams } from "@agility-workbench/grid";

// happy-dom's <canvas> has no 2D context; CanvasMeasurer needs one to measure text.
beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (t: string) => ({ width: t.length * 7 }),
  });
});

// happy-dom is not reset between tests; clear the document so a grid (or its floating tooltip
// layer) left by one test can't be matched by the next test's queries.
afterEach(() => {
  document.body.innerHTML = "";
});

type Row = { id: number; name: string; email: string; notes: string };

const DATA: Row[] = [
  { id: 1, name: "Ava", email: "ava@example.com", notes: "short" },
  { id: 2, name: "Liam", email: "liam@example.com", notes: "short" },
];

async function mountGrid(opts: {
  tooltip?: boolean | TooltipOptions;
  columns?: ReactColDef[];
} = {}) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
  document.body.appendChild(container);

  const apiRef = React.createRef<IGridAPI | null>();
  const columns: ReactColDef[] = opts.columns ?? [
    { colId: "name", key: "name", label: "Name" },
    { colId: "email", key: "email", label: "Email" },
  ];

  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Grid
        apiRef={apiRef}
        data={DATA}
        columnDefs={columns}
        rowIdKey="id"
        tooltip={opts.tooltip ?? { showDelay: 0, hideDelay: 0 }}
      />,
    );
  });

  return { container, apiRef, root };
}

function tooltipEl(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".pte-tooltip");
}

/** Fire a mouseover on a body cell (col by data-col-idx), which the delegated handler picks up. */
function hoverBodyCell(container: HTMLElement, colIdx: number) {
  const cell = container.querySelector<HTMLElement>(`.pte-row[data-view-idx="0"] .pte-cell[data-col-idx="${colIdx}"]`);
  if (!cell) throw new Error(`no body cell at colIdx ${colIdx}`);
  cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }));
  return cell;
}

/** Await one macrotask so a `setTimeout(0)` show/hide timer has fired before we assert. Real timers
 * under happy-dom don't always drain within an `act(async)` microtask flush, which makes bare
 * hover-then-assert flaky when the event loop is busy from a prior test. */
function tick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("tooltips", () => {
  it("shows a programmatic tooltip via api.showTooltip", async () => {
    const { container, apiRef, root } = await mountGrid({
      tooltip: { showDelay: 0 },
      columns: [
        { colId: "name", key: "name", label: "Name" },
        { colId: "email", key: "email", label: "Email", tooltipField: "notes" },
      ],
    });
    await act(async () => {
      apiRef.current!.showTooltip({ rowId: "1", colId: apiRef.current!.getColumnModel().getByColId("email")!.instanceID });
      await tick();
    });
    const el = tooltipEl(container);
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("short");
    await act(async () => { root.unmount(); });
  });

  it("tooltipField shows a value from another field on hover", async () => {
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0 },
      columns: [
        { colId: "name", key: "name", label: "Name", tooltipField: "email" },
        { colId: "email", key: "email", label: "Email" },
      ],
    });
    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    const el = tooltipEl(container);
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("@example.com");
    await act(async () => { root.unmount(); });
  });

  it("custom tooltipComponent renders", async () => {
    const Comp = (p: TooltipComponentParams) =>
      React.createElement("span", { className: "custom-tt" }, `TT:${p.value}`);
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0 },
      columns: [
        { colId: "name", key: "name", label: "Name", tooltipComponent: Comp },
        { colId: "email", key: "email", label: "Email" },
      ],
    });
    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    // React root renders asynchronously; flush a microtask.
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector(".custom-tt")).not.toBeNull();
    expect(container.querySelector(".custom-tt")!.textContent).toContain("TT:Ava");
    await act(async () => { root.unmount(); });
  });

  it("suppressAutoTooltip disables the auto-truncation tooltip", async () => {
    // Force truncation by mocking scroll/client widths on the hovered cell.
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0 },
      columns: [
        { colId: "name", key: "name", label: "Name", suppressAutoTooltip: true },
        { colId: "email", key: "email", label: "Email" },
      ],
    });
    const cell = container.querySelector<HTMLElement>(`.pte-row[data-view-idx="0"] .pte-cell[data-col-idx="0"]`)!;
    Object.defineProperty(cell, "scrollWidth", { value: 500, configurable: true });
    Object.defineProperty(cell, "clientWidth", { value: 50, configurable: true });
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }));
      await tick();
    });
    expect(tooltipEl(container)).toBeNull();
    await act(async () => { root.unmount(); });
  });

  it("does not show tooltips when tooltip=false", async () => {
    const { container, apiRef, root } = await mountGrid({
      tooltip: false,
      columns: [
        { colId: "name", key: "name", label: "Name", tooltipField: "email" },
        { colId: "email", key: "email", label: "Email" },
      ],
    });
    await act(async () => {
      apiRef.current!.showTooltip({ rowId: "1", colId: apiRef.current!.getColumnModel().getByColId("name")!.instanceID });
      await tick();
    });
    expect(tooltipEl(container)).toBeNull();
    await act(async () => { root.unmount(); });
  });

  it("shows a header tooltip on header hover", async () => {
    const { container, apiRef, root } = await mountGrid({
      tooltip: { showDelay: 0 },
      columns: [
        { colId: "name", key: "name", label: "Name", headerTooltip: "The person's name" },
        { colId: "email", key: "email", label: "Email" },
      ],
    });
    const instanceId = apiRef.current!.getColumnModel().getByColId("name")!.instanceID;
    const header = container.querySelector<HTMLElement>(`.pte-hcell#${instanceId}`)!;
    await act(async () => {
      header.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }));
      await tick();
    });
    const el = tooltipEl(container);
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("The person's name");
    await act(async () => { root.unmount(); });
  });

  it("column-level tooltipOptions.mode overrides the grid default", async () => {
    // Grid default is anchored; the 'name' column overrides to follow-mouse.
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0, mode: "anchored" },
      columns: [
        { colId: "name", key: "name", label: "Name", tooltipField: "email", tooltipOptions: { mode: "follow" } },
        { colId: "email", key: "email", label: "Email", tooltipField: "notes" },
      ],
    });
    // Column 0 (name) → follow: no placement stamp.
    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    expect(tooltipEl(container)).not.toBeNull();
    expect(tooltipEl(container)!.dataset.placement).toBeUndefined();

    // Column 1 (email) → inherits grid anchored: placement stamp present.
    await act(async () => { hoverBodyCell(container, 1); await tick(); });
    expect(tooltipEl(container)!.dataset.placement).toBeTruthy();
    await act(async () => { root.unmount(); });
  });

  it("column-level tooltipOptions.interactive forces anchored even under a follow grid default", async () => {
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0, mode: "follow" },
      columns: [
        { colId: "name", key: "name", label: "Name", tooltipField: "email", tooltipOptions: { interactive: true } },
        { colId: "email", key: "email", label: "Email" },
      ],
    });
    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    const el = tooltipEl(container);
    expect(el).not.toBeNull();
    // interactive ⇒ anchored (placement stamped) + interactive class, despite the follow grid default.
    expect(el!.dataset.placement).toBeTruthy();
    expect(el!.classList.contains("pte-tooltip-interactive")).toBe(true);
    await act(async () => { root.unmount(); });
  });

  it("reconfigures the tooltip mode live when the prop changes (anchored → follow)", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const apiRef = React.createRef<IGridAPI | null>();
    const columns: ReactColDef[] = [
      { colId: "name", key: "name", label: "Name", tooltipField: "email" },
      { colId: "email", key: "email", label: "Email" },
    ];
    const render = (tooltip: TooltipOptions) =>
      React.createElement(Grid, { apiRef, data: DATA, columnDefs: columns, rowIdKey: "id", tooltip });

    const root = createRoot(container);
    await act(async () => { root.render(render({ showDelay: 0, mode: "anchored" })); });

    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    // Anchored placement stamps a data-placement side on the overlay; follow does not.
    expect(tooltipEl(container)?.dataset.placement).toBeTruthy();

    // Switch to follow-mouse live (no remount).
    await act(async () => { root.render(render({ showDelay: 0, mode: "follow" })); });
    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    const el = tooltipEl(container);
    expect(el).not.toBeNull();
    // Follow mode carries no placement side (anchored stamps one; follow does not). This is the
    // observable signal that the live mode switch took effect. (Pixel-level pointer tracking is
    // exercised in the playground demo — happy-dom's zero-size getBoundingClientRect makes the
    // clamped left/top unreliable to assert here.)
    expect(el!.dataset.placement).toBeUndefined();
    await act(async () => { root.unmount(); });
  });

  it("disables tooltips live when the prop flips to false", async () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(container);
    const apiRef = React.createRef<IGridAPI | null>();
    const columns: ReactColDef[] = [
      { colId: "name", key: "name", label: "Name", tooltipField: "email" },
      { colId: "email", key: "email", label: "Email" },
    ];
    const render = (tooltip: boolean | TooltipOptions) =>
      React.createElement(Grid, { apiRef, data: DATA, columnDefs: columns, rowIdKey: "id", tooltip });

    const root = createRoot(container);
    await act(async () => { root.render(render({ showDelay: 0 })); });
    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    expect(tooltipEl(container)).not.toBeNull();

    await act(async () => { root.render(render(false)); });
    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    expect(tooltipEl(container)).toBeNull();
    await act(async () => { root.unmount(); });
  });
});
