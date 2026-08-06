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
      (gridReady)="api = $event"
    />
  `,
})
class QuickFilterAdvancedHost {
  api: IGridAPI | null = null;
  quickFilter: GridOptions["quickFilter"] = true;
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
const clearBtn = (gridEl: HTMLElement) =>
  gridEl.querySelector<HTMLButtonElement>(".pte-quick-filter-clear")!;
const closeBtn = (gridEl: HTMLElement) =>
  gridEl.querySelector<HTMLButtonElement>(".pte-quick-filter-close");
const optionsBtn = (gridEl: HTMLElement) =>
  gridEl.querySelector<HTMLButtonElement>(".pte-quick-filter-options")!;
const pill = (gridEl: HTMLElement) =>
  gridEl.querySelector<HTMLButtonElement>(".pte-quick-filter-pill");
const keepCheckbox = (gridEl: HTMLElement) =>
  gridEl.querySelector<HTMLInputElement>(".pte-quick-filter-keep-checkbox");
const rootEl = (gridEl: HTMLElement) => gridEl.querySelector<HTMLElement>(".pte-root")!;

async function tick(ms = 0): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function setSearch(gridEl: HTMLElement, text: string): Promise<void> {
  input(gridEl).value = text;
  input(gridEl).dispatchEvent(new Event("input", { bubbles: true }));
  await tick(5);
}

function openWidget(gridEl: HTMLElement): KeyboardEvent {
  const root = rootEl(gridEl);
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

describe("AwbGrid quick filter (advanced)", () => {
  it("does NOT capture Ctrl+F when focus is outside the grid (browser find left alone)", async () => {
    const { gridEl } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { debounceMs: 0 };
    });

    // Ctrl+F dispatched at the document (focus never entered the grid) doesn't reach the grid's
    // root-bound handler. The widget stays closed and the event isn't prevented, so the browser's
    // native find is free to run.
    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(widget(gridEl)?.classList).not.toContain("pte-quick-filter-open");
    expect(event.defaultPrevented).toBe(false);
  });

  it("typing in the search box does NOT leak to the grid (no edit-on-type / navigation)", async () => {
    const { gridEl, host } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { debounceMs: 0 };
    });
    const core = host.api!.getCore();

    // Select an editable cell so edit-on-type would fire if a printable key reached the grid.
    host.api!.setFocusedCell(0, 0);

    openWidget(gridEl);
    expect(widget(gridEl)?.classList).toContain("pte-quick-filter-open");

    // A printable keydown originating from the search input. The input's keydown handler stops
    // propagation, so the grid's root-level handler never sees it — no cell editor opens.
    input(gridEl).dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
    expect(core.getEditingCell()).toBeNull();
  });

  it("hides the clear button until there is text, and shows it once there is", async () => {
    const { gridEl } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", debounceMs: 0 };
    });

    // No text yet → clear button hidden.
    expect(clearBtn(gridEl).hidden).toBe(true);

    await setSearch(gridEl, "acme");
    expect(clearBtn(gridEl).hidden).toBe(false);

    // Clicking clear empties the input and hides the button again.
    clearBtn(gridEl).click();
    expect(input(gridEl).value).toBe("");
    expect(clearBtn(gridEl).hidden).toBe(true);
  });

  it("closes and clears the search via the close button (onDemand mode)", async () => {
    const { gridEl, host } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { debounceMs: 0 };
    });
    const core = host.api!.getCore();

    openWidget(gridEl);
    await setSearch(gridEl, "globex");
    expect(core.getRowModel().getViewCount()).toBe(1);

    expect(closeBtn(gridEl)).toBeTruthy();
    closeBtn(gridEl)!.click();

    // Widget hidden and the search cleared (dismissing doesn't leave a silent filter behind).
    expect(widget(gridEl)?.classList).not.toContain("pte-quick-filter-open");
    expect(core.getQuickFilterText()).toBe("");
    expect(core.getRowModel().getViewCount()).toBe(3);
    expect(document.activeElement).toBe(rootEl(gridEl));
  });

  it("returns focus to the grid when Escape closes the search", async () => {
    const { gridEl } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { debounceMs: 0 };
    });
    openWidget(gridEl);

    input(gridEl).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(widget(gridEl)?.classList).not.toContain("pte-quick-filter-open");
    expect(document.activeElement).toBe(rootEl(gridEl));
  });

  it("respects 'always' mode: widget open on mount and no close button", async () => {
    const { gridEl } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", debounceMs: 0 };
    });
    expect(widget(gridEl)?.classList).toContain("pte-quick-filter-open");
    expect(closeBtn(gridEl)).toBeNull();
  });

  it("anchors to the left edge when configured, releasing the right edge to auto", async () => {
    const { gridEl } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", position: { anchor: "left", offsetX: 16 } };
    });
    const w = widget(gridEl)!;
    expect(w.style.left).toBe("16px");
    // The opposite edge must be an explicit `auto`, not "" — clearing it would fall back to the
    // base stylesheet `right` rule, pinning both edges and stretching the panel to full width.
    expect(w.style.right).toBe("auto");
  });

  it("anchors right by default, releasing the left edge to auto", async () => {
    const { gridEl } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { mode: "always" };
    });
    // happy-dom drops `calc(var(...))` on assignment, so we can't read the `right` value back
    // here; the observable, env-robust signal for the right anchor is that `left` is auto.
    expect(widget(gridEl)!.style.left).toBe("auto");
  });

  it("offsets the top below the header by offsetTop", async () => {
    const { gridEl } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", position: { offsetTop: 20 } };
    });
    // top = headerHeight + offsetTop; header height is >= 0 in happy-dom (often 0), so assert
    // the offset is included by checking it is at least offsetTop px.
    const top = parseInt(widget(gridEl)!.style.top, 10);
    expect(Number.isNaN(top)).toBe(false);
    expect(top).toBeGreaterThanOrEqual(20);
  });

  it("keep-on-close checkbox makes the filter persist and drives the pill", async () => {
    const { gridEl, host } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { debounceMs: 0, showLayoutOptions: true };
    });
    const core = host.api!.getCore();

    openWidget(gridEl);
    // Enable "keep filter when closed".
    optionsBtn(gridEl).click();
    expect(keepCheckbox(gridEl)!.checked).toBe(false); // clearOnClose default true → unchecked
    keepCheckbox(gridEl)!.checked = true;
    keepCheckbox(gridEl)!.dispatchEvent(new Event("change", { bubbles: true }));

    await setSearch(gridEl, "globex");
    closeBtn(gridEl)!.click();

    // Filter persists and the pill stands in.
    expect(core.getQuickFilterText()).toBe("globex");
    expect(core.getRowModel().getViewCount()).toBe(1);
    expect(pill(gridEl)!.hidden).toBe(false);
  });

  it("does not steal focus when a live reconfigure replaces an unfocused widget", async () => {
    const { fixture, gridEl, host } = await mountGridHost(QuickFilterAdvancedHost, 600, (instance) => {
      instance.quickFilter = { mode: "always", debounceMs: 0 };
    });
    const root = rootEl(gridEl);
    root.focus();

    host.quickFilter = { mode: "always", debounceMs: 0, position: { offsetX: 16 } };
    await syncGridInputs(fixture);

    expect(document.activeElement).toBe(root);
  });
});
