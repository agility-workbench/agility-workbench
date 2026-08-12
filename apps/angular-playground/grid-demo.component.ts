import { Component, OnDestroy, ViewEncapsulation, computed, effect, signal, untracked } from "@angular/core";
import {
  AwbGrid,
  ChangeFlashCellRenderer,
  type CellRendererParams,
  type ColDef,
  type ColumnPanelTrigger,
  type FormatterOptionsParams,
  type GroupDisplayType,
  type IGridAPI,
  type IServerSideDataSource,
  type IServerSideFilter,
  type IServerSideRequest,
  type NgColDef,
  type RowModelType,
} from "@agility-workbench/angular-grid";

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

/**
 * Location cell renderer. Written as a framework-agnostic core function renderer (builds real DOM)
 * rather than an Angular component because it is also attached to column defs RETURNED BY the
 * server-side data source — those columns go straight to the core without passing through the
 * Angular component adapter, so only core renderer shapes work on that path.
 */
function LocationCellRenderer(params: CellRendererParams): HTMLElement | null {
  const city = String(params.valueFormatted ?? params.value ?? "");
  if (!city) return null;

  const meta = getCityMeta(city);

  const root = document.createElement("span");
  root.className = `location-cell location-cell-${meta.tone}`;
  root.title = `${city} · ${meta.region}`;

  const mark = document.createElement("span");
  mark.className = "location-cell-mark";
  mark.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) mark.appendChild(document.createElement("span"));

  const main = document.createElement("span");
  main.className = "location-cell-main";
  const cityEl = document.createElement("span");
  cityEl.className = "location-cell-city";
  cityEl.textContent = city;
  const regionEl = document.createElement("span");
  regionEl.className = "location-cell-region";
  regionEl.textContent = meta.region;
  main.append(cityEl, regionEl);

  const code = document.createElement("span");
  code.className = "location-cell-code";
  code.textContent = meta.icon;

  root.append(mark, main, code);
  return root;
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

function buildInitialTradingRows(): TradingRow[] {
  return TRADING_SYMBOLS.map(({ symbol, name, base }) => makeRow(symbol, name, base));
}

@Component({
  selector: "trading-grid",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="display: flex; flex-direction: column; gap: 6px; height: 100%; min-height: 0">
      <div style="display: flex; align-items: center; gap: 8px">
        <button class="btn" type="button" (click)="streaming.set(!streaming())">
          {{ streaming() ? "Pause" : "Resume" }} ticks
        </button>
        <button class="btn" type="button" (click)="addSymbol()">Add symbol</button>
        <button class="btn" type="button" (click)="removeLast()">Remove last</button>
        <span style="font-size: 12px; color: #6b7280">
          {{ rowCount() }} rows · streaming via applyTransaction (add / update / remove)
        </span>
      </div>
      <div style="flex: 1; min-height: 0">
        <awb-grid
          [rowData]="initialRows"
          [columnDefs]="columnDefs"
          rowIdKey="symbol"
          (gridReady)="onReady($event)"
        />
      </div>
    </div>
  `,
  styles: [":host { display: block; height: 100%; min-height: 0; }"],
})
export class TradingGridComponent implements OnDestroy {
  // Initial rows are passed to [rowData] exactly ONCE (constant reference). Every subsequent
  // change is streamed through api.applyTransaction — no full rowData set, so edit history is kept
  // and only the touched cells repaint (which is what lets ChangeFlashCellRenderer flash deltas).
  readonly initialRows = buildInitialTradingRows();

  // Live working set, keyed by symbol. Plain map — the ticker reads/writes without re-rendering.
  private readonly rowsMap = new Map<string, TradingRow>(this.initialRows.map((r) => [r.symbol, r]));
  private readonly basePrices = new Map<string, number>(
    [...TRADING_SYMBOLS, ...EXTRA_SYMBOLS].map((s) => [s.symbol, s.base]),
  );

  readonly streaming = signal(true);
  readonly rowCount = signal(this.initialRows.length);
  private nextExtraIdx = 0;

  private api: IGridAPI | null = null;
  private readonly intervalId: number;

  constructor() {
    this.intervalId = window.setInterval(() => this.tick(), 300);
  }

  ngOnDestroy(): void {
    window.clearInterval(this.intervalId);
  }

  onReady(api: IGridAPI): void {
    this.api = api;
  }

  private tick(): void {
    if (!this.streaming()) return;
    const api = this.api;
    if (!api) return;

    const symbols = [...this.rowsMap.keys()];
    if (symbols.length === 0) return;

    const updatesPerTick = Math.max(1, Math.floor(symbols.length * 0.4));
    const update: { rowId: string; row: TradingRow }[] = [];
    const touched = new Set<string>();
    for (let i = 0; i < updatesPerTick; i++) {
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      if (touched.has(symbol)) continue;
      touched.add(symbol);
      const row = this.rowsMap.get(symbol)!;
      const drift = (Math.random() - 0.5) * row.ltp * 0.004;
      const newLtp = +Math.max(0.01, row.ltp + drift).toFixed(2);
      const base = this.basePrices.get(symbol) ?? newLtp;
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
      this.rowsMap.set(symbol, nextRow);
      update.push({ rowId: symbol, row: nextRow });
    }

    if (update.length > 0) api.applyTransaction({ update });
  }

  addSymbol(): void {
    const api = this.api;
    if (!api) return;
    // Find the next extra symbol not already present.
    for (let n = 0; n < EXTRA_SYMBOLS.length; n++) {
      const idx = (this.nextExtraIdx + n) % EXTRA_SYMBOLS.length;
      const { symbol, name, base } = EXTRA_SYMBOLS[idx];
      if (this.rowsMap.has(symbol)) continue;
      const row = makeRow(symbol, name, base);
      this.rowsMap.set(symbol, row);
      this.nextExtraIdx = idx + 1;
      api.applyTransaction({ add: [row] });
      this.rowCount.set(this.rowsMap.size);
      return;
    }
  }

  removeLast(): void {
    const api = this.api;
    if (!api) return;
    const symbols = [...this.rowsMap.keys()];
    if (symbols.length === 0) return;
    const symbol = symbols[symbols.length - 1];
    this.rowsMap.delete(symbol);
    api.applyTransaction({ remove: [symbol] });
    this.rowCount.set(this.rowsMap.size);
  }

  readonly columnDefs: NgColDef[] = [
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
  ];
}

@Component({
  selector: "grid-demo",
  standalone: true,
  imports: [AwbGrid, TradingGridComponent],
  // Encapsulation is off so the `.location-cell*` styles reach the DOM built by the core function
  // renderer inside the grid (core-owned DOM never carries Angular's scoping attributes).
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="grid-demo-root">
      <div style="display: flex; align-items: center; gap: 18px; flex-wrap: wrap">
        <div style="display: flex; gap: 12px">
          <input
            type="number"
            [value]="count()"
            min="1"
            max="100000"
            (input)="count.set(+$any($event.target).value)"
          />
          <button class="btn" type="button" (click)="fetchTick.set(fetchTick() + 1)">Fetch</button>
        </div>
        <button class="btn" type="button" (click)="paginate.set(!paginate())">
          {{ paginate() ? "Don't" : "" }} Paginate
        </button>
        <button class="btn" type="button" (click)="rowNumbers.set(!rowNumbers())">
          {{ rowNumbers() ? "Hide" : "Show" }} Row Numbers
        </button>
        <button class="btn" type="button" (click)="toggleRowModel()">
          Use {{ rowModel() === "clientSide" ? "Server-side" : "Client-side" }} Row Model
        </button>
        <div style="display: flex; align-items: center; gap: 8px">
          <label for="ssrm-block-size" style="font-size: 13px">SSRM block</label>
          <select id="ssrm-block-size" (change)="serverSideBlockSize.set(+$any($event.target).value)">
            @for (size of blockSizes; track size) {
              <option [value]="size" [selected]="size === serverSideBlockSize()">{{ size }}</option>
            }
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 8px">
          <label for="theme-select" style="font-size: 13px">Theme</label>
          <select id="theme-select" (change)="themeId.set($any($event.target).value)">
            @for (theme of themePresets; track theme.id) {
              <option [value]="theme.id" [selected]="theme.id === themeId()">{{ theme.label }}</option>
            }
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: 8px">
          <label for="column-panel-trigger" style="font-size: 13px">Columns trigger</label>
          <select
            id="column-panel-trigger"
            (change)="columnPanelTrigger.set($any($event.target).value)"
          >
            @for (trigger of columnPanelTriggers; track trigger.value) {
              <option [value]="trigger.value" [selected]="trigger.value === columnPanelTrigger()">
                {{ trigger.label }}
              </option>
            }
          </select>
        </div>
        @if (rowModel() === "clientSide") {
          <div style="display: flex; align-items: center; gap: 8px">
            <label for="group-display" style="font-size: 13px">Group display</label>
            <select id="group-display" (change)="groupDisplayType.set($any($event.target).value)">
              <option value="singleColumn" [selected]="groupDisplayType() === 'singleColumn'">Single column</option>
              <option value="multipleColumns" [selected]="groupDisplayType() === 'multipleColumns'">Multiple columns</option>
              <option value="groupRows" [selected]="groupDisplayType() === 'groupRows'">Group rows</option>
            </select>
            <label for="group-by" style="font-size: 13px">Group by</label>
            <select id="group-by" (change)="onGroupByChange($any($event.target).value)">
              <option value="" [selected]="groupByColId() === ''">(none)</option>
              @for (c of groupableCols(); track c.colId ?? c.key) {
                <option [value]="c.colId ?? c.key" [selected]="(c.colId ?? c.key) === groupByColId()">
                  {{ c.label ?? c.key }}
                </option>
              }
            </select>
          </div>
        }
        @if (error()) {
          <div style="color: red">Error: {{ error() }}</div>
        }
      </div>
      <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px">
        <div style="flex: 1; min-height: 0">
          @if (gridMounted()) {
            <awb-grid
              [class]="activeTheme().className"
              [rowData]="rowData()"
              [columnDefs]="colDefs()"
              [loading]="loading()"
              [pagination]="paginate()"
              [rowNumbers]="rowNumbers()"
              [rowModelType]="rowModel()"
              [groupDisplayType]="groupDisplayType()"
              [quickFilter]="true"
              [columnPanel]="{ trigger: columnPanelTrigger() }"
              [serverSideDataSource]="serverSideDataSource"
              [serverSideAggregationSource]="serverSideDataSource.getAggregates"
              [serverSideBlockSize]="serverSideBlockSize()"
              [pageSize]="100"
              [pageSizes]="pageSizes"
              (gridReady)="onGridReady($event)"
            />
          }
        </div>
        <div style="display: flex; align-items: center; gap: 8px">
          <strong style="font-size: 13px">Trading terminal</strong>
          <span style="font-size: 12px; color: #6b7280">
            (live applyTransaction stream — green/red flashes show up/down LTP, bid, ask, change moves;
            use Add / Remove to stream structural changes)
          </span>
        </div>
        <div style="flex: 1; min-height: 0" [class]="activeTheme().className">
          <trading-grid />
        </div>
      </div>
    </div>
  `,
  styles: [
    `
    grid-demo {
      display: block;
      height: 100%;
      min-height: 0;
    }

    .grid-demo-root {
      padding: 8px;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .location-cell {
      --location-accent: #2563eb;
      --location-bg: rgba(37, 99, 235, 0.13);
      --location-border: rgba(37, 99, 235, 0.34);
      display: inline-grid;
      grid-template-columns: 18px minmax(0, 1fr) auto;
      align-items: center;
      gap: 7px;
      width: 100%;
      min-width: 0;
      height: 28px;
      padding: 3px 7px 3px 6px;
      box-sizing: border-box;
      border: 1px solid var(--location-border);
      border-radius: 6px;
      background:
        linear-gradient(90deg, var(--location-bg), transparent 78%),
        color-mix(in srgb, var(--pte-cell-bg-color, #fff) 88%, var(--location-accent));
      overflow: hidden;
    }

    .location-cell-mark {
      display: grid;
      grid-template-columns: repeat(3, 4px);
      align-items: end;
      gap: 2px;
      width: 18px;
      height: 16px;
    }

    .location-cell-mark span {
      display: block;
      width: 4px;
      border-radius: 2px 2px 1px 1px;
      background: var(--location-accent);
      opacity: 0.9;
    }

    .location-cell-mark span:nth-child(1) {
      height: 9px;
    }

    .location-cell-mark span:nth-child(2) {
      height: 15px;
    }

    .location-cell-mark span:nth-child(3) {
      height: 11px;
    }

    .location-cell-main {
      display: flex;
      min-width: 0;
      flex-direction: column;
      justify-content: center;
      line-height: 1.05;
    }

    .location-cell-city {
      overflow: hidden;
      color: var(--pte-text-color, #111827);
      font-size: 12px;
      font-weight: 650;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .location-cell-region {
      overflow: hidden;
      color: color-mix(in srgb, var(--pte-text-color, #111827) 68%, transparent);
      font-size: 9px;
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .location-cell-code {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 18px;
      padding: 0 4px;
      border-radius: 4px;
      background: var(--location-accent);
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      line-height: 1;
    }

    .location-cell-blue {
      --location-accent: #2563eb;
      --location-bg: rgba(37, 99, 235, 0.14);
      --location-border: rgba(37, 99, 235, 0.36);
    }

    .location-cell-green {
      --location-accent: #15803d;
      --location-bg: rgba(21, 128, 61, 0.14);
      --location-border: rgba(21, 128, 61, 0.34);
    }

    .location-cell-violet {
      --location-accent: #7c3aed;
      --location-bg: rgba(124, 58, 237, 0.14);
      --location-border: rgba(124, 58, 237, 0.34);
    }

    .location-cell-amber {
      --location-accent: #b45309;
      --location-bg: rgba(180, 83, 9, 0.15);
      --location-border: rgba(180, 83, 9, 0.34);
    }

    .location-cell-rose {
      --location-accent: #be123c;
      --location-bg: rgba(190, 18, 60, 0.13);
      --location-border: rgba(190, 18, 60, 0.32);
    }

    .location-cell-teal {
      --location-accent: #0f766e;
      --location-bg: rgba(15, 118, 110, 0.14);
      --location-border: rgba(15, 118, 110, 0.34);
    }
    `,
  ],
})
export class GridDemoComponent implements OnDestroy {
  readonly rowData = signal<any[]>([]);
  readonly colDefs = signal<NgColDef[]>([]);
  readonly error = signal<string | null>(null);
  readonly count = signal(50000);
  readonly fetchTick = signal(0); // React's `toggle` — bump to refetch.
  readonly loading = signal(true);
  readonly paginate = signal(true);
  readonly rowNumbers = signal(false);
  readonly rowModel = signal<RowModelType>("clientSide");
  readonly serverSideBlockSize = signal(100);
  readonly themeId = signal(themePresets[0].id);
  // Row grouping (client-side only) demo controls.
  readonly groupDisplayType = signal<GroupDisplayType>("singleColumn");
  readonly groupByColId = signal<string>("");
  readonly columnPanelTrigger = signal<ColumnPanelTrigger>("rail");

  readonly themePresets = themePresets;
  readonly blockSizes = [25, 50, 100, 250, 500];
  readonly pageSizes = [25, 50, 100, 250, 500, 1000];
  readonly columnPanelTriggers: Array<{ value: ColumnPanelTrigger; label: string }> = [
    { value: "rail", label: "Rail" },
    { value: "header", label: "Header" },
    { value: "menu", label: "Column menu" },
    { value: "footer", label: "Footer" },
    { value: "toolbar", label: "Toolbar" },
  ];

  readonly activeTheme = computed(
    () => themePresets.find((theme) => theme.id === this.themeId()) ?? themePresets[0],
  );
  readonly groupableCols = computed(() =>
    this.colDefs().filter((c) => c.key && !c.children?.length),
  );

  // React's remount-via-`key` trick: the grid remounts whenever any of the key parts change.
  readonly gridMounted = signal(true);

  private gridApi: IGridAPI | null = null;
  private fetchSeq = 0;

  constructor() {
    // Data fetch — mirrors React's useEffect([toggle, count, rowModel]); only runs client-side.
    effect(() => {
      this.fetchTick();
      const count = this.count();
      const rowModel = this.rowModel();
      if (rowModel !== "clientSide") return;
      untracked(() => this.fetchData(count, rowModel));
    });

    // Theme — mirrors React's useEffect([themeId]) applying the preset class to <body>.
    effect(() => {
      const activeTheme = this.activeTheme();
      const themeClasses = themePresets.map((theme) => theme.className);
      document.body.classList.remove(...themeClasses);
      document.body.classList.add(activeTheme.className);
    });

    // Remount — mirrors React's key={`${rowModel}-${serverSideBlockSize}-${rowNumbers}-${groupDisplayType}`}.
    let firstRun = true;
    effect(() => {
      this.rowModel();
      this.serverSideBlockSize();
      this.rowNumbers();
      this.groupDisplayType();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => {
        this.gridMounted.set(false);
        queueMicrotask(() => this.gridMounted.set(true));
      });
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove(...themePresets.map((theme) => theme.className));
  }

  onGridReady(api: IGridAPI): void {
    this.gridApi = api;
  }

  toggleRowModel(): void {
    this.rowModel.set(this.rowModel() === "clientSide" ? "serverSide" : "clientSide");
  }

  onGroupByChange(colId: string): void {
    this.groupByColId.set(colId);
    this.gridApi?.dispatch({ type: "rowGroupSet", colIds: colId ? [colId] : [] });
  }

  private applyDemoColumnConfig(cols: NgColDef[] = []): NgColDef[] {
    const currencyFormatter = (col: NgColDef) => {
      if (col.type !== "currency") return;
      col.formatterOptions = (params: FormatterOptionsParams) => ({
        currency: params.row?.currency || "USD",
        locale: "en-US",
      });
    };

    const formatApplier = (inputCols: NgColDef[]) => {
      for (const col of inputCols) {
        currencyFormatter(col);
        if (col.children && col.children.length > 0) {
          formatApplier(col.children);
        }

        if (col.key == "fy2026") {
          col.filterParams = {
            maxNumConditions: 7,
            buttons: ["apply", "cancel", "clear", "reset"],
          };
        }

        if (col.key == "location") {
          col.cellRenderer = LocationCellRenderer;
        }
      }
    };

    formatApplier(cols);
    return cols;
  }

  private flattenServerFilters(filters: IServerSideFilter[]): GridServerFilter[] {
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
  }

  private buildServerPayload(
    request: Pick<IServerSideRequest, "filters" | "sorts" | "startRow" | "endRow">,
    extras: Pick<GridServerPayload, "aggregates"> = {},
  ): GridServerPayload {
    const startRow = Math.max(0, request.startRow ?? 0);
    const endRow = Math.max(startRow + 1, request.endRow ?? startRow + 100);

    return {
      ...extras,
      start_row: startRow,
      end_row: endRow,
      filters: this.flattenServerFilters(request.filters),
      sorts: request.sorts,
    };
  }

  // Built once (React's useMemo with [] deps); the arrow methods close over `this` lazily.
  readonly serverSideDataSource: IServerSideDataSource = (() => {
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

        const payload = await fetchServer(this.buildServerPayload(request));
        const rows = payload?.data ?? [];
        const totalRows = payload?.totalRows ?? payload?.total ?? rows.length;

        return {
          rows,
          totalRows,
          columns: payload?.columns?.length
            ? (this.applyDemoColumnConfig(payload.columns as NgColDef[]) as ColDef[])
            : undefined,
          schemaVersion: payload?.schemaVersion,
        };
      },
      getAggregates: async ({ request }) => {
        console.log("Server-side aggregation request", request);

        const payload = await fetchServer(
          this.buildServerPayload(request, { aggregates: request.aggregates }),
        );
        return { values: payload?.values ?? payload ?? {} };
      },
    };
  })();

  private async fetchData(count: number, rowModel: RowModelType): Promise<void> {
    const seq = ++this.fetchSeq;
    this.loading.set(true);
    this.error.set(null);

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
      if (seq !== this.fetchSeq) return;

      this.applyDemoColumnConfig(payload.columns ?? []);

      payload.columns.forEach((col: ColDef) => {
        if (col.key == "department") {
          col.sortable = false;
          col.filter = "set";
          col.filterParams = {
            filterValues: (params: any) => {
              setTimeout(() => {
                console.log("Loading filter values for department column", params);
                params.success((payload.data ?? []).map((r: any) => r.department));
              }, 1000);
            },
          };
        }
        if (col.key == "country") col.filter = false;
        if (col.key == "location") {
          col.resizable = false;
          col.filter = "set";
        }
        if (col.key == "gl_account") col.movable = false;
        if (col.key == "business_unit") col.hideable = false;
      });

      this.colDefs.set(payload.columns ?? []);
      this.rowData.set(rowModel === "clientSide" ? payload.data ?? [] : []);
    } catch (err) {
      if (seq !== this.fetchSeq) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      this.error.set(message);
    } finally {
      if (seq === this.fetchSeq) {
        this.loading.set(false);
      }
    }
  }
}
