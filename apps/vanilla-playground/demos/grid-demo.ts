import {
  ChangeFlashCellRenderer,
  type CellRendererParams,
  type ColDef,
  type ColumnPanelTrigger,
  type FormatterOptionsParams,
  type GroupDisplayType,
  type IServerSideDataSource,
  type IServerSideFilter,
  type IServerSideRequest,
  type RowModelType,
} from "@grid";

import { btn, field, h, numberInput, select, toolbarRow } from "../dom";
import { mountGrid, type MountedGrid } from "../demoGrid";

/**
 * The original playground page: a schema-driven grid fed by the local dev data server, plus a live
 * "trading terminal" below it streaming through applyTransaction.
 *
 * The top grid needs the dev server on http://localhost:8008 (same as the React and Angular
 * playgrounds). Without it the grid shows the fetch error and stays empty; every other demo in this
 * playground is self-contained.
 */

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

function locationCellRenderer(params: CellRendererParams): HTMLElement | null {
  const city = String(params.valueFormatted ?? params.value ?? "");
  if (!city) return null;

  const meta = getCityMeta(city);
  return h("span", { class: `location-cell location-cell-${meta.tone}`, title: `${city} · ${meta.region}` },
    h("span", { class: "location-cell-mark", "aria-hidden": "true" },
      h("span"), h("span"), h("span"),
    ),
    h("span", { class: "location-cell-main" },
      h("span", { class: "location-cell-city", text: city }),
      h("span", { class: "location-cell-region", text: meta.region }),
    ),
    h("span", { class: "location-cell-code", text: meta.icon }),
  );
}

// ── The trading terminal ────────────────────────────────────────────────────────────────────────

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

// Extra symbols that aren't seeded initially — the "Add symbol" button streams these in via
// applyTransaction so you can watch a brand-new row appear without a full data reload.
const EXTRA_SYMBOLS = [
  { symbol: "IBM", name: "IBM Corp.", base: 168.90 },
  { symbol: "QCOM", name: "Qualcomm Inc.", base: 171.44 },
  { symbol: "AVGO", name: "Broadcom Inc.", base: 1342.10 },
  { symbol: "TXN", name: "Texas Instruments", base: 196.33 },
  { symbol: "MU", name: "Micron Technology", base: 118.72 },
  { symbol: "SNOW", name: "Snowflake Inc.", base: 128.51 },
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

function makeRow(symbol: string, name: string, base: number): TradingRow {
  return {
    symbol,
    name,
    ltp: base,
    bid: +(base - 0.05).toFixed(2),
    ask: +(base + 0.05).toFixed(2),
    change: 0,
    changePct: 0,
    volume: Math.floor(500_000 + Math.random() * 4_500_000),
  };
}

const flashDirection = (_prev: unknown, next: unknown) =>
  Number(next) > 0 ? "up" : Number(next) < 0 ? "down" : "neutral";

const TRADING_COLUMNS: ColDef[] = [
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
    cellRendererParams: { cellFlashDuration: 400, cellFadeDuration: 900, direction: flashDirection },
  },
  {
    colId: "changePct", key: "changePct", label: "Chg %", width: 100,
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { cellFlashDuration: 400, cellFadeDuration: 900, direction: flashDirection },
  },
  { colId: "volume", key: "volume", label: "Volume", width: 120 },
];

/**
 * Initial rows are handed to the grid exactly ONCE. Every subsequent change is streamed through
 * api.applyTransaction — no full setRowData, so edit history is kept and only the touched cells
 * repaint (which is what lets ChangeFlashCellRenderer flash deltas).
 */
function mountTradingGrid(container: HTMLElement): () => void {
  const rows = new Map<string, TradingRow>(
    TRADING_SYMBOLS.map(({ symbol, name, base }) => [symbol, makeRow(symbol, name, base)]),
  );
  const basePrices = new Map<string, number>(
    [...TRADING_SYMBOLS, ...EXTRA_SYMBOLS].map(s => [s.symbol, s.base]),
  );

  let streaming = true;
  let nextExtraIdx = 0;
  let tickTimer: number | null = null;

  const host = h("div", { style: { flex: "1", minHeight: "0" } });
  const countLabel = h("span", { style: { fontSize: "12px", color: "#6b7280" } });
  const streamButton = btn("Pause ticks", () => {
    streaming = !streaming;
    streamButton.textContent = `${streaming ? "Pause" : "Resume"} ticks`;
    restartTicker();
  });

  container.appendChild(h("div", {
    style: { display: "flex", flexDirection: "column", gap: "6px", height: "100%", minHeight: "0" },
  },
    h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
      streamButton,
      btn("Add symbol", addSymbol),
      btn("Remove last", removeLast),
      countLabel,
    ),
    host,
  ));

  const grid = mountGrid(host, {
    rowData: [...rows.values()],
    columnDefs: TRADING_COLUMNS,
    rowIdKey: "symbol",
  });

  restartTicker();
  renderCount();

  function restartTicker(): void {
    if (tickTimer !== null) window.clearInterval(tickTimer);
    tickTimer = null;
    if (!streaming) return;
    tickTimer = window.setInterval(() => {
      const symbols = [...rows.keys()];
      if (symbols.length === 0) return;

      const updatesPerTick = Math.max(1, Math.floor(symbols.length * 0.4));
      const update: { rowId: string; row: TradingRow }[] = [];
      const touched = new Set<string>();
      for (let i = 0; i < updatesPerTick; i++) {
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        if (touched.has(symbol)) continue;
        touched.add(symbol);
        const row = rows.get(symbol)!;
        const drift = (Math.random() - 0.5) * row.ltp * 0.004;
        const newLtp = +Math.max(0.01, row.ltp + drift).toFixed(2);
        const base = basePrices.get(symbol) ?? newLtp;
        const change = +(newLtp - base).toFixed(2);
        const changePct = +((change / base) * 100).toFixed(2);
        const nextRow: TradingRow = {
          ...row,
          ltp: newLtp,
          bid: +(newLtp - 0.05).toFixed(2),
          ask: +(newLtp + 0.05).toFixed(2),
          change,
          changePct,
          volume: row.volume + Math.floor(Math.random() * 5000),
        };
        rows.set(symbol, nextRow);
        update.push({ rowId: symbol, row: nextRow });
      }

      if (update.length > 0) grid.api.applyTransaction({ update });
    }, 300);
  }

  function addSymbol(): void {
    // Find the next extra symbol not already present.
    for (let n = 0; n < EXTRA_SYMBOLS.length; n++) {
      const idx = (nextExtraIdx + n) % EXTRA_SYMBOLS.length;
      const { symbol, name, base } = EXTRA_SYMBOLS[idx];
      if (rows.has(symbol)) continue;
      const row = makeRow(symbol, name, base);
      rows.set(symbol, row);
      nextExtraIdx = idx + 1;
      grid.api.applyTransaction({ add: [row] });
      renderCount();
      return;
    }
  }

  function removeLast(): void {
    const symbols = [...rows.keys()];
    if (symbols.length === 0) return;
    const symbol = symbols[symbols.length - 1];
    rows.delete(symbol);
    grid.api.applyTransaction({ remove: [symbol] });
    renderCount();
  }

  function renderCount(): void {
    countLabel.textContent =
      `${rows.size} rows · streaming via applyTransaction (add / update / remove)`;
  }

  return () => {
    if (tickTimer !== null) window.clearInterval(tickTimer);
    grid.destroy();
  };
}

// ── The server-backed grid ──────────────────────────────────────────────────────────────────────

function applyDemoColumnConfig(cols: ColDef[] = []): ColDef[] {
  const currencyFormatter = (col: ColDef) => {
    if (col.type !== "currency") return;
    col.formatterOptions = (params: FormatterOptionsParams) => ({
      currency: params.row?.currency || "USD",
      locale: "en-US",
    });
  };

  const formatApplier = (inputCols: ColDef[]) => {
    for (const col of inputCols) {
      currencyFormatter(col);
      if (col.children && col.children.length > 0) formatApplier(col.children);

      if (col.key === "fy2026") {
        col.filterParams = {
          maxNumConditions: 7,
          buttons: ["apply", "cancel", "clear", "reset"],
        };
      }

      if (col.key === "location") col.cellRenderer = locationCellRenderer;
    }
  };

  formatApplier(cols);
  return cols;
}

function flattenServerFilters(filters: IServerSideFilter[]): GridServerFilter[] {
  return filters.flatMap(item => {
    const mapped = item.filters.flatMap(filter => {
      const values = Array.isArray(filter.values) ? filter.values : [filter.values];
      if (values.length === 0) return [];
      return values.map(value => ({ key: item.key, type: filter.type, value }));
    });
    return item.join === "or" && mapped.length > 1 ? mapped.slice(0, 1) : mapped;
  });
}

function buildServerPayload(
  request: Pick<IServerSideRequest, "filters" | "sorts" | "startRow" | "endRow">,
  extras: Pick<GridServerPayload, "aggregates"> = {},
): GridServerPayload {
  const startRow = Math.max(0, request.startRow ?? 0);
  const endRow = Math.max(startRow + 1, request.endRow ?? startRow + 100);

  return {
    ...extras,
    start_row: startRow,
    end_row: endRow,
    filters: flattenServerFilters(request.filters),
    sorts: request.sorts,
  };
}

async function fetchServer(payload: GridServerPayload): Promise<any> {
  const response = await fetch(`${GRID_SERVER_URL}/agg/flat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Server-side fetch failed with status ${response.status}`);
  return response.json();
}

const serverSideDataSource: IServerSideDataSource = {
  getRows: async ({ request }) => {
    console.log("Server-side request", request);

    const payload = await fetchServer(buildServerPayload(request));
    const rows = payload?.data ?? [];
    const totalRows = payload?.totalRows ?? payload?.total ?? rows.length;

    return {
      rows,
      totalRows,
      columns: payload?.columns?.length
        ? applyDemoColumnConfig(payload.columns as ColDef[])
        : undefined,
      schemaVersion: payload?.schemaVersion,
    };
  },
  getAggregates: async ({ request }) => {
    console.log("Server-side aggregation request", request);

    const payload = await fetchServer(buildServerPayload(request, { aggregates: request.aggregates }));
    return { values: payload?.values ?? payload ?? {} };
  },
};

export function mountGridDemo(container: HTMLElement): () => void {
  let count = 50000;
  let paginate = true;
  let rowNumbers = false;
  let rowModel: RowModelType = "clientSide";
  let serverSideBlockSize = 100;
  let themeId = themePresets[0].id;
  let groupDisplayType: GroupDisplayType = "singleColumn";
  let columnPanelTrigger: ColumnPanelTrigger = "rail";
  let colDefs: ColDef[] = [];
  let rowData: unknown[] = [];
  let grid: MountedGrid;
  let fetchToken = 0;
  let disposed = false;

  const host = h("div", { style: { width: "100%", height: "100%" } });
  const errorBox = h("div", { style: { color: "red" } });
  const groupBySelect = select([{ value: "", label: "(none)" }], "", value => {
    grid.api.dispatch({ type: "rowGroupSet", colIds: value ? [value] : [] });
  });

  const countInput = numberInput(count, value => { count = Number(value); }, { min: 1, max: 100000 });
  const paginateButton = btn("Don't Paginate", () => {
    paginate = !paginate;
    paginateButton.textContent = `${paginate ? "Don't " : ""}Paginate`;
    grid.renderer.togglePagination(paginate);
  });
  const rowNumbersButton = btn("Show Row Numbers", () => {
    rowNumbers = !rowNumbers;
    rowNumbersButton.textContent = `${rowNumbers ? "Hide" : "Show"} Row Numbers`;
    // The row-number utility column is part of the grid's structure, so it rebuilds the instance
    // (the React demo keys its <Grid> on the same flag).
    rebuild();
  });
  const rowModelButton = btn("Use Server-side Row Model", () => {
    rowModel = rowModel === "clientSide" ? "serverSide" : "clientSide";
    rowModelButton.textContent = `Use ${rowModel === "clientSide" ? "Server-side" : "Client-side"} Row Model`;
    groupControls.style.display = rowModel === "clientSide" ? "flex" : "none";
    rebuild();
    if (rowModel === "clientSide") void fetchData();
  });

  const groupControls = h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
    field("Group display", select(
      [
        { value: "singleColumn", label: "Single column" },
        { value: "multipleColumns", label: "Multiple columns" },
        { value: "groupRows", label: "Group rows" },
      ],
      groupDisplayType,
      value => {
        groupDisplayType = value as GroupDisplayType;
        grid.core.setGroupDisplayType(groupDisplayType);
      },
    )),
    field("Group by", groupBySelect),
  );

  const tradingHost = h("div", { style: { flex: "1", minHeight: "0" } });

  container.appendChild(h("div", {
    style: {
      padding: "8px", height: "100%", boxSizing: "border-box", display: "flex",
      flexDirection: "column", gap: "8px",
    },
  },
    toolbarRow(
      h("div", { style: { display: "flex", gap: "12px" } }, countInput, btn("Fetch", () => void fetchData())),
      paginateButton,
      rowNumbersButton,
      rowModelButton,
      field("SSRM block", select([25, 50, 100, 250, 500], serverSideBlockSize, value => {
        serverSideBlockSize = Number(value);
        rebuild();
      })),
      field("Theme", select(
        themePresets.map(theme => ({ value: theme.id, label: theme.label })),
        themeId,
        value => {
          themeId = value;
          applyThemeClass();
        },
      )),
      field("Columns trigger", select(
        [
          { value: "rail", label: "Rail" },
          { value: "header", label: "Header" },
          { value: "menu", label: "Column menu" },
          { value: "footer", label: "Footer" },
          { value: "toolbar", label: "Toolbar" },
        ],
        columnPanelTrigger,
        value => {
          columnPanelTrigger = value as ColumnPanelTrigger;
          grid.renderer.setColumnPanelOptions({ trigger: columnPanelTrigger });
        },
      )),
      groupControls,
      errorBox,
    ),
    h("div", {
      style: { flex: "1", minHeight: "0", display: "flex", flexDirection: "column", gap: "8px" },
    },
      h("div", { style: { flex: "1", minHeight: "0" } }, host),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
        h("strong", { text: "Trading terminal", style: { fontSize: "13px" } }),
        h("span", {
          style: { fontSize: "12px", color: "#6b7280" },
          text: "(live applyTransaction stream — green/red flashes show up/down LTP, bid, ask, change"
            + " moves; use Add / Remove to stream structural changes)",
        }),
      ),
      tradingHost,
    ),
  ));

  applyThemeClass();
  build();
  const disposeTrading = mountTradingGrid(tradingHost);
  void fetchData();

  function build(): void {
    grid = mountGrid(host, {
      rowData,
      columnDefs: colDefs,
      pagination: paginate,
      rowNumbers,
      rowModelType: rowModel,
      groupDisplayType,
      quickFilter: true,
      columnPanel: { trigger: columnPanelTrigger },
      serverSideDataSource,
      serverSideAggregationSource: serverSideDataSource.getAggregates,
      serverSideBlockSize,
      pageSize: 100,
      pageSizes: [25, 50, 100, 250, 500, 1000],
    });
    setLoading(rowModel === "clientSide" && rowData.length === 0);
  }

  function rebuild(): void {
    grid.destroy();
    host.replaceChildren();
    build();
  }

  function setLoading(loading: boolean): void {
    grid.core.dispatch({ type: "overlayShow", overlayType: loading ? "loading" : "none" });
  }

  async function fetchData(): Promise<void> {
    if (rowModel !== "clientSide") return;
    const token = ++fetchToken;
    errorBox.textContent = "";
    setLoading(true);

    try {
      const payload = await fetchServer({ page: 0, page_size: count });
      if (token !== fetchToken || disposed) return;

      const columns: ColDef[] = payload.columns ?? [];
      applyDemoColumnConfig(columns);

      for (const col of columns) {
        if (col.key === "department") {
          col.sortable = false;
          col.filter = "set";
          col.filterParams = {
            filterValues: params => {
              setTimeout(() => {
                console.log("Loading filter values for department column", params);
                params.success((payload.data ?? []).map((r: any) => r.department));
              }, 1000);
            },
          };
        }
        if (col.key === "country") col.filter = false;
        if (col.key === "location") {
          col.resizable = false;
          col.filter = "set";
        }
        if (col.key === "gl_account") col.movable = false;
        if (col.key === "business_unit") col.hideable = false;
      }

      colDefs = columns;
      rowData = payload.data ?? [];
      grid.core.setColumnDefsFromProps(colDefs);
      grid.api.setRowData(rowData as any[]);
      renderGroupByOptions();
    } catch (err) {
      if (token !== fetchToken || disposed) return;
      errorBox.textContent = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
    } finally {
      if (token === fetchToken && !disposed) setLoading(false);
    }
  }

  function renderGroupByOptions(): void {
    const previous = groupBySelect.value;
    groupBySelect.replaceChildren(h("option", { value: "", text: "(none)" }));
    for (const col of colDefs) {
      if (!col.key || col.children?.length) continue;
      groupBySelect.appendChild(h("option", {
        value: col.colId ?? col.key,
        text: col.label ?? col.key,
      }));
    }
    groupBySelect.value = previous;
  }

  function applyThemeClass(): void {
    const classNames = themePresets.map(theme => theme.className);
    const active = themePresets.find(theme => theme.id === themeId) ?? themePresets[0];
    document.body.classList.remove(...classNames);
    document.body.classList.add(active.className);
  }

  return () => {
    disposed = true;
    document.body.classList.remove(...themePresets.map(theme => theme.className));
    disposeTrading();
    grid.destroy();
  };
}
