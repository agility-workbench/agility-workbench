import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

type DealRow = {
  id: number;
  customer: string;
  region: string;
  units: number;
  revenue: number;
  status: string;
};

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne"];
const REGIONS = ["North", "South", "East", "West"];
const STATUSES = ["Open", "Won", "Lost"];

function buildRows(): DealRow[] {
  return Array.from({ length: 40 }, (_, index) => ({
    id: index + 1,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    region: REGIONS[index % REGIONS.length],
    units: 2 + ((index * 7) % 19),
    revenue: 250 + ((index * 137) % 2400),
    status: STATUSES[index % STATUSES.length],
  }));
}

/** Leaf ids the width slider resizes (the locked edge columns keep their width). */
const DATA_COLUMNS = ["customer", "region", "units", "revenue"];
const INITIAL_WIDTH = 140;

@Component({
  selector: "header-wrap-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="hw-controls">
      <label class="hw-check">
        <input type="checkbox" [checked]="wrap()" (change)="wrap.set(checked($event)); reapplyWidth()" />
        Wrap header text
      </label>
      <label class="hw-check">
        <input type="checkbox" [checked]="autoHeight()" (change)="autoHeight.set(checked($event)); reapplyWidth()" />
        Auto header height
      </label>
      <label class="hw-check">
        Column width
        <input type="range" min="70" max="320" step="10" [value]="width()" (input)="onWidth($event)" />
        <span class="hw-width">{{ width() }}px</span>
      </label>
    </div>

    <div class="hw-controls">
      <button type="button" class="btn" (click)="api?.setColumnPinned('region', 'left')">Pin region left</button>
      <button type="button" class="btn" (click)="api?.setColumnPinned(dataColumns, null)">Unpin all</button>
      <button type="button" class="btn" (click)="api?.setColumnVisible('units', false)">Hide units</button>
      <button type="button" class="btn" (click)="api?.setColumnsVisible(dataColumns, true)">Show all</button>
      <button type="button" class="btn" (click)="api?.moveColumn('revenue', 0)">Move revenue to index 0</button>
      <button type="button" class="btn" (click)="api?.moveColumn('id', 99)">Move Order # to the end (locked: no-op)</button>
      <span class="hw-note">Order: {{ order() }}</span>
    </div>

    <p class="hw-blurb">
      The labels wrap with <code>wrapHeaderText</code> and the header grows to fit them with
      <code>autoHeaderHeight</code> (group level and leaf level independently; pinned sections stay
      level). Turn auto height off and wrapped labels are clipped at the configured height.
      <code>Order #</code> is <code>lockPosition: "left"</code> and <code>Deal status</code> is
      <code>"right"</code>: try dragging them, or dropping another column before Order #.
    </p>

    <div class="demo-grid-host">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs()"
        rowIdKey="id"
        [columnPanel]="columnPanel"
        (gridReady)="onReady($event)"
        (columnsChanged)="updateOrder()"
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
      .hw-controls {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        font-size: 13px;
      }
      .hw-check {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hw-width {
        min-width: 48px;
      }
      .hw-note {
        color: #6b7280;
      }
      .hw-blurb {
        font-size: 13px;
        color: #6b7280;
        line-height: 1.5;
      }
    `,
  ],
})
export class HeaderWrapDemoComponent {
  readonly rows = buildRows();
  readonly dataColumns = DATA_COLUMNS;
  readonly columnPanel = { trigger: "rail" as const };
  readonly wrap = signal(true);
  readonly autoHeight = signal(true);
  readonly width = signal(INITIAL_WIDTH);
  readonly order = signal("");

  // Width lives outside the defs: the slider resizes through the API, and the header re-measures.
  readonly columnDefs = computed<NgColDef[]>(() => {
    const header = { wrapHeaderText: this.wrap(), autoHeaderHeight: this.autoHeight() };
    return [
      { colId: "id", key: "id", label: "Order #", width: 90, type: ColumnType.NUMBER, lockPosition: "left", ...header },
      {
        colId: "account", label: "Customer details for the quarterly account review", ...header,
        children: [
          { colId: "customer", key: "customer", label: "Customer account name (legal entity)", width: INITIAL_WIDTH, ...header },
          { colId: "region", key: "region", label: "Primary region of operation", width: INITIAL_WIDTH, ...header },
        ],
      },
      {
        colId: "performance", label: "Commercial performance this fiscal year", ...header,
        children: [
          { colId: "units", key: "units", label: "Units shipped to date across all warehouses", width: INITIAL_WIDTH, type: ColumnType.NUMBER, ...header },
          { colId: "revenue", key: "revenue", label: "Recognised revenue in reporting currency", width: INITIAL_WIDTH, type: ColumnType.CURRENCY, ...header },
        ],
      },
      { colId: "status", key: "status", label: "Deal status", width: 110, lockPosition: "right", ...header },
    ];
  });

  api: IGridAPI | null = null;

  onReady(api: IGridAPI): void {
    this.api = api;
    this.updateOrder();
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  onWidth(event: Event): void {
    this.width.set(Number((event.target as HTMLInputElement).value));
    this.applyWidth();
  }

  /** New defs reset widths to the defs' own; re-apply the slider's once the binding has pushed them. */
  reapplyWidth(): void {
    setTimeout(() => this.applyWidth(), 0);
  }

  updateOrder(): void {
    this.order.set(this.api?.getColumnState().map(s => s.colId).join(", ") ?? "");
  }

  private applyWidth(): void {
    this.api?.setColumnWidths(DATA_COLUMNS.map(colId => ({ colId, widthPx: this.width() })));
  }
}
