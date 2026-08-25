import { createGrid, ColumnType, type ColDef, type GridSheet } from "@grid";

import { bold, demoRoot, gridHost, h, note } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * Sheets playground: spreadsheet-style tabs in the footer's left zone over ONE grid instance and
 * ONE row model. Each sheet is a live view state — switching tabs captures the sheet you leave
 * and applies the one you enter. The **+** button appends a blank pivot sheet; double-click
 * renames; right-click offers Rename / Duplicate / Delete; Ctrl+PageDown/PageUp switches sheets.
 * The sheet list is application-owned: this page holds it in a local variable and re-syncs the
 * grid through `updateGridOptions`.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  quarter: string;
  product: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const PRODUCTS = ["Hardware", "Software", "Services"];

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(7);
  const pick = picker(rand);
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      quarter: pick(QUARTERS),
      product: pick(PRODUCTS),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 100_000),
    };
  });
}

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 130 },
  { colId: "country", key: "country", label: "Country", width: 130 },
  { colId: "quarter", key: "quarter", label: "Quarter", width: 110 },
  { colId: "product", key: "product", label: "Product", width: 130 },
  { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
];

export function mountSheetsDemo(container: HTMLElement): () => void {
  let sheets: GridSheet[] = [{ id: "data", name: "Data" }];
  let activeSheetId: string | null = "data";

  const host = gridHost();
  const list = h("ol", {
    style: { margin: "10px 0 0", paddingLeft: "20px", fontSize: "12px", lineHeight: "1.7" },
  });

  container.appendChild(demoRoot(
    note(
      "One grid, one row model — the footer tabs are live view states. Switch to ",
      bold("By Quarter"), " for a pre-built pivot sheet, press ", bold("+"),
      " for a blank one (pivot mode on, hint in the header until you choose an aggregate),",
      " double-click a tab to rename it, right-click for Rename / Duplicate / Delete, or switch",
      " with ", bold("Ctrl+PageDown/PageUp"), ". Edits made on any sheet update every sheet's",
      " derived values, because the data is shared.",
    ),
    h("div", { style: { display: "flex", gap: "12px", flex: "1", minHeight: "0" } },
      // minWidth:0 keeps the grid from widening the page as generated pivot columns appear.
      host,
      h("aside", {
        style: {
          width: "240px", flex: "0 0 240px", overflow: "auto", padding: "12px",
          boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: "8px",
          background: "#f9fafb",
        },
      },
        h("strong", { text: "Application-owned sheets", style: { fontSize: "13px" } }),
        h("div", {
          text: "Held by this page; every tab mutation reports the full next list.",
          style: { marginTop: "4px", fontSize: "11px", color: "#6b7280" },
        }),
        list,
      ),
    ),
  ));

  const api = createGrid(host, {
    rowData: buildRows(2000),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    pagination: true,
    pageSize: 25,
    groupDefaultExpanded: 1,
    toolbar: { pivot: true },
    sheets: sheetsOptions(),
  });

  // Seed a ready-made pivot sheet next to the Data sheet: the + button does the same derivation
  // (current state, pivot on) — this one just arrives pre-configured with roles.
  sheets = [...sheets, {
    id: "by-quarter",
    name: "By Quarter",
    state: {
      ...api.captureViewState(),
      pivotMode: true,
      pivotColumns: ["quarter"],
      rowGroupColumns: ["region"],
      aggregateModel: [{ colId: "revenue", type: "sum" }],
      groupExpansion: [],
    },
  }];
  syncSheets();

  function sheetsOptions() {
    return {
      sheets,
      activeSheetId,
      onChange: (next: GridSheet[]) => {
        sheets = next;
        renderList();
      },
      onActiveSheetChange: (sheetId: string | null) => {
        activeSheetId = sheetId;
        renderList();
      },
    };
  }

  /** Sheets are application-owned: hand the grid the new list so the tab strip re-syncs. */
  function syncSheets(): void {
    api.updateGridOptions({ sheets: sheetsOptions() });
    renderList();
  }

  function renderList(): void {
    list.replaceChildren(...sheets.map(sheet => h("li", {},
      bold(sheet.name),
      (sheet.id === activeSheetId ? " — active" : "") + (sheet.state?.pivotMode ? " (pivot)" : ""),
    )));
  }

  return () => api.destroy();
}
