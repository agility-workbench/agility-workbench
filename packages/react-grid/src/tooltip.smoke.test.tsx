// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type {
  ReactColDef,
  ReactDefaultColDef,
  ReactGetRowPresentation,
} from "./cellRenderer";
import {
  SparklineRenderer,
  type IGridAPI,
  type TooltipOptions,
  type TooltipComponentParams,
} from "@agility-workbench/grid";

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
  defaultColDef?: ReactDefaultColDef;
  getRowPresentation?: ReactGetRowPresentation;
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
        defaultColDef={opts.defaultColDef}
        getRowPresentation={opts.getRowPresentation}
      />,
    );
  });

  return { container, apiRef, root };
}

function tooltipEl(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".pte-tooltip");
}

function bodyCell(container: HTMLElement, viewIdx: number, colIdx: number): HTMLElement {
  const cell = container.querySelector<HTMLElement>(
    `.pte-row[data-view-idx="${viewIdx}"] .pte-cell[data-col-idx="${colIdx}"]`,
  );
  if (!cell) throw new Error(`no body cell at viewIdx ${viewIdx}, colIdx ${colIdx}`);
  return cell;
}

/** Fire a mouseover on a body cell (col by data-col-idx), which the delegated handler picks up. */
function hoverBodyCell(container: HTMLElement, colIdx: number) {
  const cell = bodyCell(container, 0, colIdx);
  cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }));
  return cell;
}

/** Reproduce the native boundary pair emitted when the pointer crosses between two cells. */
function movePointer(from: HTMLElement, to: HTMLElement) {
  from.dispatchEvent(new MouseEvent("mouseout", {
    bubbles: true,
    clientX: 10,
    clientY: 10,
    relatedTarget: to,
  }));
  to.dispatchEvent(new MouseEvent("mouseover", {
    bubbles: true,
    clientX: 10,
    clientY: 10,
    relatedTarget: from,
  }));
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
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
  });

  it("cancels a stale delayed tooltip when vertical traversal returns to the active cell", async () => {
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 15, hideDelay: 0, mode: "anchored" },
      columns: [
        {
          colId: "name",
          key: "name",
          label: "Name",
          tooltipValueGetter: ({ rowId }) => rowId === "1" ? "row one" : undefined,
        },
      ],
    });
    const first = bodyCell(container, 0, 0);
    const second = bodyCell(container, 1, 0);

    await act(async () => {
      first.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }));
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    const overlay = tooltipEl(container);
    expect(overlay?.textContent).toContain("row one");

    // Start row two's delayed show, then cross back before it expires. Row two deliberately has no
    // content: the stale timer used to call hideNow() and make row one's tooltip disappear.
    await act(async () => {
      movePointer(first, second);
      movePointer(second, first);
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    expect(tooltipEl(container)).toBe(overlay);
    expect(tooltipEl(container)?.textContent).toContain("row one");
    expect(first.getAttribute("aria-describedby")).toBe(overlay?.id);
    await unmountTestRoot(root);
  });

  it("shows tooltips on center-section cells when a column is pinned left", async () => {
    // Regression: with a pinned column, each row slot renders multiple section row elements
    // sharing one data-view-idx; the anchor lookup must search past the first (pinned) row.
    const { container, apiRef, root } = await mountGrid({
      tooltip: { showDelay: 0 },
      columns: [
        { colId: "name", key: "name", label: "Name", pinned: "left" },
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
    await unmountTestRoot(root);
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
    expect(container.querySelector(".custom-tt")).not.toBeNull();
    expect(container.querySelector(".custom-tt")!.textContent).toContain("TT:Ava");
    await unmountTestRoot(root);
  });

  it("measures an anchored React row tooltip after moving from an adjacent follow cell", async () => {
    class InertResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", InertResizeObserver);

    const RowTooltip = (p: TooltipComponentParams) =>
      React.createElement("span", { className: "measured-row-tooltip" }, p.content);
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0 },
      getRowPresentation: () => ({
        tooltip: {
          content: "Compensation review",
          component: RowTooltip,
          options: { mode: "follow" },
        },
      }),
      columns: [
        { colId: "name", key: "name", label: "Name" },
        {
          colId: "email",
          key: "email",
          label: "Salary",
          tooltipOptions: { mode: "anchored", placement: "right" },
        },
      ],
    });

    const rect = (left: number, top: number, width: number, height: number) => ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect);
    const getRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("pte-root")) return rect(0, 0, 600, 400);
        if (this.classList.contains("pte-floating")) {
          const rendered = this.querySelector(".measured-row-tooltip") != null;
          return rect(0, 0, 180, rendered ? 60 : 0);
        }
        if (this.matches('.pte-cell[data-col-idx="1"]')) return rect(100, 100, 120, 40);
        return rect(0, 0, 0, 0);
      });

    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    expect(container.querySelector(".measured-row-tooltip")).not.toBeNull();

    await act(async () => { hoverBodyCell(container, 1); await tick(); });
    expect(tooltipEl(container)?.dataset.placement).toBe("right");
    expect(tooltipEl(container)?.style.top).toBe("90px");

    getRect.mockRestore();
    await unmountTestRoot(root);
    vi.unstubAllGlobals();
  });

  it("uses a full row tooltip default while columns override content and options independently", async () => {
    const RowTooltip = (p: TooltipComponentParams) =>
      React.createElement("span", { className: "row-tooltip" }, `${p.contentSource}:${p.content}`);
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0, mode: "anchored" },
      getRowPresentation: ({ rowId }) => rowId === "1" ? {
        tooltip: {
          content: "Row status: pending",
          component: RowTooltip,
          options: { mode: "follow" },
        },
      } : undefined,
      columns: [
        { colId: "name", key: "name", label: "Name" },
        {
          colId: "email",
          key: "email",
          label: "Email",
          tooltipValueGetter: () => "Column-specific email help",
          tooltipOptions: { mode: "anchored", placement: "left" },
        },
      ],
    });

    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector(".row-tooltip")?.textContent).toBe("row:Row status: pending");
    expect(tooltipEl(container)?.dataset.placement).toBeUndefined();

    await act(async () => { hoverBodyCell(container, 1); await tick(); });
    await act(async () => { await Promise.resolve(); });
    // The column replaces content and positioning, while retaining the row's default component.
    expect(container.querySelector(".row-tooltip")?.textContent)
      .toBe("column:Column-specific email help");
    expect(tooltipEl(container)?.dataset.placement).toBe("left");
    await unmountTestRoot(root);
  });

  it("places row defaults above defaultColDef but below an explicit column", async () => {
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0, mode: "anchored" },
      defaultColDef: {
        tooltipField: "notes",
        tooltipOptions: { placement: "right" },
      },
      getRowPresentation: () => ({
        tooltip: {
          content: "row fallback",
          options: { placement: "top" },
        },
      }),
      columns: [
        { colId: "name", key: "name", label: "Name" },
        {
          colId: "email",
          key: "email",
          label: "Email",
          tooltipField: "email",
          tooltipOptions: { placement: "left" },
        },
      ],
    });

    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    expect(tooltipEl(container)?.textContent).toContain("row fallback");
    expect(tooltipEl(container)?.dataset.placement).toBe("top");

    await act(async () => { hoverBodyCell(container, 1); await tick(); });
    expect(tooltipEl(container)?.textContent).toContain("ava@example.com");
    expect(tooltipEl(container)?.dataset.placement).toBe("left");
    await unmountTestRoot(root);
  });

  it("supports row-level interactivity and a column tooltip opt-out", async () => {
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0, mode: "follow" },
      getRowPresentation: () => ({
        tooltip: {
          content: "Interactive row help",
          options: { mode: "follow", interactive: true },
        },
      }),
      columns: [
        { colId: "name", key: "name", label: "Name" },
        {
          colId: "email",
          key: "email",
          label: "Email",
          inheritRowPresentation: { tooltip: false },
        },
      ],
    });

    await act(async () => { hoverBodyCell(container, 0); await tick(); });
    expect(tooltipEl(container)?.classList.contains("pte-tooltip-interactive")).toBe(true);
    // interactive forces anchored even when both grid and row request follow mode.
    expect(tooltipEl(container)?.dataset.placement).toBeTruthy();

    await act(async () => { hoverBodyCell(container, 1); await tick(); });
    expect(tooltipEl(container)).toBeNull();
    await unmountTestRoot(root);
  });

  it("uses the grid tooltip for individual sparkline points", async () => {
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0, hideDelay: 0 },
      columns: [
        {
          colId: "trend",
          label: "Trend",
          valueGetter: row => [10, Number.NaN, 30],
          cellRenderer: SparklineRenderer,
          cellRendererParams: {
            type: "line",
            showPoints: true,
            tooltipValueFormatter: ({ value, index }: { value: number; index: number }) =>
              `Point ${index}: $${value}`,
          },
        },
      ],
    });

    const targets = container.querySelectorAll<SVGElement>(
      `.pte-row[data-view-idx="0"] .pte-sparkline-tooltip-target`,
    );
    expect(targets).toHaveLength(2);
    expect(targets[0].tagName.toLowerCase()).toBe("rect");
    expect(Number(targets[0].getAttribute("height"))).toBeGreaterThan(0);
    expect(container.querySelectorAll(
      `.pte-row[data-view-idx="0"] .pte-sparkline-point`,
    )).toHaveLength(2);
    expect(targets[0].dataset.sparklinePointIndex).toBe("0");
    expect(targets[1].dataset.sparklinePointIndex).toBe("2");

    await act(async () => {
      targets[1].dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        clientX: 20,
        clientY: 10,
      }));
      await tick();
    });
    expect(tooltipEl(container)?.textContent).toContain("Point 2: $30");

    await act(async () => {
      targets[0].dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        clientX: 10,
        clientY: 10,
      }));
      await tick();
    });
    expect(tooltipEl(container)?.textContent).toContain("Point 0: $10");
    await unmountTestRoot(root);
  });

  it("shows tuple X and Y values in the default sparkline tooltip", async () => {
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 0, hideDelay: 0 },
      columns: [
        {
          colId: "trend",
          label: "Trend",
          valueGetter: () => [["Jan", 10], ["Feb", 20], ["Mar", 30]],
          cellRenderer: SparklineRenderer,
        },
      ],
    });
    const target = container.querySelector<SVGElement>(
      `.pte-row[data-view-idx="0"] .pte-sparkline-tooltip-target[data-sparkline-point-index="1"]`,
    )!;
    expect(container.querySelector(
      `.pte-row[data-view-idx="0"] .pte-sparkline-point`,
    )).toBeNull();
    await act(async () => {
      target.dispatchEvent(new MouseEvent("mouseover", {
        bubbles: true,
        clientX: 15,
        clientY: 10,
      }));
      await tick();
    });
    expect(tooltipEl(container)?.textContent).toContain("Feb: 20");
    await unmountTestRoot(root);
  });

  it("updates and retargets an open sparkline tooltip without rebuilding it", async () => {
    let series = [10, 20, 30];
    const { container, apiRef, root } = await mountGrid({
      tooltip: { showDelay: 0, hideDelay: 0 },
      columns: [
        {
          colId: "trend",
          label: "Trend",
          valueGetter: () => series,
          cellRenderer: SparklineRenderer,
          cellRendererParams: {
            tooltipValueFormatter: ({ value, index }: { value: number; index: number }) =>
              `Point ${index}: $${value}`,
          },
        },
      ],
    });
    const targets = () => container.querySelectorAll<SVGElement>(
      `.pte-row[data-view-idx="0"] .pte-sparkline-tooltip-target`,
    );
    const hoveredTarget = targets()[1];
    await act(async () => {
      hoveredTarget.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 15, clientY: 10 }));
      await tick();
    });
    const overlay = tooltipEl(container)!;
    const content = overlay.querySelector<HTMLElement>(".pte-tooltip-text")!;
    expect(content.textContent).toContain("Point 1: $20");

    series = [10, 28, 30];
    await act(async () => {
      apiRef.current!.applyTransaction({ update: [{ rowId: "1", row: { ...DATA[0] } }] });
      await Promise.resolve();
    });

    expect(targets()[1]).toBe(hoveredTarget);
    expect(tooltipEl(container)).toBe(overlay);
    expect(overlay.querySelector(".pte-tooltip-text")).toBe(content);
    expect(content.textContent).toContain("Point 1: $28");

    await act(async () => {
      targets()[0].dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 5, clientY: 10 }));
      await Promise.resolve();
    });
    expect(tooltipEl(container)).toBe(overlay);
    expect(overlay.querySelector(".pte-tooltip-text")).toBe(content);
    expect(content.textContent).toContain("Point 0: $10");
    await unmountTestRoot(root);
  });

  it("does not show sparkline point tooltips when tooltip=false", async () => {
    const { container, root } = await mountGrid({
      tooltip: false,
      columns: [
        {
          colId: "trend",
          label: "Trend",
          valueGetter: () => [10, 20],
          cellRenderer: SparklineRenderer,
        },
      ],
    });
    const target = container.querySelector<SVGElement>(".pte-sparkline-tooltip-target")!;
    await act(async () => {
      target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await tick();
    });
    expect(tooltipEl(container)).toBeNull();
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
  });

  it("mounts a React component for a header tooltip", async () => {
    function ReactHeaderTooltip(props: TooltipComponentParams) {
      return <span className="react-header-tooltip">Header: {props.colDef?.label}</span>;
    }
    const { container, apiRef, root } = await mountGrid({
      tooltip: { showDelay: 0 },
      columns: [
        { colId: "name", key: "name", label: "Name", headerTooltip: ReactHeaderTooltip },
        { colId: "email", key: "email", label: "Email" },
      ],
    });
    const instanceId = apiRef.current!.getColumnModel().getByColId("name")!.instanceID;
    const header = container.querySelector<HTMLElement>(`.pte-hcell#${instanceId}`)!;
    await act(async () => {
      header.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }));
      await tick();
    });
    expect(container.querySelector(".react-header-tooltip")?.textContent).toContain("Header: Name");
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
  });

  it("opens at the latest pointer position and follows it without remounting content", async () => {
    const { container, root } = await mountGrid({
      tooltip: { showDelay: 10, mode: "follow" },
      columns: [
        { colId: "name", key: "name", label: "Name", tooltipField: "email" },
      ],
    });
    const gridRoot = container.querySelector<HTMLElement>(".pte-root")!;
    gridRoot.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: 400,
      width: 500,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect);
    const cell = container.querySelector<HTMLElement>(
      `.pte-row[data-view-idx="0"] .pte-cell[data-col-idx="0"]`,
    )!;
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 15 }));
      cell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 60, clientY: 70 }));
      await new Promise(resolve => setTimeout(resolve, 15));
    });
    const overlay = tooltipEl(container)!;
    const content = overlay.querySelector<HTMLElement>(".pte-tooltip-text")!;
    expect(overlay.style.left).toBe("68px");
    expect(overlay.style.top).toBe("78px");
    const replaceChildren = vi.spyOn(overlay, "replaceChildren");

    await act(async () => {
      cell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 120, clientY: 130 }));
      await Promise.resolve();
    });

    expect(tooltipEl(container)).toBe(overlay);
    expect(overlay.querySelector(".pte-tooltip-text")).toBe(content);
    expect(overlay.style.left).toBe("128px");
    expect(overlay.style.top).toBe("138px");
    expect(replaceChildren).not.toHaveBeenCalled();
    await unmountTestRoot(root);
  });

  it("applies follow mode to header tooltips", async () => {
    const { container, apiRef, root } = await mountGrid({
      tooltip: { showDelay: 0, mode: "follow" },
      columns: [
        { colId: "name", key: "name", label: "Name", headerTooltip: "Employee name" },
      ],
    });
    const gridRoot = container.querySelector<HTMLElement>(".pte-root")!;
    gridRoot.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: 400,
      width: 500,
      height: 400,
      toJSON: () => ({}),
    } as DOMRect);
    const instanceId = apiRef.current!.getColumnModel().getByColId("name")!.instanceID;
    const header = container.querySelector<HTMLElement>(`.pte-hcell#${instanceId}`)!;
    await act(async () => {
      header.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 20, clientY: 25 }));
      await tick();
      header.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100, clientY: 110 }));
    });

    const overlay = tooltipEl(container)!;
    expect(overlay.textContent).toContain("Employee name");
    expect(overlay.dataset.placement).toBeUndefined();
    expect(overlay.style.left).toBe("108px");
    expect(overlay.style.top).toBe("118px");
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
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
    await unmountTestRoot(root);
  });
});
