import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type GridToolbarOptions,
  type NgColDef,
  type SavedGridView,
  type SavedViewsOptions,
} from "@agility-workbench/angular-grid";

type Row = {
  id: number;
  region: string;
  country: string;
  product: string;
  owner: string;
  revenue: number;
};

const STORAGE_KEY = "pte-saved-views-demo";

function loadViews(): SavedGridView[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

@Component({
  selector: "saved-views-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="views-header">
      <div class="views-blurb">
        Configure columns, grouping, sorting, column filters, quick filter, and group expansion.
        Then use <strong>Views → Save current view…</strong>. Switching views restores the complete
        presentation state through the public grid APIs.
      </div>
      <button class="btn" type="button" [disabled]="views().length === 0" (click)="clearStorage()">
        Clear demo storage
      </button>
    </div>

    <div class="views-main">
      <div class="views-grid">
        <awb-grid
          [rowData]="rows"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [toolbar]="toolbarOptions"
          [savedViews]="savedViewsOptions()"
          [quickFilter]="quickFilterOptions"
          [columnPanel]="columnPanelOptions"
          [allowExportAsCSV]="true"
          [allowExportAsExcel]="true"
          [groupDefaultExpanded]="1"
        />
      </div>

      <aside class="views-aside">
        <strong class="views-aside-title">Application-owned views</strong>
        <div class="views-aside-sub">Persisted by this page in local storage.</div>
        @if (views().length === 0) {
          <p class="views-empty">No saved views yet.</p>
        } @else {
          <ol class="views-list">
            @for (view of views(); track view.id) {
              <li>
                <strong>{{ view.name }}</strong>{{ view.id === activeViewId() ? " — active" : "" }}
              </li>
            }
          </ol>
        }
      </aside>
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
      .views-header {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .views-blurb {
        flex: 1 1 560px;
        font-size: 12px;
        line-height: 1.55;
        color: #4b5563;
      }
      .views-main {
        display: flex;
        gap: 12px;
        flex: 1;
        min-height: 0;
      }
      .views-grid {
        flex: 1;
        min-width: 0;
      }
      .views-aside {
        width: 280px;
        flex: 0 0 280px;
        overflow: auto;
        padding: 12px;
        box-sizing: border-box;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        background: #f9fafb;
      }
      .views-aside-title {
        font-size: 13px;
      }
      .views-aside-sub {
        margin-top: 4px;
        font-size: 11px;
        color: #6b7280;
      }
      .views-empty {
        font-size: 12px;
        color: #9ca3af;
      }
      .views-list {
        margin: 10px 0 0;
        padding-left: 20px;
        font-size: 12px;
        line-height: 1.7;
      }
    `,
  ],
})
export class SavedViewsDemoComponent {
  readonly views = signal<SavedGridView[]>(loadViews());
  readonly activeViewId = signal<string | null>(null);

  readonly rows: Row[] = Array.from({ length: 120 }, (_, index) => ({
    id: index + 1,
    region: ["Americas", "EMEA", "APAC"][index % 3],
    country: ["USA", "Germany", "India", "Japan", "Brazil", "France"][(index * 5) % 6],
    product: ["Analytics", "Cloud", "Security", "Support"][(index * 3) % 4],
    owner: ["Ava", "Liam", "Mia", "Noah", "Emma"][(index * 2) % 5],
    revenue: 15_000 + ((index * 8_719) % 110_000),
  }));

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "product", key: "product", label: "Product", width: 140 },
    { colId: "owner", key: "owner", label: "Owner", width: 120 },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 140,
      type: ColumnType.CURRENCY,
    },
  ];

  readonly toolbarOptions: GridToolbarOptions = {
    views: true,
    grouping: true,
    sorting: true,
    quickFilter: true,
    export: true,
  };

  readonly quickFilterOptions = { debounceMs: 0, showOptions: true } as const;
  readonly columnPanelOptions = { trigger: "toolbar" } as const;

  readonly savedViewsOptions = computed<SavedViewsOptions>(() => ({
    views: this.views(),
    activeViewId: this.activeViewId(),
    onChange: (next) => this.persistViews(next),
    onActiveViewChange: (viewId) => this.activeViewId.set(viewId),
  }));

  persistViews(next: SavedGridView[]): void {
    this.views.set(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  clearStorage(): void {
    this.persistViews([]);
    this.activeViewId.set(null);
  }
}
