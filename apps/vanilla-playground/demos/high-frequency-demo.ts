import {
  ChangeFlashCellRenderer,
  SparklineRenderer,
  createGrid,
  type CellRendererParams,
  type ColDef,
  type SparklineParams,
  type SparklineTooltipValueFormatterParams,
} from "@grid";

import { btn, field, h, select } from "../dom";

type MarketRow = {
  symbol: string;
  venue: string;
  sector: string;
  open: number;
  price: number;
  bid: number;
  ask: number;
  change: number;
  changePct: number;
  volume: number;
  trades: number;
  ltpHistory: number[];
};

const SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK.B",
  "AVGO", "LLY", "JPM", "V", "UNH", "XOM", "MA", "COST",
  "HD", "PG", "JNJ", "ORCL", "ABBV", "BAC", "KO", "MRK",
  "NFLX", "CRM", "AMD", "CVX", "PEP", "TMO", "ADBE", "WMT",
  "LIN", "MCD", "CSCO", "ACN", "ABT", "QCOM", "IBM", "GE",
  "CAT", "INTU", "NOW", "AMAT", "TXN", "ISRG", "UBER", "BKNG",
];
const SECTORS = ["Technology", "Financials", "Consumer", "Health care", "Industrials", "Energy"];

function buildRows(): MarketRow[] {
  return SYMBOLS.map((symbol, index) => {
    const open = +(38 + ((index * 47) % 520) + (index % 7) * 0.37).toFixed(2);
    const ltpHistory = Array.from({ length: 20 }, (_, sample) => +(
      open * (1 + Math.sin((index + sample) * 0.73) * 0.002 + (sample - 10) * 0.00005)
    ).toFixed(2));
    const price = ltpHistory[ltpHistory.length - 1];
    const change = +(price - open).toFixed(2);
    return {
      symbol,
      venue: index % 3 === 0 ? "NYSE" : "NASDAQ",
      sector: SECTORS[index % SECTORS.length],
      open,
      price,
      bid: +(price - 0.02).toFixed(2),
      ask: +(price + 0.02).toFixed(2),
      change,
      changePct: +((change / open) * 100).toFixed(2),
      volume: 100_000 + index * 31_337,
      trades: 2_000 + index * 97,
      ltpHistory,
    };
  });
}

function nextQuote(row: MarketRow): MarketRow {
  const movement = (Math.random() - 0.49) * Math.max(0.04, row.price * 0.0016);
  const price = +Math.max(0.01, row.price + movement).toFixed(2);
  const spread = Math.max(0.01, +(price * 0.00012).toFixed(2));
  const change = +(price - row.open).toFixed(2);
  return {
    ...row,
    price,
    bid: +(price - spread).toFixed(2),
    ask: +(price + spread).toFixed(2),
    change,
    changePct: +((change / row.open) * 100).toFixed(2),
    volume: row.volume + 10 + Math.floor(Math.random() * 900),
    trades: row.trades + 1 + Math.floor(Math.random() * 8),
    ltpHistory: [...row.ltpHistory.slice(-19), price],
  };
}

const priceFormatter = ({ value }: { value: unknown }) =>
  typeof value === "number" ? value.toFixed(2) : "";
const integerFormatter = ({ value }: { value: unknown }) =>
  typeof value === "number" ? value.toLocaleString("en-US") : "";
const direction = (_previous: unknown, next: unknown) =>
  typeof next === "number" && next > 0 ? "up" : typeof next === "number" && next < 0 ? "down" : "neutral";

const LOGO_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#0891b2", "#4f46e5"];

function logoColor(symbol: string): string {
  const hash = [...symbol].reduce((total, character) => total + character.charCodeAt(0), 0);
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

function symbolCellRenderer({ value }: CellRendererParams): HTMLElement {
  const symbol = String(value ?? "");
  return h("span", { class: "market-symbol" },
    h("span", {
      class: "market-logo",
      "aria-hidden": "true",
      text: symbol.replace(/[^A-Z]/g, "").slice(0, 2),
      style: { background: logoColor(symbol) },
    }),
    h("strong", { text: symbol }),
  );
}

const sparklineParams: SparklineParams = {
  type: "line",
  showPoints: false,
  tooltipValueFormatter: ({ xValue, yValue }: SparklineTooltipValueFormatterParams) =>
    `${String(xValue)}: $${yValue.toFixed(2)}`,
};

const COLUMNS: ColDef[] = [
  {
    colId: "symbol", key: "symbol", label: "Symbol", width: 124, pinned: "left",
    cellRenderer: symbolCellRenderer,
  },
  { colId: "venue", key: "venue", label: "Venue", width: 92 },
  { colId: "sector", key: "sector", label: "Sector", width: 125 },
  {
    colId: "price", key: "price", label: "Last", width: 104, valueFormatter: priceFormatter,
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { cellFlashDuration: 120, cellFadeDuration: 260 },
  },
  {
    colId: "bid", key: "bid", label: "Bid", width: 96, valueFormatter: priceFormatter,
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { cellFlashDuration: 100, cellFadeDuration: 220 },
  },
  {
    colId: "ask", key: "ask", label: "Ask", width: 96, valueFormatter: priceFormatter,
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { cellFlashDuration: 100, cellFadeDuration: 220 },
  },
  {
    colId: "change", key: "change", label: "Change", width: 100, valueFormatter: priceFormatter,
    cellClass: ({ value }) => typeof value === "number" && value < 0 ? "market-down" : "market-up",
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { direction, cellFlashDuration: 140, cellFadeDuration: 300 },
  },
  {
    colId: "changePct", key: "changePct", label: "Change %", width: 105, sort: "desc",
    valueFormatter: ({ value }) => typeof value === "number" ? `${value.toFixed(2)}%` : "",
    cellClass: ({ value }) => typeof value === "number" && value < 0 ? "market-down" : "market-up",
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { direction, cellFlashDuration: 140, cellFadeDuration: 300 },
  },
  {
    colId: "ltpHistory", label: "Last 20 LTPs", width: 185,
    sortable: false, filter: false, groupable: false, aggregatable: false,
    valueGetter: row => (row.data as MarketRow).ltpHistory.map((price, index) => [
      index === 19 ? "Latest" : `T-${19 - index}`,
      price,
    ] as const),
    cellRenderer: SparklineRenderer,
    cellRendererParams: sparklineParams,
    headerTooltip: "Rolling series of the latest 20 last-traded prices.",
  },
  { colId: "volume", key: "volume", label: "Volume", width: 122, valueFormatter: integerFormatter },
  { colId: "trades", key: "trades", label: "Trades", width: 105, valueFormatter: integerFormatter },
];

export function mountHighFrequencyDemo(container: HTMLElement): () => void {
  const initialRows = buildRows();
  const rows = new Map(initialRows.map(row => [row.symbol, row]));

  let streaming = true;
  let rate = 1_200;
  let submitted = 0;
  let settled = 0;
  let pending = 0;
  let feedTimer: number | null = null;

  const host = h("div", { class: "high-frequency-grid" });
  const stats = h("div", { class: "high-frequency-stats", "aria-live": "polite" });
  const feedButton = btn("Pause feed", () => {
    if (streaming) api.flushAsyncTransactions();
    streaming = !streaming;
    feedButton.textContent = streaming ? "Pause feed" : "Resume feed";
    restartFeed();
  });

  container.appendChild(h("section", { class: "high-frequency-demo" },
    h("header", { class: "high-frequency-header" },
      h("div", null,
        h("span", { class: "high-frequency-eyebrow", text: "Async transaction batching" }),
        h("h2", { text: "Live market tracker" }),
        h("p", {
          text: "Every quote is submitted as its own transaction. A 32 ms window coalesces the stream"
            + " into one filter, sort, model, and render pass per batch.",
        }),
      ),
      stats,
    ),
    h("div", { class: "high-frequency-controls" },
      feedButton,
      h("label", null, "Update rate", select(
        [
          { value: 300, label: "300 / second" },
          { value: 1200, label: "1,200 / second" },
          { value: 3000, label: "3,000 / second" },
        ],
        rate,
        value => {
          rate = Number(value);
          restartFeed();
        },
      )),
      btn("Flush now", () => api.flushAsyncTransactions()),
      h("code", { text: "applyTransactionAsync · asyncTransactionWaitMs=32" }),
    ),
    host,
  ));

  const api = createGrid(host, {
    rowData: initialRows,
    columnDefs: COLUMNS,
    rowIdKey: "symbol",
    asyncTransactionWaitMs: 32,
    rowHover: true,
    zebraRows: true,
    tooltip: { showDelay: 0, hideDelay: 50 },
  });

  const PULSES_PER_SECOND = 50;
  restartFeed();
  renderStats();

  let previousSubmitted = 0;
  let previousSettled = 0;
  const statsTimer = window.setInterval(() => {
    // Both counters are sampled twice a second, so the delta doubles into a per-second rate.
    const submittedRate = (submitted - previousSubmitted) * 2;
    const settledRate = (settled - previousSettled) * 2;
    previousSubmitted = submitted;
    previousSettled = settled;
    renderStats(submittedRate, settledRate);
  }, 500);

  function restartFeed(): void {
    if (feedTimer !== null) window.clearInterval(feedTimer);
    feedTimer = null;
    if (!streaming) return;
    feedTimer = window.setInterval(() => {
      const updatesThisPulse = Math.max(1, Math.round(rate / PULSES_PER_SECOND));
      for (let index = 0; index < updatesThisPulse; index++) {
        const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const row = nextQuote(rows.get(symbol)!);
        rows.set(symbol, row);
        submitted++;
        pending++;
        void api.applyTransactionAsync({ update: [{ rowId: symbol, row }] }).then(() => {
          settled++;
          pending--;
        });
      }
    }, 1_000 / PULSES_PER_SECOND);
  }

  function renderStats(submittedRate = 0, settledRate = 0): void {
    const stat = (value: string, label: string) =>
      h("span", null, h("strong", { text: value }), ` ${label}`);
    stats.replaceChildren(
      stat(submittedRate.toLocaleString(), "submitted/s"),
      stat(settledRate.toLocaleString(), "settled/s"),
      stat(String(pending), "pending"),
    );
  }

  return () => {
    if (feedTimer !== null) window.clearInterval(feedTimer);
    window.clearInterval(statsTimer);
    api.destroy();
  };
}
