import { useEffect, useMemo, useRef, useState } from "react";

import { ChangeFlashCellRenderer, type IGridAPI } from "@grid";
import { Grid, type ReactColDef } from "@react-grid";

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
    return {
      symbol,
      venue: index % 3 === 0 ? "NYSE" : "NASDAQ",
      sector: SECTORS[index % SECTORS.length],
      open,
      price: open,
      bid: +(open - 0.02).toFixed(2),
      ask: +(open + 0.02).toFixed(2),
      change: 0,
      changePct: 0,
      volume: 100_000 + index * 31_337,
      trades: 2_000 + index * 97,
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
  };
}

const priceFormatter = ({ value }: { value: unknown }) =>
  typeof value === "number" ? value.toFixed(2) : "";
const integerFormatter = ({ value }: { value: unknown }) =>
  typeof value === "number" ? value.toLocaleString("en-US") : "";
const direction = (_previous: unknown, next: unknown) =>
  typeof next === "number" && next > 0 ? "up" : typeof next === "number" && next < 0 ? "down" : "neutral";

export default function HighFrequencyDemo() {
  const initialRows = useMemo(() => buildRows(), []);
  const rowsRef = useRef(new Map(initialRows.map((row) => [row.symbol, row])));
  const apiRef = useRef<IGridAPI | null>(null);
  const submittedRef = useRef(0);
  const settledRef = useRef(0);
  const pendingRef = useRef(0);
  const [streaming, setStreaming] = useState(true);
  const [rate, setRate] = useState(1_200);
  const [stats, setStats] = useState({ submitted: 0, settled: 0, pending: 0 });

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "symbol", key: "symbol", label: "Symbol", width: 92, pinned: "left" },
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
      cellClass: ({ value }: { value: unknown }) => typeof value === "number" && value < 0 ? "market-down" : "market-up",
      cellRenderer: ChangeFlashCellRenderer,
      cellRendererParams: { direction, cellFlashDuration: 140, cellFadeDuration: 300 },
    },
    {
      colId: "changePct", key: "changePct", label: "Change %", width: 105,
      valueFormatter: ({ value }: { value: unknown }) => typeof value === "number" ? `${value.toFixed(2)}%` : "",
      cellClass: ({ value }: { value: unknown }) => typeof value === "number" && value < 0 ? "market-down" : "market-up",
      cellRenderer: ChangeFlashCellRenderer,
      cellRendererParams: { direction, cellFlashDuration: 140, cellFadeDuration: 300 },
    },
    { colId: "volume", key: "volume", label: "Volume", width: 122, valueFormatter: integerFormatter },
    { colId: "trades", key: "trades", label: "Trades", width: 105, valueFormatter: integerFormatter },
  ], []);

  useEffect(() => {
    if (!streaming) return;
    const pulsesPerSecond = 50;
    const intervalId = window.setInterval(() => {
      const api = apiRef.current;
      if (!api) return;
      const updatesThisPulse = Math.max(1, Math.round(rate / pulsesPerSecond));

      for (let index = 0; index < updatesThisPulse; index++) {
        const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
        const row = nextQuote(rowsRef.current.get(symbol)!);
        rowsRef.current.set(symbol, row);
        submittedRef.current++;
        pendingRef.current++;
        void api.applyTransactionAsync({ update: [{ rowId: symbol, row }] }).then(() => {
          settledRef.current++;
          pendingRef.current--;
        });
      }
    }, 1_000 / pulsesPerSecond);
    return () => window.clearInterval(intervalId);
  }, [rate, streaming]);

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
    setStreaming(value => !value);
  };

  return (
    <section className="high-frequency-demo">
      <header className="high-frequency-header">
        <div>
          <span className="high-frequency-eyebrow">Async transaction batching</span>
          <h2>Live market tracker</h2>
          <p>
            Every quote is submitted as its own transaction. A 32 ms window coalesces the stream
            into one filter, sort, model, and render pass per batch.
          </p>
        </div>
        <div className="high-frequency-stats" aria-live="polite">
          <span><strong>{stats.submitted.toLocaleString()}</strong> submitted/s</span>
          <span><strong>{stats.settled.toLocaleString()}</strong> settled/s</span>
          <span><strong>{stats.pending}</strong> pending</span>
        </div>
      </header>

      <div className="high-frequency-controls">
        <button className="btn" type="button" onClick={toggleStreaming}>
          {streaming ? "Pause feed" : "Resume feed"}
        </button>
        <label>
          Update rate
          <select value={rate} onChange={(event) => setRate(Number(event.target.value))}>
            <option value={300}>300 / second</option>
            <option value={1200}>1,200 / second</option>
            <option value={3000}>3,000 / second</option>
          </select>
        </label>
        <button className="btn" type="button" onClick={() => apiRef.current?.flushAsyncTransactions()}>
          Flush now
        </button>
        <code>applyTransactionAsync · asyncTransactionWaitMs=32</code>
      </div>

      <div className="high-frequency-grid">
        <Grid
          apiRef={apiRef}
          data={initialRows}
          columnDefs={columnDefs}
          rowIdKey="symbol"
          asyncTransactionWaitMs={32}
          rowHover
          zebraRows
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </section>
  );
}
