import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChangeFlashCellRenderer,
  Grid,
  SparklineRenderer,
  type CellRendererParams,
  type IGridAPI,
  type IRowNode,
  type ReactColDef,
} from "@agility-workbench/react-grid";
import { brandTheme } from "../gridTheme";
import { ShowcaseFrame, showcaseButtonClass } from "./ShowcaseFrame";
import styles from "./TradingDesk.module.css";

/** `CellClassArgs` is not exported by the package; a cellClass callback only needs the value. */
type CellClassArgs = { value: unknown };

type Quote = {
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
  history: number[];
};

const SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO",
  "JPM", "V", "UNH", "XOM", "MA", "COST", "HD", "PG",
  "ORCL", "BAC", "KO", "MRK", "NFLX", "CRM", "AMD", "CVX",
  "PEP", "ADBE", "WMT", "MCD", "CSCO", "QCOM", "IBM", "CAT",
];
const SECTORS = ["Technology", "Financials", "Consumer", "Health care", "Industrials", "Energy"];
const LOGO_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#0891b2", "#4f46e5"];

const HISTORY_LENGTH = 20;

function buildQuotes(): Quote[] {
  return SYMBOLS.map((symbol, index) => {
    const open = +(38 + ((index * 47) % 520) + (index % 7) * 0.37).toFixed(2);
    const history = Array.from({ length: HISTORY_LENGTH }, (_, sample) =>
      +(open * (1 + Math.sin((index + sample) * 0.73) * 0.002 + (sample - 10) * 0.00005)).toFixed(2));
    const price = history[history.length - 1];
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
      history,
    };
  });
}

function nextQuote(quote: Quote): Quote {
  const movement = (Math.random() - 0.49) * Math.max(0.04, quote.price * 0.0016);
  const price = +Math.max(0.01, quote.price + movement).toFixed(2);
  const spread = Math.max(0.01, +(price * 0.00012).toFixed(2));
  const change = +(price - quote.open).toFixed(2);
  return {
    ...quote,
    price,
    bid: +(price - spread).toFixed(2),
    ask: +(price + spread).toFixed(2),
    change,
    changePct: +((change / quote.open) * 100).toFixed(2),
    volume: quote.volume + 10 + Math.floor(Math.random() * 900),
    trades: quote.trades + 1 + Math.floor(Math.random() * 8),
    history: [...quote.history.slice(1 - HISTORY_LENGTH), price],
  };
}

const price2 = ({ value }: { value: unknown }) => typeof value === "number" ? value.toFixed(2) : "";
const integer = ({ value }: { value: unknown }) => typeof value === "number" ? value.toLocaleString("en-US") : "";
const percent = ({ value }: { value: unknown }) => typeof value === "number" ? `${value.toFixed(2)}%` : "";
const signClass = ({ value }: CellClassArgs) =>
  typeof value === "number" && value < 0 ? styles.down : styles.up;

/** `ChangeFlashCellRenderer` colors the flash by what this returns, not by the delta. */
const flashBySign = (_previous: unknown, next: unknown) =>
  typeof next === "number" && next > 0 ? "up" : typeof next === "number" && next < 0 ? "down" : "neutral";

function SymbolCell({ value }: CellRendererParams) {
  const symbol = String(value ?? "");
  const hash = [...symbol].reduce((total, character) => total + character.charCodeAt(0), 0);
  return (
    <span className={styles.symbol}>
      <span className={styles.logo} style={{ background: LOGO_COLORS[hash % LOGO_COLORS.length] }} aria-hidden="true">
        {symbol.slice(0, 2)}
      </span>
      <strong>{symbol}</strong>
    </span>
  );
}

const columnDefs: ReactColDef[] = [
  { colId: "symbol", key: "symbol", label: "Symbol", width: 128, pinned: "left", cellRenderer: SymbolCell },
  { colId: "venue", key: "venue", label: "Venue", width: 96 },
  { colId: "sector", key: "sector", label: "Sector", width: 128, filter: "set" },
  {
    colId: "price", key: "price", label: "Last", width: 104, valueFormatter: price2,
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { cellFlashDuration: 120, cellFadeDuration: 260 },
  },
  {
    colId: "bid", key: "bid", label: "Bid", width: 96, valueFormatter: price2,
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { cellFlashDuration: 100, cellFadeDuration: 220 },
  },
  {
    colId: "ask", key: "ask", label: "Ask", width: 96, valueFormatter: price2,
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { cellFlashDuration: 100, cellFadeDuration: 220 },
  },
  {
    colId: "change", key: "change", label: "Change", width: 102, valueFormatter: price2, cellClass: signClass,
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { direction: flashBySign, cellFlashDuration: 140, cellFadeDuration: 300 },
  },
  {
    colId: "changePct", key: "changePct", label: "Change %", width: 110, sort: "desc",
    valueFormatter: percent, cellClass: signClass,
    cellRenderer: ChangeFlashCellRenderer,
    cellRendererParams: { direction: flashBySign, cellFlashDuration: 140, cellFadeDuration: 300 },
  },
  {
    colId: "history", label: "Last 20 ticks", width: 180,
    sortable: false, filter: false, groupable: false, aggregatable: false, exportable: false,
    valueGetter: (node: IRowNode) => (node.data as Quote).history.map((price, index) =>
      [index === HISTORY_LENGTH - 1 ? "Latest" : `T-${HISTORY_LENGTH - 1 - index}`, price] as const),
    cellRenderer: SparklineRenderer,
    cellRendererParams: {
      type: "line",
      tooltipValueFormatter: ({ xValue, yValue }) => `${String(xValue)}: $${yValue.toFixed(2)}`,
    },
    headerTooltip: "A rolling window of the last twenty traded prices, redrawn from the stream.",
  },
  { colId: "volume", key: "volume", label: "Volume", width: 118, valueFormatter: integer },
  { colId: "trades", key: "trades", label: "Trades", width: 100, valueFormatter: integer },
];

const PULSES_PER_SECOND = 50;

export function TradingDeskDemo() {
  const initialQuotes = useMemo(buildQuotes, []);
  const quotesRef = useRef(new Map(initialQuotes.map((quote) => [quote.symbol, quote])));
  const apiRef = useRef<IGridAPI | null>(null);
  const submittedRef = useRef(0);
  const settledRef = useRef(0);
  const pendingRef = useRef(0);
  const [streaming, setStreaming] = useState(true);
  const [rate, setRate] = useState(1_200);
  const [stats, setStats] = useState({ submitted: 0, settled: 0, pending: 0 });

  // One transaction per quote. `asyncTransactionWaitMs` coalesces whatever arrived inside the
  // window into a single filter, sort, model, and render pass.
  useEffect(() => {
    if (!streaming) return;
    const perPulse = Math.max(1, Math.round(rate / PULSES_PER_SECOND));
    const intervalId = window.setInterval(() => {
      const api = apiRef.current;
      if (!api) return;
      for (let index = 0; index < perPulse; index++) {
        const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const quote = nextQuote(quotesRef.current.get(symbol)!);
        quotesRef.current.set(symbol, quote);
        submittedRef.current++;
        pendingRef.current++;
        void api.applyTransactionAsync({ update: [{ rowId: symbol, row: quote }] }).then(() => {
          settledRef.current++;
          pendingRef.current--;
        });
      }
    }, 1_000 / PULSES_PER_SECOND);
    return () => window.clearInterval(intervalId);
  }, [rate, streaming]);

  // Sampled twice a second and doubled, so the headline numbers read per second.
  useEffect(() => {
    let previousSubmitted = 0;
    let previousSettled = 0;
    const intervalId = window.setInterval(() => {
      const submitted = submittedRef.current;
      const settled = settledRef.current;
      setStats({
        submitted: (submitted - previousSubmitted) * 2,
        settled: (settled - previousSettled) * 2,
        pending: pendingRef.current,
      });
      previousSubmitted = submitted;
      previousSettled = settled;
    }, 500);
    return () => window.clearInterval(intervalId);
  }, []);

  const toggleStreaming = () => {
    if (streaming) apiRef.current?.flushAsyncTransactions();
    setStreaming((value) => !value);
  };

  return (
    <ShowcaseFrame
      kicker="Streaming · async transactions"
      title="Trading desk"
      hint="Thirty-two symbols under a live quote feed. Sort, filter, and group while it runs — the sort is honoured on every batch, so rows reorder under the stream."
      stats={[
        { label: "submitted/s", value: stats.submitted.toLocaleString() },
        { label: "settled/s", value: stats.settled.toLocaleString() },
        { label: "pending", value: String(stats.pending) },
      ]}
      controls={
        <>
          <button className={showcaseButtonClass} type="button" onClick={toggleStreaming}>
            {streaming ? "Pause feed" : "Resume feed"}
          </button>
          <label>
            Rate
            <select value={rate} onChange={(event) => setRate(Number(event.target.value))}>
              <option value={300}>300 / second</option>
              <option value={1200}>1,200 / second</option>
              <option value={3000}>3,000 / second</option>
            </select>
          </label>
          <button className={showcaseButtonClass} type="button" onClick={() => apiRef.current?.flushAsyncTransactions()}>
            Flush now
          </button>
          <code>applyTransactionAsync · asyncTransactionWaitMs=32</code>
        </>
      }
      note="Right-click a row for the body menu, or group by Sector from the toolbar — aggregates recompute per batch too."
    >
      <Grid
        apiRef={apiRef}
        rowData={initialQuotes}
        columnDefs={columnDefs}
        rowIdKey="symbol"
        theme={brandTheme}
        asyncTransactionWaitMs={32}
        defaultColDef={{ sortable: true, resizable: true, movable: true, groupable: true }}
        toolbar={{ grouping: true, sorting: true, quickFilter: true }}
        rowHover
        zebraRows
        highlightActiveCell
        rangeSelection
        groupRowsSticky
        ariaLabel="Live market quotes"
        tooltip={{ showDelay: 0, hideDelay: 60 }}
        style={{ width: "100%", height: "100%" }}
      />
    </ShowcaseFrame>
  );
}
