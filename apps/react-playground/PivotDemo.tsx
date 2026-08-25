import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import { AggregateType } from "@grid/interfaces/aggregate";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

/**
 * Pivot playground: pick the pivot columns and measures, flip pivot mode (checkbox, toolbar
 * indicator, or the column menu's "Pivot on Column"), and watch pivot cells update live as cell
 * edits land. Sorting a generated value column orders the group rows by that cell's aggregate.
 * The toolbar's Columns button opens the column panel, which acts as the pivot customizer while
 * pivoted: role chips per source column plus ordered Row groups / Column labels / Values wells.
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
  const rand = mulberry32(11);
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

const PIVOTABLE: Array<{ colId: string; label: string }> = [
  { colId: "quarter", label: "Quarter" },
  { colId: "product", label: "Product" },
];

const MEASURES: Array<{ colId: string; type: AggregateType; label: string }> = [
  { colId: "revenue", type: AggregateType.SUM, label: "Revenue (sum)" },
  { colId: "revenue", type: AggregateType.AVG, label: "Revenue (avg)" },
  { colId: "units", type: AggregateType.SUM, label: "Units (sum)" },
];

export function PivotDemo() {
  const rows = useMemo(() => buildRows(2000), []);
  const apiRef = useRef<IGridAPI | null>(null);
  const editCounter = useRef(0);

  const [pivotOn, setPivotOn] = useState(true);
  const [pivotCols, setPivotCols] = useState<string[]>(["quarter"]);
  const [measures, setMeasures] = useState<Set<number>>(new Set([0]));
  const [groupBy, setGroupBy] = useState<string[]>(["region"]);
  const [dragMode, setDragMode] = useState<"measures" | "free">("measures");

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    // A pivotComparator keeps quarters in calendar order even if a formatter renamed them.
    { colId: "quarter", key: "quarter", label: "Quarter", width: 110, pivotComparator: (a, b) => String(a).localeCompare(String(b)) },
    { colId: "product", key: "product", label: "Product", width: 130 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ], []);

  const applyAggregates = (selected: Set<number>) => {
    apiRef.current?.setAggregates(MEASURES.filter((_, i) => selected.has(i)));
  };

  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
    applyAggregates(measures);
    api.setRowGroupColumns(groupBy);
    api.setPivotColumns(pivotCols);
    api.setPivotMode(pivotOn);
  };

  const togglePivotCol = (colId: string) => {
    setPivotCols(prev => {
      const next = prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId];
      apiRef.current?.setPivotColumns(next);
      return next;
    });
  };

  const toggleMeasure = (index: number) => {
    setMeasures(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      applyAggregates(next);
      return next;
    });
  };

  const toggleGroupCol = (colId: string) => {
    setGroupBy(prev => {
      const next = prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId];
      apiRef.current?.setRowGroupColumns(next);
      return next;
    });
  };

  // Live-update demo: bump one revenue cell by a visible amount. In pivot mode the affected
  // pivot cells (and the footer grand totals) re-derive immediately.
  const bumpARevenueCell = () => {
    const api = apiRef.current;
    if (!api) return;
    // setCellValue writes into the same row objects `data` holds, so the local reference is live.
    const row = rows[editCounter.current++ % 50];
    api.setCellValue({ rowId: String(row.id), colId: "revenue" }, row.revenue + 25_000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={pivotOn}
            onChange={(e) => { setPivotOn(e.target.checked); apiRef.current?.setPivotMode(e.target.checked); }}
          />
          Pivot mode
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>Pivot on</span>
          {PIVOTABLE.map(({ colId, label }) => (
            <label key={colId} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={pivotCols.includes(colId)} onChange={() => togglePivotCol(colId)} />
              {label}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>Measures</span>
          {MEASURES.map((m, i) => (
            <label key={m.label} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={measures.has(i)} onChange={() => toggleMeasure(i)} />
              {m.label}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>Group rows by</span>
          {["region", "country"].map((colId) => (
            <label key={colId} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={groupBy.includes(colId)} onChange={() => toggleGroupCol(colId)} />
              {colId === "region" ? "Region" : "Country"}
            </label>
          ))}
        </div>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          Column drag
          <select value={dragMode} onChange={(e) => setDragMode(e.target.value as "measures" | "free")}>
            <option value="measures">Reorders measures</option>
            <option value="free">Free arrangement</option>
          </select>
        </label>

        <button className="btn" type="button" onClick={bumpARevenueCell}>
          Bump a revenue cell (+25k)
        </button>
      </div>

      {/* minWidth:0 keeps the grid from widening the page as generated pivot columns appear. */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Grid
          apiRef={apiRef}
          data={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          groupDefaultExpanded={1}
          toolbar={{ pivot: true }}
          columnPanel={{ trigger: "toolbar" }}
          pivotColumnMoveMode={dragMode}
          style={{ width: "100%", height: "100%" }}
          onGridReady={handleReady}
        />
      </div>
    </div>
  );
}

export default PivotDemo;
