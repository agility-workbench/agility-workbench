import { Component, VERSION, signal } from '@angular/core';
import {
  AwbGrid,
  ColumnType,
  type GridEventCellClickedParams,
  type GridEventSelectionChangedParams,
  type IGridAPI,
  type NgColDef,
  type SortChangedParams,
} from '@agility-workbench/angular-grid';

export interface SmokeRow {
  id: string;
  name: string;
  region: string;
  units: number;
  active: boolean;
}

const REGIONS = ['Europe', 'Americas', 'APAC'] as const;

export function makeRows(count: number): SmokeRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i + 1}`,
    name: `Item ${String(i + 1).padStart(3, '0')}`,
    region: REGIONS[i % REGIONS.length],
    units: ((i * 37) % 500) + 1,
    active: i % 4 !== 0,
  }));
}

@Component({
  selector: 'app-root',
  imports: [AwbGrid],
  template: `
    <main class="shell">
      <h1>AwbGrid consumer smoke — Angular {{ ngVersion }}</h1>
      <div class="controls">
        <input
          #search
          placeholder="Quick filter (try Europe)"
          (input)="quickFilter(search.value)"
        />
        <button type="button" (click)="sortUnitsDesc()">Sort units desc</button>
        <button type="button" (click)="selectFirstTwo()">Select rows 1–2</button>
        <span data-testid="status">{{ status() }}</span>
      </div>
      <div class="grid-host">
        <awb-grid
          [rowData]="rows"
          [columnDefs]="columns"
          rowIdKey="id"
          [rowSelection]="true"
          [cellSelection]="true"
          [zebraRows]="true"
          (gridReady)="onReady($event)"
          (cellClicked)="onCellClicked($event)"
          (selectionChanged)="onSelectionChanged($event)"
          (sortChanged)="onSortChanged($event)"
        />
      </div>
      <ol data-testid="log">
        @for (line of log(); track $index) {
          <li>{{ line }}</li>
        }
      </ol>
    </main>
  `,
  styles: `
    .shell { display: flex; flex-direction: column; gap: 12px; padding: 16px; height: 100vh; box-sizing: border-box; font: 14px/1.4 system-ui, sans-serif; }
    .controls { display: flex; gap: 8px; align-items: center; }
    .grid-host { flex: 1; min-height: 320px; }
    ol { max-height: 120px; overflow: auto; font: 12px/1.5 ui-monospace, monospace; }
  `,
})
export class App {
  readonly ngVersion = VERSION.full;
  readonly rows = makeRows(200);
  readonly status = signal('waiting for gridReady');
  readonly log = signal<string[]>([]);

  api: IGridAPI | null = null;

  readonly columns: NgColDef[] = [
    { key: 'name', label: 'Name', width: 160 },
    { key: 'region', label: 'Region', width: 120 },
    { key: 'units', label: 'Units', type: ColumnType.NUMBER, width: 100 },
    { key: 'active', label: 'Active', type: ColumnType.BOOLEAN, width: 90 },
  ];

  onReady(api: IGridAPI): void {
    this.api = api;
    this.status.set('grid ready');
    this.push('gridReady');
  }

  onCellClicked(params: GridEventCellClickedParams): void {
    this.push(`cellClicked ${params.colId}`);
  }

  onSelectionChanged(_params: GridEventSelectionChangedParams): void {
    this.push(`selectionChanged rows=${this.api?.getSelectedRows().length ?? 0}`);
  }

  onSortChanged(_params: SortChangedParams): void {
    this.push('sortChanged');
  }

  quickFilter(text: string): void {
    this.api?.setQuickFilter(text);
  }

  sortUnitsDesc(): void {
    if (!this.api) return;
    const state = this.api.captureViewState();
    state.sortModel = [{ colId: 'units', dir: 'desc' }];
    this.api.applyViewState(state);
  }

  selectFirstTwo(): void {
    this.api?.selectRowsById(['r1', 'r2'], 'set');
  }

  private push(line: string): void {
    this.log.update((lines) => [...lines.slice(-19), line]);
  }
}
