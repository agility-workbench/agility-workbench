// @vitest-environment happy-dom
/**
 * `localeText` / `getLocaleText` end to end: an override reaches every surface the grid paints its
 * own words on, and an untranslated grid still says exactly what it always said.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createGrid } from "../createGrid";
import { ColumnType } from "../interfaces/column";
import type { GridOptions } from "../interfaces/gridOptions";
import type { CreateGridOptions } from "../createGrid";
import type { IGridAPI } from "../interfaces/iGridAPI";

beforeAll(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    font: "",
    measureText: (text: string) => ({ width: text.length * 7 }),
  });
});

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.style.height = "400px";
  host.style.width = "800px";
  document.body.appendChild(host);
});

const rowData = [
  { id: 1, name: "Widget", status: "Open", active: true },
  { id: 2, name: "Gadget", status: "", active: false },
  { id: 3, name: "Doohickey", status: "Closed", active: true },
];

function mount(extra: Partial<CreateGridOptions> = {}): IGridAPI {
  return createGrid(host, {
    rowIdKey: "id",
    columnDefs: [
      { key: "name", label: "Name", type: ColumnType.STRING },
      { key: "status", label: "Status", filter: "set" },
      { key: "active", label: "Active", type: ColumnType.BOOLEAN },
    ],
    rowData,
    ...extra,
  });
}

const menuTexts = () =>
  [...document.querySelectorAll(".pte-menu-item .pte-menu-item-text")].map(el => el.textContent);

describe("localeText", () => {
  it("translates the pagination footer, with placeholders filled", () => {
    mount({
      pagination: true,
      pageSize: 25,
      localeText: { rowsPerPage: "Zeilen pro Seite", page: "Seite", pageOfTotalOption: "{page} von {total}", nextPage: "Nächste Seite" },
    });
    const footer = host.querySelector(".pte-pagination-wrapper")!;
    expect(footer.textContent).toContain("Zeilen pro Seite");
    expect(footer.textContent).toContain("Seite");
    expect(host.querySelector(".pte-pagination-page-select option")!.textContent).toBe("1 von 1");
    expect(host.querySelector(".pte-pagination-btn-next")!.getAttribute("aria-label")).toBe("Nächste Seite");
  });

  it("translates the set filter's Select All and Blanks rows", () => {
    mount({ localeText: { selectAll: "(Alle auswählen)", blanks: "(Leer)" } });
    const statusHeader = [...host.querySelectorAll<HTMLElement>(".pte-hcell")]
      .find(cell => cell.textContent?.includes("Status"))!;
    statusHeader.querySelector<HTMLElement>(".pte-hcell-menu-filterBtn")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const labels = [...document.querySelectorAll(".pte-set-filter-option-label-text")].map(el => el.textContent);
    expect(labels.slice(0, 2)).toEqual(["(Alle auswählen)", "(Leer)"]);
  });

  it("translates the column menu", () => {
    mount({ localeText: { sortAscending: "Aufsteigend sortieren", hideColumnMenu: "Spalte ausblenden" } });
    host.querySelector<HTMLElement>(".pte-hcell-menu-menuBtn")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menuTexts()).toContain("Aufsteigend sortieren");
    expect(menuTexts()).toContain("Spalte ausblenden");
    expect(document.querySelector(".pte-menu")!.getAttribute("aria-label")).toBe("Column menu");
  });

  it("translates the body menu", () => {
    mount({ localeText: { copy: "Kopieren", copyWithHeaders: "Mit Überschriften kopieren", cellMenu: "Zellenmenü" } });
    host.querySelector<HTMLElement>(".pte-cell")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(menuTexts()).toEqual(expect.arrayContaining(["Kopieren", "Mit Überschriften kopieren"]));
    expect(document.querySelector(".pte-menu")!.getAttribute("aria-label")).toBe("Zellenmenü");
  });

  it("translates the overlays; the dedicated message options still win", () => {
    const api = mount({ rowData: [], localeText: { loading: "Daten werden geladen…", noRows: "Keine Zeilen" } });
    expect(host.querySelector(".pte-norows-label")!.textContent).toBe("Keine Zeilen");
    api.showLoadingOverlay();
    expect(host.querySelector(".pte-loading-label")!.textContent).toBe("Daten werden geladen…");
    api.destroy();

    document.body.innerHTML = "";
    document.body.appendChild(host);
    host.replaceChildren();
    mount({ rowData: [], noRowsMessage: "Nichts da", localeText: { noRows: "Keine Zeilen" } });
    expect(host.querySelector(".pte-norows-label")!.textContent).toBe("Nichts da");
  });

  it("translates header aria-labels: the select-all checkbox and the row-number column", () => {
    mount({
      rowNumbers: true,
      rowSelection: { mode: "multiple", checkboxes: true, headerCheckbox: true } as GridOptions["rowSelection"],
      localeText: { rowNumber: "Zeilennummer", selectAllRows: "Alle Zeilen auswählen" },
    });
    expect(host.querySelector(".pte-hcell-row-number")!.getAttribute("aria-label")).toBe("Zeilennummer");
    expect(host.querySelector(".pte-hcell-checkbox")!.getAttribute("aria-label")).toBe("Alle Zeilen auswählen");
  });

  it("translates the toolbar", () => {
    mount({
      toolbar: { export: true, pivot: true } as GridOptions["toolbar"],
      localeText: { export: "Exportieren", exportTable: "Tabelle exportieren", pivot: "Pivot-Modus" },
    });
    const exportButton = host.querySelector(".pte-grid-toolbar-export-button")!;
    expect(exportButton.getAttribute("aria-label")).toBe("Tabelle exportieren");
    expect(exportButton.textContent).toContain("Exportieren");
  });

  it("translates the screen-reader announcements, plurals included", async () => {
    const api = mount({
      rowSelection: true,
      localeText: {
        rowsSelectedOne: "{count} Zeile ausgewählt",
        rowsSelectedOther: "{count} Zeilen ausgewählt",
        rowsLoadedOther: "{count} Zeilen geladen",
      },
    });
    const region = () => host.querySelector(".pte-grid-sr-announcer")!.textContent;
    const settle = () => new Promise(resolve => setTimeout(resolve, 200));
    api.getCore().dispatch({ type: "overlayShow", overlayType: "loading" });
    api.getCore().dispatch({ type: "overlayShow", overlayType: "none" });
    await settle();
    expect(region()).toBe("3 Zeilen geladen");
    api.getCore().dispatch({ type: "rowSelectSet", viewIdx: 1, mode: "replace" } as any);
    await settle();
    expect(region()).toBe("1 Zeile ausgewählt");
    api.getCore().dispatch({ type: "rowSelectSet", viewIdx: 2, mode: "toggle" } as any);
    await settle();
    expect(region()).toBe("2 Zeilen ausgewählt");
  });

  it("getLocaleText wins over localeText and sees the uninterpolated text and the values", () => {
    const calls: unknown[] = [];
    const api = mount({
      pagination: true,
      localeText: { pageOfTotal: "Seite {page} von {total}" },
      getLocaleText: ({ key, defaultValue, variableValues }) => {
        if (key === "pageOfTotal") calls.push({ defaultValue, variableValues });
        return key === "rowsPerPage" ? "Zeilen" : defaultValue;
      },
    });
    expect(host.textContent).toContain("Zeilen");
    expect(calls[0]).toEqual({ defaultValue: "Seite {page} von {total}", variableValues: { page: 1, total: 1 } });
    expect(api.getLocaleText("pageOfTotal", { page: 2, total: 5 })).toBe("Seite 2 von 5");
    expect(api.getLocaleText("rowsPerPage")).toBe("Zeilen");
  });

  it("defaults are the English strings when nothing is translated", () => {
    const api = mount({ pagination: true });
    expect(api.getLocaleText("rowsPerPage")).toBe("Rows per page");
    expect(host.textContent).toContain("Rows per page");
  });
});

describe("overlay API", () => {
  it("showLoadingOverlay / hideOverlay drive the loading overlay", () => {
    const api = mount();
    const loading = () => host.querySelector(".pte-loading-overlay")!;
    expect(loading().classList.contains("hidden")).toBe(true);
    api.showLoadingOverlay();
    expect(loading().classList.contains("hidden")).toBe(false);
    api.hideOverlay();
    expect(loading().classList.contains("hidden")).toBe(true);
  });

  it("showNoRowsOverlay shows the empty overlay over rows; hideOverlay takes it away again", () => {
    const api = mount();
    const empty = () => host.querySelector(".pte-norows-overlay")!;
    expect(empty().classList.contains("hidden")).toBe(true);
    api.showNoRowsOverlay();
    expect(empty().classList.contains("hidden")).toBe(false);
    expect(host.querySelector(".pte-norows-label")!.textContent).toBe("No rows to show");
    api.hideOverlay();
    expect(empty().classList.contains("hidden")).toBe(true);
  });

  it("hideOverlay keeps the no-rows overlay on a genuinely empty grid", () => {
    const api = mount({ rowData: [] });
    api.showLoadingOverlay();
    expect(host.querySelector(".pte-norows-overlay")!.classList.contains("hidden")).toBe(true);
    api.hideOverlay();
    expect(host.querySelector(".pte-norows-overlay")!.classList.contains("hidden")).toBe(false);
  });
});
