import { Component, ElementRef, OnDestroy, computed, effect, signal, viewChild } from "@angular/core";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  type GridEventAggregateChangedParams,
  type IGridAPI,
  type IServerSideAggregationRequest,
  type IServerSideDataSource,
  type IServerSideRequest,
  type NgColDef,
  type PaginationControlsOptions,
} from "@agility-workbench/angular-grid";

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
 * choice that did nothing. Mirrors the React page
 * (apps/react-playground/ServerSideAggregateScopeDemo.tsx).
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
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
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

@Component({
  selector: "server-side-aggregate-scope-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="font-size: 12px; line-height: 1.5; max-width: 1100px">
      <strong>Whole-dataset totals:</strong> on the server-side row model, <em>Entire dataset</em>
      needs a server aggregation source: the data source's own <code>getAggregates</code>, or the
      <code>serverSideAggregationSource</code> option (which wins when both exist). Pick a wiring
      and switch the footer's Aggregate control to <em>Entire dataset</em>: the panel shows the
      server being asked and the totals jumping from the page's 25 rows to all 1,200. With no
      source the scope is locked to <em>Current page</em>, and the footer says so: the choice is
      greyed out with a tooltip (hover the control; with <em>Narrow footer</em> on, open ⋮ →
      Aggregate), or hidden, as the two options beside the wiring say.
    </div>

    <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap">
      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        Aggregation wiring
        <select [value]="wiring()" (change)="onWiringChange($event)">
          @for (option of wiringOptions; track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        Entire dataset when unavailable
        <select [value]="whenUnavailable()" (change)="onWhenUnavailableChange($event)">
          <option value="disabled">disabled (greyed out + tooltip)</option>
          <option value="hidden">hidden</option>
        </select>
      </label>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        Tooltip
        <select [value]="messageMode()" (change)="onMessageModeChange($event)">
          @for (option of messageOptions; track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        <input type="checkbox" [checked]="narrow()" (change)="onNarrowChange($event)" />
        Narrow footer (aggregate control moves into the ⋮ overflow menu)
      </label>

      <button class="btn" type="button" (click)="changeWiring(wiring())">Remount grid</button>
    </div>

    <div
      style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 11px; font-family: monospace; padding: 8px; border-radius: 4px"
      [style.border]="locked() ? '1px solid #f59e0b' : '1px solid #d1d5db'"
      [style.background]="locked() ? 'rgba(245, 158, 11, 0.08)' : 'rgba(156, 163, 175, 0.08)'"
    >
      <div>
        <div style="font-weight: 600; margin-bottom: 4px">footer Aggregate select (what the user sees)</div>
        @if (footer(); as state) {
          @if (state.present) {
            <div>value: <strong>{{ state.value }}</strong> · control disabled: <strong>{{ state.disabled }}</strong></div>
            <div>
              "Entire dataset" option:
              <strong [style.color]="state.allOption === 'enabled' ? 'inherit' : '#b45309'">{{ state.allOption }}</strong>
            </div>
            <div>tooltip (title): <strong>{{ state.title ? '"' + state.title + '"' : "none" }}</strong></div>
          } @else {
            <div style="color: #9ca3af">not in the footer (overflowed into ⋮, or hidden)</div>
          }
        } @else {
          <div style="color: #9ca3af">—</div>
        }
        <div style="font-weight: 600; margin-top: 8px; margin-bottom: 4px">last aggregateChanged event</div>
        @if (aggregateEvent(); as ev) {
          <div>scope: <strong>{{ ev.scope }}</strong> · reason: {{ ev.reason }} · valuesAvailable: {{ ev.valuesAvailable }}</div>
        } @else {
          <div style="color: #9ca3af">—</div>
        }
      </div>
      <div>
        <div style="font-weight: 600; margin-bottom: 4px">
          server getAggregates calls ({{ aggregateCalls().length }}{{ aggregateCalls().length >= 4 ? "+" : "" }})
        </div>
        @if (aggregateCalls().length === 0) {
          <div style="color: #9ca3af">none — the grid has not asked the server for totals</div>
        } @else {
          @for (line of aggregateCalls(); track $index) {
            <div>{{ line }}</div>
          }
        }
        <div style="margin-top: 8px; color: #9ca3af">row block requests: {{ rowRequests() }} · wiring: {{ wiringLabel() }}</div>
      </div>
    </div>

    <div #host style="flex: 1; min-width: 0; min-height: 0" [style.max-width]="narrow() ? '340px' : null">
      @for (gen of [generation()]; track gen) {
        <awb-grid
          [columnDefs]="columnDefs"
          rowIdKey="id"
          rowModelType="serverSide"
          [serverSideDataSource]="dataSource()"
          [serverSideAggregationSource]="wiring() === 'option' ? getAggregates : undefined"
          [serverSideBlockSize]="100"
          [pagination]="true"
          [pageSize]="25"
          [paginationControls]="paginationControls()"
          (gridReady)="onReady($event)"
        />
      }
    </div>
  `,
  styles: [":host { display: flex; flex-direction: column; height: 100%; gap: 12px; min-height: 0 }"],
})
export class ServerSideAggregateScopeDemoComponent implements OnDestroy {
  readonly wiringOptions = WIRING_OPTIONS;
  readonly messageOptions = MESSAGE_OPTIONS;
  readonly wiring = signal<Wiring>("dataSource");
  readonly whenUnavailable = signal<WhenUnavailable>("disabled");
  readonly messageMode = signal<MessageMode>("default");
  readonly narrow = signal(false);
  readonly aggregateEvent = signal<GridEventAggregateChangedParams | null>(null);
  readonly footer = signal<FooterState | null>(null);
  readonly aggregateCalls = signal<string[]>([]);
  readonly rowRequests = signal(0);
  /** Remount key: the wiring is a creation-time decision (the React page changes its `key`).
   * Rendered through `@for … track generation()` because an `@if` flipped off and back on inside
   * one change-detection turn never actually destroys the component. */
  readonly generation = signal(0);
  readonly locked = computed(() => this.footer()?.present === true && this.footer()!.allOption !== "enabled");
  readonly wiringLabel = computed(() => WIRING_OPTIONS.find(o => o.value === this.wiring())?.label ?? "");
  /** The footer options are live: the wrapper forwards a changed input through updateGridOptions. */
  readonly paginationControls = computed(() => footerOptions(this.whenUnavailable(), this.messageMode()));

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>("host");
  private api: IGridAPI | null = null;
  private unsubscribe: Array<() => void> = [];

  constructor() {
    // A footer option change rebuilds the footer; read it again once that has happened.
    effect(() => {
      this.paginationControls();
      this.readFooterSoon();
    });
  }

  readonly getAggregates: NonNullable<IServerSideDataSource["getAggregates"]> = ({ request, success }) => {
    this.aggregateCalls.update(log => [
      `scope=${request.aggregateScope} aggregates=[${request.aggregates.map(a => `${a.key}:${a.type}`).join(", ")}]`,
      ...log,
    ].slice(0, 4));
    setTimeout(() => success(serveAggregates(request)), 250);
  };

  readonly dataSource = computed<IServerSideDataSource>(() => {
    const wiring = this.wiring();
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        this.rowRequests.update(n => n + 1);
        setTimeout(() => success(serveRows(request)), 250);
      },
    };
    // The documented shape: getAggregates on the data source itself.
    if (wiring === "dataSource") source.getAggregates = this.getAggregates;
    return source;
  });

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "Order", width: 90, type: ColumnType.NUMBER },
    { colId: "region", key: "region", label: "Region", width: 120 },
    { colId: "category", key: "category", label: "Category", width: 120 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ];

  ngOnDestroy(): void {
    this.detach();
  }

  onReady(api: IGridAPI): void {
    this.api = api;
    this.detach();
    this.unsubscribe = [
      api.on("aggregateChanged", ev => {
        this.aggregateEvent.set(ev);
        this.readFooterSoon();
      }),
      api.on("rowsChanged", () => this.readFooterSoon()),
      api.on("paginationChanged", () => this.readFooterSoon()),
    ];
    // Footer totals for the two numeric columns; the footer shows up with them at page scope.
    api.setAggregates([
      { colId: "units", type: AggregateType.SUM },
      { colId: "revenue", type: AggregateType.SUM },
    ]);
    this.readFooterSoon();
  }

  onWiringChange(ev: Event): void {
    this.changeWiring((ev.target as HTMLSelectElement).value as Wiring);
  }

  onWhenUnavailableChange(ev: Event): void {
    this.whenUnavailable.set((ev.target as HTMLSelectElement).value as WhenUnavailable);
  }

  onMessageModeChange(ev: Event): void {
    this.messageMode.set((ev.target as HTMLSelectElement).value as MessageMode);
  }

  onNarrowChange(ev: Event): void {
    this.narrow.set((ev.target as HTMLInputElement).checked);
    this.readFooterSoon();
  }

  changeWiring(next: Wiring): void {
    this.wiring.set(next);
    this.aggregateEvent.set(null);
    this.footer.set(null);
    this.aggregateCalls.set([]);
    this.rowRequests.set(0);
    this.api = null;
    this.detach();
    this.generation.update(g => g + 1);
  }

  // What the user sees: the footer's own Aggregate select, read from the grid's DOM.
  private readFooterSoon(): void {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const select = this.host().nativeElement.querySelector<HTMLSelectElement>("select.pte-aggregate-scope");
      if (!select) {
        this.footer.set({ present: false, value: "", disabled: false, title: "", allOption: "absent" });
        return;
      }
      const all = select.querySelector<HTMLOptionElement>('option[value="all"]');
      this.footer.set({
        present: true,
        value: select.value,
        disabled: select.disabled,
        title: select.title,
        allOption: !all ? "absent" : all.disabled ? "disabled" : "enabled",
      });
    }));
  }

  private detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }
}
