// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { unmountTestRoot } from "./testUtils";
import { Grid } from "./grid";
import type { GridToolbarOptions, IGridAPI, ReactColDef } from "./index";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const columnDefs: ReactColDef[] = [
  { colId: "name", key: "name", label: "Name" },
  { colId: "region", key: "region", label: "Region" },
];

async function mount() {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 500, configurable: true });
  document.body.appendChild(container);
  const root = createRoot(container);
  const apiRef = React.createRef<IGridAPI | null>();

  const render = async (
    toolbar?: GridToolbarOptions,
    columnPanel: React.ComponentProps<typeof Grid>["columnPanel"] = false,
    quickFilter: React.ComponentProps<typeof Grid>["quickFilter"] = false,
    savedViews: React.ComponentProps<typeof Grid>["savedViews"] = undefined,
  ) => {
    await act(async () => {
      root.render(
        <Grid
          apiRef={apiRef}
          rowIdKey="id"
          rowData={[{ id: "1", name: "Acme", region: "West" }]}
          columnDefs={columnDefs}
          toolbar={toolbar}
          columnPanel={columnPanel}
          quickFilter={quickFilter}
          savedViews={savedViews}
        />,
      );
    });
  };

  await render();
  return { container, root, api: apiRef.current!, render };
}

describe("toolbar options", () => {
  it("opts every section out by default and updates section combinations without remounting", async () => {
    const { container, root, api, render } = await mount();
    const core = api.getCore();
    expect(container.querySelector(".pte-grid-toolbar")).toBeNull();

    await render({ grouping: true });
    expect(container.querySelector(".pte-grid-toolbar-group-section")).not.toBeNull();
    expect(container.querySelector(".pte-grid-toolbar-sort-section")).toBeNull();
    expect(container.querySelector(".pte-grid-toolbar-export-button")).toBeNull();
    expect(api.getCore()).toBe(core);

    const region = api.getColumnModel().getByColId("region")!;
    await act(async () => {
      core.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });
    });
    expect(container.querySelector(".pte-grid-toolbar-group-chip-label")?.textContent).toBe("Region");

    await render({ sorting: true, export: true });
    expect(container.querySelector(".pte-grid-toolbar-group-section")).toBeNull();
    expect(container.querySelector(".pte-grid-toolbar-sort-section")).not.toBeNull();
    expect(container.querySelector(".pte-grid-toolbar-export-button")).not.toBeNull();
    expect(core.getRowGroupColumns().map(col => col.instanceID)).toEqual([region.instanceID]);
    expect(api.getCore()).toBe(core);

    await render({ grouping: true });
    expect(container.querySelector(".pte-grid-toolbar-group-chip-label")?.textContent).toBe("Region");

    await render({});
    expect(container.querySelector(".pte-grid-toolbar")).toBeNull();
    expect(api.getCore()).toBe(core);

    await unmountTestRoot(root);
  });

  it("keeps toolbar visibility derived from sections and the Columns trigger", async () => {
    const { container, root, api, render } = await mount();
    const core = api.getCore();

    await render(undefined, { trigger: "toolbar" });
    expect(container.querySelector(".pte-grid-toolbar")).not.toBeNull();
    expect(container.querySelector(".pte-column-panel-trigger-toolbar-button")).not.toBeNull();
    expect(container.querySelector(".pte-grid-toolbar-export-button")).toBeNull();

    await render({ export: true }, { trigger: "toolbar" });
    expect(container.querySelector(".pte-grid-toolbar-export-button")).not.toBeNull();
    expect(container.querySelector(".pte-column-panel-trigger-toolbar-button")).not.toBeNull();

    await render({ export: true }, false);
    expect(container.querySelector(".pte-grid-toolbar")).not.toBeNull();
    expect(container.querySelector(".pte-column-panel-trigger-toolbar-button")).toBeNull();

    await render(undefined, false);
    expect(container.querySelector(".pte-grid-toolbar")).toBeNull();
    expect(api.getCore()).toBe(core);

    await unmountTestRoot(root);
  });

  it("hosts the existing quick filter once, preserves its state across live placement changes, and focuses it", async () => {
    const { container, root, api, render } = await mount();
    const core = api.getCore();

    await render(
      { quickFilter: true, export: true },
      { trigger: "toolbar" },
      { debounceMs: 10_000, showOptions: true, showLayoutOptions: true },
    );

    const toolbar = container.querySelector(".pte-grid-toolbar")!;
    const toolbarFilter = toolbar.querySelector<HTMLInputElement>(".pte-quick-filter-input");
    expect(toolbarFilter).not.toBeNull();
    expect(container.querySelectorAll(".pte-quick-filter")).toHaveLength(1);
    expect(toolbar.querySelector(".pte-quick-filter-anchor-select")).toBeNull();

    // The bar's overflow button is always mounted, and always last: what it holds is decided by a
    // fit pass, and a pass measures the bar the button is already part of.
    const rightChildren = Array.from(toolbar.querySelector(".pte-grid-toolbar-right")!.children);
    expect(rightChildren.map(child => child.className)).toEqual([
      // The quick filter is also the bar's elastic control — it takes whatever width the fit pass
      // leaves over, so the bar has no hole in it.
      "pte-grid-toolbar-quick-filter pte-bar-elastic",
      "pte-grid-toolbar-export-button",
      expect.stringContaining("pte-column-panel-trigger-toolbar-button"),
      "pte-grid-toolbar-more-button",
    ]);

    toolbarFilter!.value = "acme";
    await act(async () => {
      toolbarFilter!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(core.getQuickFilterText()).toBe("");

    toolbarFilter!.blur();
    await act(async () => {
      container.querySelector<HTMLElement>(".pte-root")!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(toolbarFilter);

    await act(async () => {
      toolbarFilter!.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }));
    });
    expect(document.activeElement).toBe(container.querySelector(".pte-root"));

    container.querySelector<HTMLElement>(".pte-root")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(toolbarFilter);

    await render({}, false, { debounceMs: 10_000, showOptions: true });
    const floatingFilter = container.querySelector<HTMLInputElement>(".pte-quick-filter-input");
    expect(floatingFilter).not.toBeNull();
    expect(floatingFilter).not.toBe(toolbarFilter);
    expect(floatingFilter!.value).toBe("acme");
    expect(core.getQuickFilterText()).toBe("acme");
    expect(container.querySelectorAll(".pte-quick-filter")).toHaveLength(1);
    expect(api.getCore()).toBe(core);
    expect(document.activeElement).toBe(floatingFilter);

    await render({ quickFilter: true }, false, { debounceMs: 10_000, showOptions: true });
    const restoredToolbarFilter =
      container.querySelector<HTMLInputElement>(".pte-grid-toolbar .pte-quick-filter-input");
    expect(restoredToolbarFilter?.value).toBe("acme");
    expect(container.querySelectorAll(".pte-quick-filter")).toHaveLength(1);
    expect(document.activeElement).toBe(restoredToolbarFilter);

    await unmountTestRoot(root);
  });

  it("lets the toolbar section enable the default quick filter by itself", async () => {
    const { container, root, render } = await mount();

    await render({ quickFilter: true });
    expect(container.querySelector(".pte-grid-toolbar .pte-quick-filter-input")).not.toBeNull();

    await render({});
    expect(container.querySelector(".pte-grid-toolbar")).toBeNull();
    expect(container.querySelector(".pte-quick-filter")).toBeNull();

    await unmountTestRoot(root);
  });

  it("updates application-owned saved views live without remounting", async () => {
    const { container, root, api, render } = await mount();
    const core = api.getCore();
    const onActiveViewChange = vi.fn();
    const state = api.captureViewState();
    state.quickFilterText = "acme";

    await render(
      { views: true },
      false,
      false,
      {
        views: [{ id: "sales", name: "Sales view", state }],
        activeViewId: null,
        onActiveViewChange,
      },
    );
    const viewsButton =
      container.querySelector<HTMLButtonElement>(".pte-grid-toolbar-views-button")!;
    expect(viewsButton.textContent).toContain("Views");

    viewsButton.click();
    container.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="toolbarViewApply:sales"]',
    )!.click();
    expect(core.getQuickFilterText()).toBe("acme");
    expect(onActiveViewChange).toHaveBeenCalledWith("sales");
    expect(api.getCore()).toBe(core);

    await render(
      { views: true },
      false,
      false,
      {
        views: [{ id: "sales", name: "Renamed externally", state }],
        activeViewId: "sales",
        onActiveViewChange,
      },
    );
    expect(viewsButton.textContent).toContain("Renamed externally");
    expect(api.getCore()).toBe(core);

    await unmountTestRoot(root);
  });
});
