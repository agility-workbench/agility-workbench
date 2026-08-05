import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import { AggregateType } from "@grid/interfaces/aggregate";
import type { IServerSideDataSource, IServerSideRequest } from "@grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

/**
 * Server-side grouping playground: a fake server (in-memory, 250ms latency) implements the
 * grouping contract — per-parent block requests, GROUP BY rows with counts and sums, optional
 * totalRows. Toggle "Report totalRows" off to see the open-ended flow: the pager shows "N+",
 * "next" keeps probing past the frontier, and the count pins once an empty block comes back.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  category: string;
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
      category: pick(CATEGORIES),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 500_000),
    };
  });
}

// The "database". A mutable ref so the Mutate button can simulate server-side changes that only
// become visible through refreshServerSideData.
const ALL_ROWS = buildRows(5_000);

function serveRequest(request: IServerSideRequest, reportTotals: boolean) {
  let subset = ALL_ROWS.filter(row =>
    request.groupKeys.every(k => (row as any)[k.key] === k.value));

  let rows: any[];
  if (request.groupKeys.length < request.groupBy.length) {
    // Group level: one row per bucket, ordered by the bucket's sort (or ascending), carrying the
    // leaf-descendant count and any requested sums.
    const key = request.groupBy[request.groupKeys.length];
    const buckets = new Map<string, SaleRow[]>();
    for (const row of subset) {
      const v = String((row as any)[key]);
      if (!buckets.has(v)) buckets.set(v, []);
      buckets.get(v)!.push(row);
    }
    const groupSort = request.sorts.find(s => s.key === key);
    const dir = groupSort?.dir === "desc" ? -1 : 1;
    rows = Array.from(buckets.keys())
      .sort((a, b) => a.localeCompare(b) * dir)
      .map((v) => {
        const leaves = buckets.get(v)!;
        const groupRow: any = { [key]: (leaves[0] as any)[key], count: leaves.length };
        for (const agg of request.aggregates) {
          if (agg.type === AggregateType.SUM) {
            groupRow[agg.key] = leaves.reduce((s, r) => s + Number((r as any)[agg.key] ?? 0), 0);
          }
        }
        return groupRow;
      });
  } else {
    // Leaf level within the group path: honor non-grouped sorts.
    const leafSort = request.sorts.find(s => !request.groupBy.includes(s.key));
    if (leafSort) {
      const dir = leafSort.dir === "desc" ? -1 : 1;
      subset = subset.slice().sort((a, b) => {
        const av = (a as any)[leafSort.key];
        const bv = (b as any)[leafSort.key];
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      });
    }
    rows = subset;
  }

  const start = request.startRow ?? 0;
  const end = request.endRow ?? rows.length;
  return {
    rows: rows.slice(start, end),
    totalRows: reportTotals ? rows.length : undefined,
  };
}

const GROUPABLE: Array<{ colId: string; label: string }> = [
  { colId: "region", label: "Region" },
  { colId: "country", label: "Country" },
  { colId: "category", label: "Category" },
];

export function ServerSideGroupingDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const [groupBy, setGroupBy] = useState<string[]>(["region", "country"]);
  const [reportTotals, setReportTotals] = useState(true);
  const [pagination, setPagination] = useState(true);
  const [stickyGroups, setStickyGroups] = useState(true);
  const [requestLog, setRequestLog] = useState<string[]>([]);
  const reportTotalsRef = useRef(reportTotals);
  reportTotalsRef.current = reportTotals;

  const dataSource = useMemo<IServerSideDataSource>(() => ({
    getRows: ({ request, success }) => {
      setRequestLog(log => [
        `${request.groupKeys.length ? request.groupKeys.map(k => String(k.value)).join(" / ") : "(root)"} [${request.startRow}, ${request.endRow})`,
        ...log,
      ].slice(0, 8));
      setTimeout(() => success(serveRequest(request, reportTotalsRef.current)), 250);
    },
  }), []);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "category", key: "category", label: "Category", width: 130 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ], []);

  const applyGrouping = (colIds: string[]) => {
    apiRef.current?.dispatch({ type: "rowGroupSet", colIds });
  };

  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
    const model = [
      { key: colInstance(api, "units"), type: AggregateType.SUM },
      { key: colInstance(api, "revenue"), type: AggregateType.SUM },
    ].filter((m) => m.key);
    api.dispatch({ type: "aggregateModelSet", aggregateModels: model as any });
    applyGrouping(groupBy);
  };

  const toggleGroupCol = (colId: string) => {
    setGroupBy((prev) => {
      const next = prev.includes(colId) ? prev.filter((c) => c !== colId) : [...prev, colId];
      applyGrouping(next);
      return next;
    });
  };

  const mutateServer = () => {
    // Simulate a server-side change: bump every EMEA revenue.
    for (const row of ALL_ROWS) {
      if (row.region === "EMEA") row.revenue += 1_000;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
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
            checked={reportTotals}
            onChange={(e) => setReportTotals(e.target.checked)}
          />
          Report totalRows (off → open-ended "+", pager probes)
        </label>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={pagination} onChange={(e) => setPagination(e.target.checked)} />
          Pagination
        </label>

        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={stickyGroups} onChange={(e) => setStickyGroups(e.target.checked)} />
          Sticky group rows
        </label>

        <button
          className="btn"
          type="button"
          onClick={() => { mutateServer(); void apiRef.current?.refreshServerSideData(); }}
        >
          Mutate server + soft refresh
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            mutateServer();
            void apiRef.current?.refreshServerSideData({
              groupKeys: [{ key: "region", value: "EMEA" }],
              purge: true,
            });
          }}
        >
          Purge-refresh EMEA subtree
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace", minHeight: 16 }}>
        requests: {requestLog.join("  •  ") || "—"}
      </div>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Grid
          key={String(pagination)}
          apiRef={apiRef}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowModelType="serverSide"
          serverSideDataSource={dataSource}
          serverSideBlockSize={100}
          pagination={pagination}
          groupRowsSticky={stickyGroups}
          pageSize={50}
          getGroupChildCount={(row: any) => row.count}
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

export default ServerSideGroupingDemo;
