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
  type NgColDef,
  type QuickFilterOptions,
} from "@agility-workbench/angular-grid";

/**
 * Showcases the quick-filter (global search) configuration:
 *  - `clearOnClose`: keep the filter applied after the widget is dismissed (a collapsed pill stands
 *    in so the active search stays visible / re-openable).
 *  - `position`: anchor left/right, plus X (from the edge) and Y (below the header) offsets.
 *  - `showOptions` / `showLayoutOptions`: which controls the widget exposes in its options popover.
 *
 * Changing any control below reconfigures the live grid in place — the Angular wrapper forwards the
 * new `quickFilter` config to the renderer, which rebuilds the widget without remounting the grid
 * (an active search is preserved across the change). Open the search with Ctrl/Cmd+F (or it's
 * pinned in "always" mode).
 */

type Company = { id: number; name: string; region: string; sector: string; employees: number };

const NAMES = [
  "Acme Corp", "Acme Labs", "Globex", "Initech", "Umbrella", "Soylent", "Hooli", "Vandelay",
  "Stark Industries", "Wayne Enterprises", "Wonka", "Cyberdyne", "Tyrell", "Massive Dynamic",
  "Aperture Science", "Black Mesa", "Oscorp", "Nakatomi", "Gekko & Co", "Bluth Company",
];
const REGIONS = ["West", "East", "North", "South", "Central"];
const SECTORS = ["Tech", "Finance", "Retail", "Energy", "Health", "Media"];

function buildRows(): Company[] {
  // Deterministic (no Math.random) so the demo data is stable across reloads.
  return NAMES.map((name, i) => ({
    id: i + 1,
    name,
    region: REGIONS[i % REGIONS.length],
    sector: SECTORS[i % SECTORS.length],
    employees: 50 + ((i * 137) % 950),
  }));
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
      With <code>clearOnClose</code> off, dismissing the search leaves the filter active and shows a
      pill you can click to reopen. With <code>showLayoutOptions</code> on, the ⋯ options popover
      exposes the Anchor and “Keep filter when closed” controls.
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
    { colId: "id", key: "id", label: "ID", width: 70 },
    { colId: "name", key: "name", label: "Name", width: 200 },
    { colId: "region", key: "region", label: "Region", width: 120 },
    { colId: "sector", key: "sector", label: "Sector", width: 120 },
    { colId: "employees", key: "employees", label: "Employees", width: 120 },
  ];

  // Live-editable quick-filter config.
  readonly mode = signal<"onDemand" | "always">("onDemand");
  readonly clearOnClose = signal(false);
  readonly anchor = signal<"left" | "right">("right");
  readonly offsetX = signal(8);
  readonly offsetTop = signal(6);
  readonly showOptions = signal(true);
  readonly showLayoutOptions = signal(true);
  readonly reconfigurePending = signal(false);
  readonly reconfigureResult = signal("");

  readonly quickFilter = computed<QuickFilterOptions>(() => ({
    mode: this.mode(),
    clearOnClose: this.clearOnClose(),
    position: { anchor: this.anchor(), offsetX: this.offsetX(), offsetTop: this.offsetTop() },
    showOptions: this.showOptions(),
    showLayoutOptions: this.showLayoutOptions(),
  }));

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
}
