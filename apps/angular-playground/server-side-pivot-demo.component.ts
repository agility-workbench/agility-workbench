import { Component, signal } from "@angular/core";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  type IGridAPI,
  type IServerSideAggregationRequest,
  type IServerSideDataSource,
  type IServerSidePivotField,
  type IServerSideRequest,
  type NgColDef,
} from "@agility-workbench/angular-grid";

/**
 * Pivot on the server-side row model: the grid sends `request.pivot` (pivot column keys and the
 * measures), the server answers with group rows that carry one value per pivot field and, on root
 * responses, the `pivotFields` list that declares the generated columns. The grid orders the
 * header itself, never asks for leaf rows (the deepest row-group level does not expand), sorts a
 * generated column by the server's field name, and gets footer grand totals from `getAggregates`
 * with the same pivot block.
 *
 * The fake server below does the aggregation in memory over 5,000 rows, with a 250 ms delay. The
 * panel shows the last row request and what came back, so the contract is visible without dev
 * tools. Open the column panel (toolbar → Columns) to change row groups, pivot columns and values.
 * Mirrors the React page (apps/react-playground/ServerSidePivotDemo.tsx).
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
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
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

const ALL_ROWS = buildRows(5_000);

// ---- The fake server ----------------------------------------------------------------------------

function aggregate(type: string, rows: SaleRow[], key: string): number | undefined {
  const nums = rows.map(row => (row as any)[key]).filter(v => typeof v === "number") as number[];
  if (type === AggregateType.COUNT) return rows.length;
  if (nums.length === 0) return undefined;
  switch (type) {
    case AggregateType.SUM: return nums.reduce((s, v) => s + v, 0);
    case AggregateType.AVG: return nums.reduce((s, v) => s + v, 0) / nums.length;
    case AggregateType.MIN: return Math.min(...nums);
    case AggregateType.MAX: return Math.max(...nums);
    default: return undefined;
  }
}

// The server's own field names: "Q1|Hardware::sum(revenue)".
const fieldName = (keys: any[], valueKey: string, type: string) => `${keys.join("|")}::${type}(${valueKey})`;

// Every pivot field of the filtered set — the whole set, whatever block was asked for.
function pivotFields(pivot: NonNullable<IServerSideRequest["pivot"]>, rows: SaleRow[]): IServerSidePivotField[] {
  const paths = new Map<string, any[]>();
  for (const row of rows) {
    const keys = pivot.pivotBy.map(key => (row as any)[key]);
    paths.set(JSON.stringify(keys), keys);
  }
  const fields: IServerSidePivotField[] = [];
  for (const keys of paths.values()) {
    for (const value of pivot.values) {
      fields.push({ field: fieldName(keys, value.key, value.type), pivotKeys: keys, valueKey: value.key, aggregate: value.type });
    }
  }
  return fields;
}

// One value per pivot field: the measure over the rows on that pivot path.
function pivotValues(pivot: NonNullable<IServerSideRequest["pivot"]>, rows: SaleRow[]): Record<string, number | undefined> {
  const byPath = new Map<string, SaleRow[]>();
  for (const row of rows) {
    const path = JSON.stringify(pivot.pivotBy.map(key => (row as any)[key]));
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path)!.push(row);
  }
  const out: Record<string, number | undefined> = {};
  for (const [path, pathRows] of byPath) {
    const keys = JSON.parse(path);
    for (const value of pivot.values) out[fieldName(keys, value.key, value.type)] = aggregate(value.type, pathRows, value.key);
  }
  return out;
}

function sortRows(rows: any[], sorts: IServerSideRequest["sorts"]): any[] {
  if (sorts.length === 0) return rows;
  return rows.slice().sort((a, b) => {
    for (const sort of sorts) {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === bv) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : 1;
      return sort.dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function serveRows(request: IServerSideRequest) {
  const rows = ALL_ROWS.filter(row => request.groupKeys.every(k => (row as any)[k.key] === k.value));
  let out: any[];
  if (request.groupKeys.length < request.groupBy.length || (request.pivot && request.groupBy.length === 0)) {
    // Group rows (or the pivot's one grand-total row when nothing is grouped).
    const key = request.groupBy[request.groupKeys.length];
    const buckets = new Map<any, SaleRow[]>();
    for (const row of rows) {
      const value = key ? (row as any)[key] : "total";
      if (!buckets.has(value)) buckets.set(value, []);
      buckets.get(value)!.push(row);
    }
    out = Array.from(buckets, ([value, groupRows]) => {
      const groupRow: any = key ? { [key]: value, childCount: groupRows.length } : {};
      if (request.pivot) Object.assign(groupRow, pivotValues(request.pivot, groupRows));
      for (const agg of request.aggregates) groupRow[agg.key] = aggregate(agg.type, groupRows, agg.key);
      return groupRow;
    });
  } else {
    out = rows;
  }
  out = sortRows(out, request.sorts);
  const start = request.startRow ?? 0;
  const end = request.endRow ?? out.length;
  return {
    rows: out.slice(start, end),
    totalRows: out.length,
    // Root responses declare the generated columns.
    ...(request.pivot && request.groupKeys.length === 0 ? { pivotFields: pivotFields(request.pivot, ALL_ROWS) } : {}),
  };
}

function serveTotals(request: IServerSideAggregationRequest) {
  if (request.pivot) return { values: pivotValues(request.pivot, ALL_ROWS) };
  const values: Record<string, number | undefined> = {};
  for (const agg of request.aggregates) values[agg.key] = aggregate(agg.type, ALL_ROWS, agg.key);
  return { values };
}

// ---- The page -----------------------------------------------------------------------------------

function describeRequest(request: IServerSideRequest): string {
  return JSON.stringify({
    groupBy: request.groupBy,
    groupKeys: request.groupKeys.map(k => k.value),
    pivot: request.pivot,
    sorts: request.sorts,
    startRow: request.startRow,
    endRow: request.endRow,
  });
}

function describeResponse(result: ReturnType<typeof serveRows>): string {
  const fields = result.pivotFields;
  const fieldText = fields
    ? `pivotFields: ${fields.length} (${fields.slice(0, 3).map(f => f.field).join(", ")}${fields.length > 3 ? ", …" : ""})`
    : "no pivotFields (child listing)";
  return `rows: ${result.rows.length} of ${result.totalRows} · ${fieldText}`;
}

@Component({
  selector: "server-side-pivot-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="font-size: 12px; line-height: 1.5; max-width: 1100px">
      <strong>Server-side pivot:</strong> the grid sends <code>request.pivot</code> (pivot column keys
      and measures) and the server answers with group rows carrying one value per pivot field, plus
      <code>pivotFields</code> on root responses to declare the generated columns. The grid orders the
      header, never requests leaf rows, and sorts a generated column by the server's field name (click
      a quarter header). Footer grand totals come from <code>getAggregates</code> with the same pivot
      block; switch it off and the footer has nothing to show while grouped. Open toolbar → Columns to
      change row groups, pivot columns and values.
    </div>

    <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap">
      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        <input type="checkbox" [checked]="withTotals()" (change)="onTotalsChange($event)" />
        getAggregates on the data source (footer grand totals)
      </label>
      <button class="btn" type="button" (click)="togglePivotMode()">Toggle pivot mode</button>
      <button class="btn" type="button" (click)="remount()">Remount grid</button>
    </div>

    <div
      style="font-size: 11px; font-family: monospace; white-space: pre-wrap; word-break: break-all;
             padding: 8px; border-radius: 4px; border: 1px solid #d1d5db; background: rgba(156, 163, 175, 0.08)"
    >
      <div><strong>last getRows request</strong> ({{ rowRequests() }} so far): {{ lastRequest() }}</div>
      <div><strong>response</strong>: {{ lastResponse() }}</div>
      <div>
        <strong>getAggregates calls</strong>:
        {{ !withTotals() ? "not wired" : totalsCalls().length === 0 ? "none yet" : totalsCalls().join(" ⟵ ") }}
      </div>
    </div>

    <div style="flex: 1; min-width: 0; min-height: 0">
      @for (gen of [generation()]; track gen) {
        <awb-grid
          [columnDefs]="columnDefs"
          rowIdKey="id"
          rowModelType="serverSide"
          [serverSideDataSource]="makeDataSource()"
          [getGroupChildCount]="getGroupChildCount"
          [toolbar]="{ pivot: true }"
          [columnPanel]="{ trigger: 'toolbar' }"
          (gridReady)="onReady($event)"
        />
      }
    </div>
  `,
  styles: [":host { display: flex; flex-direction: column; height: 100%; gap: 12px; min-height: 0 }"],
})
export class ServerSidePivotDemoComponent {
  readonly withTotals = signal(true);
  readonly lastRequest = signal("—");
  readonly lastResponse = signal("—");
  readonly rowRequests = signal(0);
  readonly totalsCalls = signal<string[]>([]);
  /** Remount key: the data source is a creation-time decision (the React page changes its `key`).
   * Rendered through `@for … track generation()` because an `@if` flipped off and back on inside
   * one change-detection turn never actually destroys the component. */
  readonly generation = signal(0);

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "quarter", key: "quarter", label: "Quarter", width: 110 },
    { colId: "product", key: "product", label: "Product", width: 130 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ];

  readonly getGroupChildCount = (row: any) => row.childCount;

  private api: IGridAPI | null = null;
  // One data source per mount, so a re-render does not hand the grid a new one.
  private dataSource: IServerSideDataSource | null = null;
  private dataSourceGeneration = -1;

  makeDataSource(): IServerSideDataSource {
    if (this.dataSource && this.dataSourceGeneration === this.generation()) return this.dataSource;
    const source: IServerSideDataSource = {
      getRows: ({ request, success }) => {
        this.rowRequests.update(n => n + 1);
        setTimeout(() => {
          const result = serveRows(request);
          this.lastRequest.set(describeRequest(request));
          this.lastResponse.set(describeResponse(result));
          success(result);
        }, 250);
      },
    };
    if (this.withTotals()) {
      source.getAggregates = ({ request, success }) => {
        this.totalsCalls.update(calls => [
          `pivot=${request.pivot ? JSON.stringify(request.pivot.values.map(v => `${v.key}:${v.type}`)) : "none"} aggregates=${request.aggregates.length}`,
          ...calls,
        ].slice(0, 3));
        setTimeout(() => success(serveTotals(request)), 250);
      };
    }
    this.dataSource = source;
    this.dataSourceGeneration = this.generation();
    return source;
  }

  onReady(api: IGridAPI): void {
    this.api = api;
    // Pivot mode first: roles assigned while pivoted belong to the pivot view, so turning the
    // mode off returns to the plain flat grid.
    api.setPivotMode(true);
    api.setRowGroupColumns(["region"]);
    api.setPivotColumns(["quarter"]);
    api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
  }

  onTotalsChange(ev: Event): void {
    this.withTotals.set((ev.target as HTMLInputElement).checked);
    this.remount();
  }

  togglePivotMode(): void {
    this.api?.setPivotMode(!this.api.getPivotMode());
  }

  remount(): void {
    this.api = null;
    this.lastRequest.set("—");
    this.lastResponse.set("—");
    this.rowRequests.set(0);
    this.totalsCalls.set([]);
    this.generation.update(g => g + 1);
  }
}
