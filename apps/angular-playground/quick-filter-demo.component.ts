import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  signal,
  viewChild,
} from "@angular/core";
import {
  AwbGrid,
  themeLight,
  type GridTheme,
  type NgColDef,
  type QuickFilterMatchMode,
  type QuickFilterOptions,
} from "@agility-workbench/angular-grid";

/**
 * Showcases the quick-filter (global search) configuration:
 *  - `behavior` / `showBehaviorToggle`: filter the rows, or leave every row in place and highlight
 *    the matching cells (Excel-style find, with a match counter and Enter/Shift+Enter stepping).
 *  - `matchMode`: all words / one contiguous run / the cell's whole text (the same three shapes in
 *    both behaviors; only "all words" widens to the whole row while filtering).
 *  - `clearOnClose`: keep the filter applied after the widget is dismissed (a collapsed pill stands
 *    in so the active search stays visible / re-openable).
 *  - `position`: anchor left/right, plus X (from the edge) and Y (below the header) offsets.
 *  - `showOptions` / `showLayoutOptions`: which controls the widget exposes in its options popover.
 *
 * In find mode the widget is not chrome you dismiss once the search is typed — you keep operating it
 * (next/previous, the counter) while reading the cells — so a match that lands underneath it would
 * be unreachable. Stepping onto one therefore moves it out from under the widget: the reveal scrolls
 * the match clear where it can, and where no scroll can (the first row, the last column, and the
 * pinned Status column, none of which have anywhere to go) the widget flips to the opposite edge.
 * The configured anchor is untouched by that — a dodge lasts as long as the search does.
 *
 * The highlight color comes from somewhere else — the theme, not the quick-filter config: the
 * `findMatchColor` theme param derives all three find CSS variables (the tint for every match, the
 * stronger tint for the active one, and its outline) from a single color. It is applied as a custom
 * property on the grid root, so changing it re-tints the cells already painted without a remount or
 * a re-render; the swatch below is live even mid-search.
 *
 * Changing any control below reconfigures the live grid in place — the Angular wrapper forwards the
 * new `quickFilter` config to the renderer, which rebuilds the widget without remounting the grid
 * (an active search is preserved across the change). Open the search with Ctrl/Cmd+F (or it's
 * pinned in "always" mode).
 */

type Company = {
  id: number;
  name: string;
  region: string;
  sector: string;
  employees: number;
  ceo: string;
  hq: string;
  country: string;
  currency: string;
  founded: number;
  revenue: number;
  tier: string;
  status: string;
  domain: string;
  notes: string;
};

const NAMES = [
  "Acme Corp", "Acme Labs", "Globex", "Initech", "Umbrella", "Soylent", "Hooli", "Vandelay",
  "Stark Industries", "Wayne Enterprises", "Wonka", "Cyberdyne", "Tyrell", "Massive Dynamic",
  "Aperture Science", "Black Mesa", "Oscorp", "Nakatomi", "Gekko & Co", "Bluth Company",
];
const REGIONS = ["West", "East", "North", "South", "Central"];
const SECTORS = ["Tech", "Finance", "Retail", "Energy", "Health", "Media"];
const CEOS = [
  "Dana Whitfield", "Marcus Lee", "Priya Nair", "Tom Okafor", "Elena Rossi",
  "Hiro Tanaka", "Sara Kaufman", "Luis Ferreira", "Anna Novak", "Owen Bradley",
];
const CITIES = [
  "Seattle", "Austin", "Boston", "Denver", "Atlanta",
  "Chicago", "Portland", "Miami", "Phoenix", "Newark",
];
// Paired so a row's country and currency never contradict each other.
const LOCALES = [
  { country: "USA", currency: "USD" },
  { country: "Canada", currency: "CAD" },
  { country: "UK", currency: "GBP" },
  { country: "Germany", currency: "EUR" },
  { country: "Japan", currency: "JPY" },
  { country: "Australia", currency: "AUD" },
];
const TIERS = ["Enterprise", "Mid-Market", "SMB"];
const STATUSES = ["Active", "Prospect", "Churned", "On Hold"];
const NOTE_TOPICS = [
  "renewal pending", "expansion review", "pilot in flight", "quarterly audit", "migration planned",
];

// The light stylesheet's own find tint, so the swatch opens showing what the grid is already using.
const DEFAULT_FIND_MATCH_COLOR = "#facc15";

function buildRows(): Company[] {
  // Deterministic (no Math.random) so the demo data is stable across reloads.
  return NAMES.map((name, i) => {
    const sector = SECTORS[i % SECTORS.length];
    const locale = LOCALES[i % LOCALES.length];
    return {
      id: i + 1,
      name,
      region: REGIONS[i % REGIONS.length],
      sector,
      employees: 50 + ((i * 137) % 950),
      ceo: CEOS[i % CEOS.length],
      hq: CITIES[i % CITIES.length],
      country: locale.country,
      currency: locale.currency,
      founded: 1958 + ((i * 7) % 60),
      revenue: 4 + ((i * 31) % 480),
      tier: TIERS[i % TIERS.length],
      status: STATUSES[i % STATUSES.length],
      // Echoes the name in a different shape, so "whole cell" and "exact phrase" visibly disagree.
      domain: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
      notes: `${sector} ${NOTE_TOPICS[i % NOTE_TOPICS.length]}`,
    };
  });
}

@Component({
  selector: "quick-filter-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="controls">
      <label class="ctl">
        Mode
        <select (change)="onModeChange($event)">
          <option value="onDemand" [selected]="mode() === 'onDemand'">onDemand (Ctrl/Cmd+F)</option>
          <option value="always" [selected]="mode() === 'always'">always (pinned)</option>
        </select>
      </label>

      <label class="ctl">
        Behavior
        <select (change)="onBehaviorChange($event)">
          <option value="filter" [selected]="behavior() === 'filter'">filter (narrow rows)</option>
          <option value="find" [selected]="behavior() === 'find'">find (highlight cells)</option>
        </select>
      </label>

      <label class="ctl">
        Match
        <select (change)="onMatchModeChange($event)">
          <option value="multiTerm" [selected]="matchMode() === 'multiTerm'">All words</option>
          <option value="substring" [selected]="matchMode() === 'substring'">Exact phrase</option>
          <option value="wholeCell" [selected]="matchMode() === 'wholeCell'">Whole cell</option>
        </select>
      </label>

      <label class="ctl">
        <input
          type="checkbox"
          [checked]="showBehaviorToggle()"
          (change)="onShowBehaviorToggleToggle($event)"
        />
        showBehaviorToggle
      </label>

      <label class="ctl">
        <input type="checkbox" [checked]="clearOnClose()" (change)="onClearOnCloseToggle($event)" />
        clearOnClose
      </label>

      <label class="ctl">
        Anchor
        <select (change)="onAnchorChange($event)">
          <option value="right" [selected]="anchor() === 'right'">right</option>
          <option value="left" [selected]="anchor() === 'left'">left</option>
        </select>
      </label>

      <label class="ctl">
        offsetX
        <input type="number" [value]="offsetX()" min="0" class="num" (input)="onOffsetXInput($event)" />
      </label>

      <label class="ctl">
        offsetTop
        <input type="number" [value]="offsetTop()" min="0" class="num" (input)="onOffsetTopInput($event)" />
      </label>

      <label class="ctl">
        <input type="checkbox" [checked]="showOptions()" (change)="onShowOptionsToggle($event)" />
        showOptions
      </label>

      <label class="ctl">
        <input
          type="checkbox"
          [checked]="showLayoutOptions()"
          (change)="onShowLayoutOptionsToggle($event)"
        />
        showLayoutOptions
      </label>

      <label class="ctl">
        findMatchColor
        <input
          type="color"
          class="swatch"
          [value]="findMatchColor() ?? defaultFindMatchColor"
          (input)="onFindMatchColorInput($event)"
        />
      </label>

      <button type="button" [disabled]="findMatchColor() === null" (click)="resetFindMatchColor()">
        Reset color
      </button>

      <button type="button" [disabled]="reconfigurePending()" (click)="scheduleFocusedReconfigure()">
        {{ reconfigurePending() ? "Reconfiguring in 4s…" : "Test focused reconfigure" }}
      </button>
    </div>

    <p class="hint">
      {{
        mode() === "onDemand"
          ? "Press Ctrl/Cmd+F over the grid to open the search."
          : "Search is pinned open under the header."
      }}
      {{
        behavior() === "find"
          ? "Find mode: nothing is filtered — matching cells are highlighted, and Enter / Shift+Enter step through them (the counter shows where you are)."
          : "Filter mode: non-matching rows are hidden."
      }}
      With <code>showBehaviorToggle</code> on, the ⋯ popover switches between the two without
      touching grid options.
      With <code>clearOnClose</code> off, dismissing the search leaves the filter active and shows a
      pill you can click to reopen. With <code>showLayoutOptions</code> on, the ⋯ options popover
      exposes the Anchor and “Keep filter when closed” controls.
      The <code>findMatchColor</code> swatch re-tints the highlights live (a theme param, not a
      quick-filter option) — try it with a search active.
      In find mode the search box steps out of its own way: search <code>Active</code> and step to the
      first row's pinned Status cell — nothing can scroll it out from under the box, so the box flips
      to the other edge instead (your Anchor setting stays as you left it).
      To verify focus preservation during live reconfiguration, click
      “Test focused reconfigure,” press Ctrl/Cmd+F, and leave the search input focused before the
      four-second timer expires. {{ reconfigureResult() }}
    </p>

    <div #gridHost class="demo-grid-host">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [rowNumbers]="true"
        [quickFilter]="quickFilter()"
        [theme]="theme()"
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
      .controls {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }
      .ctl {
        font-size: 13px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .num {
        width: 64px;
      }
      .swatch {
        width: 40px;
        height: 24px;
        padding: 0;
      }
      .hint {
        font-size: 12px;
        color: #6b7280;
        margin: 0;
      }
    `,
  ],
})
export class QuickFilterDemoComponent implements OnDestroy {
  readonly rows = buildRows();

  readonly columnDefs: NgColDef[] = [
    // Deliberately wider than the viewport: find-mode stepping has to scroll matches
    // into view horizontally, not just vertically.
    { colId: "id", key: "id", label: "ID", width: 70 },
    { colId: "name", key: "name", label: "Name", width: 200 },
    { colId: "region", key: "region", label: "Region", width: 120 },
    { colId: "sector", key: "sector", label: "Sector", width: 120 },
    { colId: "employees", key: "employees", label: "Employees", width: 120 },
    { colId: "ceo", key: "ceo", label: "CEO", width: 160 },
    { colId: "hq", key: "hq", label: "HQ", width: 120 },
    { colId: "country", key: "country", label: "Country", width: 110 },
    { colId: "currency", key: "currency", label: "Currency", width: 100 },
    { colId: "founded", key: "founded", label: "Founded", width: 100 },
    { colId: "revenue", key: "revenue", label: "Revenue ($M)", width: 130 },
    { colId: "tier", key: "tier", label: "Tier", width: 130 },
    // Pinned right, which is the case scrolling can never rescue: a match here sits under a
    // right-anchored search widget and no scroll can move it, so the widget has to step aside.
    { colId: "status", key: "status", label: "Status", width: 110, pinned: "right" },
    { colId: "domain", key: "domain", label: "Domain", width: 200 },
    { colId: "notes", key: "notes", label: "Notes", width: 240 },
  ];

  // Live-editable quick-filter config.
  readonly mode = signal<"onDemand" | "always">("onDemand");
  readonly behavior = signal<"filter" | "find">("filter");
  readonly showBehaviorToggle = signal(true);
  readonly matchMode = signal<QuickFilterMatchMode>("multiTerm");
  readonly clearOnClose = signal(false);
  readonly anchor = signal<"left" | "right">("right");
  readonly offsetX = signal(8);
  readonly offsetTop = signal(6);
  readonly showOptions = signal(true);
  readonly showLayoutOptions = signal(true);
  readonly reconfigurePending = signal(false);
  readonly reconfigureResult = signal("");
  // Left null until the swatch is touched, so the stylesheet's own (light/dark-aware) defaults are
  // what the demo starts from.
  readonly findMatchColor = signal<string | null>(null);
  readonly defaultFindMatchColor = DEFAULT_FIND_MATCH_COLOR;

  readonly quickFilter = computed<QuickFilterOptions>(() => ({
    mode: this.mode(),
    behavior: this.behavior(),
    showBehaviorToggle: this.showBehaviorToggle(),
    matchMode: this.matchMode(),
    clearOnClose: this.clearOnClose(),
    position: { anchor: this.anchor(), offsetX: this.offsetX(), offsetTop: this.offsetTop() },
    showOptions: this.showOptions(),
    showLayoutOptions: this.showLayoutOptions(),
  }));

  readonly theme = computed<GridTheme | undefined>(() => {
    const color = this.findMatchColor();
    return color === null ? undefined : themeLight.withParams({ findMatchColor: color });
  });

  private readonly gridHost = viewChild.required<ElementRef<HTMLDivElement>>("gridHost");
  private reconfigureTimer: number | null = null;

  ngOnDestroy(): void {
    if (this.reconfigureTimer !== null) window.clearTimeout(this.reconfigureTimer);
  }

  scheduleFocusedReconfigure(): void {
    if (this.reconfigureTimer !== null) window.clearTimeout(this.reconfigureTimer);
    this.reconfigurePending.set(true);
    this.reconfigureResult.set("");
    this.gridHost().nativeElement.querySelector<HTMLElement>(".pte-root")?.focus();
    this.reconfigureTimer = window.setTimeout(() => {
      // Any config change rebuilds the widget. Changing this otherwise-inconsequential offset
      // verifies that the replacement widget restores focus when the old input owned it.
      this.offsetX.update((value) => value + 1);
      this.reconfigureTimer = null;
      window.requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null;
        this.reconfigureResult.set(
          active?.classList.contains("pte-quick-filter-input")
            ? "Focus remained in the quick filter."
            : `Focus moved to ${active?.tagName.toLowerCase() ?? "no element"}.`,
        );
        this.reconfigurePending.set(false);
      });
    }, 4000);
  }

  onModeChange(event: Event): void {
    this.mode.set((event.target as HTMLSelectElement).value as "onDemand" | "always");
  }

  onBehaviorChange(event: Event): void {
    this.behavior.set((event.target as HTMLSelectElement).value as "filter" | "find");
  }

  onMatchModeChange(event: Event): void {
    this.matchMode.set((event.target as HTMLSelectElement).value as QuickFilterMatchMode);
  }

  onShowBehaviorToggleToggle(event: Event): void {
    this.showBehaviorToggle.set((event.target as HTMLInputElement).checked);
  }

  onClearOnCloseToggle(event: Event): void {
    this.clearOnClose.set((event.target as HTMLInputElement).checked);
  }

  onAnchorChange(event: Event): void {
    this.anchor.set((event.target as HTMLSelectElement).value as "left" | "right");
  }

  onOffsetXInput(event: Event): void {
    this.offsetX.set(Number((event.target as HTMLInputElement).value));
  }

  onOffsetTopInput(event: Event): void {
    this.offsetTop.set(Number((event.target as HTMLInputElement).value));
  }

  onShowOptionsToggle(event: Event): void {
    this.showOptions.set((event.target as HTMLInputElement).checked);
  }

  onShowLayoutOptionsToggle(event: Event): void {
    this.showLayoutOptions.set((event.target as HTMLInputElement).checked);
  }

  onFindMatchColorInput(event: Event): void {
    this.findMatchColor.set((event.target as HTMLInputElement).value);
  }

  resetFindMatchColor(): void {
    this.findMatchColor.set(null);
  }
}
