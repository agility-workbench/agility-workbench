import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  signal,
  viewChild,
} from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

type Row = {
  id: number;
  region: string;
  product: string;
  owner: string;
  status: string;
  revenue: number;
};

const WIDTH_PRESETS = [900, 700, 480, 360] as const;

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
      <strong class="preset-title">Resizable toolbar</strong>
      <span class="preset-sub">
        Drag the container’s bottom-right resize handle, or choose a preset:
      </span>
      @for (preset of presets; track preset) {
        <button class="btn" type="button" (click)="width.set(preset)">{{ preset }}px</button>
      }
      <code class="width-readout">{{ width() }}px</code>
    </div>

    <p class="hint">
      Full labels become icon-only controls as space tightens. At the narrowest width, Export and
      Columns move into the More menu while grouping, sorting, and quick filter remain available.
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
    }
  }
}
