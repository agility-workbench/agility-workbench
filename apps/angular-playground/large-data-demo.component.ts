import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from "@angular/core";
import { AwbGrid, ColumnType, type IGridAPI, type NgColDef } from "@agility-workbench/angular-grid";

const ROWS = 10_000;
const METRICS = 197; // + id, name (pinned left) and total (pinned right) = 200 columns

type Row = Record<string, number | string>;

function buildRows(): Row[] {
  const rows: Row[] = new Array(ROWS);
  for (let r = 0; r < ROWS; r++) {
    const row: Row = { id: r + 1, name: `Account ${String(r + 1).padStart(5, "0")}` };
    let total = 0;
    for (let c = 0; c < METRICS; c++) {
      const value = (r * 31 + c * 17) % 1_000;
      row[`m${c}`] = value;
      total += value;
    }
    row.total = total;
    rows[r] = row;
  }
  return rows;
}

/**
 * Large data set: 10,000 rows × 200 columns. Same page as the vanilla playground's
 * large-data-demo.ts. Both virtualization options are creation-only: the grid sits in a keyed
 * `@for` over one key, so changing an option destroys it and creates a new one.
 */
@Component({
  selector: "large-data-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="ld-controls">
      <label>
        <input type="checkbox" [checked]="virtualize()" (change)="setVirtualize($any($event.target).checked)" />
        Column virtualization
      </label>
      <label>
        overscanColumnCount
        <select [value]="overscan()" (change)="setOverscan($any($event.target).value)">
          @for (n of overscanChoices; track n) {
            <option [value]="n" [selected]="n === overscan()">{{ n }}</option>
          }
        </select>
      </label>
      <span class="ld-count">{{ count() }}</span>
    </div>
    <p class="ld-blurb">
      {{ rowCount }} rows × 200 columns (two pinned left, one pinned right). Scroll sideways and watch
      the count: with column virtualization on, each row renders the visible centre columns plus
      <code>overscanColumnCount</code> on each side; pinned columns, the header and the aggregate row
      are always fully rendered. Both options are creation-only, so changing one rebuilds the grid.
    </p>
    <div class="demo-grid-host" #host>
      @for (key of [gridKey()]; track key) {
        <awb-grid
          [rowData]="rows"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [rowSelection]="{ mode: 'multiple', checkboxes: true }"
          [columnVirtualization]="virtualize()"
          [overscanColumnCount]="overscan()"
          (gridReady)="onReady($event)"
        />
      }
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
      .ld-controls {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        font-size: 13px;
      }
      .ld-controls label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .ld-count {
        font-family: monospace;
      }
      .ld-blurb {
        margin: 0;
        font-size: 13px;
        color: #6b7280;
        line-height: 1.5;
      }
    `,
  ],
})
export class LargeDataDemoComponent {
  readonly rows = buildRows();
  readonly rowCount = ROWS.toLocaleString();
  readonly overscanChoices = [0, 1, 2, 4, 8, 16];
  readonly virtualize = signal(true);
  readonly overscan = signal(2);
  readonly gridKey = signal("true-2");
  readonly count = signal("");
  private readonly host = viewChild.required<ElementRef<HTMLElement>>("host");
  private offs: Array<() => void> = [];
  private frame = 0;
  private readonly onResize = () => this.recount();

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "ID", width: 80, pinned: "left", type: ColumnType.NUMBER },
    { colId: "name", key: "name", label: "Account", width: 150, pinned: "left", editable: true },
    ...Array.from({ length: METRICS }, (_, c): NgColDef => ({
      colId: `m${c}`, key: `m${c}`, label: `Metric ${c + 1}`, width: 110, type: ColumnType.NUMBER, editable: true,
    })),
    { colId: "total", key: "total", label: "Total", width: 120, pinned: "right", type: ColumnType.NUMBER },
  ];

  constructor() {
    window.addEventListener("resize", this.onResize);
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      window.removeEventListener("resize", this.onResize);
      this.offs.forEach(off => off());
      this.offs = [];
    });
  }

  setVirtualize(value: boolean): void {
    this.virtualize.set(value);
    this.gridKey.set(`${value}-${this.overscan()}`);
  }

  setOverscan(value: string): void {
    this.overscan.set(Number(value));
    this.gridKey.set(`${this.virtualize()}-${value}`);
  }

  onReady(api: IGridAPI): void {
    this.offs.forEach(off => off());
    const recount = () => this.recount();
    this.offs = [
      api.on("bodyScroll", recount),
      api.on("columnWidthsChanged", recount),
      api.on("columnsChanged", recount),
      api.on("firstDataRendered", recount),
    ];
    this.recount();
  }

  private recount(): void {
    cancelAnimationFrame(this.frame);
    // After the grid's own frame-batched window update.
    this.frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const body = this.host().nativeElement.querySelector(".pte-body");
      const cells = body?.querySelectorAll(".pte-cell:not(.pte-full-width-cell)").length ?? 0;
      const centreRow = body?.querySelector<HTMLElement>(".pte-viewport .pte-row[data-view-idx]");
      const perRow = centreRow?.querySelectorAll(":scope > .pte-cell:not(.pte-full-width-cell)").length ?? 0;
      this.count.set(`${cells.toLocaleString()} rendered .pte-cell elements in the body (${perRow} centre cells per row of ${METRICS})`);
    }));
  }
}
