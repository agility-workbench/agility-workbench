import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type GridEventSelectionChangedParams,
  type GridOptions,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

type OrderRow = {
  id: string;
  customer: string;
  region: string;
  status: string;
  owner: string;
  total: number;
};

type SelectionMode = "single" | "multiple";
type CheckboxPin = "left" | "right" | null;

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne", "Wonka", "Hooli"];
const REGIONS = ["North", "South", "East", "West"];
const STATUSES = ["Ready", "Review", "Blocked"];
const OWNERS = ["Ava", "Liam", "Mia", "Noah", "Emma", "Ethan"];

function buildRows(): OrderRow[] {
  return Array.from({ length: 64 }, (_, index) => ({
    id: `ORD-${String(index + 1).padStart(3, "0")}`,
    customer: `${CUSTOMERS[index % CUSTOMERS.length]} ${Math.floor(index / CUSTOMERS.length) + 1}`,
    region: REGIONS[(index * 3) % REGIONS.length],
    status: STATUSES[(index * 5) % STATUSES.length],
    owner: OWNERS[(index * 7) % OWNERS.length],
    total: 850 + ((index * 1379) % 18_000),
  }));
}

@Component({
  selector: "row-selection-checkbox-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="checkbox-demo-intro">
      <div>
        <h2>Row selection checkboxes</h2>
        <p>
          Toggle rows additively, Shift-click to add a range, or use the tri-state header checkbox.
          The checkbox column is independent of row numbers.
        </p>
      </div>
      <div class="checkbox-demo-actions">
        <button class="btn" type="button" (click)="api?.selectAllRows()">Select all rows</button>
        <button class="btn" type="button" (click)="selectSampleIds()">Select sample IDs</button>
        <button class="btn" type="button" (click)="api?.deselectAllRows()">Clear</button>
      </div>
    </div>

    <div class="checkbox-demo-options">
      <label>
        Selection mode
        <select [value]="selectionMode()" (change)="setSelectionMode($any($event.target).value)">
          <option value="multiple">Multiple</option>
          <option value="single">Single</option>
        </select>
      </label>
      <label>
        Initial checkbox pin
        <select [value]="checkboxPin() ?? 'none'" (change)="setCheckboxPin($any($event.target).value)">
          <option value="left">Left</option>
          <option value="none">No pin</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          [checked]="checkboxPinnable()"
          (change)="checkboxPinnable.set($any($event.target).checked)"
        />
        Can be repinned
      </label>
      <label>
        <input
          type="checkbox"
          [checked]="lockBlocked()"
          (change)="lockBlocked.set($any($event.target).checked)"
        />
        Lock "Blocked" rows (isRowSelectable)
      </label>
    </div>

    <div class="checkbox-demo-main">
      <div class="demo-grid-host" style="min-width: 0">
        <awb-grid
          [rowData]="rows"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [rowSelection]="rowSelection()"
          [isRowSelectable]="isRowSelectable()"
          [getRowStyle]="getRowStyle()"
          [quickFilter]="true"
          [pagination]="true"
          [pageSize]="15"
          [pageSizes]="pageSizes"
          (gridReady)="onReady($event)"
          (selectionChanged)="onSelectionChanged($event)"
        />
      </div>

      <aside class="checkbox-demo-summary">
        <h3>Selected rows</h3>
        <div class="checkbox-demo-count">{{ selectedIds().length }}</div>
        <div class="checkbox-demo-reason">last change: {{ lastReason() }}</div>
        <div class="checkbox-demo-ids">
          @for (id of selectedIds().slice(0, 18); track id) {
            <code>{{ id }}</code>
          }
        </div>
        @if (selectedIds().length > 18) {
          <p class="checkbox-demo-empty">+{{ selectedIds().length - 18 }} more</p>
        }
        @if (selectedIds().length === 0) {
          <p class="checkbox-demo-empty">Use a row or header checkbox to begin.</p>
        }
      </aside>
    </div>
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 12px }
      .checkbox-demo-intro {
        display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
        padding: 12px 14px; border: 1px solid var(--pte-frame-border-color, #d1d5db);
        border-radius: 8px; background: var(--pte-header-bg-color, #fff)
      }
      .checkbox-demo-intro h2 { font-size: 18px; margin-bottom: 4px }
      .checkbox-demo-intro p { font-size: 13px; line-height: 1.45; opacity: 0.75 }
      .checkbox-demo-actions { display: flex; gap: 8px; flex-wrap: wrap }
      .checkbox-demo-options {
        display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 8px 12px;
        border: 1px solid var(--pte-frame-border-color, #d1d5db); border-radius: 8px
      }
      .checkbox-demo-options label { display: flex; align-items: center; gap: 6px; font-size: 13px }
      .checkbox-demo-main { display: flex; flex: 1; min-height: 0; gap: 12px }
      .checkbox-demo-summary {
        width: 260px; flex-shrink: 0; align-self: stretch; overflow: auto; box-sizing: border-box;
        padding: 12px; border: 1px solid var(--pte-frame-border-color, #d1d5db);
        border-radius: 8px; background: var(--pte-header-bg-color, #fff)
      }
      .checkbox-demo-summary h3 { font-size: 14px; margin-bottom: 8px }
      .checkbox-demo-count { font-size: 24px; font-weight: 700 }
      .checkbox-demo-reason { font-size: 12px; opacity: 0.65; margin-top: 2px }
      .checkbox-demo-ids { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px }
      .checkbox-demo-ids code {
        padding: 3px 6px; border-radius: 4px; background: var(--pte-input-bg-color, #eef2f7); font-size: 11px
      }
      .checkbox-demo-empty { font-size: 12px; opacity: 0.65; margin-top: 10px }
    `,
  ],
})
export class RowSelectionCheckboxDemoComponent {
  readonly rows = buildRows();
  readonly selectionMode = signal<SelectionMode>("multiple");
  readonly checkboxPin = signal<CheckboxPin>("left");
  readonly checkboxPinnable = signal(true);
  readonly rowSelection = computed(() => ({
    mode: this.selectionMode(),
    checkboxes: true,
    checkboxColumnPinned: this.checkboxPin(),
    checkboxColumnPinnable: this.checkboxPinnable(),
  }));
  readonly pageSizes = [15, 30, 60];
  readonly lockBlocked = signal(false);
  // isRowSelectable disables the checkbox and every other selection route for the row; the row's
  // own visual identity (here: dimming via getRowStyle) stays the app's job.
  readonly isRowSelectable = computed<GridOptions["isRowSelectable"]>(() =>
    this.lockBlocked()
      ? node => (node.data as OrderRow).status !== "Blocked"
      : undefined);
  readonly getRowStyle = computed<GridOptions["getRowStyle"]>(() =>
    this.lockBlocked()
      ? params => ((params.data as OrderRow | undefined)?.status === "Blocked"
        ? { opacity: "0.5" }
        : undefined)
      : undefined);
  readonly selectedIds = signal<string[]>([]);
  readonly lastReason = signal("ready");

  api: IGridAPI | null = null;

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "Order", width: 110 },
    { colId: "customer", key: "customer", label: "Customer", width: 180, filter: "text" },
    { colId: "region", key: "region", label: "Region", width: 120, filter: "set" },
    { colId: "status", key: "status", label: "Status", width: 120, filter: "set" },
    { colId: "owner", key: "owner", label: "Owner", width: 120, filter: "set" },
    { colId: "total", key: "total", label: "Total", width: 130, type: ColumnType.CURRENCY },
  ];

  onReady(api: IGridAPI): void {
    this.api = api;
    this.selectedIds.set(api.getSelection().selectedRowIds.map(String));
    this.lastReason.set("ready");
  }

  onSelectionChanged(event: GridEventSelectionChangedParams): void {
    this.selectedIds.set(event.snapshot.selectedRowIds.map(String));
    this.lastReason.set(event.reason ?? "unknown");
  }

  selectSampleIds(): void {
    this.api?.selectRowsById(["ORD-002", "ORD-017", "ORD-036"]);
  }

  setSelectionMode(value: string): void {
    this.selectionMode.set(value === "single" ? "single" : "multiple");
  }

  setCheckboxPin(value: string): void {
    this.checkboxPin.set(value === "none" ? null : value === "right" ? "right" : "left");
  }
}
