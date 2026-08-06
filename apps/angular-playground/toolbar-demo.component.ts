import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type GridToolbarOptions,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";

type SalesRow = {
  id: number;
  region: string;
  country: string;
  product: string;
  rep: string;
  quarter: string;
  units: number;
  revenue: number;
};

const REGIONS = ["Americas", "EMEA", "APAC"] as const;
const COUNTRIES: Record<(typeof REGIONS)[number], string[]> = {
  Americas: ["USA", "Canada", "Brazil"],
  EMEA: ["UK", "Germany", "France"],
  APAC: ["Japan", "India", "Australia"],
};
const PRODUCTS = ["Analytics", "Cloud", "Security", "Support"];
const REPS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva"];

function buildRows(): SalesRow[] {
  return Array.from({ length: 120 }, (_, index) => {
    const region = REGIONS[index % REGIONS.length];
    const units = 12 + ((index * 17) % 180);
    return {
      id: index + 1,
      region,
      country: COUNTRIES[region][Math.floor(index / 3) % COUNTRIES[region].length],
      product: PRODUCTS[(index * 3) % PRODUCTS.length],
      rep: REPS[(index * 2) % REPS.length],
      quarter: `Q${(index % 4) + 1}`,
      units,
      revenue: units * (95 + ((index * 29) % 240)),
    };
  });
}

const SECTION_LABELS: Array<{
  key: keyof GridToolbarOptions;
  label: string;
}> = [
  { key: "grouping", label: "Grouping" },
  { key: "sorting", label: "Sorting" },
  { key: "quickFilter", label: "Quick filter" },
  { key: "export", label: "Export" },
];

@Component({
  selector: "toolbar-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="controls-row">
      <section class="sections-card">
        <div class="sections-heading">
          <div class="sections-title">Toolbar sections</div>
          <div class="sections-sub">Every control updates the existing grid instance.</div>
        </div>

        <div class="section-toggles">
          @for (section of sections; track section.key) {
            <label class="toggle">
              <input
                type="checkbox"
                [checked]="toolbar()[section.key] === true"
                (change)="onSectionToggle(section.key, $event)"
              />
              {{ section.label }}
            </label>
          }

          <label class="toggle">
            <input type="checkbox" [checked]="columns()" (change)="onColumnsToggle($event)" />
            Columns trigger
          </label>
        </div>

        <div class="card-actions">
          <button class="btn" type="button" (click)="enableAll()">All</button>
          <button class="btn" type="button" (click)="disableAll()">None</button>
        </div>
      </section>

      <aside class="readout">
        <div class="readout-head">
          <span class="readout-label">Expected toolbar</span>
          <strong class="readout-value">{{ toolbarVisible() ? "Visible" : "Hidden" }}</strong>
        </div>
        <code class="readout-code">{{ configText() }}</code>
      </aside>
    </div>

    <p class="hint">
      Disable and re-enable a zone to see that its grouping or sorting state is preserved. Disable
      every section while leaving <strong>Columns trigger</strong> on for a Columns-only toolbar;
      turn that off too and the toolbar takes up no space.
    </p>

    <div class="demo-grid-host">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [toolbar]="toolbar()"
        [quickFilter]="{ debounceMs: 0, showOptions: true }"
        [columnPanel]="columnPanel()"
        [allowExportAsCSV]="true"
        [allowExportAsExcel]="true"
        [groupDefaultExpanded]="1"
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
      .controls-row {
        display: flex;
        align-items: stretch;
        gap: 12px;
        flex-wrap: wrap;
      }
      .sections-card {
        display: flex;
        align-items: center;
        gap: 16px;
        flex: 1 1 620px;
        min-width: 0;
        padding: 10px 12px;
        border: 1px solid var(--pte-frame-border-color, #d1d5db);
        border-radius: 8px;
      }
      .sections-heading {
        flex: 0 0 auto;
      }
      .sections-title {
        font-size: 13px;
        font-weight: 600;
      }
      .sections-sub {
        margin-top: 2px;
        font-size: 11px;
        color: #6b7280;
      }
      .section-toggles {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }
      .toggle {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
      }
      .card-actions {
        display: flex;
        gap: 6px;
        margin-left: auto;
      }
      .readout {
        flex: 0 1 340px;
        min-width: 260px;
        padding: 10px 12px;
        border: 1px solid var(--pte-frame-border-color, #d1d5db);
        border-radius: 8px;
        background: #f9fafb;
      }
      .readout-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      .readout-label {
        font-size: 12px;
        color: #6b7280;
      }
      .readout-value {
        font-size: 12px;
      }
      .readout-code {
        display: block;
        margin-top: 6px;
        font-size: 11px;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .hint {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: #6b7280;
      }
      .demo-grid-host {
        min-width: 0;
      }
    `,
  ],
})
export class ToolbarDemoComponent {
  readonly rows = buildRows();
  readonly sections = SECTION_LABELS;

  readonly toolbar = signal<GridToolbarOptions>({
    grouping: true,
    sorting: true,
    quickFilter: true,
    export: true,
  });
  readonly columns = signal(true);

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "product", key: "product", label: "Product", width: 140 },
    { colId: "rep", key: "rep", label: "Sales rep", width: 160 },
    { colId: "quarter", key: "quarter", label: "Quarter", width: 100 },
    { colId: "units", key: "units", label: "Units", width: 100, type: ColumnType.NUMBER },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 140,
      type: ColumnType.CURRENCY,
    },
  ];

  readonly toolbarVisible = computed(
    () => Object.values(this.toolbar()).some(Boolean) || this.columns(),
  );

  readonly columnPanel = computed<{ trigger: "toolbar" } | false>(() =>
    this.columns() ? { trigger: "toolbar" } : false,
  );

  readonly configText = computed(
    () =>
      `toolbar = ${JSON.stringify(this.toolbar())}\ncolumnPanel = ${
        this.columns() ? '{ trigger: "toolbar" }' : "false"
      }`,
  );

  private api: IGridAPI | null = null;

  onSectionToggle(key: keyof GridToolbarOptions, event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.toolbar.update((current) => ({ ...current, [key]: enabled }));
  }

  onColumnsToggle(event: Event): void {
    this.columns.set((event.target as HTMLInputElement).checked);
  }

  enableAll(): void {
    this.toolbar.set({ grouping: true, sorting: true, quickFilter: true, export: true });
    this.columns.set(true);
  }

  disableAll(): void {
    this.toolbar.set({});
    this.columns.set(false);
  }

  onReady(api: IGridAPI): void {
    this.api = api;
    const model = api.getColumnModel();
    const region = model.getByColId("region");
    const revenue = model.getByColId("revenue");
    const rep = model.getByColId("rep");
    if (region) {
      api.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });
    }
    api.dispatch({
      type: "sortModelSet",
      sortItems: [
        ...(revenue ? [{ key: revenue.instanceID, dir: "desc" as const }] : []),
        ...(rep ? [{ key: rep.instanceID, dir: "asc" as const }] : []),
      ],
    });
  }
}
