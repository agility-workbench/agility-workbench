import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type GridOptions,
  type IGridAPI,
  type NgColDef,
  type RowTransactionResult,
} from "@agility-workbench/angular-grid";

type InsertRow = {
  id: string;
  label: string;
  api: "initial" | "sync" | "async" | "menu";
  requestedIndex: number | null;
  batch: number;
  batchOrder: number;
};

const INITIAL_ROW_COUNT = 24;
const MAX_INSERT_COUNT = 1_000;

function buildInitialRows(): InsertRow[] {
  return Array.from({ length: INITIAL_ROW_COUNT }, (_, index) => ({
    id: `initial-${index + 1}`,
    label: `Initial row ${index + 1}`,
    api: "initial",
    requestedIndex: null,
    batch: 0,
    batchOrder: index + 1,
  }));
}

function normalizeInteger(raw: string, minimum: number, maximum: number, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), minimum), maximum);
}

function resultText(result: RowTransactionResult): string {
  return `${result.added} added, ${result.updated} updated, ${result.removed} removed`;
}

@Component({
  selector: "indexed-insert-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <section class="indexed-insert-demo">
      <header class="indexed-insert-header">
        <div>
          <div class="indexed-insert-eyebrow">Client-side transactions</div>
          <h2>Indexed row insertion</h2>
          <p>
            Insert a contiguous block into the underlying row order. With no active sort or filter,
            the requested source index is also the displayed position. Enable the row-number menu
            to insert one row above or below from a right-click.
          </p>
        </div>
        <div class="indexed-insert-status" aria-live="polite">
          {{ status() }}
          @if (pendingAsync() > 0) { ({{ pendingAsync() }} async pending) }
        </div>
      </header>

      <div class="indexed-insert-controls">
        <label>
          Number of rows
          <input
            type="number"
            min="1"
            [max]="maxInsertCount"
            step="1"
            [value]="rowsToInsert()"
            (input)="rowsToInsert.set($any($event.target).value)"
          />
        </label>
        <label>
          Insert at index
          <input
            type="number"
            min="0"
            step="1"
            [value]="addIndex()"
            (input)="addIndex.set($any($event.target).value)"
          />
        </label>
        <button class="btn" type="button" (click)="insertSync()">
          Insert with sync API
        </button>
        <button class="btn" type="button" (click)="insertAsync()">
          Insert with async API
        </button>
        <button
          class="btn"
          type="button"
          [attr.aria-pressed]="rowInsertionMenuEnabled()"
          (click)="toggleRowInsertionMenu()"
        >
          {{ rowInsertionMenuEnabled() ? "Disable" : "Enable" }} row-number Insert menu
        </button>
      </div>

      <div class="indexed-insert-grid">
        <awb-grid
          [rowData]="initialRows"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [rowNumbers]="true"
          [rowInsertionMenu]="rowInsertionMenu()"
          [zebraRows]="true"
          [highlightActiveCell]="true"
          [asyncTransactionWaitMs]="64"
          (gridReady)="onReady($event)"
        />
      </div>
    </section>
  `,
  styles: [":host { display: block; height: 100%; min-height: 0; }"],
})
export class IndexedInsertDemoComponent {
  readonly initialRows = buildInitialRows();
  readonly rowsToInsert = signal("5");
  readonly addIndex = signal("3");
  readonly pendingAsync = signal(0);
  readonly rowInsertionMenuEnabled = signal(false);
  readonly status = signal("Choose a block size and source index, then run either API.");
  readonly maxInsertCount = MAX_INSERT_COUNT;
  readonly rowInsertionMenu = computed<GridOptions["rowInsertionMenu"]>(() => {
    if (!this.rowInsertionMenuEnabled()) return undefined;
    return {
      createRow: ({ position, addIndex }) => {
        const [row] = this.makeRows("menu", 1, addIndex);
        this.status.set(`Context menu inserted 1 row ${position} at source index ${addIndex}.`);
        return row;
      },
    };
  });

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "Row ID", width: 140 },
    { colId: "label", key: "label", label: "Label", width: 190 },
    { colId: "api", key: "api", label: "Inserted by", width: 120 },
    {
      colId: "requestedIndex",
      key: "requestedIndex",
      label: "Requested index",
      width: 145,
      type: ColumnType.NUMBER,
    },
    { colId: "batch", key: "batch", label: "Batch", width: 90, type: ColumnType.NUMBER },
    {
      colId: "batchOrder",
      key: "batchOrder",
      label: "Order in batch",
      width: 135,
      type: ColumnType.NUMBER,
    },
  ];

  private api: IGridAPI | null = null;
  private nextRowId = INITIAL_ROW_COUNT + 1;
  private nextBatch = 1;

  onReady(api: IGridAPI): void {
    this.api = api;
  }

  insertSync(): void {
    const api = this.api;
    if (!api) return;
    const { count, index } = this.readRequest();
    const result = api.applyTransaction({ add: this.makeRows("sync", count, index), addIndex: index });
    this.status.set(`Sync transaction at index ${index}: ${resultText(result)}.`);
  }

  insertAsync(): void {
    const api = this.api;
    if (!api) return;
    const { count, index } = this.readRequest();
    this.pendingAsync.update(value => value + 1);
    this.status.set(`Queued async transaction with ${count} rows at index ${index}…`);
    void api.applyTransactionAsync({
      add: this.makeRows("async", count, index),
      addIndex: index,
    }).then(result => {
      this.status.set(`Async transaction settled at index ${index}: ${resultText(result)}.`);
    }).finally(() => {
      this.pendingAsync.update(value => Math.max(0, value - 1));
    });
  }

  toggleRowInsertionMenu(): void {
    const enabled = !this.rowInsertionMenuEnabled();
    this.rowInsertionMenuEnabled.set(enabled);
    this.status.set(enabled
      ? "Row-number Insert menu enabled. Right-click a row number to insert above or below it."
      : "Row-number Insert menu disabled.");
  }

  private readRequest(): { count: number; index: number } {
    return {
      count: normalizeInteger(this.rowsToInsert(), 1, MAX_INSERT_COUNT, 1),
      index: normalizeInteger(this.addIndex(), 0, Number.MAX_SAFE_INTEGER, 0),
    };
  }

  private makeRows(api: "sync" | "async" | "menu", count: number, index: number): InsertRow[] {
    const batch = this.nextBatch++;
    return Array.from({ length: count }, (_, offset) => {
      const id = this.nextRowId++;
      return {
        id: `inserted-${id}`,
        label: `${api === "sync" ? "Sync" : api === "async" ? "Async" : "Menu"} inserted row ${id}`,
        api,
        requestedIndex: index,
        batch,
        batchOrder: offset + 1,
      };
    });
  }
}
