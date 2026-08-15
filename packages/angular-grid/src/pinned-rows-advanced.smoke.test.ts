import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { BodyMenuContext, GridOptions, IGridAPI, IRowNode } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef, NgDefaultColDef } from "./interface";
import type { NgMenuItem } from "./menu";
import { mountGridHost } from "./test-utils";

type Row = { id: string; region: string; country: string; sales: number };

const ROWS: Row[] = [
  { id: "1", region: "EMEA", country: "UK", sales: 10 },
  { id: "2", region: "EMEA", country: "UK", sales: 20 },
  { id: "3", region: "EMEA", country: "France", sales: 30 },
  { id: "4", region: "APAC", country: "Japan", sales: 40 },
  { id: "5", region: "APAC", country: "India", sales: 50 },
];

const COLUMNS: NgColDef[] = [
  { colId: "region", key: "region", label: "Region", pinned: "left" },
  { colId: "country", key: "country", label: "Country" },
  { colId: "sales", key: "sales", label: "Sales" },
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
      [defaultColDef]="defaultColDef"
      [cellSelection]="cellSelection"
      [pinnedTopRowData]="pinnedTop"
      [pinnedBottomRowData]="pinnedBottom"
      [isRowPinned]="isRowPinned"
      [pinnedRowsEditable]="pinnedRowsEditable"
      [groupRowsSticky]="groupRowsSticky"
      [groupDefaultExpanded]="groupDefaultExpanded"
      [groupDisplayType]="groupDisplayType"
      [bodyContextMenu]="bodyContextMenu"
      (gridReady)="api = $event"
    />
  `,
})
class PinnedRowsHost {
  api: IGridAPI | null = null;
  rows: unknown[] = ROWS;
  cols: NgColDef[] = COLUMNS;
  defaultColDef: NgDefaultColDef | undefined;
  cellSelection: GridOptions["cellSelection"];
  pinnedTop: GridOptions["pinnedTopRowData"];
  pinnedBottom: GridOptions["pinnedBottomRowData"];
  isRowPinned: GridOptions["isRowPinned"];
  pinnedRowsEditable: GridOptions["pinnedRowsEditable"];
  groupRowsSticky: GridOptions["groupRowsSticky"];
  groupDefaultExpanded: GridOptions["groupDefaultExpanded"];
  groupDisplayType: GridOptions["groupDisplayType"];
  bodyContextMenu:
    | boolean
    | ((p: { ctx: BodyMenuContext; items: NgMenuItem[] }) => NgMenuItem[])
    | undefined;
}

function stickyRows(count = 60): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `sticky-${index}`,
    region: "EMEA",
    country: index < 30 ? "First" : "Second",
    sales: index,
  }));
}

function keydown(target: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  }));
}

async function scrollBody(scroller: HTMLElement, top: number): Promise<void> {
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event("scroll"));
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function stubClipboard(): { written: string[]; restore: () => void } {
  const written: string[] = [];
  const original = navigator.clipboard;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  return {
    written,
    restore: () => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: original });
    },
  };
}

describe("AwbGrid pinned and sticky rows (advanced)", () => {
  it("gives top, bottom, and central body independent vertical scrollbars", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost);
    const gridRoot = gridEl.querySelector<HTMLElement>(".pte-root")!;
    Object.defineProperty(gridRoot, "clientHeight", { value: 300, configurable: true });
    const pinnedRows = Array.from({ length: 12 }, (_, index) => ({
      id: `pinned-${index}`,
      region: `Pinned ${index + 1}`,
      country: "All",
      sales: index,
    }));

    host.api!.setPinnedTopRowData(pinnedRows);
    host.api!.setPinnedBottomRowData(pinnedRows);

    const top = gridEl.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    const bottom = gridEl.querySelector<HTMLElement>(".pte-pinned-rows-bottom")!;
    const topVertical = top.querySelector<HTMLDivElement>(".pte-pinned-rows-vertical")!;
    const bottomVertical = bottom.querySelector<HTMLDivElement>(".pte-pinned-rows-vertical")!;
    // The body is its own vertical scroller now — the bands must still not share it.
    const bodyVertical = gridEl.querySelector<HTMLDivElement>(".pte-body")!;
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
    expect(gridEl.querySelector<HTMLElement>(".pte-body")!.scrollTop).toBe(0);

    bottomVertical.scrollTop = 86;
    bottomVertical.dispatchEvent(new Event("scroll"));
    expect(bottom.querySelector<HTMLElement>(".pte-pinned-rows-center")!.scrollTop).toBe(86);
    expect(top.querySelector<HTMLElement>(".pte-pinned-rows-center")!.scrollTop).toBe(43);
  });

  it("explicitly pins a generated group node and keeps its chevron connected to the live group", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost);
    const core = host.api!.getCore();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const group = core.getRowModel().getRowNodeAtViewIndex(0)!;

    core.dispatch({ type: "focusSet", viewIdx: 0, colIdx: 1, reason: "keyboard" });
    host.api!.setRowPinned(group.id, "top");

    const topBand = gridEl.querySelector<HTMLElement>(".pte-pinned-rows-top")!;
    const pinned = topBand.querySelector<HTMLElement>(
      `.pte-pinned-row[data-row-id='${group.id}']`,
    )!;
    expect(pinned).toBeTruthy();
    expect(topBand.textContent).toContain(group.groupKey);
    expect(gridEl.querySelector(`.pte-body [row-id='${group.id}']`)).toBeNull();
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 1, rowPinned: "top" });

    const before = core.getRowModel().getViewCount();
    topBand.querySelector<HTMLElement>(`.pte-group-toggle[data-group-id='${group.id}']`)!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(core.getRowModel().getViewCount()).toBeGreaterThan(before);
    expect(gridEl.querySelector(".pte-pinned-rows-top .icon-group-expanded")).toBeTruthy();

    host.api!.setRowPinned(group.id, null);
    expect(gridEl.querySelector(
      `.pte-pinned-rows-top .pte-pinned-row[data-row-id='${group.id}']`,
    )).toBeNull();
    // The chevron cell keeps focus across the unpin. Its leaf index is 1: the auto-group column is
    // unpinned by default (no forced pin-left), so it sits after the left-pinned "region" column.
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 1 });
  });

  it("overlays the active group ancestry and pushes headers without moving the body flow", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.rows = stickyRows();
      instance.groupRowsSticky = true;
      instance.groupDefaultExpanded = -1;
    });
    const core = host.api!.getCore();
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });

    const scroller = gridEl.querySelector<HTMLDivElement>(".pte-body")!;

    // The chain docks at rest: the band already exists at scrollTop 0, mirroring the top header
    // rows pixel-for-pixel.
    const overlay = gridEl.querySelector<HTMLElement>(".pte-body-frame .pte-sticky-rows")!;
    expect(overlay).toBeTruthy();
    expect(overlay.style.display).toBe("flex");
    expect(overlay.querySelectorAll(
      ".pte-pinned-rows-center .pte-pinned-row.pte-group-row",
    ).length).toBe(2);

    // Wheel over the band keeps scrolling the grid as if the overlay were not there.
    overlay.dispatchEvent(new WheelEvent("wheel", { deltaY: 86, bubbles: true, cancelable: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(scroller.scrollTop).toBe(86);

    // Both nested headers stay stuck as the body scrolls beneath the overlay — nothing is removed
    // from the body flow.
    await scrollBody(scroller, 1);
    expect(overlay.style.display).toBe("flex");
    expect(overlay.querySelectorAll(
      ".pte-pinned-rows-center .pte-pinned-row.pte-group-row",
    ).length).toBe(2);
    const firstRoot = core.getRowModel().getRowNodeAtViewIndex(0)!;
    const firstChildGroup = core.getRowModel().getRowNodeAtViewIndex(1)!;
    expect(overlay.querySelector(`[data-row-id='${firstRoot.id}']`)).toBeTruthy();
    expect(overlay.querySelector(`[data-row-id='${firstChildGroup.id}']`)).toBeTruthy();
    expect(gridEl.querySelector(`.pte-body .pte-viewport [row-id='${firstRoot.id}']`)).toBeTruthy();
    expect(gridEl.querySelector(
      `.pte-body .pte-viewport [row-id='${firstChildGroup.id}']`,
    )).toBeTruthy();
    // The push-down band stays reserved for application-pinned rows and the virtual window is
    // never compacted for sticky ancestors.
    expect(gridEl.querySelector<HTMLElement>(".pte-pinned-rows-top")!.style.display).toBe("none");
    expect(core.getBodyPinnedRowCountBefore(core.getRowModel().getViewCount())).toBe(0);

    // Hovering an overlay mirror highlights every copy of the row, body copy included.
    const stickyRowId = firstChildGroup.id;
    overlay.querySelector<HTMLElement>(
      `.pte-pinned-rows-center .pte-pinned-row[data-row-id='${stickyRowId}'] .pte-cell`,
    )!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const hoverCopies = gridEl.querySelectorAll<HTMLElement>(`[row-id='${stickyRowId}']`);
    expect(hoverCopies.length).toBeGreaterThan(1);
    expect(Array.from(hoverCopies).every((row) => row.classList.contains("pte-row-hover"))).toBe(true);

    // Sibling boundary: the incoming country header pushes the outgoing one up behind the region
    // header (a per-frame translate), then docks in its slot when it reaches the stack bottom.
    const groups = Array.from(
      { length: core.getRowModel().getViewCount() },
      (_, index) => core.getRowModel().getRowNodeAtViewIndex(index)!,
    ).filter((node) => node.isGroup && node.level === 1);
    const currentParent = groups[0];
    const nextParent = groups[1];
    expect(nextParent).toBeTruthy();
    const boundary = nextParent.viewIndex * 43;

    // Mid-push: the outgoing header has slid up behind the region header (1px still peeking out
    // below it) and the overlay clips at its sliding bottom edge.
    await scrollBody(scroller, boundary - 44);
    const outgoing = overlay.querySelector<HTMLElement>(
      `.pte-pinned-rows-center .pte-pinned-row[data-row-id='${currentParent.id}']`,
    )!;
    expect(outgoing).toBeTruthy();
    expect(outgoing.style.transform).toBe("translateY(1px)");
    expect(overlay.style.height).toBe("44px");
    expect(overlay.querySelector(`[data-row-id='${nextParent.id}']`)).toBeNull();

    // Two pixels later the incoming header reaches the stack bottom and docks in the slot; the
    // outgoing sibling is fully hidden and leaves the stack. Its body row never moved.
    await scrollBody(scroller, boundary - 42);
    expect(overlay.querySelector(`[data-row-id='${currentParent.id}']`)).toBeNull();
    const incoming = overlay.querySelector<HTMLElement>(
      `.pte-pinned-rows-center .pte-pinned-row[data-row-id='${nextParent.id}']`,
    )!;
    expect(incoming).toBeTruthy();
    expect(incoming.style.transform).toBe("translateY(43px)");
    expect(overlay.style.height).toBe("86px");
    expect(gridEl.querySelector(`.pte-body .pte-viewport [row-id='${nextParent.id}']`)).toBeTruthy();
  });

  it("keeps body rows continuous while headers convert to sticky (no row-height jump)", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.rows = stickyRows().map((row, index) => ({ ...row, id: `flow-${index}` }));
      instance.groupRowsSticky = true;
      instance.groupDefaultExpanded = -1;
    });
    const core = host.api!.getCore();
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });

    const scroller = gridEl.querySelector<HTMLDivElement>(".pte-body")!;

    // On-screen offset of a body row, derived from the same quantities the browser paints from:
    // viewport translateY + the row's offset within the compacted slot stack - scrollTop.
    const screenPosOf = (rowId: string, scrollTop: number): number | null => {
      const viewport = gridEl.querySelector<HTMLElement>(".pte-body .pte-viewport")!;
      const match = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(viewport.style.transform ?? "");
      const translateY = match ? parseFloat(match[1]) : 0;
      let stackOffset = 0;
      for (const el of Array.from(viewport.children) as HTMLElement[]) {
        if (el.style.display === "none") continue;
        if (el.getAttribute("row-id") === rowId) return translateY + stackOffset - scrollTop;
        stackOffset += parseFloat(el.style.height || "43");
      }
      return null;
    };

    const nextParent = Array.from(
      { length: core.getRowModel().getViewCount() },
      (_, index) => core.getRowModel().getRowNodeAtViewIndex(index)!,
    ).filter((node) => node.isGroup && node.level === 1)[1];
    const probe = core.getRowModel().getRowNodeAtViewIndex(nextParent.viewIndex + 1)!;
    const boundary = nextParent.viewIndex * 43;

    // Sample scroll positions spanning the entire push window and both docking edges. Scrolling
    // by N pixels must move the probe row by exactly N pixels — any extra delta is the row-height
    // jump this regression guards against.
    const samples = [
      boundary - 87, boundary - 86, boundary - 85,
      boundary - 44, boundary - 43, boundary - 42, boundary - 41,
      boundary - 1, boundary, boundary + 1,
    ];
    let previous: { top: number; pos: number } | null = null;
    for (const top of samples) {
      await scrollBody(scroller, top);
      const pos = screenPosOf(probe.id, top);
      expect(pos).not.toBeNull();
      if (previous) {
        expect(previous.pos - (pos as number)).toBe(top - previous.top);
      }
      previous = { top, pos: pos as number };
    }
  });

  it("keeps application-pinned top rows outside the body when sticky ancestors are active", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.pinnedTop = [{ id: "target", region: "Target", country: "All", sales: 200 }];
      instance.groupRowsSticky = true;
      instance.groupDefaultExpanded = -1;
    });
    host.api!.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    const scroller = gridEl.querySelector<HTMLDivElement>(".pte-body")!;
    await scrollBody(scroller, 1);

    const gridRoot = gridEl.querySelector<HTMLElement>(".pte-root")!;
    const body = gridRoot.querySelector<HTMLElement>(".pte-body")!;
    const topBand = gridRoot.querySelector<HTMLElement>(".pte-pinned-rows-top")!;

    expect(topBand.parentElement).toBe(gridRoot);
    expect(topBand.textContent).toContain("Target");
    expect(topBand.querySelector("[data-row-id='p:top:target']")).toBeTruthy();
    // The push-down band holds only the application row; sticky ancestors render in the body
    // overlay so their band membership never changes with scrolling.
    expect(topBand.querySelectorAll(
      ".pte-pinned-rows-center .pte-pinned-row.pte-group-row",
    ).length).toBe(0);
    expect(gridEl.querySelectorAll(
      ".pte-body-frame .pte-sticky-rows .pte-pinned-rows-center .pte-pinned-row.pte-group-row",
    ).length).toBe(2);
    expect(body.querySelector(".pte-pinned-rows")).toBeNull();
  });

  it("scrolls a focused row clear of the sticky ancestor overlay", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.rows = stickyRows().map((row, index) => ({ ...row, id: `nav-${index}` }));
      instance.groupRowsSticky = true;
      instance.groupDefaultExpanded = -1;
    });
    const core = host.api!.getCore();
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    const scroller = gridEl.querySelector<HTMLDivElement>(".pte-body")!;

    // Focusing a row above the viewport scrolls it BELOW the docked ancestor chain (2 x 43px),
    // not merely to the scroller top where the overlay would hide it.
    await scrollBody(scroller, 500);
    core.dispatch({ type: "focusSet", viewIdx: 13, colIdx: 1, reason: "keyboard" });
    expect(scroller.scrollTop).toBe(13 * 43 - 86);

    await scrollBody(scroller, 500);
    core.dispatch({ type: "focusSet", viewIdx: 2, colIdx: 1, reason: "keyboard" });
    expect(scroller.scrollTop).toBe(0);
  });

  it("mouse-drag ranges span the body and the pinned bands, and copy includes them", async () => {
    const clipboard = stubClipboard();
    try {
      const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
        instance.pinnedTop = [{ id: "t1", region: "TopRegion", country: "TopCountry", sales: 111 }];
      });
      const core = host.api!.getCore();

      // Drag from the pinned top row into body row 1 (country column, colIdx 1 — the region
      // column is left-pinned in this fixture and lives outside the center viewport).
      const bandCell = gridEl.querySelector<HTMLElement>(
        ".pte-pinned-rows-top .pte-pinned-row[data-view-idx='0'] .pte-cell[data-col-idx='1']",
      )!;
      const bodyCell = gridEl.querySelector<HTMLElement>(
        ".pte-body .pte-viewport .pte-row[data-view-idx='1'] .pte-cell[data-col-idx='1']",
      )!;
      bandCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      bodyCell.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      expect(core.getSelectionRange()).toMatchObject({
        rowStart: 0, rowEnd: 1, colStart: 1, colEnd: 1, pinnedTop: { start: 0, end: 0 },
      });
      // Both segments paint.
      expect(gridEl.querySelector(
        ".pte-pinned-rows-top .pte-cell[data-col-idx='1'].selected.selected-top",
      )).toBeTruthy();

      // Ctrl+C serializes pinned top rows first, then the body rows.
      const gridRoot = gridEl.querySelector<HTMLElement>(".pte-root")!;
      keydown(gridRoot, "c", { ctrlKey: true });
      expect(clipboard.written.length).toBe(1);
      const lines = clipboard.written[0].split("\n");
      expect(lines[0]).toBe("TopCountry");
      expect(lines.length).toBe(3); // pinned row + body rows 0..1
    } finally {
      clipboard.restore();
    }
  });

  it("Ctrl+A selects the entire grid including the pinned bands", async () => {
    const clipboard = stubClipboard();
    try {
      const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
        instance.pinnedTop = [{ id: "t1", region: "Top", country: "tc", sales: 1 }];
        instance.pinnedBottom = [{ id: "b1", region: "Bottom", country: "bc", sales: 2 }];
      });
      const core = host.api!.getCore();
      const gridRoot = gridEl.querySelector<HTMLElement>(".pte-root")!;

      keydown(gridRoot, "a", { ctrlKey: true });
      expect(core.getSelectionRange()).toMatchObject({
        rowStart: 0,
        rowEnd: 4,
        pinnedTop: { start: 0, end: 0 },
        pinnedBottom: { start: 0, end: 0 },
      });
      expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 2, rowPinned: "bottom" });
      // Both bands paint their segment.
      expect(gridEl.querySelector(".pte-pinned-rows-top .pte-cell.selected")).toBeTruthy();
      expect(gridEl.querySelector(".pte-pinned-rows-bottom .pte-cell.selected")).toBeTruthy();

      // Copy serializes the whole grid: pinned top, 5 body rows, pinned bottom.
      keydown(gridRoot, "c", { ctrlKey: true });
      expect(clipboard.written.length).toBe(1);
      const lines = clipboard.written[0].split("\n");
      expect(lines.length).toBe(7);
      expect(lines[0].startsWith("Top")).toBe(true);
      expect(lines[6].startsWith("Bottom")).toBe(true);
    } finally {
      clipboard.restore();
    }
  });

  it("edits pinned data rows when pinnedRowsEditable is enabled, with undo", async () => {
    const topRow = { id: "t1", region: "Original", country: "tc", sales: 1 };
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.pinnedTop = [topRow];
      instance.pinnedRowsEditable = true;
      instance.defaultColDef = { editable: true };
    });
    const core = host.api!.getCore();

    // Double-click the pinned cell: the editor mounts inside the band cell.
    const bandCell = gridEl.querySelector<HTMLElement>(
      ".pte-pinned-rows-top .pte-pinned-row[data-view-idx='0'] .pte-cell[data-col-idx='1']",
    )!;
    bandCell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    bandCell.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    bandCell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
    expect(core.getEditingCell()).toMatchObject({ rowId: "p:top:t1", rowPinned: "top" });
    const input = bandCell.querySelector<HTMLInputElement>("input")!;
    expect(input).toBeTruthy();

    // Commit a new value: it writes into the application-provided data object and repaints.
    input.value = "Changed";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(core.getEditingCell()).toBeNull();
    expect(topRow.country).toBe("Changed");
    expect(gridEl.querySelector(
      ".pte-pinned-rows-top .pte-pinned-row[data-view-idx='0'] .pte-cell[data-col-idx='1']",
    )!.textContent).toBe("Changed");

    // Undo restores the pinned row's value.
    core.dispatch({ type: "undo" });
    expect(topRow.country).toBe("tc");
  });

  it("keeps pinned rows read-only by default and never edits pinned group headers", async () => {
    const { host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.pinnedTop = [{ id: "t1", region: "Top", country: "tc", sales: 1 }];
      instance.defaultColDef = { editable: true };
    });
    const core = host.api!.getCore();

    // Without pinnedRowsEditable, editStart on a pinned cell is a no-op.
    core.dispatch({
      type: "editStart",
      cell: {
        rowId: "p:top:t1",
        colId: core.getColumnModel().getLeaves()[1].instanceID,
        rowPinned: "top",
      },
      source: "api",
    });
    expect(core.getEditingCell()).toBeNull();
  });

  it("never edits a pinned synthetic group header even with pinnedRowsEditable", async () => {
    const { host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.pinnedRowsEditable = true;
      instance.defaultColDef = { editable: true };
      instance.isRowPinned = ({ node }) =>
        node.isGroup && node.groupKey === "EMEA" ? "top" : null;
    });
    const core = host.api!.getCore();
    core.dispatch({ type: "rowGroupSet", colIds: ["region"] });
    const pinnedGroup = core.getDisplayedPinnedRow("top", 0)!;
    expect(pinnedGroup.isGroup).toBe(true);
    core.dispatch({
      type: "editStart",
      cell: {
        rowId: pinnedGroup.id,
        colId: core.getColumnModel().getLeaves()[1].instanceID,
        rowPinned: "top",
      },
      source: "api",
    });
    expect(core.getEditingCell()).toBeNull();
  });

  it("exports include pinned rows: Ctrl+A and cross-band ranges, body-only ranges exclude them", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.pinnedTop = [{ id: "t1", region: "TopR", country: "TopC", sales: 100 }];
      instance.pinnedBottom = [{ id: "b1", region: "BotR", country: "BotC", sales: 200 }];
    });
    const api = host.api!;
    const core = api.getCore();
    const gridRoot = gridEl.querySelector<HTMLElement>(".pte-root")!;

    // Full export (no selection): pinned top first, body, pinned bottom last.
    const all = api.getDataAsCsv({ includeHeaders: false }).split("\n");
    expect(all.length).toBe(7);
    expect(all[0].startsWith("TopR")).toBe(true);
    expect(all[6].startsWith("BotR")).toBe(true);

    // Ctrl+A → selection export spans the bands.
    keydown(gridRoot, "a", { ctrlKey: true });
    const selected = api.getDataAsCsv({ includeHeaders: false }).split("\n");
    expect(selected.length).toBe(7);
    expect(selected[0].startsWith("TopR")).toBe(true);
    expect(selected[6].startsWith("BotR")).toBe(true);

    // A body-only range excludes the bands.
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 0, mode: "start" });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 3, colIdx: 2, mode: "extend" });
    const bodyOnly = api.getDataAsCsv({ includeHeaders: false }).split("\n");
    expect(bodyOnly.length).toBe(3);
    expect(bodyOnly.some((line) => line.startsWith("TopR") || line.startsWith("BotR"))).toBe(false);

    // A range extended into the bottom band includes just that band segment.
    core.dispatch({ type: "rangeSelectSet", viewIdx: 4, colIdx: 0, mode: "start" });
    core.dispatch({
      type: "rangeSelectSet", viewIdx: 0, colIdx: 2, rowPinned: "bottom", mode: "extend",
    });
    const crossing = api.getDataAsCsv({ includeHeaders: false }).split("\n");
    expect(crossing.length).toBe(2);
    expect(crossing[1].startsWith("BotR")).toBe(true);
  });

  it("opens the context menu on the clicked pinned band cell, not the body top-left", async () => {
    const seenCtxs: BodyMenuContext[] = [];
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.cellSelection = true;
      instance.pinnedTop = [{ id: "target", region: "Target", country: "All", sales: 200 }];
      instance.pinnedBottom = [{ id: "total", region: "Total", country: "All", sales: 150 }];
      instance.bodyContextMenu = ({ ctx, items }) => {
        seenCtxs.push(ctx);
        return items;
      };
    });
    const core = host.api!.getCore();
    const topCell = gridEl.querySelector<HTMLElement>(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-cell",
    )!;

    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
    topCell.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(core.getActiveCell()).toEqual({ row: 0, colIdx: 1, rowPinned: "top" });
    expect(seenCtxs[0]?.rowPinned).toBe("top");
    expect(seenCtxs[0]?.rowId).toBe("p:top:target");
    expect(document.querySelector(".pte-menu")).not.toBeNull();
  });

  it("keeps a selection spanning the bottom band when right-clicking inside it", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.cellSelection = true;
      instance.pinnedBottom = [{ id: "total", region: "Total", country: "All", sales: 150 }];
    });
    const core = host.api!.getCore();
    core.dispatch({ type: "rangeSelectSet", viewIdx: 4, colIdx: 1, mode: "start" });
    core.dispatch({
      type: "rangeSelectSet", viewIdx: 0, colIdx: 1, rowPinned: "bottom", mode: "extend",
    });
    const before = core.getSelectionRange();
    expect(before?.pinnedBottom).toEqual({ start: 0, end: 0 });

    const bottomCell = gridEl.querySelector<HTMLElement>(
      ".pte-pinned-rows-bottom .pte-pinned-rows-center .pte-cell",
    )!;
    bottomCell.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }),
    );

    // The clicked band cell is inside the active selection, so focus must not collapse to it.
    expect(core.getSelectionRange()).toEqual(before);
  });

  it("draws a cross-band range as one continuous border box (no seam borders)", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.cellSelection = true;
      instance.pinnedTop = [{ id: "target", region: "Target", country: "All", sales: 200 }];
    });
    const core = host.api!.getCore();
    core.dispatch({
      type: "rangeSelectSet", viewIdx: 0, colIdx: 1, rowPinned: "top", mode: "start",
    });
    core.dispatch({ type: "rangeSelectSet", viewIdx: 1, colIdx: 1, mode: "extend" });

    const bandCell = gridEl.querySelector<HTMLElement>(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-row[data-view-idx='0'] .pte-cell[data-col-idx='1']",
    )!;
    const bodyFirst = gridEl.querySelector<HTMLElement>(
      ".pte-body .pte-row[data-view-idx='0'] .pte-cell[data-col-idx='1']",
    )!;
    const bodyLast = gridEl.querySelector<HTMLElement>(
      ".pte-body .pte-row[data-view-idx='1'] .pte-cell[data-col-idx='1']",
    )!;

    // Band segment: outer edge bordered, seam edge open.
    expect(bandCell.classList.contains("selected")).toBe(true);
    expect(bandCell.classList.contains("selected-top")).toBe(true);
    expect(bandCell.classList.contains("selected-bottom")).toBe(false);
    // Body part: seam edge open, outer edge bordered.
    expect(bodyFirst.classList.contains("selected")).toBe(true);
    expect(bodyFirst.classList.contains("selected-top")).toBe(false);
    expect(bodyLast.classList.contains("selected-bottom")).toBe(true);
  });

  it("paints column selection through the pinned bands and closes it on the bottom band", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.cellSelection = true;
      instance.pinnedTop = [{ id: "target", region: "Target", country: "All", sales: 200 }];
      instance.pinnedBottom = [{ id: "total", region: "Total", country: "All", sales: 150 }];
    });
    const core = host.api!.getCore();
    const countryCol = core.getColumnModel().getLeaves()[1];
    core.dispatch({ type: "columnSelectSet", colId: countryCol.instanceID, mode: "replace" });

    const topCell = gridEl.querySelector<HTMLElement>(
      ".pte-pinned-rows-top .pte-pinned-rows-center .pte-cell[data-col-idx='1']",
    )!;
    const bottomCell = gridEl.querySelector<HTMLElement>(
      ".pte-pinned-rows-bottom .pte-pinned-rows-center .pte-cell[data-col-idx='1']",
    )!;
    const bodyLast = gridEl.querySelector<HTMLElement>(
      `.pte-body .pte-row[data-view-idx='${ROWS.length - 1}'] .pte-cell[data-col-idx='1']`,
    )!;

    expect(topCell.classList.contains("selected")).toBe(true);
    expect(topCell.classList.contains("selected-left")).toBe(true);
    expect(topCell.classList.contains("selected-right")).toBe(true);
    expect(topCell.classList.contains("selected-bottom")).toBe(false);
    expect(bottomCell.classList.contains("selected")).toBe(true);
    // The column run closes at the grid's visual bottom — the bottom band, not the body.
    expect(bottomCell.classList.contains("selected-bottom")).toBe(true);
    expect(bodyLast.classList.contains("selected")).toBe(true);
    expect(bodyLast.classList.contains("selected-bottom")).toBe(false);
  });

  it("force-pins the ancestor chain above a pinned row and releases it as one unit", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.groupDefaultExpanded = -1;
      instance.pinnedBottom = [{ id: "T", region: "TOTAL", country: "", sales: 150 }];
    });
    const core = host.api!.getCore();
    core.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });

    const model = core.getRowModel();
    const groupNode = (key: string): IRowNode => {
      for (let index = 0; index < model.getViewCount(); index++) {
        const node = model.getRowNodeAtViewIndex(index);
        if (node?.isGroup && node.groupKey === key) return node;
      }
      throw new Error(`group '${key}' not found`);
    };
    const bandIds = (band: "top" | "bottom") => Array.from(
      gridEl.querySelectorAll<HTMLElement>(
        `.pte-pinned-rows-${band} .pte-pinned-rows-center .pte-pinned-row`,
      ),
    ).map((element) => element.dataset.rowId);

    // Pinning the mid-level UK group brings its EMEA parent along, above it.
    const emea = groupNode("EMEA");
    const uk = groupNode("UK");
    host.api!.setRowPinned(uk.id, "top");
    expect(bandIds("top")).toEqual([emea.id, uk.id]);

    // Unpinning the derived ancestor releases the whole chain (cascade to pinned descendants).
    host.api!.setRowPinned(emea.id, null);
    expect(bandIds("top")).toEqual([]);

    // A pinned leaf carries its full chain too; the chain stays above the app data rows.
    const france = groupNode("France");
    host.api!.setRowPinned("3", "bottom");
    expect(bandIds("bottom")).toEqual([emea.id, france.id, "3", "p:bottom:T"]);

    // Unpinning the leaf releases its derived ancestors; app data rows stay.
    host.api!.setRowPinned("3", null);
    expect(bandIds("bottom")).toEqual(["p:bottom:T"]);
  });

  it("supports callback-based group pinning and groupRows full-width display", async () => {
    const { gridEl, host } = await mountGridHost(PinnedRowsHost, 600, (instance) => {
      instance.groupDisplayType = "groupRows";
      instance.isRowPinned = ({ node }) =>
        node.isGroup && node.groupKey === "EMEA" ? "bottom" : null;
    });
    host.api!.dispatch({ type: "rowGroupSet", colIds: ["region"] });

    const pinnedGroup = gridEl.querySelector<HTMLElement>(
      ".pte-pinned-rows-bottom .pte-pinned-row.pte-full-width-row",
    )!;
    expect(pinnedGroup).toBeTruthy();
    expect(pinnedGroup.textContent).toContain("EMEA");
    expect(pinnedGroup.querySelector(".pte-full-width-cell")).toBeTruthy();
  });
});
