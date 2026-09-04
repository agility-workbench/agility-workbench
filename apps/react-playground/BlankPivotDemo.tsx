import { useCallback, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import { AggregateType } from "@grid/interfaces/aggregate";
import type { GridSheet } from "@grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

/**
 * The blank pivot canvas: pivot mode with no row group, no pivot column and no value displays
 * NOTHING — no columns (not even the auto-group column), no rows — and says so through
 * `pivotEmptyMessage`. Turn pivot mode on with the grid empty of roles and watch the whole
 * layout go blank; the column panel opens itself, because a blank canvas has no header to reach
 * a column menu from.
 *
 * The panel here is `availability: "pivot"` by default — it exists only while pivoted, which is
 * the setup for an app that manages columns its own way but wants the grid's pivot customizer.
 * Flip it to `always` to compare.
 *
 * Press + in the footer for a second blank sheet: a fresh pivot sheet lands on the same canvas.
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

// Set at construction, like every other message option (none are runtime-updatable). Omit it and
// the grid says "Add row groups, column labels or values to build the pivot".
const EMPTY_MESSAGE = "Nothing configured yet — drop a field into Row groups, Column labels or Values";

export function BlankPivotDemo() {
  const rows = useMemo(() => buildRows(2000), []);
  const apiRef = useRef<IGridAPI | null>(null);

  const [availability, setAvailability] = useState<"always" | "pivot">("pivot");
  const [state, setState] = useState({
    pivotMode: false,
    unconfigured: false,
    groups: [] as string[],
    pivots: [] as string[],
    values: [] as string[],
  });

  const [sheets, setSheets] = useState<GridSheet[]>([{ id: "data", name: "Data" }]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>("data");

  const syncFromGrid = useCallback((api: IGridAPI) => {
    setState({
      pivotMode: api.getPivotMode(),
      unconfigured: api.isPivotUnconfigured(),
      groups: api.getRowGroupColumns(),
      pivots: api.getPivotColumns(),
      values: api.getAggregates().map(agg => `${agg.colId}:${agg.type}`),
    });
  }, []);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "quarter", key: "quarter", label: "Quarter", width: 110 },
    { colId: "product", key: "product", label: "Product", width: 130 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ], []);

  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
    // Subscriptions die with the grid instance, which this page owns for its lifetime.
    api.on("pivotChanged", () => syncFromGrid(api));
    api.on("aggregateChanged", () => syncFromGrid(api));
    api.on("columnsChanged", () => syncFromGrid(api));
    syncFromGrid(api);
  };

  const clearRoles = (api: IGridAPI) => {
    api.setRowGroupColumns([]);
    api.setPivotColumns([]);
    api.setAggregates([]);
  };

  const rowStyle = { fontSize: 12, lineHeight: 1.5 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#6b7280" }}>
        Press <strong>Pivot</strong> in the toolbar with no roles set and the grid goes{" "}
        <strong>completely blank</strong> — no columns, no rows, just <code>pivotEmptyMessage</code>{" "}
        (overridden on this page, to show it is yours to word). Previously this state showed a lone
        group column over a &quot;Total&quot; row that nothing could act on. The column panel opens
        itself on the way in, since a blank canvas has no header to open a column menu from. Fill
        any one of the three wells and the grid fills in; empty them all and it goes blank again.{" "}
        <strong>+</strong> in the footer adds another blank pivot sheet.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          Column panel
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value as "always" | "pivot")}
          >
            <option value="pivot">availability: &quot;pivot&quot;</option>
            <option value="always">availability: &quot;always&quot;</option>
          </select>
        </label>

        <button className="btn" type="button" onClick={() => {
          const api = apiRef.current;
          if (!api) return;
          clearRoles(api);
          api.setPivotMode(true);
        }}>
          Enter pivot mode (blank)
        </button>

        <button className="btn" type="button" onClick={() => {
          const api = apiRef.current;
          if (!api) return;
          api.setRowGroupColumns(["region"]);
          api.setPivotColumns(["quarter"]);
          api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
          api.setPivotMode(true);
        }}>
          Configure a pivot
        </button>

        <button className="btn" type="button" onClick={() => {
          if (apiRef.current) clearRoles(apiRef.current);
        }}>
          Clear every role
        </button>

        <button className="btn" type="button" onClick={() => apiRef.current?.setPivotMode(false)}>
          Leave pivot mode
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* minWidth:0 keeps the grid from widening the page as generated pivot columns appear. */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <Grid
            apiRef={apiRef}
            data={rows}
            columnDefs={columnDefs}
            rowIdKey="id"
            groupDefaultExpanded={1}
            toolbar={{ pivot: true }}
            pivotEmptyMessage={EMPTY_MESSAGE}
            // Only while pivoted: outside pivot mode this app owns column management itself.
            columnPanel={{ availability, trigger: "toolbar" }}
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

        <aside style={{
          width: 260, flex: "0 0 260px", overflow: "auto", padding: 12,
          boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 8,
          background: "#f9fafb",
        }}>
          <strong style={{ fontSize: 13 }}>What the grid reports</strong>
          <div style={{ marginTop: 4, fontSize: 11, color: "#6b7280" }}>
            <code>isPivotUnconfigured()</code> is public, so an app driving pivot through its own UI
            can render the same empty state the grid does.
          </div>
          <dl style={{
            display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px",
            margin: "8px 0 0", ...rowStyle,
          }}>
            <dt style={{ color: "#6b7280" }}>Pivot mode</dt>
            <dd style={{ margin: 0 }}>{state.pivotMode ? "on" : "off"}</dd>
            <dt style={{ color: "#6b7280" }}>isPivotUnconfigured()</dt>
            <dd style={{ margin: 0, fontWeight: state.unconfigured ? 700 : 400 }}>
              {String(state.unconfigured)}
            </dd>
            <dt style={{ color: "#6b7280" }}>Row groups</dt>
            <dd style={{ margin: 0 }}>{state.groups.join(", ") || "—"}</dd>
            <dt style={{ color: "#6b7280" }}>Column labels</dt>
            <dd style={{ margin: 0 }}>{state.pivots.join(", ") || "—"}</dd>
            <dt style={{ color: "#6b7280" }}>Values</dt>
            <dd style={{ margin: 0 }}>{state.values.join(", ") || "—"}</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}

export default BlankPivotDemo;
