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

  it("moves a nested leaf with its full hierarchy when dropped at the section end", async () => {
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
    const rootDropZone = container.querySelector<HTMLElement>(
      '.pte-column-panel-section[data-section="center"] .pte-column-panel-root-dropzone',
    )!;
    await act(async () => {
      panelRow(container, "name")
        .dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
      rootDropZone.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
      rootDropZone.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(api.getColumnState().map(state => state.colId)).toEqual(["region", "revenue", "name"]);
    const model = api.getColumnModel();
    const nameAncestors = model.getAncestors(model.getByColId("name")!.instanceID);
    const regionAncestors = model.getAncestors(model.getByColId("region")!.instanceID);
    expect(nameAncestors.map(col => col.colId)).toEqual(["identity", "contact", "name"]);
    expect(regionAncestors.map(col => col.colId)).toEqual(["identity", "contact", "region"]);
    expect(nameAncestors[0].instanceID).not.toBe(regionAncestors[0].instanceID);
    expect(container.querySelectorAll(
      '.pte-column-panel-tree-group[data-group-col-id="identity"]',
    )).toHaveLength(2);
    expect(container.querySelector(".pte-column-panel-list")
      ?.classList.contains("pte-column-panel-dragging-group-column")).toBe(false);
    expect(container.querySelector(".pte-column-panel-announcer")?.textContent)
      .toBe("Name moved to position 3 of 3");
    await act(async () => root.unmount());
  });

  it("duplicates only the immediate parent when a leaf moves within its top-level group", async () => {
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
          { colId: "status", key: "status", label: "Status" },
        ],
      },
      { colId: "revenue", key: "revenue", label: "Revenue" },
    ];
    const { container, root, api } = await mount({ defaultOpen: true }, groupedColumns);

    await act(async () => {
      panelRow(container, "name")
        .dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
      panelRow(container, "status")
        .dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
      panelRow(container, "status")
        .dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });

    expect(api.getColumnState().map(state => state.colId))
      .toEqual(["region", "status", "name", "revenue"]);
    const model = api.getColumnModel();
    const nameAncestors = model.getAncestors(model.getByColId("name")!.instanceID);
    const regionAncestors = model.getAncestors(model.getByColId("region")!.instanceID);
    expect(nameAncestors.map(col => col.colId)).toEqual(["identity", "contact", "name"]);
    expect(regionAncestors.map(col => col.colId)).toEqual(["identity", "contact", "region"]);
    expect(nameAncestors[0].instanceID).toBe(regionAncestors[0].instanceID);
    expect(nameAncestors[1].instanceID).not.toBe(regionAncestors[1].instanceID);
    expect(container.querySelectorAll(
      '.pte-column-panel-tree-group[data-group-col-id="identity"]',
    )).toHaveLength(1);
    expect(container.querySelectorAll(
      '.pte-column-panel-tree-group[data-group-col-id="contact"]',
    )).toHaveLength(2);
    await act(async () => root.unmount());
  });

  it("lists only columns made visible by column-group expansion", async () => {
    const adaptiveColumns: ReactColDef[] = [
      {
        colId: "responsive",
        label: "Responsive",
        children: [
          {
            colId: "name",
            key: "name",
            label: "Name",
            columnGroupShow: "closed",
          },
          {
            colId: "region",
            key: "region",
            label: "Region",
            columnGroupShow: "open",
          },
        ],
      },
    ];
    const { container, root, api } = await mount({ defaultOpen: true }, adaptiveColumns);
    const bulk = container.querySelector<HTMLInputElement>(".pte-column-panel-bulk-checkbox")!;

    expect(panelRow(container, "name")).not.toBeNull();
    expect(panelRow(container, "region")).toBeNull();
    expect(api.getColumnModel().getCenterLeaves().map(col => col.colId)).toEqual(["name"]);
    expect(container.querySelectorAll(".pte-column-panel-row")).toHaveLength(1);
    expect(bulk.checked).toBe(true);

    const nameCheckbox = panelRow(container, "name")
      .querySelector<HTMLInputElement>(".pte-column-panel-checkbox")!;
    await act(async () => nameCheckbox.click());
    expect(panelRow(container, "name")).not.toBeNull();
    expect(nameCheckbox.checked).toBe(false);
    expect(api.getColumnModel().getCenterLeaves()).toHaveLength(0);

    const groupId = api.getColumnModel().getByColId("responsive")!.instanceID;
    await act(async () => {
      api.getCore().dispatch({
        type: "headerAction",
        colId: groupId,
        action: "toggleGroupExpand",
      });
    });

    expect(panelRow(container, "name")).toBeNull();
    expect(panelRow(container, "region")).not.toBeNull();
    expect(api.getColumnModel().getCenterLeaves().map(col => col.colId)).toEqual(["region"]);
    expect(container.querySelectorAll(".pte-column-panel-row")).toHaveLength(1);
    expect(bulk.checked).toBe(true);

    await act(async () => {
      api.getCore().dispatch({
        type: "headerAction",
        colId: groupId,
        action: "toggleGroupExpand",
      });
    });
    const restoredNameCheckbox = panelRow(container, "name")
      .querySelector<HTMLInputElement>(".pte-column-panel-checkbox")!;
    expect(panelRow(container, "region")).toBeNull();
    expect(restoredNameCheckbox.checked).toBe(false);
    expect(api.getColumnModel().getCenterLeaves()).toHaveLength(0);
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
    if (trigger === "toolbar") {
      const exportButton = parent.querySelector<HTMLButtonElement>(".pte-grid-toolbar-export-button");
      expect(exportButton).not.toBeNull();
      expect(parent.lastElementChild).toBe(triggerButton);
    }
    expect(container.querySelector(".pte-root")!.classList.contains(`pte-column-panel-trigger-${trigger}`))
      .toBe(true);

    await act(async () => triggerButton.click());
    expect(container.querySelector(".pte-root")!.classList.contains("pte-column-panel-open")).toBe(true);
    expect(container.querySelector(".pte-column-panel-content")).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("groups a column dropped from the header onto the toolbar grouping section", async () => {
    const { container, root, api } = await mount({ trigger: "toolbar" });
    const model = api.getColumnModel();
    const region = model.getByColId("region")!;
    const revenue = model.getByColId("revenue")!;
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-add")!.click();
      container.querySelector<HTMLButtonElement>(
        `.pte-menu-item[data-item-id="toolbarGroupAdd-${region.instanceID}"]`,
      )!.click();
      container.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-add")!.click();
      container.querySelector<HTMLButtonElement>(
        `.pte-menu-item[data-item-id="toolbarGroupAdd-${revenue.instanceID}"]`,
      )!.click();
    });

    const name = model.getByColId("name")!;
    const header = container.querySelector<HTMLElement>(`.pte-hcell#${name.instanceID}`)!;
    const dropZone = container.querySelector<HTMLElement>(".pte-grid-toolbar-group-dropzone")!;
    const chips = Array.from(
      dropZone.querySelectorAll<HTMLElement>(".pte-grid-toolbar-group-chip"),
    );
    chips.forEach((chip, index) => {
      Object.defineProperty(chip, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left: index * 100,
          right: (index + 1) * 100,
          top: 0,
          bottom: 26,
          width: 100,
          height: 26,
        }),
      });
    });
    Object.defineProperty(header, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, right: 120, top: 50, bottom: 90, width: 120, height: 40 }),
    });
    Object.defineProperty(dropZone, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, right: 300, top: 0, bottom: 42, width: 300, height: 42 }),
    });

    await act(async () => {
      header.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 60,
      }));
      document.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: 120,
        clientY: 20,
      }));
      expect(chips[1].classList.contains("drop-before")).toBe(true);
      expect(
        dropZone.querySelector<HTMLElement>(".pte-grid-toolbar-group-drop-indicator")?.style.left,
      ).toBe("100px");
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });

    expect(api.getColumnModel().getAutoGroupColumns()).toHaveLength(1);
    expect(Array.from(
      container.querySelectorAll(".pte-grid-toolbar-group-chip-label"),
      chip => chip.textContent,
    )).toEqual(["Region", "Name", "Revenue"]);
    expect(dropZone.querySelector(".pte-grid-toolbar-group-drop-indicator")).toBeNull();
    await act(async () => root.unmount());
  });

  it("keeps toolbar sort priority synchronized with header indicators", async () => {
    const { container, root, api } = await mount({ trigger: "toolbar" });
    const core = api.getCore();
    const model = api.getColumnModel();
    const region = model.getByColId("region")!;
    const revenue = model.getByColId("revenue")!;

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!.click();
      container.querySelector<HTMLButtonElement>(
        `.pte-menu-item[data-item-id="toolbarSortAdd-${region.instanceID}"]`,
      )!.click();
      container.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!.click();
      container.querySelector<HTMLButtonElement>(
        `.pte-menu-item[data-item-id="toolbarSortAdd-${revenue.instanceID}"]`,
      )!.click();
    });

    expect(core.getSortModel().items.map(item => item.col.instanceID))
      .toEqual([region.instanceID, revenue.instanceID]);
    expect(
      document.getElementById(region.instanceID)
        ?.querySelector(".pte-hcell-sort-priority")?.textContent,
    ).toBe("1");
    expect(
      document.getElementById(revenue.instanceID)
        ?.querySelector(".pte-hcell-sort-priority")?.textContent,
    ).toBe("2");

    const name = model.getByColId("name")!;
    const nameHeader = document.getElementById(name.instanceID)!;
    const sortZone = container.querySelector<HTMLElement>(".pte-grid-toolbar-sort-dropzone")!;
    const sortChips = Array.from(
      sortZone.querySelectorAll<HTMLElement>(".pte-grid-toolbar-sort-chip"),
    );
    sortChips.forEach((chip, index) => {
      Object.defineProperty(chip, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left: 300 + index * 100,
          right: 400 + index * 100,
          top: 0,
          bottom: 26,
          width: 100,
          height: 26,
        }),
      });
    });
    Object.defineProperty(nameHeader, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, right: 120, top: 50, bottom: 90, width: 120, height: 40 }),
    });
    Object.defineProperty(sortZone, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 300, right: 600, top: 0, bottom: 42, width: 300, height: 42 }),
    });

    await act(async () => {
      nameHeader.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 60,
      }));
      document.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: 420,
        clientY: 20,
      }));
      expect(sortChips[1].classList.contains("drop-before")).toBe(true);
      expect(
        sortZone.querySelector<HTMLElement>(".pte-grid-toolbar-sort-drop-indicator")?.style.left,
      ).toBe("100px");
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    expect(core.getSortModel().items.map(item => item.col.instanceID))
      .toEqual([region.instanceID, name.instanceID, revenue.instanceID]);
    expect(Array.from(
      container.querySelectorAll(".pte-grid-toolbar-sort-chip-label"),
      chip => chip.textContent,
    )).toEqual(["Region", "Name", "Revenue"]);
    expect(sortZone.querySelector(".pte-grid-toolbar-sort-drop-indicator")).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(
        `.pte-grid-toolbar-sort-chip[data-sort-col-id="${name.instanceID}"] .pte-grid-toolbar-sort-remove`,
      )!.click();
    });

    await act(async () => {
      container.querySelector<HTMLElement>(
        `.pte-grid-toolbar-sort-chip[data-sort-col-id="${revenue.instanceID}"]`,
      )!.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
      }));
    });
    expect(core.getSortModel().items.map(item => item.col.instanceID))
      .toEqual([revenue.instanceID, region.instanceID]);
    expect(
      document.getElementById(revenue.instanceID)
        ?.querySelector(".pte-hcell-sort-priority")?.textContent,
    ).toBe("1");
    expect(
      document.getElementById(region.instanceID)
        ?.querySelector(".pte-hcell-sort-priority")?.textContent,
    ).toBe("2");

    await act(async () => {
      core.dispatch({
        type: "headerAction",
        action: "toggleSort",
        colId: name.instanceID,
      });
    });
    expect(core.getSortModel().items.map(item => item.col.instanceID)).toEqual([name.instanceID]);
    expect(Array.from(
      container.querySelectorAll(".pte-grid-toolbar-sort-chip-label"),
      chip => chip.textContent,
    )).toEqual(["Name"]);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-clear")!.click();
    });
    expect(core.getSortModel().items).toEqual([]);
    expect(container.querySelector(".pte-grid-toolbar-sort-chip")).toBeNull();

    await act(async () => root.unmount());
  });

  it("identifies clipped grouping and sort chips with grid tooltips", async () => {
    const { container, root, api } = await mount({ trigger: "toolbar" });
    const model = api.getColumnModel();
    const region = model.getByColId("region")!;
    const revenue = model.getByColId("revenue")!;
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".pte-grid-toolbar-group-add")!.click();
      container.querySelector<HTMLButtonElement>(
        `.pte-menu-item[data-item-id="toolbarGroupAdd-${region.instanceID}"]`,
      )!.click();
      container.querySelector<HTMLButtonElement>(".pte-grid-toolbar-sort-add")!.click();
      container.querySelector<HTMLButtonElement>(
        `.pte-menu-item[data-item-id="toolbarSortAdd-${revenue.instanceID}"]`,
      )!.click();
    });

    const groupChip = container.querySelector<HTMLElement>(
      `.pte-grid-toolbar-group-chip[data-group-col-id="${region.instanceID}"]`,
    )!;
    const groupLabel = groupChip.querySelector<HTMLElement>(
      ".pte-grid-toolbar-group-chip-label",
    )!;
    expect(groupChip.hasAttribute("title")).toBe(false);
    Object.defineProperties(groupLabel, {
      scrollWidth: { configurable: true, value: 60 },
      clientWidth: { configurable: true, value: 100 },
    });
    await act(async () => {
      groupChip.querySelector<HTMLElement>(".pte-grid-toolbar-group-drag")!.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, clientX: 20, clientY: 20 }),
      );
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    expect(container.querySelector(".pte-tooltip")).toBeNull();

    Object.defineProperty(groupLabel, "clientWidth", { configurable: true, value: 0 });
    await act(async () => {
      groupChip.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      groupChip.querySelector<HTMLElement>(".pte-grid-toolbar-group-drag")!.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, clientX: 20, clientY: 20 }),
      );
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    expect(container.querySelector(".pte-tooltip")?.textContent).toBe("Region");

    const sortChip = container.querySelector<HTMLElement>(
      `.pte-grid-toolbar-sort-chip[data-sort-col-id="${revenue.instanceID}"]`,
    )!;
    const sortLabel = sortChip.querySelector<HTMLElement>(
      ".pte-grid-toolbar-sort-chip-label",
    )!;
    expect(sortChip.hasAttribute("title")).toBe(false);
    Object.defineProperties(sortLabel, {
      scrollWidth: { configurable: true, value: 80 },
      clientWidth: { configurable: true, value: 0 },
    });
    await act(async () => {
      groupChip.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      sortChip.querySelector<HTMLElement>(".pte-grid-toolbar-sort-drag")!.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, clientX: 400, clientY: 20 }),
      );
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    expect(container.querySelector(".pte-tooltip")?.textContent).toBe("Revenue");

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
