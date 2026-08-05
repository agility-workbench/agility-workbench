import { Component, computed, signal } from "@angular/core";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  type ColumnPanelTrigger,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

type OrderRow = {
  id: number;
  customer: string;
  region: string;
  units: number;
  revenue: number;
};

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne"];
const REGIONS = ["North", "South", "East", "West"];

function buildRows(): OrderRow[] {
  return Array.from({ length: 24 }, (_, index) => ({
    id: index + 1,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    region: REGIONS[index % REGIONS.length],
    units: 2 + ((index * 7) % 19),
    revenue: 250 + ((index * 137) % 2400),
  }));
}

@Component({
  selector: "footer-visibility-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="fv-controls">
      <label class="fv-check">
        <input type="checkbox" [checked]="pagination()" (change)="onPaginationToggle($event)" />
        Pagination
      </label>

      <label class="fv-check">
        <input type="checkbox" [checked]="aggregateRevenue()" (change)="onAggregateToggle($event)" />
        Sum Revenue
      </label>

      <label class="fv-check">
        <input type="checkbox" [checked]="allowAggregation()" (change)="onCapabilityToggle($event)" />
        Columns aggregatable
      </label>

      <span class="fv-note">
        Shared footer expected: <strong>{{ pagination() || aggregateRevenue() ? "visible" : "hidden" }}</strong>
      </span>
      <span class="fv-note">
        Aggregate controls expected: <strong>{{ allowAggregation() ? "available" : "omitted" }}</strong>
      </span>

      <div class="fv-trigger">
        <label for="column-panel-trigger" class="fv-trigger-label">Columns trigger</label>
        <select id="column-panel-trigger" [value]="columnPanelTrigger()" (change)="onTriggerChange($event)">
          <option value="rail">Rail</option>
          <option value="header">Header</option>
          <option value="menu">Column menu</option>
          <option value="footer">Footer</option>
          <option value="toolbar">Toolbar</option>
        </select>
      </div>
    </div>

    <p class="fv-blurb">
      With both controls off, the aggregate/pagination footer should take up no space. Enable either
      pagination or the Revenue aggregate to reveal it; turn both off to hide it again. Disable
      <code> aggregatable</code> for every column to remove aggregation from the column menus and
      omit the aggregate controls from the shared footer.
    </p>

    <div class="demo-grid-host">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs()"
        rowIdKey="id"
        [pagination]="pagination()"
        [pageSize]="8"
        [pageSizes]="pageSizes"
        [columnPanel]="columnPanelOptions()"
        (gridReady)="onReady($event)"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 12px;
        min-height: 0;
      }
      .fv-controls {
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
      }
      .fv-check {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }
      .fv-note {
        font-size: 13px;
        color: #6b7280;
      }
      .fv-trigger {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .fv-trigger-label {
        font-size: 13px;
      }
      .fv-blurb {
        font-size: 13px;
        color: #6b7280;
        line-height: 1.5;
      }
    `,
  ],
})
export class FooterVisibilityDemoComponent {
  readonly rows = buildRows();
  readonly pagination = signal(false);
  readonly aggregateRevenue = signal(false);
  readonly allowAggregation = signal(true);
  readonly columnPanelTrigger = signal<ColumnPanelTrigger>("rail");

  readonly pageSizes = [8, 16, 24];

  readonly columnDefs = computed<NgColDef[]>(() => [
    { colId: "id", key: "id", label: "Order", width: 100, type: ColumnType.NUMBER, aggregatable: false },
    { colId: "customer", key: "customer", label: "Customer", width: 180, aggregatable: false },
    { colId: "region", key: "region", label: "Region", width: 140, aggregatable: false },
    {
      colId: "units",
      key: "units",
      label: "Units",
      width: 120,
      type: ColumnType.NUMBER,
      aggregatable: this.allowAggregation(),
    },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 160,
      type: ColumnType.CURRENCY,
      aggregatable: this.allowAggregation(),
    },
  ]);

  readonly columnPanelOptions = computed(() => ({ trigger: this.columnPanelTrigger() }));

  private api: IGridAPI | null = null;

  onReady(api: IGridAPI): void {
    this.api = api;
  }

  onPaginationToggle(event: Event): void {
    this.pagination.set((event.target as HTMLInputElement).checked);
  }

  onAggregateToggle(event: Event): void {
    this.setRevenueAggregate((event.target as HTMLInputElement).checked);
  }

  onCapabilityToggle(event: Event): void {
    this.setAggregationCapability((event.target as HTMLInputElement).checked);
  }

  onTriggerChange(event: Event): void {
    this.columnPanelTrigger.set((event.target as HTMLSelectElement).value as ColumnPanelTrigger);
  }

  private setRevenueAggregate(enabled: boolean): void {
    this.aggregateRevenue.set(enabled);
    const api = this.api;
    if (!api) return;
    const revenueColumn = api.getColumnModel().getByColId("revenue");
    api.dispatch({
      type: "aggregateModelSet",
      aggregateModels: enabled && revenueColumn
        ? [{ key: revenueColumn.instanceID, type: AggregateType.SUM }]
        : [],
    });
  }

  private setAggregationCapability(enabled: boolean): void {
    if (!enabled && this.aggregateRevenue()) {
      this.setRevenueAggregate(false);
    }
    this.allowAggregation.set(enabled);
  }
}
