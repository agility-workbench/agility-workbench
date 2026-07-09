import { useMemo, useRef, useState } from "react";

import { GridReact } from "@grid-react";
import type { ReactColDef } from "@grid-react";
import { ColumnType } from "@grid/interfaces/column";
import { AggregateType } from "@grid/interfaces/aggregate";
import type { GroupDisplayType } from "@grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

/**
 * Row-grouping playground: group by one or more columns, switch the GroupDisplayType, and toggle a
 * SUM aggregate. The grid lives in a constrained flex item (minWidth:0) so adding the pinned
 * auto-group column never widens the page.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  category: string;
  rep: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany", "Spain"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
const CATEGORIES = ["Hardware", "Software", "Services"];
const REPS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva", "Ethan Khan"];

// Deterministic PRNG so demo data is stable across reloads.
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
      category: pick(CATEGORIES),
      rep: pick(REPS),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 500_000),
    };
  });
}

const GROUPABLE: Array<{ colId: string; label: string }> = [
  { colId: "region", label: "Region" },
  { colId: "country", label: "Country" },
  { colId: "category", label: "Category" },
  { colId: "rep", label: "Sales Rep" },
];

const DISPLAY_TYPES: GroupDisplayType[] = ["singleColumn", "multipleColumns", "groupRows"];

export function GroupingDemo() {
  const rows = useMemo(() => buildRows(2000), []);
  const apiRef = useRef<IGridAPI | null>(null);

  const [displayType, setDisplayType] = useState<GroupDisplayType>("singleColumn");
  const [groupBy, setGroupBy] = useState<string[]>(["region", "category"]);
  const [aggregate, setAggregate] = useState(true);
  const [groupRowsSelectable, setGroupRowsSelectable] = useState(false);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "category", key: "category", label: "Category", width: 130 },
    { colId: "rep", key: "rep", label: "Sales Rep", width: 160 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ], []);

  const applyGrouping = (colIds: string[]) => {
    apiRef.current?.dispatch({ type: "rowGroupSet", colIds });
  };

  const applyAggregates = (on: boolean) => {
    const api = apiRef.current;
    if (!api) return;
    const model = on
      ? [
          { key: colInstance(api, "units"), type: AggregateType.SUM },
          { key: colInstance(api, "revenue"), type: AggregateType.SUM },
        ].filter((m) => m.key)
      : [];
    api.dispatch({ type: "aggregateModelSet", aggregateModels: model as any });
  };

  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
    applyAggregates(aggregate);
    applyGrouping(groupBy);
  };

  const toggleGroupCol = (colId: string) => {
    setGroupBy((prev) => {
      const next = prev.includes(colId) ? prev.filter((c) => c !== colId) : [...prev, colId];
      applyGrouping(next);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="display-type" style={{ fontSize: 13 }}>Display type</label>
          <select
            id="display-type"
            value={displayType}
            onChange={(e) => setDisplayType(e.target.value as GroupDisplayType)}
          >
            {DISPLAY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>(remounts the grid)</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13 }}>Group by</span>
          {GROUPABLE.map(({ colId, label }) => (
            <label key={colId} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={groupBy.includes(colId)} onChange={() => toggleGroupCol(colId)} />
              {label}
            </label>
          ))}
        </div>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={aggregate}
            onChange={(e) => { setAggregate(e.target.checked); applyAggregates(e.target.checked); }}
          />
          Sum Units &amp; Revenue
        </label>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={groupRowsSelectable}
            onChange={(e) => setGroupRowsSelectable(e.target.checked)}
          />
          Group rows selectable
        </label>

        <button className="btn" type="button" onClick={() => { setGroupBy([]); applyGrouping([]); }}>
          Clear grouping
        </button>
      </div>

      {/* minWidth:0 keeps the grid from widening the page when the pinned auto-group column appears. */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <GridReact
          key={`${displayType}-${groupRowsSelectable}`}
          apiRef={apiRef}
          data={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          groupDisplayType={displayType}
          groupDefaultExpanded={1}
          groupRowsSelectable={groupRowsSelectable}
          style={{ width: "100%", height: "100%" }}
          onGridReady={handleReady}
        />
      </div>
    </div>
  );
}

// Resolve a column's instanceID (the key the aggregate model expects) from its colId.
function colInstance(api: IGridAPI, colId: string): string {
  return api.getColumnModel().getByColId(colId)?.instanceID ?? "";
}

export default GroupingDemo;
