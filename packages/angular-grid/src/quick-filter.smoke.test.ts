import { Component } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { GridOptions, IGridAPI } from "@agility-workbench/grid";
import { AwbGrid } from "./grid.component";
import type { NgColDef } from "./interface";
import { mountGridHost, syncGridInputs } from "./test-utils";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <awb-grid
      style="height: 600px"
      [rowData]="rows"
      [columnDefs]="cols"
      rowIdKey="id"
      [quickFilter]="quickFilter"
      [toolbar]="toolbar"
      (gridReady)="api = $event"
    />
  `,
})
class QuickFilterHost {
  api: IGridAPI | null = null;
  quickFilter: GridOptions["quickFilter"] = true;
  toolbar: GridOptions["toolbar"] = undefined;
  rows = [
    { id: "1", name: "Acme Corp", region: "West" },
    { id: "2", name: "Acme Labs", region: "East" },
    { id: "3", name: "Globex", region: "West" },
  ];
  cols: NgColDef[] = [
    { colId: "name", key: "name", label: "Name", editable: true },
    { colId: "region", key: "region", label: "Region", editable: true },
  ];
}

const widget = (gridEl: HTMLElement) => gridEl.querySelector<HTMLElement>(".pte-quick-filter");
const input = (gridEl: HTMLElement) =>
  gridEl.querySelector<HTMLInputElement>(".pte-quick-filter-input")!;

async function tick(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function setSearch(gridEl: HTMLElement, text: string): Promise<void> {
  input(gridEl).value = text;
  input(gridEl).dispatchEvent(new Event("input", { bubbles: true }));
  await tick(5);
}

function openWidget(gridEl: HTMLElement): KeyboardEvent {
  const root = gridEl.querySelector<HTMLElement>(".pte-root")!;
  root.focus();
  const event = new KeyboardEvent("keydown", {
    key: "f",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  root.dispatchEvent(event);
  return event;
}

describe("AwbGrid quick filter", () => {
  it("opens on Ctrl+F and filters as the user types", async () => {
    const { gridEl, host } = await mountGridHost(QuickFilterHost, 600, (instance) => {
      instance.quickFilter = { debounceMs: 0 };
    });
    expect(widget(gridEl)?.classList).not.toContain("pte-quick-filter-open");
    expect(openWidget(gridEl).defaultPrevented).toBe(true);
    expect(widget(gridEl)?.classList).toContain("pte-quick-filter-open");

    await setSearch(gridEl, "globex");
    expect(host.api!.getCore().getQuickFilterText()).toBe("globex");
    expect(host.api!.getCore().getRowModel().getViewCount()).toBe(1);
    expect(host.api!.getCore().getRowIdAtViewIndex(0)).toBe("3");
  });

  it("shows the no-rows overlay for no matches and clears it from the UI", async () => {
    const { gridEl, host } = await mountGridHost(QuickFilterHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", debounceMs: 0 };
    });
    await setSearch(gridEl, "not-present");
    expect(gridEl.querySelector(".pte-norows-overlay")?.classList).not.toContain("hidden");

    gridEl.querySelector<HTMLButtonElement>(".pte-quick-filter-clear")!.click();
    expect(host.api!.getCore().getQuickFilterText()).toBe("");
    expect(host.api!.getCore().getRowModel().getViewCount()).toBe(3);
    expect(gridEl.querySelector(".pte-norows-overlay")?.classList).toContain("hidden");
  });

  it("applies match-case changes from the inline options panel", async () => {
    const { gridEl, host } = await mountGridHost(QuickFilterHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", debounceMs: 0 };
    });
    gridEl.querySelector<HTMLButtonElement>(".pte-quick-filter-options")!.click();
    const caseSensitive = gridEl.querySelector<HTMLInputElement>(
      ".pte-quick-filter-options-panel input[type='checkbox']",
    )!;
    caseSensitive.checked = true;
    caseSensitive.dispatchEvent(new Event("change", { bubbles: true }));

    await setSearch(gridEl, "acme");
    expect(host.api!.getCore().getRowModel().getViewCount()).toBe(0);
    await setSearch(gridEl, "Acme");
    expect(host.api!.getCore().getRowModel().getViewCount()).toBe(2);
  });

  it("keeps a closed filter visible as an indicator when clearOnClose is false", async () => {
    const { gridEl, host } = await mountGridHost(QuickFilterHost, 600, (instance) => {
      instance.quickFilter = { debounceMs: 0, clearOnClose: false };
    });
    openWidget(gridEl);
    await setSearch(gridEl, "globex");
    gridEl.querySelector<HTMLButtonElement>(".pte-quick-filter-close")!.click();

    expect(host.api!.getCore().getQuickFilterText()).toBe("globex");
    expect(widget(gridEl)?.classList).not.toContain("pte-quick-filter-open");
    const pill = gridEl.querySelector<HTMLButtonElement>(".pte-quick-filter-pill")!;
    expect(pill.hidden).toBe(false);
    expect(pill.textContent).toContain("globex");
    pill.click();
    expect(widget(gridEl)?.classList).toContain("pte-quick-filter-open");
  });

  it("renders layout controls and re-anchors from their selection", async () => {
    const { gridEl } = await mountGridHost(QuickFilterHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", showLayoutOptions: true };
    });
    expect(widget(gridEl)?.style.left).toBe("auto");
    gridEl.querySelector<HTMLButtonElement>(".pte-quick-filter-options")!.click();
    const anchor = gridEl.querySelector<HTMLSelectElement>(".pte-quick-filter-anchor-select")!;
    anchor.value = "left";
    anchor.dispatchEvent(new Event("change", { bubbles: true }));
    expect(widget(gridEl)?.style.left).toBe("8px");
    expect(widget(gridEl)?.style.right).toBe("auto");
  });

  it("reconfigures live while preserving search text, focus, and the grid API", async () => {
    const { fixture, gridEl, host } = await mountGridHost(QuickFilterHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", debounceMs: 0 };
    });
    const api = host.api!;
    await setSearch(gridEl, "globex");
    const previousInput = input(gridEl);
    previousInput.focus();

    host.quickFilter = {
      mode: "always",
      debounceMs: 0,
      position: { anchor: "left", offsetX: 16 },
    };
    await syncGridInputs(fixture);

    expect(host.api).toBe(api);
    expect(input(gridEl)).not.toBe(previousInput);
    expect(input(gridEl).value).toBe("globex");
    expect(document.activeElement).toBe(input(gridEl));
    expect(widget(gridEl)?.style.left).toBe("16px");
    expect(api.getCore().getRowModel().getViewCount()).toBe(1);
  });

  it("enables and disables the widget live without recreating the grid", async () => {
    const { fixture, gridEl, host } = await mountGridHost(QuickFilterHost, 600, (instance) => {
      instance.quickFilter = false;
    });
    const api = host.api!;
    expect(widget(gridEl)).toBeNull();

    host.quickFilter = { mode: "always", debounceMs: 0 };
    await syncGridInputs(fixture);
    expect(widget(gridEl)).toBeTruthy();
    await setSearch(gridEl, "globex");

    host.quickFilter = false;
    await syncGridInputs(fixture);
    expect(host.api).toBe(api);
    expect(widget(gridEl)).toBeNull();
    expect(api.getCore().getQuickFilterText()).toBe("");
    expect(api.getCore().getRowModel().getViewCount()).toBe(3);
  });

  it("moves the single quick-filter instance into and out of the toolbar", async () => {
    const { fixture, gridEl, host } = await mountGridHost(QuickFilterHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", debounceMs: 0 };
      instance.toolbar = { quickFilter: true };
    });
    await setSearch(gridEl, "acme");
    expect(gridEl.querySelectorAll(".pte-quick-filter")).toHaveLength(1);
    expect(gridEl.querySelector(".pte-grid-toolbar .pte-quick-filter-input")).toBeTruthy();

    host.toolbar = {};
    await syncGridInputs(fixture);
    expect(gridEl.querySelectorAll(".pte-quick-filter")).toHaveLength(1);
    expect(gridEl.querySelector(".pte-grid-toolbar .pte-quick-filter-input")).toBeNull();
    expect(input(gridEl).value).toBe("acme");
    expect(host.api!.getCore().getQuickFilterText()).toBe("acme");
  });
});
