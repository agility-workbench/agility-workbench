import { Component, signal } from "@angular/core";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  type GroupDisplayType,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

type Row = {
  id: number;
  region: string;
  country: string;
  account: string;
  revenue: number;
};

const REGIONS: Record<string, string[]> = {
  Americas: ["USA", "Canada", "Brazil"],
  EMEA: ["UK", "France", "Germany"],
  APAC: ["India", "Japan", "Australia"],
};

const ROWS: Row[] = Array.from({ length: 240 }, (_, index) => {
  const region = Object.keys(REGIONS)[index % 3];
  const countries = REGIONS[region];
  return {
    id: index + 1,
    region,
    country: countries[Math.floor(index / 3) % countries.length],
    account: `Account ${String(index + 1).padStart(3, "0")}`,
    revenue: 5_000 + ((index * 12_731) % 220_000),
  };
});

@Component({
  selector: "sticky-group-rows-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
      <button class="btn" type="button" (click)="sticky.set(!sticky())">
        Sticky ancestors: {{ sticky() ? "on" : "off" }}
      </button>
      <label style="font-size: 12px">
        Group display
        <select [value]="displayType()" (change)="onDisplayTypeChange($event)">
          <option value="singleColumn">Single column</option>
          <option value="multipleColumns">Multiple columns</option>
          <option value="groupRows">Full-width group rows</option>
        </select>
      </label>
      <button class="btn" type="button" (click)="pinEmea()">Pin EMEA bottom</button>
      <button class="btn" type="button" (click)="clearManualPin()">Clear explicit pin</button>
      <span style="font-size: 12px; color: #6b7280">{{ manualLabel() }}</span>
    </div>
    <div style="font-size: 12px; color: #6b7280">
      Scroll through the expanded Region → Country hierarchy. Active ancestors stack above the
      body; every mirrored chevron controls the original live group.
    </div>
    <div style="flex: 1; min-height: 0">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columns"
        rowIdKey="id"
        [rowPinningMenu]="true"
        [groupDefaultExpanded]="-1"
        [groupRowsSticky]="sticky()"
        [groupDisplayType]="displayType()"
        [groupRowsSelectable]="true"
        [quickFilter]="true"
        [toolbar]="{ grouping: true, sorting: true }"
        (gridReady)="onReady($event)"
      />
    </div>
  `,
  styles: [":host { display: flex; flex-direction: column; height: 100%; gap: 10px; min-height: 0 }"],
})
export class StickyGroupRowsDemoComponent {
  readonly rows = ROWS;
  readonly sticky = signal(true);
  readonly displayType = signal<GroupDisplayType>("singleColumn");
  readonly manualLabel = signal("No explicit group pin");

  readonly columns: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 140 },
    { colId: "country", key: "country", label: "Country", width: 140 },
    { colId: "account", key: "account", label: "Account", width: 190 },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 160,
      type: ColumnType.CURRENCY,
    },
  ];

  private api: IGridAPI | null = null;
  private manuallyPinnedId: string | null = null;

  onReady(api: IGridAPI): void {
    this.api = api;
    api.dispatch({ type: "rowGroupSet", colIds: ["region", "country"] });
    const revenue = api.getColumnModel().getByColId("revenue");
    if (revenue) {
      api.dispatch({
        type: "aggregateModelSet",
        aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }],
      });
    }
  }

  onDisplayTypeChange(ev: Event): void {
    this.displayType.set((ev.target as HTMLSelectElement).value as GroupDisplayType);
  }

  pinEmea(): void {
    const api = this.api;
    if (!api) return;
    if (this.manuallyPinnedId) api.setRowPinned(this.manuallyPinnedId, null);
    const emea = api.getCore().getRowModel().getGroupNodes()
      .find(node => node.level === 0 && node.groupKey === "EMEA");
    if (!emea) return;
    api.setRowPinned(emea.id, "bottom");
    this.manuallyPinnedId = emea.id;
    this.manualLabel.set("EMEA explicitly pinned at bottom");
  }

  clearManualPin(): void {
    if (this.manuallyPinnedId) {
      this.api?.setRowPinned(this.manuallyPinnedId, null);
      this.manuallyPinnedId = null;
    }
    this.manualLabel.set("No explicit group pin");
  }
}
