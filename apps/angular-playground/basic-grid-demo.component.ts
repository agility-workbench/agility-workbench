import { Component, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type CellValueChangedParams,
  type GridEventCellClickedParams,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";
import { makeTrades, type Trade } from "./data";

@Component({
  selector: "basic-grid-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="demo-intro">
      Declarative inputs, outputs, and the imperative API. Click a header to sort ({{ "Shift" }} for
      multi-sort), double-click a Price cell to edit, drag across cells for a range selection.
    </div>
    <div class="demo-topbar">
      <button class="btn" (click)="grid.api?.selectAllRows()">Select all rows</button>
      <button class="btn" (click)="grid.api?.deselectAllRows()">Clear selection</button>
      <button class="btn" (click)="addRow()">Add row (applyTransaction)</button>
      <button class="btn" (click)="reset()">Reset data</button>
      <span class="demo-log">{{ log() }}</span>
    </div>
    <div class="demo-grid-host">
      <awb-grid
        #grid="awbGrid"
        [rowData]="rows()"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [rowNumbers]="true"
        [rowSelection]="true"
        [zebraRows]="true"
        [highlightActiveCell]="true"
        [selectAllRowsOnHeaderClick]="true"
        [initialSort]="[{ colId: 'price', dir: 'desc' }]"
        (gridReady)="onReady($event)"
        (cellClicked)="onCellClicked($event)"
        (cellValueChanged)="onCellValueChanged($event)"
      />
    </div>
  `,
})
export class BasicGridDemoComponent {
  readonly rows = signal<Trade[]>(makeTrades(500));
  readonly log = signal("");

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "ID", type: ColumnType.NUMBER, width: 80 },
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "city", key: "city", label: "City", type: ColumnType.STRING },
    { colId: "price", key: "price", label: "Price", type: ColumnType.CURRENCY, editable: true },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER, editable: true },
  ];

  private api: IGridAPI | null = null;
  private nextId = 501;

  onReady(api: IGridAPI): void {
    this.api = api;
  }

  onCellClicked(ev: GridEventCellClickedParams): void {
    this.log.set(`cellClicked: ${String(ev.colId ?? "")} on row ${String(ev.rowId ?? "")}`);
  }

  onCellValueChanged(ev: CellValueChangedParams): void {
    this.log.set(`cellValueChanged: ${ev.colId} → ${String(ev.value)}`);
  }

  addRow(): void {
    const id = String(this.nextId++);
    this.api?.applyTransaction({
      add: [{ id, name: `Fresh Widget ${id}`, city: "Portland", price: 99.99, qty: 1, notes: "Added at runtime" }],
    });
  }

  reset(): void {
    this.nextId = 501;
    this.rows.set(makeTrades(500));
  }
}
