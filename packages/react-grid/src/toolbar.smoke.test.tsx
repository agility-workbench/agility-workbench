// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
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

    await act(async () => root.unmount());
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

    await act(async () => root.unmount());
  });
});
