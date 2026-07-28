// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Grid } from "./grid";
import type { IGridAPI, ReactColDef } from "./index";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

const columns: ReactColDef[] = [
  { colId: "name", key: "name", label: "Name" },
  { colId: "region", key: "region", label: "Region" },
  { colId: "revenue", key: "revenue", label: "Revenue" },
];

async function mount(
  columnPanel: React.ComponentProps<typeof Grid>["columnPanel"] = true,
  columnDefs: ReactColDef[] = columns,
) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientHeight", { value: 500, configurable: true });
  document.body.appendChild(container);
  const apiRef = React.createRef<IGridAPI | null>();
  const root = createRoot(container);

  const render = async (nextColumnPanel: React.ComponentProps<typeof Grid>["columnPanel"]) => {
    await act(async () => {
      root.render(
      <Grid
        apiRef={apiRef}
        rowIdKey="id"
        rowData={[{ id: "1", name: "Acme", region: "West", revenue: 42 }]}
        columnDefs={columnDefs}
        columnPanel={nextColumnPanel}
        tooltip={{ showDelay: 0, hideDelay: 0 }}
      />,
      );
    });
  };
  await render(columnPanel);
  return { container, root, api: apiRef.current!, render };
}

function panelRow(container: HTMLElement, colId: string): HTMLElement {
  return container.querySelector<HTMLElement>(`.pte-column-panel-row[data-col-id="${colId}"]`)!;
}

describe("column panel", () => {
  it("is opt-in and opens from a collapsed rail", async () => {
    const off = await mount(false);
    expect(off.container.querySelector(".pte-column-panel")).toBeNull();
    await act(async () => off.root.unmount());

    const on = await mount({ defaultOpen: false, width: 330 });
    const grid = on.container.querySelector<HTMLElement>(".pte-root")!;
    const rail = on.container.querySelector<HTMLButtonElement>(".pte-column-panel-rail")!;
    expect(grid.classList.contains("pte-column-panel-enabled")).toBe(true);
    expect(grid.style.getPropertyValue("--pte-column-panel-width")).toBe("330px");
    expect(rail.getAttribute("aria-expanded")).toBe("false");

    await act(async () => rail.click());
    expect(grid.classList.contains("pte-column-panel-open")).toBe(true);
    expect(rail.getAttribute("aria-expanded")).toBe("true");
    await act(async () => on.root.unmount());
  });

  it("searches, hides, pins, keyboard-reorders, and resets columns live", async () => {
    const { container, root, api } = await mount({ defaultOpen: true });
    const search = container.querySelector<HTMLInputElement>(".pte-column-panel-search")!;
    const reset = container.querySelector<HTMLButtonElement>(".pte-column-panel-reset")!;
    const modified = container.querySelector<HTMLElement>(".pte-column-panel-modified")!;
    const announcer = container.querySelector<HTMLElement>(".pte-column-panel-announcer")!;
    expect(announcer.getAttribute("aria-live")).toBe("polite");
    expect(reset.disabled).toBe(true);
    expect(modified.hidden).toBe(true);

    await act(async () => {
      search.value = "rev";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".pte-column-panel-row")).toHaveLength(1);
    expect(panelRow(container, "revenue")).not.toBeNull();

    await act(async () => {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const regionCheckbox = panelRow(container, "region")
      .querySelector<HTMLInputElement>(".pte-column-panel-checkbox")!;
    await act(async () => regionCheckbox.click());
    expect(api.getColumnModel().getByColId("region")!.hidden).toBe(true);
    expect(container.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!.indeterminate)
      .toBe(true);
    expect(reset.disabled).toBe(false);
    expect(modified.hidden).toBe(false);
    expect(announcer.textContent).toBe("Region hidden");

    const revenuePin = panelRow(container, "revenue")
      .querySelector<HTMLSelectElement>(".pte-column-panel-pin")!;
    await act(async () => {
      revenuePin.value = "left";
      revenuePin.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(api.getColumnModel().getByColId("revenue")!.pinned).toBe("left");
    expect(
      container.querySelector('.pte-column-panel-section[data-section="left"] [data-col-id="revenue"]'),
    ).not.toBeNull();
    expect(announcer.textContent).toBe("Revenue pinned left");

    // Move Region above Name with the keyboard-accessible order control.
    const regionUp = panelRow(container, "region")
      .querySelector<HTMLButtonElement>('[aria-label="Move Region up"]')!;
    await act(async () => regionUp.click());
    const centerOrder = api.getColumnState()
      .filter((state) => state.pinned == null)
      .sort((a, b) => a.order! - b.order!)
      .map((state) => state.colId);
    expect(centerOrder).toEqual(["region", "name"]);
    expect(announcer.textContent).toBe("Region moved to position 1 of 2");

    await act(async () => {
      reset.click();
    });
    expect(api.getColumnState().map((state) => state.colId)).toEqual(["name", "region", "revenue"]);
    expect(api.getColumnModel().getByColId("region")!.hidden).toBe(false);
    expect(api.getColumnModel().getByColId("revenue")!.pinned).toBeNull();
    expect(reset.disabled).toBe(true);
    expect(modified.hidden).toBe(true);
    expect(announcer.textContent).toBe("Column layout reset");
    await act(async () => root.unmount());
  });

  it("bulk-shows and hides eligible columns within the active search", async () => {
    const { container, root, api } = await mount({ defaultOpen: true });
    const search = container.querySelector<HTMLInputElement>(".pte-column-panel-search")!;
    const bulk = container.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!;
    const bulkLabel = container.querySelector<HTMLElement>(".pte-column-panel-bulk-label")!;

    expect(bulk.checked).toBe(true);
    expect(bulk.indeterminate).toBe(false);
    expect(bulkLabel.textContent).toBe("All columns");

    await act(async () => {
      search.value = "rev";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(bulkLabel.textContent).toBe("All matching columns");
    await act(async () => bulk.click());

    expect(api.getColumnModel().getByColId("revenue")!.hidden).toBe(true);
    expect(api.getColumnModel().getByColId("name")!.hidden).toBe(false);
    expect(api.getColumnModel().getByColId("region")!.hidden).toBe(false);
    expect(container.querySelector(".pte-column-panel-announcer")?.textContent)
      .toBe("1 matching column hidden");

    await act(async () => bulk.click());
    expect(api.getColumnModel().getByColId("revenue")!.hidden).toBe(false);
    await act(async () => root.unmount());
  });

  it("excludes non-hideable columns from bulk visibility", async () => {
    const lockedColumns: ReactColDef[] = [
      { colId: "name", key: "name", label: "Name", hideable: false },
      { colId: "region", key: "region", label: "Region" },
    ];
    const { container, root, api } = await mount({ defaultOpen: true }, lockedColumns);
    const bulk = container.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!;

    await act(async () => bulk.click());
    expect(api.getColumnModel().getByColId("name")!.hidden).toBe(false);
    expect(api.getColumnModel().getByColId("region")!.hidden).toBe(true);

    const search = container.querySelector<HTMLInputElement>(".pte-column-panel-search")!;
    await act(async () => {
      search.value = "name";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(bulk.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it("omits suppressColumnPanel columns from the drawer without removing them from the grid", async () => {
    const panelColumns: ReactColDef[] = [
      { colId: "name", key: "name", label: "Name", suppressColumnPanel: true },
      { colId: "region", key: "region", label: "Region" },
    ];
    const { container, root, api } = await mount({ defaultOpen: true }, panelColumns);

    expect(panelRow(container, "name")).toBeNull();
    expect(panelRow(container, "region")).not.toBeNull();
    expect(api.getColumnModel().getByColId("name")).not.toBeNull();
    expect(container.querySelector('.pte-hcell-leaf')?.textContent).toContain("Name");

    const bulk = container.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!;
    await act(async () => bulk.click());
    expect(api.getColumnModel().getByColId("name")!.hidden).toBe(false);
    expect(api.getColumnModel().getByColId("region")!.hidden).toBe(true);

    const search = container.querySelector<HTMLInputElement>(".pte-column-panel-search")!;
    await act(async () => {
      search.value = "name";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".pte-column-panel-row")).toHaveLength(0);
    expect(bulk.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it("renders collapsible column-group hierarchy and searches group paths", async () => {
    const groupedColumns: ReactColDef[] = [
      {
        colId: "identity",
        label: "Identity",
        children: [
          {
            colId: "contact",
            label: "Contact",
            children: [
              { colId: "name", key: "name", label: "Name" },
              { colId: "region", key: "region", label: "Region" },
            ],
          },
        ],
      },
      {
        colId: "metrics",
        label: "Metrics",
        children: [
          { colId: "revenue", key: "revenue", label: "Revenue" },
        ],
      },
    ];
    const { container, root, api } = await mount({ defaultOpen: true }, groupedColumns);
    const identity = container.querySelector<HTMLButtonElement>(
      '.pte-column-panel-tree-group[data-group-col-id="identity"] > .pte-column-panel-tree-group-header',
    )!;
    expect(identity.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll(".pte-column-panel-tree-group")).toHaveLength(3);

    await act(async () => identity.click());
    expect(panelRow(container, "name")).toBeNull();
    expect(panelRow(container, "region")).toBeNull();
    expect(panelRow(container, "revenue")).not.toBeNull();

    const search = container.querySelector<HTMLInputElement>(".pte-column-panel-search")!;
    await act(async () => {
      search.value = "identity";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(panelRow(container, "name")).not.toBeNull();
    expect(panelRow(container, "region")).not.toBeNull();
    expect(panelRow(container, "revenue")).toBeNull();

    const regionUp = panelRow(container, "region")
      .querySelector<HTMLButtonElement>('[aria-label="Move Region up"]')!;
    await act(async () => regionUp.click());
    expect(api.getColumnState().map(state => state.colId)).toEqual(["region", "name", "revenue"]);

    const bulk = container.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!;
    await act(async () => bulk.click());
    expect(api.getColumnModel().getByColId("name")!.hidden).toBe(true);
    expect(api.getColumnModel().getByColId("region")!.hidden).toBe(true);
    expect(api.getColumnModel().getByColId("revenue")!.hidden).toBe(false);
    await act(async () => root.unmount());
  });

  it("reorders columns by drag and drop within a pin section", async () => {
    const { container, root, api } = await mount({ defaultOpen: true });
    const name = panelRow(container, "name");
    const revenue = panelRow(container, "revenue");

    await act(async () => {
      name.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
      revenue.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
      revenue.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(api.getColumnState().map((state) => state.colId)).toEqual(["region", "revenue", "name"]);
    expect(container.querySelector(".pte-column-panel-announcer")?.textContent)
      .toBe("Name moved to position 3 of 3");
    await act(async () => root.unmount());
  });

  it.each([
    ["header", ".pte-column-panel", ".pte-column-panel-trigger-header-button"],
    ["footer", ".pte-column-panel", ".pte-column-panel-trigger-footer-button"],
    ["toolbar", ".pte-grid-toolbar-right", ".pte-column-panel-trigger-toolbar-button"],
  ] as const)("mounts the %s trigger in its dedicated chrome and opens the shared drawer", async (
    trigger,
    parentSelector,
    buttonSelector,
  ) => {
    const { container, root } = await mount({ trigger });
    const parent = container.querySelector<HTMLElement>(parentSelector)!;
    const triggerButton = parent.querySelector<HTMLButtonElement>(buttonSelector)!;
    expect(triggerButton).not.toBeNull();
    expect(container.querySelector(".pte-root")!.classList.contains(`pte-column-panel-trigger-${trigger}`))
      .toBe(true);

    await act(async () => triggerButton.click());
    expect(container.querySelector(".pte-root")!.classList.contains("pte-column-panel-open")).toBe(true);
    expect(container.querySelector(".pte-column-panel-content")).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("offers Manage columns in both the column button menu and header context menu", async () => {
    const { container, root, api } = await mount({ trigger: "menu" });
    const nameInstanceId = api.getColumnModel().getByColId("name")!.instanceID;
    const header = container.querySelector<HTMLElement>(`.pte-hcell#${nameInstanceId}`)!;
    const menuButton = header.querySelector<HTMLButtonElement>(".pte-hcell-menu-menuBtn")!;

    await act(async () => menuButton.click());
    const manageFromButton = container.querySelector<HTMLButtonElement>(
      '.pte-menu-item[data-item-id="manageColumns"]',
    )!;
    expect(manageFromButton.textContent).toContain("Manage columns");
    await act(async () => manageFromButton.click());
    expect(container.querySelector(".pte-root")!.classList.contains("pte-column-panel-open")).toBe(true);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".pte-column-panel-close")!.click();
      header.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 20,
        clientY: 20,
      }));
    });
    expect(container.querySelector('.pte-menu-item[data-item-id="manageColumns"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("uses grid tooltips instead of native titles for panel controls", async () => {
    const { container, root } = await mount({ trigger: "header" });
    const trigger = container.querySelector<HTMLElement>(".pte-column-panel-trigger-header-button")!;
    expect(trigger.hasAttribute("title")).toBe(false);

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    const triggerTooltip = container.querySelector<HTMLElement>(".pte-tooltip");
    expect(triggerTooltip?.textContent).toContain("Columns");
    expect(triggerTooltip?.dataset.placement).toBe("left");

    await act(async () => trigger.click());
    const label = container.querySelector<HTMLElement>('.pte-column-panel-label')!;
    expect(label.hasAttribute("title")).toBe(false);
    await act(async () => {
      label.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector(".pte-tooltip")?.textContent).toContain(label.textContent);
    await act(async () => root.unmount());
  });

  it("moves the trigger live without remounting the grid", async () => {
    const { container, root, api, render } = await mount({ trigger: "header" });
    const coreBefore = api.getCore();
    expect(container.querySelector(".pte-column-panel-trigger-header-button")).not.toBeNull();

    await render({ trigger: "toolbar" });
    expect(container.querySelector(".pte-column-panel-trigger-header-button")).toBeNull();
    expect(container.querySelector(".pte-column-panel-trigger-toolbar-button")).not.toBeNull();
    expect(api.getCore()).toBe(coreBefore);
    await act(async () => root.unmount());
  });
});
