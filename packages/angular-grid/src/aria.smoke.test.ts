import { describe, expect, it } from "vitest";
import { Component } from "@angular/core";
import type { IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

/**
 * End-to-end ARIA contract through the Angular wrapper. Mirror of
 * `packages/react-grid/src/aria.smoke.test.tsx`. The wrapper contributes no ARIA-specific code — the
 * renderer owns all of it — and this suite fails if a binding path, a change-detection quirk or a
 * renderer refactor drops the attributes an AT reads. All four column sections are populated, since the
 * owns-ordered topology only exists when a row is split across sections.
 */

type Row = { id: string; region: string; product: string; sales: number; note: string };

const ROWS: Row[] = [
  { id: "1", region: "AMER", product: "Widget", sales: 10, note: "a" },
  { id: "2", region: "AMER", product: "Gadget", sales: 20, note: "b" },
  { id: "3", region: "EMEA", product: "Widget", sales: 30, note: "c" },
  { id: "4", region: "EMEA", product: "Doohickey", sales: 40, note: "d" },
];

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [rowNumbers]="true"
      [rowSelection]="rowSelection"
      [ariaLabel]="ariaLabel"
      (gridReady)="api = $event"
    />
  `,
})
class AriaHost {
  api: IGridAPI | null = null;
  rowSelection = true;
  ariaLabel: string | undefined = undefined;
  rows: Row[] = ROWS;
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", pinned: "left" },
    { colId: "product", key: "product", label: "Product" },
    { colId: "sales", key: "sales", label: "Sales" },
    { colId: "note", key: "note", label: "Note", pinned: "right" },
  ];
}

/** Two grids in one page — the case instance-prefixed cell ids exist to survive. */
@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid style="height: 300px" [rowData]="rows" [columnDefs]="cols" rowIdKey="id"
      (gridReady)="first = $event" />
    <awb-grid style="height: 300px" [rowData]="rows" [columnDefs]="cols" rowIdKey="id"
      (gridReady)="second = $event" />
  `,
})
class TwoGridsHost {
  first: IGridAPI | null = null;
  second: IGridAPI | null = null;
  rows: Row[] = ROWS;
  cols: NgColDef[] = [
    { colId: "region", key: "region", label: "Region" },
    { colId: "product", key: "product", label: "Product" },
  ];
}

const gridRootOf = (gridEl: HTMLElement) => gridEl.querySelector<HTMLElement>(".pte-root")!;

function ownedElements(el: HTMLElement): HTMLElement[] {
  const owns = el.getAttribute("aria-owns");
  expect(owns, `${el.className} has no aria-owns`).toBeTruthy();
  return owns!.split(" ").map((id) => {
    const owned = document.getElementById(id);
    expect(owned, `aria-owns names "${id}" but no such element exists`).not.toBeNull();
    return owned!;
  });
}

/** Only the cells AT reads: creation-time stitching also names cells hidden by the layout. */
const visibleOwnedCells = (rowEl: HTMLElement) =>
  ownedElements(rowEl).filter((c) => c.style.display !== "none");

const colIndexOf = (el: HTMLElement) => Number(el.getAttribute("aria-colindex"));

/** Populated ARIA rows: empty pool slots are hidden and stripped of aria-rowindex. */
const centerBodyRows = (gridRoot: HTMLElement) =>
  Array.from(gridRoot.querySelectorAll<HTMLElement>(".pte-viewport > .pte-row[aria-rowindex]"));

const hcellFor = (api: IGridAPI, colId: string) =>
  document.getElementById(api.getColumnModel().getByColId(colId)!.instanceID)!;

/** The announcer coalesces over 150ms; wait it out rather than faking timers under Angular. */
const settleAnnouncement = () => new Promise((resolve) => setTimeout(resolve, 200));

describe("ARIA contract through the Angular wrapper", () => {
  it("exposes the root as a grid with row/column counts and multiselectable", async () => {
    const { gridEl } = await mountGridHost(AriaHost);
    const gridRoot = gridRootOf(gridEl);

    expect(gridRoot.getAttribute("role")).toBe("grid");
    expect(gridRoot.getAttribute("aria-rowcount")).toBe(String(ROWS.length + 1));
    expect(gridRoot.getAttribute("aria-colcount")).toBe("5"); // 4 columns + the row-number gutter
    expect(gridRoot.getAttribute("aria-multiselectable")).toBe("true");
    expect(gridRoot.tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("passes the grid's accessible name through, and updates it on an input change", async () => {
    const { fixture, gridEl, host } = await mountGridHost(AriaHost, 600, (instance) => {
      instance.ariaLabel = "Open invoices";
    });
    expect(gridRootOf(gridEl).getAttribute("aria-label")).toBe("Open invoices");

    host.ariaLabel = "Closed invoices";
    await syncGridInputs(fixture);
    expect(gridRootOf(gridEl).getAttribute("aria-label")).toBe("Closed invoices");

    host.ariaLabel = undefined;
    await syncGridInputs(fixture);
    expect(gridRootOf(gridEl).hasAttribute("aria-label")).toBe(false);
  });

  it("exposes one header row owning every leaf columnheader in visual order", async () => {
    const { gridEl } = await mountGridHost(AriaHost);
    const gridRoot = gridRootOf(gridEl);

    const headerRows = Array.from(gridRoot.querySelectorAll<HTMLElement>('[role="row"]'))
      .filter((r) => r.querySelector('[role="columnheader"]'));
    expect(headerRows).toHaveLength(1);

    const owned = ownedElements(headerRows[0]);
    expect(owned.every((el) => el.getAttribute("role") === "columnheader")).toBe(true);
    expect(owned.map(colIndexOf)).toEqual([1, 2, 3, 4, 5]);
    // The blank row-number gutter header is named explicitly (axe: empty-table-header).
    expect(owned[0].getAttribute("aria-label")).toBe("Row number");
  });

  it("exposes exactly one ARIA row per logical row, owning all four sections' cells in order", async () => {
    const { gridEl } = await mountGridHost(AriaHost);
    const gridRoot = gridRootOf(gridEl);

    const rows = centerBodyRows(gridRoot);
    expect(rows).toHaveLength(ROWS.length);
    for (const sel of [".pte-viewport-leading", ".pte-viewport-left", ".pte-viewport-right"]) {
      const fragments = Array.from(gridRoot.querySelectorAll<HTMLElement>(`${sel} .pte-row`));
      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments.some((f) => f.getAttribute("role") === "row")).toBe(false);
    }

    rows.forEach((rowEl, i) => {
      expect(rowEl.getAttribute("role")).toBe("row");
      expect(rowEl.getAttribute("aria-rowindex")).toBe(String(i + 2));
      const cells = visibleOwnedCells(rowEl);
      expect(cells.every((c) => c.getAttribute("role") === "gridcell")).toBe(true);
      expect(cells.map(colIndexOf)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  it("names the active cell on the root via aria-activedescendant, across sections", async () => {
    const { gridEl, host } = await mountGridHost(AriaHost);
    const gridRoot = gridRootOf(gridEl);
    const core = host.api!.getCore();

    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 2, reason: "api" } as never);
    const centerId = gridRoot.getAttribute("aria-activedescendant");
    expect(centerId).toBeTruthy();
    expect(document.getElementById(centerId!)!.getAttribute("role")).toBe("gridcell");

    // Pinned-left: the named cell reaches its row only through aria-owns.
    core.dispatch({ type: "focusSet", viewIdx: 1, colIdx: 1, reason: "api" } as never);
    const pinnedId = gridRoot.getAttribute("aria-activedescendant")!;
    expect(pinnedId).not.toBe(centerId);
    expect(document.getElementById(pinnedId)!.closest(".pte-viewport-left")).not.toBeNull();
    const owningRow = centerBodyRows(gridRoot)
      .find((r) => r.getAttribute("aria-owns")!.split(" ").includes(pinnedId));
    expect(owningRow?.getAttribute("aria-rowindex")).toBe("3");
  });

  it("puts aria-sort on the sorted columnheader and 'none' on the other sortable ones", async () => {
    const { host } = await mountGridHost(AriaHost);
    const api = host.api!;
    const core = api.getCore();

    expect(hcellFor(api, "sales").getAttribute("aria-sort")).toBe("none");
    core.dispatch({
      type: "sortModelSet",
      sortItems: [{ key: api.getColumnModel().getByColId("sales")!.instanceID, dir: "asc" }],
    } as never);
    expect(hcellFor(api, "sales").getAttribute("aria-sort")).toBe("ascending");
    expect(hcellFor(api, "product").getAttribute("aria-sort")).toBe("none");
  });

  it("mirrors row selection onto the ARIA row and its cells across sections", async () => {
    const { gridEl, host } = await mountGridHost(AriaHost);
    const gridRoot = gridRootOf(gridEl);
    host.api!.getCore().dispatch({ type: "rowSelectSet", viewIdx: 2, mode: "toggle" } as never);

    const rows = centerBodyRows(gridRoot);
    expect(rows[2].getAttribute("aria-selected")).toBe("true");
    // Absent rather than "false" on unselected rows.
    expect(rows[0].hasAttribute("aria-selected")).toBe(false);
    const cells = visibleOwnedCells(rows[2]);
    expect(cells).toHaveLength(5);
    expect(cells.every((c) => c.getAttribute("aria-selected") === "true")).toBe(true);
    expect(cells.some((c) => c.closest(".pte-viewport-left"))).toBe(true);
    expect(cells.some((c) => c.closest(".pte-viewport-right"))).toBe(true);
  });

  it("exposes group rows as expandable with a level, and updates on expand", async () => {
    const { gridEl, host } = await mountGridHost(AriaHost);
    const gridRoot = gridRootOf(gridEl);
    const api = host.api!;
    api.getCore().dispatch({ type: "rowGroupSet", colIds: ["region"] });

    const collapsed = centerBodyRows(gridRoot);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.map((r) => r.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    expect(collapsed.map((r) => r.getAttribute("aria-level"))).toEqual(["1", "1"]);

    api.setAllGroupsExpanded(true);
    const expanded = centerBodyRows(gridRoot);
    expect(expanded).toHaveLength(2 + ROWS.length);
    const groups = expanded.filter((r) => r.hasAttribute("aria-expanded"));
    expect(groups).toHaveLength(2);
    expect(groups.every((r) => r.getAttribute("aria-expanded") === "true")).toBe(true);
    // Leaf rows are neither expandable nor levelled (announcing every row as "level 1" is worse).
    const leaves = expanded.filter((r) => !r.hasAttribute("aria-expanded"));
    expect(leaves).toHaveLength(ROWS.length);
    expect(leaves.every((r) => !r.hasAttribute("aria-level"))).toBe(true);
  });

  it("carries one sr-only polite live region that announces state changes", async () => {
    const { gridEl, host } = await mountGridHost(AriaHost);
    const gridRoot = gridRootOf(gridEl);
    const announcer = gridRoot.querySelector<HTMLElement>(".pte-grid-sr-announcer")!;

    expect(announcer.getAttribute("role")).toBe("status");
    expect(announcer.getAttribute("aria-live")).toBe("polite");
    expect(announcer.getAttribute("aria-atomic")).toBe("true");
    expect(gridRoot.querySelectorAll(".pte-grid-sr-announcer")).toHaveLength(1);

    const core = host.api!.getCore();
    core.dispatch({ type: "rowSelectSet", viewIdx: 0, mode: "toggle" } as never);
    core.dispatch({ type: "rowSelectSet", viewIdx: 1, mode: "toggle" } as never);
    await settleAnnouncement();
    expect(announcer.textContent).toBe("2 rows selected");
  });

  it("marks the grid busy while the loading overlay is up", async () => {
    const { gridEl, host } = await mountGridHost(AriaHost);
    const gridRoot = gridRootOf(gridEl);
    const core = host.api!.getCore();

    expect(gridRoot.hasAttribute("aria-busy")).toBe(false);
    core.dispatch({ type: "overlayShow", overlayType: "loading" } as never);
    expect(gridRoot.getAttribute("aria-busy")).toBe("true");
    core.dispatch({ type: "overlayShow", overlayType: "none" } as never);
    expect(gridRoot.hasAttribute("aria-busy")).toBe(false);
  });

  it("exposes the column menu as a focused menu of menuitems", async () => {
    const { host } = await mountGridHost(AriaHost);
    const menuBtn = hcellFor(host.api!, "product")
      .querySelector<HTMLElement>(".pte-hcell-menu-menuBtn")!;
    menuBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const overlay = document.querySelector<HTMLElement>(".pte-menu")!;
    expect(overlay).not.toBeNull();
    expect(overlay.getAttribute("role")).toBe("menu");
    expect(overlay.getAttribute("aria-label")).toBeTruthy();
    const items = Array.from(overlay.querySelectorAll<HTMLElement>(".pte-menu-item"));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.getAttribute("role") === "menuitem")).toBe(true);
    // Focus is inside the menu, so the arrow-key pattern the role promises actually works.
    expect(overlay.contains(document.activeElement)).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".pte-menu")).toBeNull();
  });

  it("keeps two grids' cell ids and activedescendant pointers apart", async () => {
    const { fixture, host } = await mountGridHost(TwoGridsHost);
    const hostEl = fixture.nativeElement as HTMLElement;
    const [firstEl, secondEl] = Array.from(hostEl.querySelectorAll<HTMLElement>("awb-grid"));
    for (const el of [firstEl, secondEl]) {
      Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });
    }

    host.first!.getCore().dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1, reason: "api" } as never);
    host.second!.getCore().dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1, reason: "api" } as never);

    const firstId = gridRootOf(firstEl).getAttribute("aria-activedescendant")!;
    const secondId = gridRootOf(secondEl).getAttribute("aria-activedescendant")!;
    expect(firstId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
    expect(firstEl.contains(document.getElementById(firstId))).toBe(true);
    expect(secondEl.contains(document.getElementById(secondId))).toBe(true);

    const allIds = Array.from(document.querySelectorAll<HTMLElement>("[id]"), (el) => el.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
