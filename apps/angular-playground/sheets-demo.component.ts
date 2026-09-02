import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type GridSheet,
  type IGridAPI,
  type NgColDef,
  type SheetsOptions,
} from "@agility-workbench/angular-grid";

/**
 * Sheets playground: spreadsheet-style tabs in the footer's left zone over ONE grid instance and
 * ONE row model. Each sheet is a live view state — switching tabs captures the sheet you leave
 * and applies the one you enter. The **+** button appends a blank pivot sheet; double-click
 * renames; right-click offers Rename / Change color / Duplicate / Delete; Ctrl+PageDown/PageUp
 * switches sheets.
 * The sheet list is application-owned: this page holds it in a signal.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  quarter: string;
  product: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const PRODUCTS = ["Hardware", "Software", "Services"];

// Deterministic PRNG so demo data is stable across reloads.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(7);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      quarter: pick(QUARTERS),
      product: pick(PRODUCTS),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 100_000),
    };
  });
}

@Component({
  selector: "sheets-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="sheets-blurb">
      One grid, one row model — the footer tabs are live view states. Switch to
      <strong>By Quarter</strong> for a pre-built pivot sheet, press <strong>+</strong> for a blank
      one (pivot mode on, hint in the header until you choose an aggregate), double-click a tab to
      rename it, right-click for Rename / Change color / Duplicate / Delete, or switch with
      <strong>Ctrl+PageDown/PageUp</strong>. Edits made on any sheet update every sheet's derived
      values, because the data is shared.
    </div>

    <div class="sheets-main">
      <div class="sheets-grid">
        <awb-grid
          [rowData]="rows"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [pagination]="true"
          [pageSize]="25"
          [groupDefaultExpanded]="1"
          [toolbar]="{ pivot: true }"
          [sheets]="sheetsOptions()"
          (gridReady)="onReady($event)"
        />
      </div>

      <aside class="sheets-aside">
        <strong class="sheets-aside-title">Application-owned sheets</strong>
        <div class="sheets-aside-sub">Held in a signal; every tab mutation reports the full next list.</div>
        <ol class="sheets-list">
          @for (sheet of sheets(); track sheet.id) {
            <li>
              <strong>{{ sheet.name }}</strong
              >{{ sheet.id === activeSheetId() ? " — active" : "" }}{{ sheet.state?.pivotMode ? " (pivot)" : "" }}
            </li>
          }
        </ol>
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
      .sheets-blurb {
        font-size: 12px;
        line-height: 1.55;
        color: #4b5563;
      }
      .sheets-main {
        display: flex;
        gap: 12px;
        flex: 1;
        min-height: 0;
      }
      /* min-width:0 keeps the grid from widening the page as generated pivot columns appear. */
      .sheets-grid {
        flex: 1;
        min-width: 0;
      }
      .sheets-aside {
        width: 240px;
        flex: 0 0 240px;
        overflow: auto;
        padding: 12px;
        box-sizing: border-box;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        background: #f9fafb;
      }
      .sheets-aside-title {
        font-size: 13px;
      }
      .sheets-aside-sub {
        margin-top: 4px;
        font-size: 11px;
        color: #6b7280;
      }
      .sheets-list {
        margin: 10px 0 0;
        padding-left: 20px;
        font-size: 12px;
        line-height: 1.7;
      }
    `,
  ],
})
export class SheetsDemoComponent {
  readonly sheets = signal<GridSheet[]>([{ id: "data", name: "Data" }]);
  readonly activeSheetId = signal<string | null>("data");

  readonly rows: SaleRow[] = buildRows(2000);

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "quarter", key: "quarter", label: "Quarter", width: 110 },
    { colId: "product", key: "product", label: "Product", width: 130 },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
    { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
  ];

  readonly sheetsOptions = computed<SheetsOptions>(() => ({
    sheets: this.sheets(),
    activeSheetId: this.activeSheetId(),
    onChange: (next) => this.sheets.set(next),
    onActiveSheetChange: (sheetId) => this.activeSheetId.set(sheetId),
  }));

  // Seed a ready-made pivot sheet next to the Data sheet: the + button does the same derivation
  // (current state, pivot on) — this one just arrives pre-configured with roles.
  onReady(api: IGridAPI): void {
    if (this.sheets().some(sheet => sheet.id === "by-quarter")) return;
    const state = {
      ...api.captureViewState(),
      pivotMode: true,
      pivotColumns: ["quarter"],
      rowGroupColumns: ["region"],
      aggregateModel: [{ colId: "revenue", type: "sum" }],
      groupExpansion: [],
    };
    this.sheets.set([...this.sheets(), { id: "by-quarter", name: "By Quarter", state }]);
  }
}
