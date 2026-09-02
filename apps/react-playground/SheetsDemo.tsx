import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import type { GridSheet } from "@grid/interfaces/gridView";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

/**
 * Sheets playground: spreadsheet-style tabs in the footer's left zone over ONE grid instance and
 * ONE row model. Each sheet is a live view state (columns, sort, filters, grouping, aggregates,
 * pivot, expansion, page) — switching tabs captures the sheet you leave and applies the one you
 * enter. The **+** button appends a blank pivot sheet; double-click renames; right-click offers
 * Rename / Change color / Duplicate / Delete; Ctrl+PageDown/PageUp switches sheets from the
 * keyboard. The sheet
 * list is application-owned: this page holds it in React state and could persist it anywhere.
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

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(7);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
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

export function SheetsDemo() {
  const rows = useMemo(() => buildRows(2000), []);
  const apiRef = useRef<IGridAPI | null>(null);

  const [sheets, setSheets] = useState<GridSheet[]>([{ id: "data", name: "Data" }]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>("data");

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "quarter", key: "quarter", label: "Quarter", width: 110 },
    { colId: "product", key: "product", label: "Product", width: 130 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ], []);

  // Seed a ready-made pivot sheet next to the Data sheet: the + button does the same derivation
  // (current state, pivot on) — this one just arrives pre-configured with roles.
  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
    setSheets(prev => {
      if (prev.some(sheet => sheet.id === "by-quarter")) return prev;
      const state = {
        ...api.captureViewState(),
        pivotMode: true,
        pivotColumns: ["quarter"],
        rowGroupColumns: ["region"],
        aggregateModel: [{ colId: "revenue", type: "sum" }],
        groupExpansion: [],
      };
      return [...prev, { id: "by-quarter", name: "By Quarter", state }];
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: "#4b5563" }}>
        One grid, one row model — the footer tabs are live view states. Switch to
        <strong> By Quarter</strong> for a pre-built pivot sheet, press <strong>+</strong> for a
        blank one (pivot mode on, hint in the header until you choose an aggregate), double-click a
        tab to rename it, right-click for Rename / Change color / Duplicate / Delete, or switch with
        <strong> Ctrl+PageDown/PageUp</strong>. Edits made on any sheet update every sheet's
        derived values, because the data is shared.
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* minWidth:0 keeps the grid from widening the page as generated pivot columns appear. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Grid
            apiRef={apiRef}
            rowData={rows}
            columnDefs={columnDefs}
            rowIdKey="id"
            pagination
            pageSize={25}
            groupDefaultExpanded={1}
            toolbar={{ pivot: true }}
            sheets={{
              sheets,
              activeSheetId,
              onChange: setSheets,
              onActiveSheetChange: setActiveSheetId,
            }}
            style={{ width: "100%", height: "100%" }}
            onGridReady={handleReady}
          />
        </div>

        <aside
          style={{
            width: 240,
            flex: "0 0 240px",
            overflow: "auto",
            padding: 12,
            boxSizing: "border-box",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            background: "#f9fafb",
          }}
        >
          <strong style={{ fontSize: 13 }}>Application-owned sheets</strong>
          <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
            Held in this page's state; every tab mutation reports the full next list.
          </div>
          <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 12, lineHeight: 1.7 }}>
            {sheets.map(sheet => (
              <li key={sheet.id}>
                <strong>{sheet.name}</strong>
                {sheet.id === activeSheetId ? " — active" : ""}
                {sheet.state?.pivotMode ? " (pivot)" : ""}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

export default SheetsDemo;
