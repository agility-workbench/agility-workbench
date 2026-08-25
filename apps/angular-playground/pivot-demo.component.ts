import { Component, signal } from "@angular/core";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

/**
 * Pivot playground: pick the pivot columns and measures, flip pivot mode (checkbox, toolbar
 * indicator, or the column menu's "Pivot on Column"), and watch pivot cells update live as cell
 * edits land. Sorting a generated value column orders the group rows by that cell's aggregate.
 * The toolbar's Columns button opens the column panel, which acts as the pivot customizer while
 * pivoted: role chips per source column plus ordered Row groups / Column labels / Values wells.
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

const PIVOTABLE: Array<{ colId: string; label: string }> = [
  { colId: "quarter", label: "Quarter" },
  { colId: "product", label: "Product" },
];

const MEASURES: Array<{ colId: string; type: AggregateType; label: string }> = [
  { colId: "revenue", type: AggregateType.SUM, label: "Revenue (sum)" },
  { colId: "revenue", type: AggregateType.AVG, label: "Revenue (avg)" },
  { colId: "units", type: AggregateType.SUM, label: "Units (sum)" },
];

@Component({
  selector: "pivot-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="pivot-controls">
      <label class="pivot-check">
        <input type="checkbox" [checked]="pivotOn()" (change)="onPivotModeChange($event)" />
        Pivot mode
      </label>

      <div class="pivot-cluster">
        <span style="font-size: 13px">Pivot on</span>
        @for (p of pivotable; track p.colId) {
          <label class="pivot-check">
            <input type="checkbox" [checked]="pivotCols().includes(p.colId)" (change)="togglePivotCol(p.colId)" />
            {{ p.label }}
          </label>
        }
      </div>

      <div class="pivot-cluster">
        <span style="font-size: 13px">Measures</span>
        @for (m of measures; track m.label; let i = $index) {
          <label class="pivot-check">
            <input type="checkbox" [checked]="selectedMeasures().has(i)" (change)="toggleMeasure(i)" />
            {{ m.label }}
          </label>
        }
      </div>

      <div class="pivot-cluster">
        <span style="font-size: 13px">Group rows by</span>
        @for (g of groupableCols; track g.colId) {
          <label class="pivot-check">
            <input type="checkbox" [checked]="groupBy().includes(g.colId)" (change)="toggleGroupCol(g.colId)" />
            {{ g.label }}
          </label>
        }
      </div>

      <button class="btn" type="button" (click)="bumpARevenueCell()">Bump a revenue cell (+25k)</button>
    </div>

    <!-- minWidth:0 keeps the grid from widening the page as generated pivot columns appear. -->
    <div class="pivot-grid-host">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [groupDefaultExpanded]="1"
        [toolbar]="{ pivot: true }"
        [columnPanel]="{ trigger: 'toolbar' }"
        (gridReady)="onReady($event)"
      />
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

      .pivot-controls {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }

      .pivot-cluster {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .pivot-check {
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .pivot-grid-host {
        flex: 1;
        min-width: 0;
        min-height: 0;
      }
    `,
  ],
})
export class PivotDemoComponent {
  readonly rows = buildRows(2000);
  readonly pivotable = PIVOTABLE;
  readonly measures = MEASURES;
  readonly groupableCols = [
    { colId: "region", label: "Region" },
    { colId: "country", label: "Country" },
  ];

  readonly pivotOn = signal(true);
  readonly pivotCols = signal<string[]>(["quarter"]);
  readonly selectedMeasures = signal<Set<number>>(new Set([0]));
  readonly groupBy = signal<string[]>(["region"]);

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    // A pivotComparator keeps quarters in calendar order even if a formatter renamed them.
    { colId: "quarter", key: "quarter", label: "Quarter", width: 110, pivotComparator: (a, b) => String(a).localeCompare(String(b)) },
    { colId: "product", key: "product", label: "Product", width: 130 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ];

  private api: IGridAPI | null = null;
  private editCounter = 0;

  onReady(api: IGridAPI): void {
    this.api = api;
    this.applyAggregates();
    api.setRowGroupColumns(this.groupBy());
    api.setPivotColumns(this.pivotCols());
    api.setPivotMode(this.pivotOn());
  }

  onPivotModeChange(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.pivotOn.set(on);
    this.api?.setPivotMode(on);
  }

  togglePivotCol(colId: string): void {
    const prev = this.pivotCols();
    const next = prev.includes(colId) ? prev.filter((c) => c !== colId) : [...prev, colId];
    this.pivotCols.set(next);
    this.api?.setPivotColumns(next);
  }

  toggleMeasure(index: number): void {
    const next = new Set(this.selectedMeasures());
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.selectedMeasures.set(next);
    this.applyAggregates();
  }

  toggleGroupCol(colId: string): void {
    const prev = this.groupBy();
    const next = prev.includes(colId) ? prev.filter((c) => c !== colId) : [...prev, colId];
    this.groupBy.set(next);
    this.api?.setRowGroupColumns(next);
  }

  // Live-update demo: bump one revenue cell by a visible amount. In pivot mode the affected pivot
  // cells (and the footer grand totals) re-derive immediately.
  bumpARevenueCell(): void {
    const api = this.api;
    if (!api) return;
    // setCellValue writes into the same row objects rowData holds, so the local ref is live.
    const row = this.rows[this.editCounter++ % 50];
    api.setCellValue({ rowId: String(row.id), colId: "revenue" }, row.revenue + 25_000);
  }

  private applyAggregates(): void {
    const selected = this.selectedMeasures();
    this.api?.setAggregates(MEASURES.filter((_, i) => selected.has(i)));
  }
}
