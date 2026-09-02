import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import type { GridSheet, SheetTabColor } from "@grid/interfaces/gridView";
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

/**
 * Twelve random hues, named so the menu (and assistive tech) has something to read. `hsl()` rather
 * than hex on purpose: a palette entry can be any CSS colour, since a tab tints from the single
 * value it is given rather than needing a light/dark pair.
 */
function randomPalette(prefix: string): SheetTabColor[] {
  return Array.from({ length: 12 }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    color: `hsl(${Math.round(Math.random() * 360)} 72% 55%)`,
  }));
}

function Swatches({ palette }: { palette: SheetTabColor[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {palette.map(entry => (
        <span
          key={entry.name}
          title={`${entry.name} — ${entry.color}`}
          style={{
            width: 12, height: 12, borderRadius: 3,
            background: entry.color, border: "1px solid rgba(0,0,0,0.15)",
          }}
        />
      ))}
    </span>
  );
}

export function SheetsDemo() {
  const rows = useMemo(() => buildRows(2000), []);
  const apiRef = useRef<IGridAPI | null>(null);

  const [sheets, setSheets] = useState<GridSheet[]>([{ id: "data", name: "Data" }]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>("data");

  // Tab-colour palettes. `palette` null = the grid's built-in list; supplying one unlocks the
  // per-sheet override, which is what turns the option from an array into a function.
  const [palette, setPalette] = useState<SheetTabColor[] | null>(null);
  const [overrideSheetId, setOverrideSheetId] = useState<string>("");
  const [overridePalette, setOverridePalette] = useState<SheetTabColor[] | null>(null);
  const [customColor, setCustomColor] = useState(false);

  const colors = useMemo(() => {
    if (!palette) return undefined;                            // built-in palette
    if (!overrideSheetId || !overridePalette) return palette;  // array form: one list for every tab
    // Function form: consulted per menu-open, with the sheet the menu was opened on.
    return (sheet: GridSheet) => (sheet.id === overrideSheetId ? overridePalette : palette);
  }, [palette, overrideSheetId, overridePalette]);

  const overrideSheet = sheets.find(sheet => sheet.id === overrideSheetId);

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

      <div
        style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 12,
        }}
      >
        <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "#6b7280" }}>
          Tab colors
        </strong>
        <button type="button" onClick={() => setPalette(randomPalette("Random"))}>
          {palette ? "Randomize again" : "Randomize 12 colors"}
        </button>
        {palette && <Swatches palette={palette} />}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Override
          <select
            value={overrideSheetId}
            disabled={!palette}
            onChange={e => {
              setOverrideSheetId(e.target.value);
              // A fresh set for the chosen sheet, so the two palettes are visibly different.
              setOverridePalette(e.target.value ? randomPalette("Custom") : null);
            }}
          >
            <option value="">— no override —</option>
            {sheets.map(sheet => (
              <option key={sheet.id} value={sheet.id}>{sheet.name}</option>
            ))}
          </select>
        </label>
        {overrideSheet && overridePalette && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#4b5563" }}>
            {overrideSheet.name}: <Swatches palette={overridePalette} />
          </span>
        )}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={customColor}
            onChange={e => setCustomColor(e.target.checked)}
          />
          Custom… (platform picker)
        </label>
        <button
          type="button"
          disabled={!palette}
          onClick={() => { setPalette(null); setOverrideSheetId(""); setOverridePalette(null); }}
        >
          Built-in palette
        </button>
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
              colors,
              customColor,
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
          <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
            <code>colors</code> replaces the built-in palette. An array is one list for every tab; a
            function is asked per sheet, per menu-open — that's the <em>Override</em> control, which
            hands one sheet a palette of its own.
          </div>
          <ol style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 12, lineHeight: 1.7 }}>
            {sheets.map(sheet => (
              <li key={sheet.id}>
                <strong>{sheet.name}</strong>
                {sheet.id === activeSheetId ? " — active" : ""}
                {sheet.state?.pivotMode ? " (pivot)" : ""}
                {sheet.id === overrideSheetId ? " (own palette)" : ""}
                {sheet.color ? (
                  <span
                    title={sheet.color}
                    style={{
                      display: "inline-block", width: 10, height: 10, marginLeft: 6,
                      borderRadius: 3, background: sheet.color, border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

export default SheetsDemo;
