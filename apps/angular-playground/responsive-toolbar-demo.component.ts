import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  signal,
  viewChild,
} from "@angular/core";
import {
  AggregateType,
  AwbGrid,
  ColumnType,
  type GridSheet,
  type IGridAPI,
  type NgColDef,
  type SheetsOptions,
} from "@agility-workbench/angular-grid";

type Row = {
  id: number;
  region: string;
  product: string;
  owner: string;
  status: string;
  revenue: number;
};

const WIDTH_PRESETS = [1100, 900, 700, 560, 480, 360] as const;

function buildRows(): Row[] {
  return Array.from({ length: 80 }, (_, index) => ({
    id: index + 1,
    region: ["Americas", "EMEA", "APAC"][index % 3],
    product: ["Analytics", "Cloud", "Security", "Support"][(index * 3) % 4],
    owner: ["Ava", "Liam", "Mia", "Noah", "Emma"][(index * 2) % 5],
    status: ["Qualified", "Negotiating", "Won"][index % 3],
    revenue: 12_000 + ((index * 7_913) % 85_000),
  }));
}

@Component({
  selector: "responsive-toolbar-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="preset-row">
      <strong class="preset-title">Resizable toolbar and footer</strong>
      <span class="preset-sub">
        Drag the container’s bottom-right resize handle, or choose a preset:
      </span>
      @for (preset of presets; track preset) {
        <button class="btn" type="button" (click)="width.set(preset)">{{ preset }}px</button>
      }
      <code class="width-readout">{{ width() }}px</code>
    </div>

    <p class="hint">
      Toolbar: captions first, then the search field gives up its slack width, then chip lists
      fold into a <code>+N</code>, then Grouped by / Sort by become summary buttons that still
      open the full editor, then the least important controls move into the overflow menu —
      Columns last. Whatever room the last rung leaves over goes to the search field, so the bar
      never sits with a hole in it.
    </p>

    <p class="hint">
      Footer, on its own ladder: captions, then the redundant first/last page buttons go (the page
      picker already reaches any page), then rows-per-page, the aggregate scope and the sheet
      strip's <code>+</code> move into the footer's own <code>&#8942;</code> — which wears a dot
      while aggregation is on behind it. Page navigation never gives way. Nothing ever overlaps in
      either bar, and a bar out of rungs scrolls rather than clipping.
    </p>

    <div class="resize-outer">
      <div #host class="resize-host" [style.width.px]="width()">
        <awb-grid
          [rowData]="rows"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [toolbar]="{ grouping: true, sorting: true, quickFilter: true, export: true }"
          [quickFilter]="{ debounceMs: 0, showOptions: true }"
          [columnPanel]="{ trigger: 'toolbar' }"
          [allowExportAsCSV]="true"
          [allowExportAsExcel]="true"
          [groupDefaultExpanded]="1"
          [pagination]="true"
          [pageSize]="25"
          [sheets]="sheetsOptions()"
          (gridReady)="onReady($event)"
        />
      </div>
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
      .preset-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .preset-title {
        font-size: 13px;
      }
      .preset-sub {
        font-size: 12px;
        color: #6b7280;
      }
      .width-readout {
        margin-left: auto;
        font-size: 12px;
      }
      .hint {
        margin: 0;
        font-size: 12px;
        color: #6b7280;
      }
      .resize-outer {
        flex: 1;
        min-height: 0;
        overflow: auto;
      }
      .resize-host {
        max-width: 100%;
        min-width: 340px;
        height: 100%;
        min-height: 440px;
        box-sizing: border-box;
        resize: horizontal;
        overflow: hidden;
        padding: 8px;
        border: 2px dashed #9ca3af;
        border-radius: 10px;
      }
    `,
  ],
})
export class ResponsiveToolbarDemoComponent implements OnDestroy {
  readonly rows = buildRows();
  readonly presets = WIDTH_PRESETS;
  readonly width = signal(900);

  // Sheets are application-owned, but the strip updates itself optimistically before reporting,
  // so keeping the list this demo is handed back is all it takes to stay in sync.
  readonly sheets = signal<GridSheet[]>([
    { id: "data", name: "Data" },
    { id: "pipeline", name: "Pipeline" },
  ]);
  readonly activeSheetId = signal<string | null>("data");

  // The footer at its richest: every page control, a live aggregate scope select, and a sheet
  // strip with its "+" — so all of its rungs have something to give way.
  readonly sheetsOptions = computed<SheetsOptions>(() => ({
    sheets: this.sheets(),
    activeSheetId: this.activeSheetId(),
    onChange: (next) => this.sheets.set(next),
    onActiveSheetChange: (sheetId) => this.activeSheetId.set(sheetId),
  }));

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "product", key: "product", label: "Product", width: 140 },
    { colId: "owner", key: "owner", label: "Owner", width: 120 },
    { colId: "status", key: "status", label: "Status", width: 130 },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 140,
      type: ColumnType.CURRENCY,
    },
  ];

  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>("host");
  private observer: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      if (typeof ResizeObserver === "undefined") return;
      const host = this.hostRef().nativeElement;
      this.observer = new ResizeObserver(() => {
        // Read the border-box width so feeding the observed value back into a border-box `width`
        // does not repeatedly subtract this demo frame's padding and border.
        const next = Math.round(host.getBoundingClientRect().width);
        if (next > 0) this.width.set(next);
      });
      this.observer.observe(host);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  onReady(api: IGridAPI): void {
    const model = api.getColumnModel();
    const region = model.getByColId("region");
    const revenue = model.getByColId("revenue");
    if (region) api.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });
    if (revenue) {
      api.dispatch({
        type: "sortModelSet",
        sortItems: [{ key: revenue.instanceID, dir: "desc" }],
      });
      // An aggregate the footer is actually running, so the scope select is live rather than
      // disabled — and so the overflow button has a reason to show its dot once it is displaced.
      api.dispatch({
        type: "aggregateModelSet",
        aggregateModels: [{ key: revenue.instanceID, type: AggregateType.SUM }],
      });
    }
  }
}
