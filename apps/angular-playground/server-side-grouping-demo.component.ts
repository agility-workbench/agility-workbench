import { Component, computed, signal } from "@angular/core";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  type IGridAPI,
  type IServerSideDataSource,
  type IServerSideRequest,
  type NgColDef,
  type PaginationControl,
  type PaginationControlsOptions,
} from "@agility-workbench/angular-grid";

/**
 * Server-side grouping playground: a fake server (in-memory, 250ms latency) implements the
 * grouping contract — per-parent block requests, GROUP BY rows with counts and sums, optional
 * totalRows. Toggle "Report totalRows" off to see the open-ended flow: the pager shows "N+",
 * "next" keeps probing past the frontier, and the count pins once an empty block comes back.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  category: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany", "Spain"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
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

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(11);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      category: pick(CATEGORIES),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 500_000),
    };
  });
}

// The "database". Module-level and mutable so the Mutate button can simulate server-side changes
// that only become visible through refreshServerSideData.
const ALL_ROWS = buildRows(5_000);

function serveRequest(request: IServerSideRequest, reportTotals: boolean) {
  let subset = ALL_ROWS.filter(row =>
    request.groupKeys.every(k => (row as any)[k.key] === k.value));

  let rows: any[];
  if (request.groupKeys.length < request.groupBy.length) {
    // Group level: one row per bucket, ordered by the bucket's sort (or ascending), carrying the
    // leaf-descendant count and any requested sums.
    const key = request.groupBy[request.groupKeys.length];
    const buckets = new Map<string, SaleRow[]>();
    for (const row of subset) {
      const v = String((row as any)[key]);
      if (!buckets.has(v)) buckets.set(v, []);
      buckets.get(v)!.push(row);
    }
    const groupSort = request.sorts.find(s => s.key === key);
    const dir = groupSort?.dir === "desc" ? -1 : 1;
    rows = Array.from(buckets.keys())
      .sort((a, b) => a.localeCompare(b) * dir)
      .map((v) => {
        const leaves = buckets.get(v)!;
        const groupRow: any = { [key]: (leaves[0] as any)[key], count: leaves.length };
        for (const agg of request.aggregates) {
          if (agg.type === AggregateType.SUM) {
            groupRow[agg.key] = leaves.reduce((s, r) => s + Number((r as any)[agg.key] ?? 0), 0);
          }
        }
        return groupRow;
      });
  } else {
    // Leaf level within the group path: honor non-grouped sorts.
    const leafSort = request.sorts.find(s => !request.groupBy.includes(s.key));
    if (leafSort) {
      const dir = leafSort.dir === "desc" ? -1 : 1;
      subset = subset.slice().sort((a, b) => {
        const av = (a as any)[leafSort.key];
        const bv = (b as any)[leafSort.key];
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      });
    }
    rows = subset;
  }

  const start = request.startRow ?? 0;
  const end = request.endRow ?? rows.length;
  return {
    rows: rows.slice(start, end),
    totalRows: reportTotals ? rows.length : undefined,
  };
}

const GROUPABLE: Array<{ colId: string; label: string }> = [
  { colId: "region", label: "Region" },
  { colId: "country", label: "Country" },
  { colId: "category", label: "Category" },
];

type PaginationLayout = "default" | "compact" | "reversed";
const PAGINATION_LAYOUTS: Record<PaginationLayout, PaginationControl[]> = {
  default: ["pageSize", "firstPage", "previousPage", "pageSelector", "nextPage", "lastPage"],
  compact: ["previousPage", "pageSelector", "nextPage"],
  reversed: ["lastPage", "nextPage", "pageSelector", "previousPage", "firstPage", "pageSize"],
};

@Component({
  selector: "server-side-grouping-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap">
      <div style="display: flex; align-items: center; gap: 8px">
        <span style="font-size: 13px">Group by</span>
        @for (col of groupable; track col.colId) {
          <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
            <input type="checkbox" [checked]="groupBy().includes(col.colId)" (change)="toggleGroupCol(col.colId)" />
            {{ col.label }}
          </label>
        }
      </div>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        <input type="checkbox" [checked]="reportTotals()" (change)="onReportTotalsChange($event)" />
        Report totalRows (off → open-ended "+", pager probes)
      </label>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        <input type="checkbox" [checked]="showPageLabel()" (change)="onShowPageLabelChange($event)" />
        Show Page label
      </label>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        <input type="checkbox" [checked]="pagination()" (change)="onPaginationChange($event)" />
        Pagination
      </label>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        Page selection
        <select [value]="pageSelection()" (change)="onPageSelectionChange($event)">
          <option value="select">select</option>
          <option value="buttons">buttons</option>
        </select>
      </label>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        Controls
        <select [value]="paginationLayout()" (change)="onPaginationLayoutChange($event)">
          <option value="default">default order</option>
          <option value="compact">compact</option>
          <option value="reversed">reversed</option>
        </select>
      </label>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        Max page buttons
        <select
          [value]="maxPageButtons()"
          (change)="onMaxPageButtonsChange($event)"
          [disabled]="pageSelection() !== 'buttons'"
        >
          <option [value]="5">5</option>
          <option [value]="7">7</option>
          <option [value]="9">9</option>
        </select>
      </label>

      <label style="font-size: 12px; display: flex; align-items: center; gap: 4px">
        <input type="checkbox" [checked]="stickyGroups()" (change)="onStickyGroupsChange($event)" />
        Sticky group rows
      </label>

      <button class="btn" type="button" (click)="mutateAndSoftRefresh()">Mutate server + soft refresh</button>
      <button class="btn" type="button" (click)="purgeRefreshEmea()">Purge-refresh EMEA subtree</button>
    </div>

    <div style="font-size: 11px; color: #9ca3af; font-family: monospace; min-height: 16px">
      requests: {{ requestLogText() }}
    </div>

    <div style="flex: 1; min-width: 0; min-height: 0">
      @if (mounted()) {
        <awb-grid
          [columnDefs]="columnDefs"
          rowIdKey="id"
          rowModelType="serverSide"
          [serverSideDataSource]="dataSource"
          [serverSideBlockSize]="100"
          [pagination]="pagination()"
          [paginationControls]="paginationControls()"
          [groupRowsSticky]="stickyGroups()"
          [pageSize]="50"
          [getGroupChildCount]="getGroupChildCount"
          (gridReady)="onReady($event)"
        />
      }
    </div>
  `,
  styles: [":host { display: flex; flex-direction: column; height: 100%; gap: 12px; min-height: 0 }"],
})
export class ServerSideGroupingDemoComponent {
  readonly groupable = GROUPABLE;

  readonly groupBy = signal<string[]>(["region", "country"]);
  readonly reportTotals = signal(true);
  readonly pagination = signal(true);
  readonly pageSelection = signal<"select" | "buttons">("select");
  readonly showPageLabel = signal(true);
  readonly paginationLayout = signal<PaginationLayout>("default");
  readonly maxPageButtons = signal(7);
  readonly paginationControls = computed<PaginationControlsOptions>(() => ({
    pageSelection: this.pageSelection(),
    showPageLabel: this.showPageLabel(),
    controls: PAGINATION_LAYOUTS[this.paginationLayout()],
    maxPageButtons: this.maxPageButtons(),
  }));
  readonly stickyGroups = signal(true);
  readonly requestLog = signal<string[]>([]);
  /** Remount flag: the React demo remounts the grid via `key={String(pagination)}`. */
  readonly mounted = signal(true);

  private api: IGridAPI | null = null;

  readonly dataSource: IServerSideDataSource = {
    getRows: ({ request, success }) => {
      this.requestLog.update(log => [
        `${request.groupKeys.length ? request.groupKeys.map(k => String(k.value)).join(" / ") : "(root)"} [${request.startRow}, ${request.endRow})`,
        ...log,
      ].slice(0, 8));
      setTimeout(() => success(serveRequest(request, this.reportTotals())), 250);
    },
  };

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "category", key: "category", label: "Category", width: 130 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ];

  readonly getGroupChildCount = (row: any): number => row.count;

  requestLogText(): string {
    return this.requestLog().join("  •  ") || "—";
  }

  onReady(api: IGridAPI): void {
    this.api = api;
    const model = [
      { key: colInstance(api, "units"), type: AggregateType.SUM },
      { key: colInstance(api, "revenue"), type: AggregateType.SUM },
    ].filter((m) => m.key);
    api.dispatch({ type: "aggregateModelSet", aggregateModels: model as any });
    this.applyGrouping(this.groupBy());
  }

  toggleGroupCol(colId: string): void {
    const prev = this.groupBy();
    const next = prev.includes(colId) ? prev.filter((c) => c !== colId) : [...prev, colId];
    this.groupBy.set(next);
    this.applyGrouping(next);
  }

  onReportTotalsChange(ev: Event): void {
    this.reportTotals.set((ev.target as HTMLInputElement).checked);
  }

  onPaginationChange(ev: Event): void {
    this.pagination.set((ev.target as HTMLInputElement).checked);
    // Match the React demo's key-based remount when the pagination mode flips.
    this.api = null;
    this.mounted.set(false);
    queueMicrotask(() => this.mounted.set(true));
  }

  onPageSelectionChange(ev: Event): void {
    this.pageSelection.set((ev.target as HTMLSelectElement).value as "select" | "buttons");
  }

  onShowPageLabelChange(ev: Event): void {
    this.showPageLabel.set((ev.target as HTMLInputElement).checked);
  }

  onPaginationLayoutChange(ev: Event): void {
    this.paginationLayout.set((ev.target as HTMLSelectElement).value as PaginationLayout);
  }

  onMaxPageButtonsChange(ev: Event): void {
    this.maxPageButtons.set(Number((ev.target as HTMLSelectElement).value));
  }

  onStickyGroupsChange(ev: Event): void {
    this.stickyGroups.set((ev.target as HTMLInputElement).checked);
  }

  mutateAndSoftRefresh(): void {
    mutateServer();
    void this.api?.refreshServerSideData();
  }

  purgeRefreshEmea(): void {
    mutateServer();
    void this.api?.refreshServerSideData({
      groupKeys: [{ key: "region", value: "EMEA" }],
      purge: true,
    });
  }

  private applyGrouping(colIds: string[]): void {
    this.api?.dispatch({ type: "rowGroupSet", colIds });
  }
}

// Simulate a server-side change: bump every EMEA revenue.
function mutateServer(): void {
  for (const row of ALL_ROWS) {
    if (row.region === "EMEA") row.revenue += 1_000;
  }
}

// Resolve a column's instanceID (the key the aggregate model expects) from its colId.
function colInstance(api: IGridAPI, colId: string): string {
  return api.getColumnModel().getByColId(colId)?.instanceID ?? "";
}
