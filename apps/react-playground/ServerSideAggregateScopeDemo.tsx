import { useEffect, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import { AggregateType } from "@grid/interfaces/aggregate";
import type {
  GridEventAggregateChangedParams,
  IServerSideAggregationRequest,
  IServerSideDataSource,
  IServerSideRequest,
  PaginationControlsOptions,
} from "@grid";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

/**
 * Aggregate scope on the server-side row model — whole-dataset totals come from the server.
 *
 * "Entire dataset" needs a server aggregation source: the data source's own `getAggregates`, or the
 * `serverSideAggregationSource` option (which wins when both exist). The wiring select switches
 * between those two shapes and none at all; the panel reads the footer's real control and the
 * grid's `aggregateChanged` events, and counts the server's aggregation calls, so each path is
 * visible without dev tools.
 *
 * Without a source the scope is locked to "Current page": a requested "all" becomes "page", and
 * the footer says so — "Entire dataset" is greyed out with a tooltip (on the control and in the ⋮
 * overflow menu alike), or dropped from both, per `paginationControls.aggregateScope`. The two
 * selects beside the wiring drive exactly that option, live.
 *
 * Before the fix the data source's `getAggregates` was never read (only the option reached the
 * grid), the locked select was disabled whole with no explanation, and the ⋮ submenu offered a
 * choice that did nothing.
 */

type OrderRow = {
  id: number;
  region: string;
  category: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
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

function buildRows(count: number): OrderRow[] {
  const rand = mulberry32(23);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => ({
    id: 1 + i,
    region: pick(REGIONS),
    category: pick(CATEGORIES),
    units: 1 + Math.floor(rand() * 500),
    revenue: 500 + Math.floor(rand() * 50_000),
  }));
}

// 1,200 rows over 25-row pages: "Current page" and "Entire dataset" give visibly different totals.
const ALL_ROWS = buildRows(1_200);

function serveRows(request: IServerSideRequest) {
  let rows = ALL_ROWS;
  const sort = request.sorts[0];
  if (sort) {
    const dir = sort.dir === "desc" ? -1 : 1;
    rows = rows.slice().sort((a, b) => {
      const av = (a as any)[sort.key];
      const bv = (b as any)[sort.key];
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }
  const start = request.startRow ?? 0;
  const end = request.endRow ?? rows.length;
  return { rows: rows.slice(start, end), totalRows: rows.length };
}

// Whole-dataset totals, the way a real server would answer: one value per requested aggregate,
// keyed by the column's field.
function serveAggregates(request: IServerSideAggregationRequest) {
  const values: Record<string, number> = {};
  for (const agg of request.aggregates) {
    const nums = ALL_ROWS.map(row => (row as any)[agg.key]).filter(v => typeof v === "number") as number[];
    switch (agg.type) {
      case AggregateType.SUM: values[agg.key] = nums.reduce((s, v) => s + v, 0); break;
      case AggregateType.AVG: values[agg.key] = nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0; break;
      case AggregateType.MIN: values[agg.key] = Math.min(...nums); break;
      case AggregateType.MAX: values[agg.key] = Math.max(...nums); break;
      case AggregateType.COUNT: values[agg.key] = ALL_ROWS.length; break;
      default: break;
    }
  }
  return { values };
}

/** How the demo hands the server-side totals to the grid. */
type Wiring = "dataSource" | "option" | "none";

const WIRING_OPTIONS: ReadonlyArray<{ value: Wiring; label: string }> = [
  { value: "dataSource", label: "getAggregates on the data source" },
  { value: "option", label: "serverSideAggregationSource option" },
  { value: "none", label: "no server aggregation (Entire dataset unavailable)" },
];

type WhenUnavailable = "disabled" | "hidden";
type MessageMode = "default" | "custom" | "none";

const CUSTOM_MESSAGE = "Totals over all orders are not available in this view.";

const MESSAGE_OPTIONS: ReadonlyArray<{ value: MessageMode; label: string }> = [
  { value: "default", label: "grid default" },
  { value: "custom", label: `custom: "${CUSTOM_MESSAGE}"` },
  { value: "none", label: "none (empty string)" },
];

function footerOptions(whenUnavailable: WhenUnavailable, messageMode: MessageMode): PaginationControlsOptions {
  return {
    aggregateScope: {
      whenUnavailable,
      ...(messageMode === "default" ? {} : { unavailableMessage: messageMode === "custom" ? CUSTOM_MESSAGE : "" }),
    },
  };
}

type FooterState = {
  present: boolean;
  value: string;
  disabled: boolean;
  title: string;
  allOption: "absent" | "enabled" | "disabled";
};

const mono: React.CSSProperties = { fontSize: 11, fontFamily: "monospace" };
const smallLabel: React.CSSProperties = { fontSize: 12, display: "flex", alignItems: "center", gap: 4 };

export function ServerSideAggregateScopeDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const unsubscribeRef = useRef<Array<() => void>>([]);
  const [wiring, setWiring] = useState<Wiring>("dataSource");
  const [whenUnavailable, setWhenUnavailable] = useState<WhenUnavailable>("disabled");
  const [messageMode, setMessageMode] = useState<MessageMode>("default");
  const [narrow, setNarrow] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [aggregateEvent, setAggregateEvent] = useState<GridEventAggregateChangedParams | null>(null);
  const [footer, setFooter] = useState<FooterState | null>(null);
  const [aggregateCalls, setAggregateCalls] = useState<string[]>([]);
  const [rowRequests, setRowRequests] = useState(0);

  const getAggregates = useMemo<NonNullable<IServerSideDataSource["getAggregates"]>>(() => ({ request, success }) => {
    setAggregateCalls(log => [
      `scope=${request.aggregateScope} aggregates=[${request.aggregates.map(a => `${a.key}:${a.type}`).join(", ")}]`,
      ...log,
    ].slice(0, 4));
    setTimeout(() => success(serveAggregates(request)), 250);
  }, []);

  const dataSource = useMemo<IServerSideDataSource>(() => {
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        setRowRequests(n => n + 1);
        setTimeout(() => success(serveRows(request)), 250);
      },
    };
    // The documented shape: getAggregates on the data source itself.
    if (wiring === "dataSource") source.getAggregates = getAggregates;
    return source;
  }, [wiring, getAggregates]);

  const paginationControls = useMemo(
    () => footerOptions(whenUnavailable, messageMode),
    [whenUnavailable, messageMode],
  );

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "id", key: "id", label: "Order", width: 90, type: ColumnType.NUMBER },
    { colId: "region", key: "region", label: "Region", width: 120 },
    { colId: "category", key: "category", label: "Category", width: 120 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ], []);

  // What the user sees: the footer's own Aggregate select, read from the grid's DOM.
  const readFooter = () => {
    const select = hostRef.current?.querySelector<HTMLSelectElement>("select.pte-aggregate-scope");
    if (!select) {
      setFooter({ present: false, value: "", disabled: false, title: "", allOption: "absent" });
      return;
    }
    const all = select.querySelector<HTMLOptionElement>('option[value="all"]');
    setFooter({
      present: true,
      value: select.value,
      disabled: select.disabled,
      title: select.title,
      allOption: !all ? "absent" : all.disabled ? "disabled" : "enabled",
    });
  };
  const readFooterSoon = () => {
    requestAnimationFrame(() => requestAnimationFrame(readFooter));
  };

  const onGridReady = (api: IGridAPI) => {
    apiRef.current = api;
    for (const off of unsubscribeRef.current) off();
    unsubscribeRef.current = [
      api.on("aggregateChanged", ev => {
        setAggregateEvent(ev);
        readFooterSoon();
      }),
      api.on("rowsChanged", readFooterSoon),
      api.on("paginationChanged", readFooterSoon),
    ];
    // Footer totals for the two numeric columns; the footer shows up with them at page scope.
    api.setAggregates([
      { colId: "units", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.SUM },
    ]);
    readFooterSoon();
  };

  useEffect(() => () => {
    for (const off of unsubscribeRef.current) off();
    unsubscribeRef.current = [];
  }, []);

  // A footer option change rebuilds the footer; read it again once that has happened.
  useEffect(readFooterSoon, [narrow, generation, paginationControls]);

  const changeWiring = (next: Wiring) => {
    setWiring(next);
    setAggregateEvent(null);
    setFooter(null);
    setAggregateCalls([]);
    setRowRequests(0);
    setGeneration(g => g + 1);
  };

  const locked = footer?.present === true && footer.allOption !== "enabled";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 1100 }}>
        <strong>Whole-dataset totals:</strong> on the server-side row model, <em>Entire dataset</em>{" "}
        needs a server aggregation source: the data source's own <code>getAggregates</code>, or the{" "}
        <code>serverSideAggregationSource</code> option (which wins when both exist). Pick a wiring
        and switch the footer's Aggregate control to <em>Entire dataset</em>: the panel shows the
        server being asked and the totals jumping from the page's 25 rows to all 1,200. With no
        source the scope is locked to <em>Current page</em>, and the footer says so: the choice is
        greyed out with a tooltip (hover the control; with <em>Narrow footer</em> on, open ⋮ →
        Aggregate), or hidden, as the two options beside the wiring say.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={smallLabel}>
          Aggregation wiring
          <select value={wiring} onChange={(e) => changeWiring(e.target.value as Wiring)}>
            {WIRING_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label style={smallLabel}>
          Entire dataset when unavailable
          <select value={whenUnavailable} onChange={(e) => setWhenUnavailable(e.target.value as WhenUnavailable)}>
            <option value="disabled">disabled (greyed out + tooltip)</option>
            <option value="hidden">hidden</option>
          </select>
        </label>

        <label style={smallLabel}>
          Tooltip
          <select value={messageMode} onChange={(e) => setMessageMode(e.target.value as MessageMode)}>
            {MESSAGE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label style={smallLabel}>
          <input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} />
          Narrow footer (aggregate control moves into the ⋮ overflow menu)
        </label>

        <button className="btn" type="button" onClick={() => changeWiring(wiring)}>
          Remount grid
        </button>
      </div>

      <div
        style={{
          ...mono,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          padding: 8,
          borderRadius: 4,
          border: `1px solid ${locked ? "#f59e0b" : "#d1d5db"}`,
          background: locked ? "rgba(245, 158, 11, 0.08)" : "rgba(156, 163, 175, 0.08)",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>footer Aggregate select (what the user sees)</div>
          {!footer || !footer.present
            ? <div style={{ color: "#9ca3af" }}>{footer ? "not in the footer (overflowed into ⋮, or hidden)" : "—"}</div>
            : (
              <>
                <div>value: <strong>{footer.value}</strong> · control disabled: <strong>{String(footer.disabled)}</strong></div>
                <div>
                  "Entire dataset" option:{" "}
                  <strong style={{ color: footer.allOption === "enabled" ? "inherit" : "#b45309" }}>{footer.allOption}</strong>
                </div>
                <div>tooltip (title): <strong>{footer.title ? `"${footer.title}"` : "none"}</strong></div>
              </>
            )}
          <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 4 }}>last aggregateChanged event</div>
          {aggregateEvent
            ? (
              <div>
                scope: <strong>{aggregateEvent.scope}</strong> · reason: {aggregateEvent.reason} · valuesAvailable:{" "}
                {String(aggregateEvent.valuesAvailable)}
              </div>
            )
            : <div style={{ color: "#9ca3af" }}>—</div>}
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            server getAggregates calls ({aggregateCalls.length}{aggregateCalls.length >= 4 ? "+" : ""})
          </div>
          {aggregateCalls.length === 0
            ? <div style={{ color: "#9ca3af" }}>none — the grid has not asked the server for totals</div>
            : aggregateCalls.map((line, i) => <div key={i}>{line}</div>)}
          <div style={{ marginTop: 8, color: "#9ca3af" }}>
            row block requests: {rowRequests} · wiring: {WIRING_OPTIONS.find(o => o.value === wiring)?.label}
          </div>
        </div>
      </div>

      <div ref={hostRef} style={{ flex: 1, minWidth: 0, minHeight: 0, maxWidth: narrow ? 340 : undefined }}>
        <Grid
          // The wiring is a creation-time decision here, so a change remounts the grid; the footer
          // options are live.
          key={`${generation}:${wiring}`}
          apiRef={apiRef}
          onGridReady={onGridReady}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowModelType="serverSide"
          serverSideDataSource={dataSource}
          serverSideAggregationSource={wiring === "option" ? getAggregates : undefined}
          serverSideBlockSize={100}
          pagination
          pageSize={25}
          paginationControls={paginationControls}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default ServerSideAggregateScopeDemo;
