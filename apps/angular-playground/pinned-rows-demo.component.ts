import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type NgColDef,
  type RowClassParams,
} from "@agility-workbench/angular-grid";

type Row = {
  id: string;
  team: string;
  owner: string;
  pipeline: number;
  closed: number;
};

const ROWS: Row[] = Array.from({ length: 80 }, (_, index) => ({
  id: `deal-${index + 1}`,
  team: ["Enterprise", "Commercial", "Growth"][index % 3],
  owner: ["Ava", "Liam", "Mia", "Noah", "Emma"][index % 5],
  pipeline: 25_000 + ((index * 7_919) % 180_000),
  closed: 8_000 + ((index * 3_571) % 95_000),
}));

@Component({
  selector: "pinned-rows-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
      <button class="btn" type="button" (click)="showTarget.set(!showTarget())">
        {{ showTarget() ? "Hide" : "Show" }} top forecast
      </button>
      <button class="btn" type="button" (click)="showTotals.set(!showTotals())">
        {{ showTotals() ? "Hide" : "Show" }} bottom totals
      </button>
      <button class="btn" type="button" (click)="raiseForecast()">Raise forecast</button>
      <span style="font-size: 12px; color: #6b7280">
        Pinned rows stay outside sort, filter, pagination, and the virtualized row count.
        Right-click any data row for Pin row / Unpin row.
      </span>
    </div>
    <div style="flex: 1; min-height: 0">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columns"
        rowIdKey="id"
        [pinnedRowsEditable]="true"
        [rowPinningMenu]="true"
        [pinnedTopRowData]="topRows()"
        [pinnedBottomRowData]="bottomRows()"
        [quickFilter]="{ mode: 'always', debounceMs: 0 }"
        [toolbar]="{ sorting: true }"
        [getRowClass]="rowClass"
      />
    </div>
  `,
  styles: [":host { display: flex; flex-direction: column; height: 100%; gap: 10px; min-height: 0 }"],
})
export class PinnedRowsDemoComponent {
  readonly rows = ROWS;
  readonly showTarget = signal(true);
  readonly showTotals = signal(true);
  readonly forecast = signal(8_500_000);

  readonly columns: NgColDef[] = [
    { colId: "team", key: "team", label: "Team", width: 150, pinned: "left" },
    { colId: "owner", key: "owner", label: "Owner", width: 140, editable: true },
    {
      colId: "pipeline",
      key: "pipeline",
      label: "Pipeline",
      width: 160,
      type: ColumnType.CURRENCY,
    },
    {
      colId: "closed",
      key: "closed",
      label: "Closed",
      width: 160,
      type: ColumnType.CURRENCY,
    },
  ];

  private readonly totalPipeline = ROWS.reduce((sum, row) => sum + row.pipeline, 0);
  private readonly totalClosed = ROWS.reduce((sum, row) => sum + row.closed, 0);

  readonly topRows = computed<Row[]>(() => this.showTarget() ? [{
    id: "forecast",
    team: "FY forecast",
    owner: "All teams",
    pipeline: this.forecast(),
    closed: 6_400_000,
  }] : []);

  readonly bottomRows = computed<Row[]>(() => this.showTotals() ? [{
    id: "totals",
    team: "Visible dataset",
    owner: `${ROWS.length} deals`,
    pipeline: this.totalPipeline,
    closed: this.totalClosed,
  }] : []);

  readonly rowClass = ({ node }: RowClassParams): string | undefined =>
    node.rowPinned ? `demo-pinned-${node.rowPinned}` : undefined;

  raiseForecast(): void {
    this.forecast.set(this.forecast() + 250_000);
  }
}
