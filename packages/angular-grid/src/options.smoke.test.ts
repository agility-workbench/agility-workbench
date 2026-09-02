import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { GridOptions, IGridAPI, RowClassParams } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { dataCell, mountGridHost, syncGridInputs } from "./test-utils";

type Row = { id: number; name: string; status: string; amount: number };

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [pagination]="pagination"
      [paginationControls]="paginationControls"
      [pageSize]="25"
      [quickFilter]="quickFilter"
      [rowHover]="enabled"
      [columnHover]="enabled"
      [zebraRows]="enabled"
      [highlightActiveCell]="enabled"
      [getRowClass]="getRowClass"
      [getRowStyle]="getRowStyle"
      [cellSelection]="cellSelection"
      [rangeSelection]="enabled"
      [columnSelection]="enabled"
      [showColumnButtonsOnHover]="enabled"
      [bodyContextMenu]="bodyContextMenu"
      [asyncTransactionWaitMs]="asyncTransactionWaitMs"
      (gridReady)="api = $event"
    />
  `,
})
class OptionsHost {
  api: IGridAPI | null = null;
  enabled = true;
  pagination = false;
  paginationControls: GridOptions["paginationControls"] = undefined;
  cellSelection: boolean | "text" = true;
  bodyContextMenu = true;
  quickFilter: GridOptions["quickFilter"] = true;
  asyncTransactionWaitMs = 40;
  rows: Row[] = [
    { id: 1, name: "Acme", status: "ok", amount: 10 },
    { id: 2, name: "Globex", status: "error", amount: 30 },
    { id: 3, name: "Initech", status: "ok", amount: 20 },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    {
      colId: "amount",
      key: "amount",
      label: "Amount",
      cellClass: (params) => (Number(params.value) >= 30 ? "large-amount" : undefined),
      cellStyle: (params) =>
        Number(params.value) >= 30 ? ({ color: "rgb(255, 0, 0)" } as Partial<CSSStyleDeclaration>) : undefined,
    },
  ];
  getRowClass = (params: RowClassParams) =>
    (params.data as Row).status === "error" ? "row-error" : undefined;
  getRowStyle = (params: RowClassParams) =>
    params.rowIndex === 0 ? ({ fontWeight: "700" } as Partial<CSSStyleDeclaration>) : undefined;
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="[]"
      [columnDefs]="cols"
      [loading]="loading"
      loadingMessage="Fetching rows…"
      noRowsMessage="Nothing to see"
      pivotNoValuesMessage="Pick a measure to begin"
      (gridReady)="api = $event"
    />
  `,
})
class OverlayHost {
  api: IGridAPI | null = null;
  loading = true;
  cols: NgColDef[] = [{ colId: "id", key: "id", label: "ID" }];
}

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [rowSelection]="rowSelection"
      [isRowSelectable]="isRowSelectable"
      (gridReady)="api = $event"
    />
  `,
})
class LiveRowSelectionHost {
  api: IGridAPI | null = null;
  rowSelection: GridOptions["rowSelection"] = { mode: "multiple", checkboxes: true };
  isRowSelectable: GridOptions["isRowSelectable"] = undefined;
  rows = [
    { id: 1, name: "Acme" },
    { id: 2, name: "Globex" },
    { id: 3, name: "Initech" },
  ];
  cols: NgColDef[] = [{ colId: "name", key: "name", label: "Name" }];
}

function row(gridEl: HTMLElement, index: number): HTMLElement {
  return gridEl.querySelector<HTMLElement>(`.pte-row[data-view-idx='${index}']`)!;
}

describe("AwbGrid visual and runtime options", () => {
  it("updates the async transaction batch window without recreating the API", async () => {
    const { fixture, host } = await mountGridHost(OptionsHost);
    const api = host.api!;
    expect(api.getCore().getOptions().asyncTransactionWaitMs).toBe(40);

    host.asyncTransactionWaitMs = 5;
    await syncGridInputs(fixture);
    expect(host.api).toBe(api);
    expect(api.getCore().getOptions().asyncTransactionWaitMs).toBe(5);
  });

  it("updates row-selection options without recreating the API", async () => {
    const { fixture, gridEl, host } = await mountGridHost(LiveRowSelectionHost);
    const api = host.api!;
    api.selectRowsById(["1", "2"]);

    host.rowSelection = {
      mode: "single",
      checkboxes: true,
      checkboxColumnPinned: "right",
      checkboxColumnPinnable: false,
    };
    await syncGridInputs(fixture);

    expect(host.api).toBe(api);
    expect(api.getSelection().selectedRowIds).toEqual(["1"]);
    expect(gridEl.querySelector(".pte-select-all-checkbox")).toBeNull();
    expect(gridEl.querySelector(".pte-hcell-checkbox .pte-hcell-menu-menuBtn")).toBeNull();
    expect(api.getColumnModel().getRightLeaves()[0].isSelectionCheckboxColumn()).toBe(true);
  });

  it("applies and live-updates isRowSelectable without recreating the API", async () => {
    const { fixture, gridEl, host } = await mountGridHost(LiveRowSelectionHost);
    const api = host.api!;

    host.isRowSelectable = (node) => (node.data as { name: string }).name !== "Globex";
    await syncGridInputs(fixture);
    expect(host.api).toBe(api);
    expect(gridEl.querySelectorAll(".pte-checkbox-cell-disabled")).toHaveLength(1);

    api.selectAllRows();
    expect([...api.getSelection().selectedRowIds].sort()).toEqual(["1", "3"]);

    // Swapping the predicate prunes rows it now disables and repaints the checkbox cells.
    host.isRowSelectable = (node) => (node.data as { name: string }).name !== "Acme";
    await syncGridInputs(fixture);
    expect(api.getSelection().selectedRowIds).toEqual(["3"]);
    const disabled = gridEl.querySelectorAll<HTMLElement>(".pte-checkbox-cell-disabled");
    expect(disabled).toHaveLength(1);
    expect(disabled[0].getAttribute("aria-disabled")).toBe("true");
  });

  it("applies row and cell conditional styling", async () => {
    const { gridEl } = await mountGridHost(OptionsHost);

    expect(row(gridEl, 0).style.fontWeight).toBe("700");
    expect(row(gridEl, 0).classList.contains("row-error")).toBe(false);
    expect(row(gridEl, 1).classList.contains("row-error")).toBe(true);
    expect(dataCell(gridEl, 1, 1).classList.contains("large-amount")).toBe(true);
    expect(dataCell(gridEl, 1, 1).style.color).toBe("rgb(255, 0, 0)");
  });

  it("enables zebra rows, active-cell, row-hover, and column-hover visuals", async () => {
    const { gridEl, host } = await mountGridHost(OptionsHost);

    expect(row(gridEl, 0).classList.contains("pte-row-alt")).toBe(false);
    expect(row(gridEl, 1).classList.contains("pte-row-alt")).toBe(true);
    host.api!.selectRange(0, 0);
    host.api!.extendRangeTo(1, 0);
    expect(gridEl.querySelectorAll(".pte-active-cell")).toHaveLength(1);

    dataCell(gridEl, 0, 0).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(gridEl.querySelector(".pte-row-hover")).toBeTruthy();
    expect(gridEl.querySelectorAll(".pte-col-hover").length).toBeGreaterThan(1);
  });

  it("updates visual and selection options without recreating the API", async () => {
    const { fixture, gridEl, host } = await mountGridHost(OptionsHost);
    const api = host.api!;

    host.enabled = false;
    host.cellSelection = "text";
    host.bodyContextMenu = false;
    await syncGridInputs(fixture);

    expect(host.api).toBe(api);
    expect(gridEl.querySelector(".pte-row-alt")).toBeNull();
    expect(gridEl.querySelector(".pte-active-cell")).toBeNull();
    expect(gridEl.querySelector<HTMLElement>("[data-pte-grid-id]")!.classList).toContain("pte-text-selection");
    expect(api.getCore().getOptions()).toMatchObject({
      cellSelection: "text",
      rangeSelection: false,
      columnSelection: false,
      bodyContextMenu: false,
    });
  });

  it("toggles the pagination controls in place", async () => {
    const { fixture, gridEl, host } = await mountGridHost(OptionsHost);
    const footer = gridEl.querySelector(".pte-pagination-wrapper")!;
    expect(footer.classList.contains("visible")).toBe(false);

    host.pagination = true;
    await syncGridInputs(fixture);
    expect(footer.classList.contains("visible")).toBe(true);
    expect(gridEl.querySelector<HTMLSelectElement>(
      ".pte-pagination-select:not(.pte-aggregate-scope):not(.pte-pagination-page-select)",
    )?.value).toBe("25");
    expect(gridEl.querySelector(".pte-pagination-nav")).toBeTruthy();

    host.paginationControls = {
      pageSelection: "buttons",
      controls: ["previousPage", "pageSelector", "nextPage"],
      maxPageButtons: 3,
    };
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-pagination-page-select")).toBeNull();
    expect(gridEl.querySelectorAll(".pte-pagination-page-btn")).toHaveLength(1);
    expect(gridEl.querySelector(".pte-pagination-size-control")).toBeNull();

    host.pagination = false;
    await syncGridInputs(fixture);
    expect(footer.classList.contains("visible")).toBe(false);
    expect(gridEl.querySelector(".pte-pagination-nav")).toBeNull();
  });

  it("mounts, opens, and filters through the quick-filter widget", async () => {
    const { gridEl, host } = await mountGridHost(OptionsHost);
    const widget = gridEl.querySelector<HTMLElement>(".pte-quick-filter")!;
    expect(widget.classList.contains("pte-quick-filter-open")).toBe(false);

    const rootEl = gridEl.querySelector<HTMLElement>(".pte-root")!;
    rootEl.focus();
    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    rootEl.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(widget.classList.contains("pte-quick-filter-open")).toBe(true);

    host.api!.getCore().dispatch({ type: "quickFilterSet", text: "globex" });
    expect(host.api!.getCore().getRowModel().getViewCount()).toBe(1);
    expect(host.api!.getCore().getRowIdAtViewIndex(0)).toBe("2");
  });

  it("rebuilds the quick-filter widget when its config changes, preserving the grid API", async () => {
    const { fixture, gridEl, host } = await mountGridHost(OptionsHost);
    const api = host.api!;

    host.quickFilter = { mode: "always" };
    await syncGridInputs(fixture);

    expect(host.api).toBe(api);
    expect(gridEl.querySelector<HTMLElement>(".pte-quick-filter")!.classList).toContain(
      "pte-quick-filter-open",
    );
  });

  it("uses custom loading and no-rows overlay messages", async () => {
    const { fixture, gridEl, host } = await mountGridHost(OverlayHost);
    expect(gridEl.querySelector(".pte-loading-label")?.textContent).toBe("Fetching rows…");

    host.loading = false;
    await syncGridInputs(fixture);
    expect(gridEl.querySelector(".pte-norows-label")?.textContent).toBe("Nothing to see");
    // The pivot no-values hint is copy too, and it is set whether or not pivot mode is on.
    expect(gridEl.querySelector(".pte-header-pivot-hint")?.textContent)
      .toBe("Pick a measure to begin");
  });
});
