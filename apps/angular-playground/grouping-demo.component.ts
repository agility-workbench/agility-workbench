import { Component, computed, signal } from "@angular/core";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  type ColumnPanelTrigger,
  type GroupDisplayType,
  type GroupSortMode,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

/**
 * Row-grouping playground: group by one or more columns, switch the GroupDisplayType, and toggle a
 * SUM aggregate. The grid lives in a constrained flex item (minWidth:0) so adding the pinned
 * auto-group column never widens the page.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  category: string;
  rep: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany", "Spain"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
// Deliberately omit one category from each region. This makes a Region → Category grouping useful
// for checking that a Category sort reorders the second-level groups in local group-sort mode.
const CATEGORIES_BY_REGION: Record<string, string[]> = {
  EMEA: ["Hardware", "Software"],
  APAC: ["Software", "Services"],
  Americas: ["Hardware", "Services"],
};
const REPS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva", "Ethan Khan"];

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
  const rand = mulberry32(7);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      category: pick(CATEGORIES_BY_REGION[region]),
      rep: pick(REPS),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 500_000),
    };
  });
}

const GROUPABLE: Array<{ colId: string; label: string }> = [
  { colId: "region", label: "Region" },
  { colId: "country", label: "Country" },
  { colId: "category", label: "Category" },
  { colId: "rep", label: "Sales Rep" },
];

const DISPLAY_TYPES: GroupDisplayType[] = ["singleColumn", "multipleColumns", "groupRows"];

// Resolve a column's instanceID (the key the aggregate model expects) from its colId.
function colInstance(api: IGridAPI, colId: string): string {
  return api.getColumnModel().getByColId(colId)?.instanceID ?? "";
}

@Component({
  selector: "grouping-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="grouping-controls">
      <div class="grouping-cluster">
        <label for="display-type" style="font-size: 13px">Display type</label>
        <select id="display-type" [value]="displayType()" (change)="onDisplayTypeChange($event)">
          @for (t of displayTypes; track t) {
            <option [value]="t">{{ t }}</option>
          }
        </select>
        <span style="font-size: 11px; color: #9ca3af">(updates live)</span>
      </div>

      <div class="grouping-cluster">
        <span style="font-size: 13px">Group by</span>
        @for (g of groupable; track g.colId) {
          <label class="grouping-check">
            <input type="checkbox" [checked]="groupBy().includes(g.colId)" (change)="toggleGroupCol(g.colId)" />
            {{ g.label }}
          </label>
        }
      </div>

      <label class="grouping-check">
        <input type="checkbox" [checked]="aggregate()" (change)="onAggregateChange($event)" />
        Sum Units &amp; Revenue
      </label>

      <label class="grouping-check">
        <input type="checkbox" [checked]="groupRowsSelectable()" (change)="onGroupRowsSelectableChange($event)" />
        Group rows selectable
      </label>

      <label class="grouping-check">
        Group sort mode
        <select [value]="groupSortMode()" (change)="onGroupSortModeChange($event)">
          <option value="local">Local</option>
          <option value="hierarchy">Hierarchy</option>
          <option value="global">Global</option>
        </select>
      </label>

      <button class="btn" type="button" (click)="clearGrouping()">Clear grouping</button>
    </div>

    <div class="grouping-cluster">
      <label for="column-panel-trigger" style="font-size: 13px">Columns trigger</label>
      <select id="column-panel-trigger" [value]="columnPanelTrigger()" (change)="onColumnPanelTriggerChange($event)">
        <option value="rail">Rail</option>
        <option value="header">Header</option>
        <option value="menu">Column menu</option>
        <option value="footer">Footer</option>
        <option value="toolbar">Toolbar</option>
      </select>
    </div>

    <!-- minWidth:0 keeps the grid from widening the page when the pinned auto-group column appears. -->
    <div class="grouping-grid-host">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [groupDisplayType]="displayType()"
        [groupDefaultExpanded]="1"
        [groupSortMode]="groupSortMode()"
        [groupRowsSelectable]="groupRowsSelectable()"
        [columnPanel]="columnPanel()"
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

      .grouping-controls {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }

      .grouping-cluster {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .grouping-check {
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .grouping-grid-host {
        flex: 1;
        min-width: 0;
        min-height: 0;
      }
    `,
  ],
})
export class GroupingDemoComponent {
  readonly rows = buildRows(2000);
  readonly groupable = GROUPABLE;
  readonly displayTypes = DISPLAY_TYPES;

  readonly displayType = signal<GroupDisplayType>("singleColumn");
  readonly groupBy = signal<string[]>(["region", "category"]);
  readonly aggregate = signal(true);
  readonly groupRowsSelectable = signal(true);
  readonly groupSortMode = signal<GroupSortMode>("local");
  readonly columnPanelTrigger = signal<ColumnPanelTrigger>("rail");
  readonly columnPanel = computed(() => ({ trigger: this.columnPanelTrigger() }));

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    // colSpan demo: the Category cell spans across Sales Rep whenever it is "Services", producing a
    // merged two-column cell on those rows only. Span is clamped within the (center) section.
    {
      colId: "category", key: "category", label: "Category", width: 130,
      colSpan: (p) => (p.value === "Services" ? 2 : 1),
    },
    { colId: "rep", key: "rep", label: "Sales Rep", width: 160 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ];

  private api: IGridAPI | null = null;

  onReady(api: IGridAPI): void {
    this.api = api;
    this.applyAggregates(this.aggregate());
    this.applyGrouping(this.groupBy());
  }

  onDisplayTypeChange(event: Event): void {
    this.displayType.set((event.target as HTMLSelectElement).value as GroupDisplayType);
  }

  onGroupSortModeChange(event: Event): void {
    this.groupSortMode.set((event.target as HTMLSelectElement).value as GroupSortMode);
  }

  onColumnPanelTriggerChange(event: Event): void {
    this.columnPanelTrigger.set((event.target as HTMLSelectElement).value as ColumnPanelTrigger);
  }

  onGroupRowsSelectableChange(event: Event): void {
    this.groupRowsSelectable.set((event.target as HTMLInputElement).checked);
  }

  onAggregateChange(event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.aggregate.set(on);
    this.applyAggregates(on);
  }

  toggleGroupCol(colId: string): void {
    const prev = this.groupBy();
    const next = prev.includes(colId) ? prev.filter((c) => c !== colId) : [...prev, colId];
    this.groupBy.set(next);
    this.applyGrouping(next);
  }

  clearGrouping(): void {
    this.groupBy.set([]);
    this.applyGrouping([]);
  }

  private applyGrouping(colIds: string[]): void {
    this.api?.dispatch({ type: "rowGroupSet", colIds });
  }

  private applyAggregates(on: boolean): void {
    const api = this.api;
    if (!api) return;
    const model = on
      ? [
        { key: colInstance(api, "units"), type: AggregateType.SUM },
        { key: colInstance(api, "revenue"), type: AggregateType.SUM },
      ].filter((m) => m.key)
      : [];
    api.dispatch({ type: "aggregateModelSet", aggregateModels: model as any });
  }
}
