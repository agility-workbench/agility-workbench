import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type {
  GridEventSelectionChangedParams,
  GridOptions,
  IGridAPI,
  RowClassParams,
} from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { dataCell, mountGridHost, syncGridInputs } from "./test-utils";

type Row = { id: string; name: string };

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [zebraRows]="zebraRows"
      [highlightActiveCell]="highlightActiveCell"
      [columnHover]="columnHover"
      [rowHover]="rowHover"
      (gridReady)="api = $event"
    />
  `,
})
class VisualHost {
  api: IGridAPI | null = null;
  zebraRows: boolean | undefined;
  highlightActiveCell: boolean | undefined;
  columnHover: boolean | undefined;
  rowHover: boolean | undefined;
  rows: Row[] = [
    { id: "1", name: "AAA" },
    { id: "2", name: "BBB" },
    { id: "3", name: "CCC" },
    { id: "4", name: "DDD" },
  ];
  cols: NgColDef[] = [
    { colId: "id", key: "id", label: "ID" },
    { colId: "name", key: "name", label: "Name" },
  ];
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
      [rowHover]="enabled"
      [columnHover]="enabled"
      [zebraRows]="enabled"
      [highlightActiveCell]="enabled"
      [getRowStyle]="getRowStyle"
      [cellSelection]="cellSelection"
      [rangeSelection]="enabled"
      [columnSelection]="enabled"
      [showColumnButtonsOnHover]="enabled"
      (gridReady)="api = $event"
      (selectionChanged)="onSelectionChanged($event)"
    />
  `,
})
class ReconfigureHost {
  api: IGridAPI | null = null;
  enabled = false;
  cellSelection: boolean | "text" = true;
  getRowStyle: GridOptions["getRowStyle"];
  onSelectionChanged: (event: GridEventSelectionChangedParams) => void = () => {};
  rows: Row[] = [
    { id: "1", name: "AAA" },
    { id: "2", name: "BBB" },
  ];
  cols: NgColDef[] = [
    { colId: "id", key: "id", label: "ID" },
    { colId: "name", key: "name", label: "Name" },
  ];
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
      [getRowClass]="getRowClass"
      (gridReady)="api = $event"
    />
  `,
})
class StylingHost {
  api: IGridAPI | null = null;
  rows = [
    { id: "1", name: "AAA", status: "ok" },
    { id: "2", name: "BBB", status: "error" },
    { id: "3", name: "CCC", status: "ok" },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name" },
    { colId: "status", key: "status", label: "Status" },
  ];
  getRowClass = (params: RowClassParams) =>
    (params.data as { status: string }).status === "error" ? "row-error" : undefined;
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
      [showColumnButtonsOnHover]="showColumnButtonsOnHover"
      (gridReady)="api = $event"
    />
  `,
})
class MenuFlagsHost {
  api: IGridAPI | null = null;
  showColumnButtonsOnHover: boolean | undefined;
  rows: Row[] = [
    { id: "1", name: "AAA" },
    { id: "2", name: "BBB" },
  ];
  cols: NgColDef[] = [
    { colId: "id", key: "id", label: "ID" },
    { colId: "name", key: "name", label: "Name" },
  ];
}

function row(gridEl: HTMLElement, index: number): HTMLElement {
  return gridEl.querySelector<HTMLElement>(`.pte-row[data-view-idx='${index}']`)!;
}

function mouseOver(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}

describe("zebraRows", () => {
  it("stripes odd view-index rows only when enabled", async () => {
    const { gridEl } = await mountGridHost(VisualHost, 600, (host) => {
      host.zebraRows = true;
    });
    expect(row(gridEl, 0).classList.contains("pte-row-alt")).toBe(false);
    expect(row(gridEl, 1).classList.contains("pte-row-alt")).toBe(true);
    expect(row(gridEl, 2).classList.contains("pte-row-alt")).toBe(false);
  });

  it("adds no stripe class when disabled (default)", async () => {
    const { gridEl } = await mountGridHost(VisualHost);
    expect(gridEl.querySelector(".pte-row-alt")).toBeNull();
  });
});

describe("highlightActiveCell", () => {
  it("marks only the active cell within a range when enabled", async () => {
    const { gridEl, host } = await mountGridHost(VisualHost, 600, (instance) => {
      instance.highlightActiveCell = true;
    });
    host.api!.selectRange(0, 0);
    host.api!.extendRangeTo(1, 0);
    expect(gridEl.querySelectorAll(".pte-active-cell")).toHaveLength(1);
  });

  it("adds no active-cell class when disabled (default)", async () => {
    const { gridEl, host } = await mountGridHost(VisualHost);
    host.api!.selectRange(0, 0);
    host.api!.extendRangeTo(1, 0);
    expect(gridEl.querySelector(".pte-active-cell")).toBeNull();
  });
});

describe("columnHover", () => {
  it("highlights every cell in the hovered column when enabled", async () => {
    const { gridEl } = await mountGridHost(VisualHost, 600, (instance) => {
      instance.columnHover = true;
    });
    const cell = dataCell(gridEl, 0, 0);
    const colIdx = cell.dataset.colIdx!;
    mouseOver(cell);

    const highlighted = gridEl.querySelectorAll(
      `.pte-cell.pte-col-hover[data-col-idx="${colIdx}"]`,
    );
    expect(highlighted.length).toBeGreaterThan(1);
    const stray = Array.from(gridEl.querySelectorAll<HTMLElement>(".pte-col-hover"))
      .filter((highlightedCell) => highlightedCell.dataset.colIdx !== colIdx);
    expect(stray).toHaveLength(0);
  });

  it("does not highlight columns when disabled (default)", async () => {
    const { gridEl } = await mountGridHost(VisualHost);
    mouseOver(dataCell(gridEl, 0, 0));
    expect(gridEl.querySelector(".pte-col-hover")).toBeNull();
  });
});

describe("rowHover toggle", () => {
  it("highlights the hovered row by default", async () => {
    const { gridEl } = await mountGridHost(VisualHost);
    mouseOver(dataCell(gridEl, 0, 0));
    expect(gridEl.querySelector(".pte-row-hover")).not.toBeNull();
  });

  it("does not highlight the hovered row when rowHover is false", async () => {
    const { gridEl } = await mountGridHost(VisualHost, 600, (instance) => {
      instance.rowHover = false;
    });
    mouseOver(dataCell(gridEl, 0, 0));
    expect(gridEl.querySelector(".pte-row-hover")).toBeNull();
  });
});

describe("visual and interaction options update live", () => {
  it("reconfigures the existing grid instance and preserves a still-valid range", async () => {
    const { fixture, gridEl, host } = await mountGridHost(ReconfigureHost);
    const originalApi = host.api!;
    originalApi.selectRange(0, 0);
    originalApi.extendRangeTo(1, 0);

    host.enabled = true;
    host.getRowStyle = () => ({ opacity: "0.5" } as Partial<CSSStyleDeclaration>);
    await syncGridInputs(fixture);

    const core = originalApi.getCore();
    expect(host.api).toBe(originalApi);
    expect(core.getSelectionRange()).not.toBeNull();
    expect(gridEl.querySelector(".pte-active-cell")).not.toBeNull();
    expect(gridEl.querySelector(".pte-row-alt")).not.toBeNull();
    expect(row(gridEl, 0).style.opacity).toBe("0.5");
    const rootEl = gridEl.querySelector<HTMLElement>("[data-pte-grid-id]")!;
    expect(rootEl.classList.contains("pte-column-buttons-on-hover")).toBe(true);
    expect(core.getOptions()).toMatchObject({
      rangeSelection: true,
      columnSelection: true,
    });

    mouseOver(dataCell(gridEl, 0, 0));
    expect(gridEl.querySelector(".pte-row-hover")).not.toBeNull();
    expect(gridEl.querySelector(".pte-col-hover")).not.toBeNull();

    host.enabled = false;
    host.getRowStyle = undefined;
    await syncGridInputs(fixture);
    expect(core.getSelectionRange()).not.toBeNull();
    expect(gridEl.querySelector(".pte-active-cell")).toBeNull();
    expect(gridEl.querySelector(".pte-row-alt")).toBeNull();
    expect(gridEl.querySelector(".pte-row-hover")).toBeNull();
    expect(gridEl.querySelector(".pte-col-hover")).toBeNull();
    expect(row(gridEl, 0).style.opacity).toBe("");
    expect(rootEl.classList.contains("pte-column-buttons-on-hover")).toBe(false);

    host.cellSelection = "text";
    await syncGridInputs(fixture);
    expect(host.api).toBe(originalApi);
    expect(core.getSelectionRange()).toBeNull();
    expect(rootEl.classList.contains("pte-text-selection")).toBe(true);
  });

  it("routes outputs to the latest handler after a live reconfigure without replacing the grid", async () => {
    const { fixture, host } = await mountGridHost(ReconfigureHost);
    const originalApi = host.api!;
    const calls: string[] = [];
    host.onSelectionChanged = () => calls.push("first");

    host.onSelectionChanged = () => calls.push("latest");
    host.enabled = true;
    await syncGridInputs(fixture);

    originalApi.selectRange(0, 0);
    expect(host.api).toBe(originalApi);
    expect(calls).toEqual(["latest"]);
  });
});

describe("getRowClass recycle safety", () => {
  it("clears a stale row class when the underlying data stops matching", async () => {
    const { gridEl, host } = await mountGridHost(StylingHost);
    expect(row(gridEl, 1).classList.contains("row-error")).toBe(true);

    host.api!.applyTransaction({
      update: [{ rowId: "2", row: { id: "2", name: "BBB", status: "ok" } }],
    });
    expect(row(gridEl, 1).classList.contains("row-error")).toBe(false);
  });
});

describe("showColumnButtonsOnHover", () => {
  it("adds the root class only when enabled", async () => {
    const { fixture, gridEl, host } = await mountGridHost(MenuFlagsHost);
    const rootEl = gridEl.querySelector<HTMLElement>("[data-pte-grid-id]")!;
    expect(rootEl.classList.contains("pte-column-buttons-on-hover")).toBe(false);

    host.showColumnButtonsOnHover = true;
    await syncGridInputs(fixture);
    expect(rootEl.classList.contains("pte-column-buttons-on-hover")).toBe(true);
  });
});
