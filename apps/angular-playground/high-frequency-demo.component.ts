import { Component, OnDestroy, ViewEncapsulation, signal } from "@angular/core";
import {
  AwbGrid,
  ChangeFlashCellRenderer,
  SparklineRenderer,
  type CellRendererParams,
  type IGridAPI,
  type NgColDef,
  type SparklineParams,
  type SparklineTooltipValueFormatterParams,
} from "@agility-workbench/angular-grid";

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

function SymbolCellRenderer({ value }: CellRendererParams): HTMLElement {
  const symbol = String(value ?? "");
  const root = document.createElement("span");
  root.className = "market-symbol";

  const logo = document.createElement("span");
  logo.className = "market-logo";
  logo.style.background = logoColor(symbol);
  logo.setAttribute("aria-hidden", "true");
  logo.textContent = symbol.replace(/[^A-Z]/g, "").slice(0, 2);

  const ticker = document.createElement("strong");
  ticker.textContent = symbol;
  root.append(logo, ticker);
  return root;
}

const sparklineParams: SparklineParams = {
  type: "line",
  showPoints: false,
  tooltipValueFormatter: ({ xValue, yValue }: SparklineTooltipValueFormatterParams) =>
    `${String(xValue)}: $${yValue.toFixed(2)}`,
};

@Component({
  selector: "high-frequency-demo",
  standalone: true,
  imports: [AwbGrid],
  encapsulation: ViewEncapsulation.None,
  template: `
    <section class="high-frequency-demo">
      <header class="high-frequency-header">
        <div>
          <span class="high-frequency-eyebrow">Async transaction batching</span>
          <h2>Live market tracker</h2>
          <p>
            Every quote is submitted as its own transaction. A 32 ms window coalesces the stream
            into one filter, sort, model, and render pass per batch.
          </p>
        </div>
        <div class="high-frequency-stats" aria-live="polite">
          <span><strong>{{ stats().submitted.toLocaleString() }}</strong> submitted/s</span>
          <span><strong>{{ stats().settled.toLocaleString() }}</strong> settled/s</span>
          <span><strong>{{ stats().pending }}</strong> pending</span>
        </div>
      </header>

      <div class="high-frequency-controls">
        <button class="btn" type="button" (click)="toggleStreaming()">
          {{ streaming() ? "Pause feed" : "Resume feed" }}
        </button>
        <label>
          Update rate
          <select [value]="rate()" (change)="setRate($event)">
            <option [value]="300">300 / second</option>
            <option [value]="1200">1,200 / second</option>
            <option [value]="3000">3,000 / second</option>
          </select>
        </label>
        <button class="btn" type="button" (click)="api?.flushAsyncTransactions()">Flush now</button>
        <code>applyTransactionAsync · asyncTransactionWaitMs=32</code>
      </div>

      <div class="high-frequency-grid">
        <awb-grid
          [rowData]="initialRows"
          [columnDefs]="columnDefs"
          rowIdKey="symbol"
          [asyncTransactionWaitMs]="32"
          [rowHover]="true"
          [zebraRows]="true"
          [tooltip]="tooltipOptions"
          (gridReady)="onReady($event)"
        />
      </div>
    </section>
  `,
  styles: [`
    high-frequency-demo { display: block; height: 100%; min-height: 0; }
    .high-frequency-demo {
      display: flex; height: 100%; min-width: 0; min-height: 0; flex-direction: column; gap: 10px;
    }
    .high-frequency-header {
      display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 12px 14px;
      border: 1px solid var(--pte-frame-border-color, #d1d5db); border-radius: 8px;
      background: var(--pte-header-bg-color, #fff);
    }
    .high-frequency-header h2 { margin: 2px 0 4px; font-size: 20px; }
    .high-frequency-header p { max-width: 760px; font-size: 12px; line-height: 1.5; opacity: 0.75; }
    .high-frequency-eyebrow {
      color: var(--pte-selected-border-color, #2563eb); font-size: 10px; font-weight: 700;
      letter-spacing: 0.12em; text-transform: uppercase;
    }
    .high-frequency-stats { display: grid; grid-template-columns: repeat(3, minmax(92px, 1fr)); gap: 8px; }
    .high-frequency-stats span {
      padding: 8px 10px; border-radius: 7px; background: var(--pte-input-bg-color, #f3f4f6);
      font-size: 11px; white-space: nowrap;
    }
    .high-frequency-stats strong { display: block; font-size: 17px; }
    .high-frequency-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; }
    .high-frequency-controls label { display: flex; align-items: center; gap: 7px; }
    .high-frequency-controls select {
      padding: 5px 8px; border: 1px solid var(--pte-frame-border-color, #d1d5db); border-radius: 5px;
      background: var(--pte-input-bg-color, #fff); color: inherit;
    }
    .high-frequency-controls code {
      padding: 5px 8px; border-radius: 5px; background: var(--pte-input-bg-color, #f3f4f6);
    }
    .high-frequency-grid { flex: 1; min-height: 280px; }
    .high-frequency-grid .market-up { color: #22c55e; }
    .high-frequency-grid .market-down { color: #ef4444; }
    .high-frequency-grid .market-symbol {
      display: inline-flex; align-items: center; gap: 8px; height: 100%;
    }
    .high-frequency-grid .market-logo {
      display: inline-grid; width: 24px; height: 24px; flex: 0 0 24px; place-items: center;
      border-radius: 7px; color: #fff; font-size: 9px; font-weight: 800; letter-spacing: -0.02em;
      box-shadow: inset 0 0 0 1px rgb(255 255 255 / 22%);
    }
    @media (max-width: 900px) {
      .high-frequency-header { align-items: stretch; flex-direction: column; }
    }
  `],
})
export class HighFrequencyDemoComponent implements OnDestroy {
  readonly initialRows = buildRows();
  readonly streaming = signal(true);
  readonly rate = signal(1_200);
  readonly stats = signal({ submitted: 0, settled: 0, pending: 0 });
  api: IGridAPI | null = null;
  readonly tooltipOptions = { showDelay: 0, hideDelay: 50 } as const;

  private readonly rowsMap = new Map(this.initialRows.map((row) => [row.symbol, row]));
  private submitted = 0;
  private settled = 0;
  private pending = 0;
  private previousSubmitted = 0;
  private previousSettled = 0;
  private readonly feedInterval = window.setInterval(() => this.tick(), 20);
  private readonly statsInterval = window.setInterval(() => this.updateStats(), 500);

  readonly columnDefs: NgColDef[] = [
    {
      colId: "symbol", key: "symbol", label: "Symbol", width: 124, pinned: "left",
      cellRenderer: SymbolCellRenderer,
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
      cellClass: ({ value }: { value: unknown }) => typeof value === "number" && value < 0 ? "market-down" : "market-up",
      cellRenderer: ChangeFlashCellRenderer,
      cellRendererParams: { direction, cellFlashDuration: 140, cellFadeDuration: 300 },
    },
    {
      colId: "changePct", key: "changePct", label: "Change %", width: 105, sort: "desc",
      valueFormatter: ({ value }: { value: unknown }) => typeof value === "number" ? `${value.toFixed(2)}%` : "",
      cellClass: ({ value }: { value: unknown }) => typeof value === "number" && value < 0 ? "market-down" : "market-up",
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

  ngOnDestroy(): void {
    window.clearInterval(this.feedInterval);
    window.clearInterval(this.statsInterval);
    this.api?.flushAsyncTransactions();
  }

  onReady(api: IGridAPI): void {
    this.api = api;
  }

  toggleStreaming(): void {
    if (this.streaming()) this.api?.flushAsyncTransactions();
    this.streaming.update(value => !value);
  }

  setRate(event: Event): void {
    this.rate.set(Number((event.target as HTMLSelectElement).value));
  }

  private tick(): void {
    const api = this.api;
    if (!api || !this.streaming()) return;
    const updatesThisPulse = Math.max(1, Math.round(this.rate() / 50));

    for (let index = 0; index < updatesThisPulse; index++) {
      const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      const row = nextQuote(this.rowsMap.get(symbol)!);
      this.rowsMap.set(symbol, row);
      this.submitted++;
      this.pending++;
      void api.applyTransactionAsync({ update: [{ rowId: symbol, row }] }).then(() => {
        this.settled++;
        this.pending--;
      });
    }
  }

  private updateStats(): void {
    this.stats.set({
      submitted: (this.submitted - this.previousSubmitted) * 2,
      settled: (this.settled - this.previousSettled) * 2,
      pending: this.pending,
    });
    this.previousSubmitted = this.submitted;
    this.previousSettled = this.settled;
  }
}
