import { useEffect, useMemo, useState } from "react";
import "./roboto-font.css";
import "./style.css";

import { GridReact } from "@grid-react"; // React Data Grid Component
import type { ReactColDef } from "@grid-react";
import type {
  ColDef,
  FormatterOptionsParams,
  IServerSideDataSource,
  IServerSideFilter,
  IServerSideRequest,
  RowModelType,
} from "@grid";
import type { CellRendererParams } from "@grid/renderer/renderer";
import { ChangeFlashCellRenderer } from "@grid";

const GRID_SERVER_URL = "http://localhost:8008";

type GridServerFilter = {
  key: string;
  type: string;
  value: any;
};

type GridServerPayload = {
  aggregates?: Array<{ key: string; type: string }>;
  columns?: ColDef[];
  schemaVersion?: string;
  filters?: GridServerFilter[];
  sorts?: Array<{ key: string; dir: "asc" | "desc" }>;
  page?: number;
  page_size?: number;
  start_row?: number;
  end_row?: number;
};

const themePresets = [
  { id: "dark", label: "Dark", className: "pte-theme-dark" },
  { id: "light", label: "Light", className: "pte-theme-light" },
];

const cityRegions: Record<string, { region: string; tone: string; icon: string }> = {
  "new york": { region: "Northeast", tone: "blue", icon: "NY" },
  boston: { region: "Northeast", tone: "blue", icon: "BE" },
  philadelphia: { region: "Northeast", tone: "blue", icon: "PH" },
  chicago: { region: "Midwest", tone: "green", icon: "CH" },
  detroit: { region: "Midwest", tone: "green", icon: "DT" },
  minneapolis: { region: "Midwest", tone: "green", icon: "MS" },
  "san francisco": { region: "West", tone: "violet", icon: "SF" },
  "los angeles": { region: "West", tone: "violet", icon: "LA" },
  seattle: { region: "West", tone: "violet", icon: "SE" },
  portland: { region: "West", tone: "violet", icon: "PD" },
  denver: { region: "Mountain", tone: "amber", icon: "DN" },
  phoenix: { region: "Southwest", tone: "amber", icon: "PX" },
  dallas: { region: "South", tone: "rose", icon: "DL" },
  austin: { region: "South", tone: "rose", icon: "AT" },
  houston: { region: "South", tone: "rose", icon: "HS" },
  miami: { region: "Southeast", tone: "teal", icon: "MI" },
  atlanta: { region: "Southeast", tone: "teal", icon: "AL" },
  charlotte: { region: "Southeast", tone: "teal", icon: "CL" },
};

const toneCycle = ["blue", "green", "violet", "amber", "rose", "teal"];

function getCityMeta(city: string) {
  const key = city.trim().toLowerCase();
  const known = cityRegions[key];
  if (known) return known;

  const hash = Array.from(key).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return {
    region: "US City",
    tone: toneCycle[hash % toneCycle.length],
    icon: city
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join("") || "US",
  };
}

function LocationCellRenderer(params: CellRendererParams) {
  const city = String(params.valueFormatted ?? params.value ?? "");
  if (!city) return null;

  const meta = getCityMeta(city);
  return (
    <span className={`location-cell location-cell-${meta.tone}`} title={`${city} · ${meta.region}`}>
      <span className="location-cell-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="location-cell-main">
        <span className="location-cell-city">{city}</span>
        <span className="location-cell-region">{meta.region}</span>
      </span>
      <span className="location-cell-code">{meta.icon}</span>
    </span>
  );
}

const TRADING_SYMBOLS = [
  { symbol: "AAPL", name: "Apple Inc.", base: 192.34 },
  { symbol: "MSFT", name: "Microsoft Corp.", base: 418.55 },
  { symbol: "NVDA", name: "NVIDIA Corp.", base: 928.10 },
  { symbol: "GOOGL", name: "Alphabet Inc.", base: 174.21 },
  { symbol: "AMZN", name: "Amazon.com Inc.", base: 186.77 },
  { symbol: "META", name: "Meta Platforms", base: 502.18 },
  { symbol: "TSLA", name: "Tesla Inc.", base: 248.94 },
  { symbol: "AMD", name: "Adv. Micro Devices", base: 162.05 },
  { symbol: "NFLX", name: "Netflix Inc.", base: 632.42 },
  { symbol: "INTC", name: "Intel Corp.", base: 32.18 },
  { symbol: "ORCL", name: "Oracle Corp.", base: 138.55 },
  { symbol: "CRM", name: "Salesforce Inc.", base: 290.31 },
  { symbol: "ADBE", name: "Adobe Inc.", base: 524.87 },
  { symbol: "PYPL", name: "PayPal Holdings", base: 64.22 },
  { symbol: "UBER", name: "Uber Technologies", base: 71.13 },
  { symbol: "SHOP", name: "Shopify Inc.", base: 65.47 },
];

type TradingRow = {
  symbol: string;
  name: string;
  ltp: number;
  bid: number;
  ask: number;
  change: number;
  changePct: number;
  volume: number;
};

function buildInitialTradingRows(): TradingRow[] {
  return TRADING_SYMBOLS.map(({ symbol, name, base }) => ({
    symbol,
    name,
    ltp: base,
    bid: +(base - 0.05).toFixed(2),
    ask: +(base + 0.05).toFixed(2),
    change: 0,
    changePct: 0,
    volume: Math.floor(500_000 + Math.random() * 4_500_000),
  }));
}

function TradingGrid() {
  const [rows, setRows] = useState<TradingRow[]>(() => buildInitialTradingRows());
  const basePrices = useMemo(() => {
    const map = new Map<string, number>();
    TRADING_SYMBOLS.forEach((s) => map.set(s.symbol, s.base));
    return map;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRows((current) => {
        const updatesPerTick = Math.max(1, Math.floor(current.length * 0.4));
        const next = current.slice();
        for (let i = 0; i < updatesPerTick; i++) {
          const idx = Math.floor(Math.random() * next.length);
          const row = next[idx];
          const drift = (Math.random() - 0.5) * row.ltp * 0.004;
          const newLtp = +Math.max(0.01, row.ltp + drift).toFixed(2);
          const base = basePrices.get(row.symbol) ?? newLtp;
          const change = +(newLtp - base).toFixed(2);
          const changePct = +((change / base) * 100).toFixed(2);
          next[idx] = {
            ...row,
            ltp: newLtp,
            bid: +(newLtp - 0.05).toFixed(2),
            ask: +(newLtp + 0.05).toFixed(2),
            change,
            changePct,
            volume: row.volume + Math.floor(Math.random() * 5000),
          };
        }
        return next;
      });
    }, 600);
    return () => window.clearInterval(id);
  }, [basePrices]);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "symbol", key: "symbol", label: "Symbol", width: 90 },
    { colId: "name", key: "name", label: "Name", width: 180 },
    {
      colId: "ltp", key: "ltp", label: "LTP", width: 110,
      cellRenderer: ChangeFlashCellRenderer,
      cellRendererParams: { cellFlashDuration: 400, cellFadeDuration: 900 },
    },
    {
      colId: "bid", key: "bid", label: "Bid", width: 100,
      cellRenderer: ChangeFlashCellRenderer,
      cellRendererParams: { cellFlashDuration: 300, cellFadeDuration: 700 },
    },
    {
      colId: "ask", key: "ask", label: "Ask", width: 100,
      cellRenderer: ChangeFlashCellRenderer,
      cellRendererParams: { cellFlashDuration: 300, cellFadeDuration: 700 },
    },
    {
      colId: "change", key: "change", label: "Chg", width: 90,
      cellRenderer: ChangeFlashCellRenderer,
      cellRendererParams: {
        cellFlashDuration: 400,
        cellFadeDuration: 900,
        direction: (_prev: any, next: any) =>
          next > 0 ? "up" : next < 0 ? "down" : "neutral",
      },
    },
    {
      colId: "changePct", key: "changePct", label: "Chg %", width: 100,
      cellRenderer: ChangeFlashCellRenderer,
      cellRendererParams: {
        cellFlashDuration: 400,
        cellFadeDuration: 900,
        direction: (_prev: any, next: any) =>
          next > 0 ? "up" : next < 0 ? "down" : "neutral",
      },
    },
    { colId: "volume", key: "volume", label: "Volume", width: 120 },
  ], []);

  return (
    <GridReact
      data={rows}
      columnDefs={columnDefs}
      rowIdKey="symbol"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function App() {
  const [rowData, setRowData] = useState<any[]>([]);
  const [colDefs, setColDefs] = useState<ReactColDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(50000);
  const [toggle, setToggle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paginate, setPaginate] = useState(true);
  const [rowNumbers, setRowNumbers] = useState(false);
  const [rowModel, setRowModel] = useState<RowModelType>("clientSide");
  const [serverSideBlockSize, setServerSideBlockSize] = useState(100);
  const [themeId, setThemeId] = useState(themePresets[0].id);

  const applyDemoColumnConfig = (cols: ReactColDef[] = []) => {
    const currencyFormatter = (col: ReactColDef) => {
      if (col.type !== "currency") return;
      // col.valueFormatter = (params: ValueFormatterParams) => {
      //   if (typeof params.value === "number") {
      //     return round(params.value).toLocaleString("en-US", {
      //       style: "currency",
      //       currency: params.row?.currency || "USD",
      //     });
      //   }
      //   return params.value;
      // };
      col.formatterOptions = (params: FormatterOptionsParams) => ({
        currency: params.row?.currency || "USD",
        locale: "en-US",
      });
    };

    const formatApplier = (inputCols: ReactColDef[]) => {
      for (const col of inputCols) {
        currencyFormatter(col);
        if (col.children && col.children.length > 0) {
          formatApplier(col.children);
        }

        if (col.key == "fy2026") {
          col.filterParams = {
            maxFilterItems: 7,
            buttons: ["apply", "cancel", "clear", "reset"],
          }
        }

        if (col.key == "location") {
          col.cellRenderer = LocationCellRenderer;
        }
      }
    };

    formatApplier(cols);
    return cols;
  };

  const flattenServerFilters = (filters: IServerSideFilter[]): GridServerFilter[] => {
    return filters.flatMap((item) => {
      const mapped = item.filters.flatMap((filter) => {
        const values = Array.isArray(filter.values) ? filter.values : [filter.values];
        if (values.length === 0) return [];
        return values.map((value) => ({
          key: item.key,
          type: filter.type,
          value,
        }));
      });
      return item.join === "or" && mapped.length > 1 ? mapped.slice(0, 1) : mapped;
    });
  };

  const buildServerPayload = (
    request: Pick<IServerSideRequest, "filters" | "sorts" | "startRow" | "endRow">,
    extras: Pick<GridServerPayload, "aggregates"> = {},
  ): GridServerPayload => {
    const startRow = Math.max(0, request.startRow ?? 0);
    const endRow = Math.max(startRow + 1, request.endRow ?? startRow + 100);

    return {
      ...extras,
      start_row: startRow,
      end_row: endRow,
      filters: flattenServerFilters(request.filters),
      sorts: request.sorts,
    };
  };

  const serverSideDataSource = useMemo<IServerSideDataSource>(() => {
    const serverUrl = `${GRID_SERVER_URL}/agg/flat`;

    const fetchServer = async (payload: GridServerPayload) => {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Server-side fetch failed with status ${response.status}`);
      }
      return response.json();
    };

    return {
      getRows: async ({ request }) => {
        console.log("Server-side request", request);

        const payload = await fetchServer(buildServerPayload(request));
        const rows = payload?.data ?? [];
        const totalRows = payload?.totalRows ?? payload?.total ?? rows.length;

        return {
          rows,
          totalRows,
          columns: payload?.columns?.length ? applyDemoColumnConfig(payload.columns as ReactColDef[]) as ColDef[] : undefined,
          schemaVersion: payload?.schemaVersion,
        };
      },
      getAggregates: async ({ request }) => {
        console.log("Server-side aggregation request", request);

        const payload = await fetchServer(buildServerPayload(request, { aggregates: request.aggregates }));
        return { values: payload?.values ?? payload ?? {} };
      },
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      console.log("Are we here??");

      try {
        const response = await fetch(`${GRID_SERVER_URL}/agg/flat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page: 0,
            page_size: rowModel === "clientSide" ? count : 1,
          }),
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) return;

        applyDemoColumnConfig(payload.columns ?? []);

        payload.columns.forEach((col: ColDef) => {
          if (col.key == "department") {
            col.sortable = false;
            col.filter = "set";
            col.filterParams = {
              filterValues: (params) => {
                setTimeout(() => {
                  console.log("Loading filter values for department column", params);
                  params.success((payload.data ?? []).map((r: any) => r.department));
                }, 1000);
              }
            }
          }
          if (col.key == "country") col.filter = false;
          if (col.key == "location") {
            col.resizable = false;
            col.filter = "set";
          }
          if (col.key == "gl_account") col.movable = false;
          if (col.key == "business_unit") col.hideable = false;
        });

        setColDefs(payload.columns ?? []);
        setRowData(rowModel === "clientSide" ? payload.data ?? [] : []);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (rowModel == "clientSide") fetchData();

    return () => {
      cancelled = true;
    };
  }, [toggle, count, rowModel]);

  useEffect(() => {
    const themeClasses = themePresets.map((theme) => theme.className);
    const activeTheme = themePresets.find((theme) => theme.id === themeId) ?? themePresets[0];

    document.body.classList.remove(...themeClasses);
    document.body.classList.add(activeTheme.className);

    return () => {
      document.body.classList.remove(activeTheme.className);
    };
  }, [themeId]);

  const activeTheme = themePresets.find((theme) => theme.id === themeId) ?? themePresets[0];

  return (
    <div style={{ padding: "8px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <input type="number" value={count} min={1} max={100000} onChange={(e) => setCount(Number(e.target.value))} />
          <button className="btn" type="button" onClick={() => setToggle(!toggle)}>Fetch</button>
        </div>
        <button className="btn" type="button" onClick={() => setPaginate(!paginate)}>{paginate ? "Don't" : ""} Paginate</button>
        <button className="btn" type="button" onClick={() => setRowNumbers(!rowNumbers)}>
          {rowNumbers ? "Hide" : "Show"} Row Numbers
        </button>
        <button className="btn" type="button" onClick={() => setRowModel(rowModel === "clientSide" ? "serverSide" : "clientSide")}>
          Use {rowModel === "clientSide" ? "Server-side" : "Client-side"} Row Model
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label htmlFor="ssrm-block-size" style={{ fontSize: "13px" }}>SSRM block</label>
          <select id="ssrm-block-size" value={serverSideBlockSize} onChange={(e) => setServerSideBlockSize(Number(e.target.value))}>
            {[25, 50, 100, 250, 500].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label htmlFor="theme-select" style={{ fontSize: "13px" }}>Theme</label>
          <select id="theme-select" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            {themePresets.map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.label}</option>
            ))}
          </select>
        </div>
        {/* {loading && <div>Loading data…</div>} */}
        {error && <div style={{ color: "red" }}>Error: {error}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ flex: 1, minHeight: 0 }}>
        <GridReact
          key={`${rowModel}-${serverSideBlockSize}-${rowNumbers ? "row-numbers" : "no-row-numbers"}`}
          data={rowData}
          columnDefs={colDefs}
          className={activeTheme.className}
          style={{ width: "100%", height: "100%" }}
          loading={loading}
          pagination={paginate}
          rowNumbers={rowNumbers}
          rowModelType={rowModel}
          serverSideDataSource={serverSideDataSource}
          serverSideAggregationSource={serverSideDataSource.getAggregates}
          serverSideBlockSize={serverSideBlockSize}
          pageSize={100}
          pageSizes={[25, 50, 100, 250, 500, 1000]}
        />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <strong style={{ fontSize: "13px" }}>Trading terminal</strong>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            (live tick simulation — green/red flashes show up/down LTP, bid, ask, change moves)
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }} className={activeTheme.className}>
          <TradingGrid />
        </div>
      </div>
    </div>
  );
}

export default App;
