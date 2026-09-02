import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type GridSheet,
  type IGridAPI,
  type NgColDef,
  type SheetsOptions,
  type SheetTabColor,
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

/**
 * Twelve random hues, named so the menu (and assistive tech) has something to read. `hsl()` rather
 * than hex on purpose: a palette entry can be any CSS colour, since a tab tints from the single
 * value it is given rather than needing a light/dark pair.
 */
function randomPalette(prefix: string): SheetTabColor[] {
  return Array.from({ length: 12 }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    color: `hsl(${Math.round(Math.random() * 360)} 72% 55%)`,
  }));
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

    <div class="sheets-colors">
      <strong class="sheets-colors-title">Tab colors</strong>
      <button type="button" (click)="randomize()">
        {{ palette() ? "Randomize again" : "Randomize 12 colors" }}
      </button>
      @if (palette(); as grid) {
        <span class="sheets-swatches">
          @for (entry of grid; track $index) {
            <span class="sheets-swatch" [style.background]="entry.color"
              [title]="entry.name + ' — ' + entry.color"></span>
          }
        </span>
      }
      <label class="sheets-colors-field">
        Override
        <select [disabled]="!palette()" [value]="overrideSheetId()"
          (change)="setOverride($any($event.target).value)">
          <option value="">— no override —</option>
          @for (sheet of sheets(); track sheet.id) {
            <option [value]="sheet.id">{{ sheet.name }}</option>
          }
        </select>
      </label>
      @if (overrideSheet(); as target) {
        @if (overridePalette(); as own) {
          <span class="sheets-colors-override">
            {{ target.name }}:
            <span class="sheets-swatches">
              @for (entry of own; track $index) {
                <span class="sheets-swatch" [style.background]="entry.color"
                  [title]="entry.name + ' — ' + entry.color"></span>
              }
            </span>
          </span>
        }
      }
      <label class="sheets-colors-field">
        <input type="checkbox" [checked]="customColor()"
          (change)="customColor.set($any($event.target).checked)" />
        Custom&hellip; (platform picker)
      </label>
      <button type="button" [disabled]="!palette()" (click)="useBuiltIn()">Built-in palette</button>
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
        <div class="sheets-aside-sub">
          <code>colors</code> replaces the built-in palette. An array is one list for every tab; a
          function is asked per sheet, per menu-open &mdash; that's the Override control, which
          hands one sheet a palette of its own.
        </div>
        <ol class="sheets-list">
          @for (sheet of sheets(); track sheet.id) {
            <li>
              <strong>{{ sheet.name }}</strong
              >{{ sheet.id === activeSheetId() ? " — active" : "" }}{{ sheet.state?.pivotMode ? " (pivot)" : "" }}{{
                sheet.id === overrideSheetId() ? " (own palette)" : "" }}
              @if (sheet.color; as color) {
                <span class="sheets-swatch sheets-swatch-inline" [style.background]="color"
                  [title]="color"></span>
              }
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
      .sheets-colors {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 6px 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 12px;
      }
      .sheets-colors-title {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        color: #6b7280;
      }
      .sheets-colors-field,
      .sheets-colors-override {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #4b5563;
      }
      .sheets-swatches {
        display: inline-flex;
        gap: 3px;
      }
      .sheets-swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        border: 1px solid rgba(0, 0, 0, 0.15);
      }
      .sheets-swatch-inline {
        display: inline-block;
        width: 10px;
        height: 10px;
        margin-left: 6px;
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

  // Tab-colour palettes. `palette` null = the grid's built-in list; supplying one unlocks the
  // per-sheet override, which is what turns the option from an array into a function.
  readonly palette = signal<SheetTabColor[] | null>(null);
  readonly overrideSheetId = signal<string>("");
  readonly overridePalette = signal<SheetTabColor[] | null>(null);
  readonly customColor = signal(false);

  readonly overrideSheet = computed(() =>
    this.sheets().find(sheet => sheet.id === this.overrideSheetId()));

  readonly sheetsOptions = computed<SheetsOptions>(() => ({
    sheets: this.sheets(),
    activeSheetId: this.activeSheetId(),
    colors: this.colors(),
    customColor: this.customColor(),
    onChange: (next) => this.sheets.set(next),
    onActiveSheetChange: (sheetId) => this.activeSheetId.set(sheetId),
  }));

  /** The `colors` option in whichever form the controls currently call for. */
  private readonly colors = computed<SheetsOptions["colors"]>(() => {
    const grid = this.palette();
    if (!grid) return undefined;                              // built-in palette
    const own = this.overridePalette();
    const targetId = this.overrideSheetId();
    if (!targetId || !own) return grid;                       // array form: one list for every tab
    // Function form: consulted per menu-open, with the sheet the menu was opened on.
    return (sheet: GridSheet) => (sheet.id === targetId ? own : grid);
  });

  randomize(): void {
    this.palette.set(randomPalette("Random"));
  }

  setOverride(sheetId: string): void {
    this.overrideSheetId.set(sheetId);
    // A fresh set for the chosen sheet, so the two palettes are visibly different.
    this.overridePalette.set(sheetId ? randomPalette("Custom") : null);
  }

  useBuiltIn(): void {
    this.palette.set(null);
    this.overrideSheetId.set("");
    this.overridePalette.set(null);
  }

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
