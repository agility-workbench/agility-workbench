import { Component, NgZone, inject, signal } from "@angular/core";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  type GridSheet,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

/**
 * The blank pivot canvas: pivot mode with no row group, no pivot column and no value displays
 * NOTHING — no columns (not even the auto-group column), no rows — and says so through
 * `pivotEmptyMessage`. Turn pivot mode on with the grid empty of roles and watch the whole
 * layout go blank; the column panel opens itself, because a blank canvas has no header to reach
 * a column menu from.
 *
 * The panel here is `availability: "pivot"` by default — it exists only while pivoted, which is
 * the setup for an app that manages columns its own way but wants the grid's pivot customizer.
 * Flip it to `always` to compare.
 *
 * Press + in the footer for a second blank sheet: a fresh pivot sheet lands on the same canvas.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  quarter: string;
  product: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const PRODUCTS = ["Hardware", "Software", "Services"];

// Deterministic PRNG so demo data is stable across reloads.
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
      quarter: pick(QUARTERS),
      product: pick(PRODUCTS),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 100_000),
    };
  });
}

// Set at construction, like every other message option (none are runtime-updatable). Omit it and
// the grid says "Add row groups, column labels or values to build the pivot".
const EMPTY_MESSAGE = "Nothing configured yet — drop a field into Row groups, Column labels or Values";

@Component({
  selector: "blank-pivot-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <p class="blank-pivot-note">
      Press <strong>Pivot</strong> in the toolbar with no roles set and the grid goes
      <strong>completely blank</strong> — no columns, no rows, just <code>pivotEmptyMessage</code>
      (overridden on this page, to show it is yours to word). Previously this state showed a lone
      group column over a "Total" row that nothing could act on. The column panel opens itself on
      the way in, since a blank canvas has no header to open a column menu from. Fill any one of
      the three wells and the grid fills in; empty them all and it goes blank again.
      <strong>+</strong> in the footer adds another blank pivot sheet.
    </p>

    <div class="blank-pivot-controls">
      <label class="blank-pivot-check">
        Column panel
        <select [value]="availability()" (change)="onAvailabilityChange($event)">
          <option value="pivot">availability: "pivot"</option>
          <option value="always">availability: "always"</option>
        </select>
      </label>

      <button class="btn" type="button" (click)="enterBlankPivot()">Enter pivot mode (blank)</button>
      <button class="btn" type="button" (click)="configurePivot()">Configure a pivot</button>
      <button class="btn" type="button" (click)="clearRoles()">Clear every role</button>
      <button class="btn" type="button" (click)="leavePivot()">Leave pivot mode</button>
    </div>

    <div class="blank-pivot-body">
      <!-- minWidth:0 keeps the grid from widening the page as generated pivot columns appear. -->
      <div class="blank-pivot-grid-host">
        <awb-grid
          [rowData]="rows"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [groupDefaultExpanded]="1"
          [toolbar]="{ pivot: true }"
          [pivotEmptyMessage]="emptyMessage"
          [columnPanel]="{ availability: availability(), trigger: 'toolbar' }"
          [sheets]="sheetsOptions()"
          (gridReady)="onReady($event)"
        />
      </div>

      <aside class="blank-pivot-aside">
        <strong style="font-size: 13px">What the grid reports</strong>
        <div class="blank-pivot-hint">
          <code>isPivotUnconfigured()</code> is public, so an app driving pivot through its own UI
          can render the same empty state the grid does.
        </div>
        <dl class="blank-pivot-state">
          <dt>Pivot mode</dt>
          <dd>{{ pivotOn() ? "on" : "off" }}</dd>
          <dt>isPivotUnconfigured()</dt>
          <dd [class.blank-pivot-flag]="unconfigured()">{{ unconfigured() }}</dd>
          <dt>Row groups</dt>
          <dd>{{ groupBy().join(", ") || "—" }}</dd>
          <dt>Column labels</dt>
          <dd>{{ pivotCols().join(", ") || "—" }}</dd>
          <dt>Values</dt>
          <dd>{{ values().join(", ") || "—" }}</dd>
        </dl>
      </aside>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100%;
        min-height: 0;
      }

      .blank-pivot-note {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: #6b7280;
      }

      .blank-pivot-controls {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }

      .blank-pivot-check {
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .blank-pivot-body {
        display: flex;
        gap: 12px;
        flex: 1;
        min-height: 0;
      }

      .blank-pivot-grid-host {
        flex: 1;
        min-width: 0;
        min-height: 0;
      }

      .blank-pivot-aside {
        width: 260px;
        flex: 0 0 260px;
        overflow: auto;
        padding: 12px;
        box-sizing: border-box;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        background: #f9fafb;
      }

      .blank-pivot-hint {
        margin-top: 4px;
        font-size: 11px;
        color: #6b7280;
      }

      .blank-pivot-state {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 10px;
        margin: 8px 0 0;
        font-size: 12px;
        line-height: 1.5;
      }

      .blank-pivot-state dt {
        color: #6b7280;
      }

      .blank-pivot-state dd {
        margin: 0;
      }

      .blank-pivot-state dd.blank-pivot-flag {
        font-weight: 700;
      }
    `,
  ],
})
export class BlankPivotDemoComponent {
  readonly rows = buildRows(2000);
  readonly emptyMessage = EMPTY_MESSAGE;

  readonly availability = signal<"always" | "pivot">("pivot");
  readonly pivotOn = signal(false);
  readonly unconfigured = signal(false);
  readonly pivotCols = signal<string[]>([]);
  readonly groupBy = signal<string[]>([]);
  readonly values = signal<string[]>([]);

  readonly sheets = signal<GridSheet[]>([{ id: "data", name: "Data" }]);
  readonly activeSheetId = signal<string | null>("data");

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "quarter", key: "quarter", label: "Quarter", width: 110 },
    { colId: "product", key: "product", label: "Product", width: 130 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ];

  private api: IGridAPI | null = null;
  private readonly zone = inject(NgZone);

  /** Sheets are application-owned: the grid is handed the list, and reports every next one back. */
  sheetsOptions() {
    return {
      sheets: this.sheets(),
      activeSheetId: this.activeSheetId(),
      onChange: (next: GridSheet[]) => this.zone.run(() => this.sheets.set(next)),
      onActiveSheetChange: (sheetId: string | null) =>
        this.zone.run(() => this.activeSheetId.set(sheetId)),
    };
  }

  onReady(api: IGridAPI): void {
    this.api = api;
    // Subscriptions die with the grid instance, which this page owns for its lifetime. The grid
    // emits outside Angular's zone, so the resync re-enters it like the wrapper's own outputs do.
    const resync = () => this.zone.run(() => this.syncFromGrid(api));
    api.on("pivotChanged", resync);
    api.on("aggregateChanged", resync);
    api.on("columnsChanged", resync);
    this.syncFromGrid(api);
  }

  private syncFromGrid(api: IGridAPI): void {
    this.pivotOn.set(api.getPivotMode());
    this.unconfigured.set(api.isPivotUnconfigured());
    this.pivotCols.set(api.getPivotColumns());
    this.groupBy.set(api.getRowGroupColumns());
    this.values.set(api.getAggregates().map((agg) => `${agg.colId}:${agg.type}`));
  }

  onAvailabilityChange(event: Event): void {
    this.availability.set((event.target as HTMLSelectElement).value as "always" | "pivot");
  }

  enterBlankPivot(): void {
    this.clearRoles();
    this.api?.setPivotMode(true);
  }

  configurePivot(): void {
    const api = this.api;
    if (!api) return;
    api.setRowGroupColumns(["region"]);
    api.setPivotColumns(["quarter"]);
    api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
    api.setPivotMode(true);
  }

  clearRoles(): void {
    const api = this.api;
    if (!api) return;
    api.setRowGroupColumns([]);
    api.setPivotColumns([]);
    api.setAggregates([]);
  }

  leavePivot(): void {
    this.api?.setPivotMode(false);
  }
}
