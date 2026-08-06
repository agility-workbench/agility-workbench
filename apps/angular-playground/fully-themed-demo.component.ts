import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  themeDark,
  type GridTheme,
  type NgColDef,
} from "@agility-workbench/angular-grid";

type ProjectRow = {
  id: string;
  project: string;
  team: string;
  stage: "Shipping" | "Building" | "Review" | "Queued";
  priority: "Critical" | "High" | "Normal";
  progress: number;
  budget: number;
  launch: string;
};

const TEAMS = ["Orbit", "Nova", "Pulse", "Atlas"];
const STAGES: ProjectRow["stage"][] = ["Shipping", "Building", "Review", "Queued"];
const PRIORITIES: ProjectRow["priority"][] = ["Critical", "High", "Normal"];

const ROWS: ProjectRow[] = Array.from({ length: 48 }, (_, index) => ({
  id: `PX-${String(index + 1).padStart(3, "0")}`,
  project: ["Aurora Console", "Signal Engine", "Vector Mobile", "Prism Billing", "Relay API", "Zenith Search"][index % 6],
  team: TEAMS[index % TEAMS.length],
  stage: STAGES[index % STAGES.length],
  priority: PRIORITIES[index % PRIORITIES.length],
  progress: 18 + ((index * 17) % 81),
  budget: 42_000 + ((index * 13_700) % 310_000),
  launch: `2026-${String(9 + (index % 4)).padStart(2, "0")}-${String(4 + (index * 3) % 24).padStart(2, "0")}`,
}));

const PINNED_ROW: ProjectRow = {
  id: "PORTFOLIO",
  project: "Portfolio target",
  team: "All crews",
  stage: "Shipping",
  priority: "Critical",
  progress: 82,
  budget: 2_400_000,
  launch: "2026-12-18",
};

function makeTheme(rowHeight: number): GridTheme {
  return themeDark.withParams({
    accentColor: "#22d3ee",
    backgroundColor: "#070b18",
    headerBackgroundColor: "#151d3d",
    textColor: "#f1f5ff",
    mutedTextColor: "#93a4c7",
    borderColor: "#334776",
    rowHoverColor: "#182852",
    columnHoverColor: "rgba(124, 92, 255, 0.10)",
    rowAltBackgroundColor: "#0c142a",
    activeCellBorderColor: "#fbbf24",
    selectedBackgroundColor: "#283b72",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: 13,
    headerFontWeight: 750,
    rowHeight,
    cellHorizontalPadding: 16,
    iconColor: "#a5b4fc",
    scrollbarThumbColor: "#52659d",
    aggregateBackgroundColor: "#111d3c",
    sparklineStrokeColor: "#22d3ee",
    sparklineBarColor: "#8b5cf6",
    vars: {
      "--pte-row-border-size": "2px",
      "--pte-frame-border-color": "#8b5cf6",
      "--pte-resize-handle-color": "#52659d",
      "--pte-selected-resize-handle-color": "#fbbf24",
      "--pte-group-row-bg-color": "#111d3c",
      "--pte-input-bg-color": "#0b1228",
      "--pte-control-border-color": "#465b91",
      "--pte-overlay-border-color": "#52659d",
      "--pte-surface-bg-color": "#0b1228",
      "--pte-button-primary-bg": "#7c3aed",
      "--pte-button-primary-text": "#ffffff",
      "--pte-menu-btn-hover-bg": "#26386a",
      "--pte-shadow-color": "rgba(0, 0, 0, 0.72)",
      "--pte-overlay-shadow": "0 24px 70px rgba(0, 0, 0, 0.72)",
      "--pte-drag-shadow": "0 14px 36px rgba(34, 211, 238, 0.22)",
      "--pte-scrollbar-track-color": "#070b18",
      "--pte-scrollbar-thumb-hover-color": "#7c8fc8",
      "--pte-scrollbar-size": "12px",
      "--pte-scrollbar-radius": "999px",
      "--pte-tooltip-bg": "#151d3d",
      "--pte-tooltip-text-color": "#f1f5ff",
      "--pte-tooltip-border-color": "#8b5cf6",
      "--pte-tooltip-radius": "10px",
      "--pte-tooltip-shadow": "0 16px 44px rgba(0, 0, 0, 0.65)",
      "--pte-pagination-footer-height": "52px",
      "--pte-cell-flash-up-bg-color": "rgba(34, 211, 238, 0.38)",
      "--pte-cell-flash-down-bg-color": "rgba(244, 63, 94, 0.42)",
    },
  });
}

@Component({
  selector: "fully-themed-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <section class="full-theme-demo">
      <header class="full-theme-hero">
        <div>
          <span class="full-theme-kicker">CUSTOM THEME / ANGULAR</span>
          <h2>Mission Control</h2>
          <p>Every grid surface is themed per instance: chrome, menus, selection, typography, scrollbars, spacing, and two-pixel row dividers.</p>
        </div>
        <label class="full-theme-density">
          Row height
          <select [value]="rowHeight()" (change)="setRowHeight($event)">
            <option value="44">Compact · 44px</option>
            <option value="58">Comfortable · 58px</option>
            <option value="72">Oversized · 72px</option>
          </select>
        </label>
      </header>

      <div class="full-theme-grid-shell">
        @for (height of activeRowHeights(); track height) {
          <awb-grid
            [rowData]="rows"
            [columnDefs]="columns"
            rowIdKey="id"
            [rowHeight]="height"
            [headerHeight]="56"
            [theme]="theme()"
            [rowNumbers]="true"
            [rowHover]="true"
            [columnHover]="true"
            [zebraRows]="true"
            [highlightActiveCell]="true"
            [pagination]="true"
            [pageSize]="12"
            [pageSizes]="[12, 24, 48]"
            [pinnedTopRowData]="pinnedRows"
            [quickFilter]="{ mode: 'always', debounceMs: 0 }"
            [toolbar]="{ quickFilter: true, sorting: true, export: true }"
            [columnPanel]="{ trigger: 'rail' }"
            [tooltip]="{ showDelay: 150, hideDelay: 80 }"
          />
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; height: 100%; min-height: 0 }
    .full-theme-demo {
      height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 14px;
      padding: 18px; box-sizing: border-box; overflow: hidden; color: #f1f5ff;
      border: 1px solid #283b72; border-radius: 18px;
      background: radial-gradient(circle at 15% 0%, rgba(124, 58, 237, .24), transparent 34%),
                  radial-gradient(circle at 90% 15%, rgba(34, 211, 238, .14), transparent 30%), #050816;
    }
    .full-theme-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px }
    .full-theme-hero h2 { margin: 2px 0 5px; font-size: 26px; letter-spacing: -.03em }
    .full-theme-hero p { max-width: 760px; margin: 0; color: #93a4c7; font-size: 13px; line-height: 1.5 }
    .full-theme-kicker { color: #67e8f9; font-size: 10px; font-weight: 800; letter-spacing: .18em }
    .full-theme-density { display: flex; flex: 0 0 auto; align-items: center; gap: 10px; color: #a5b4fc; font-size: 12px; font-weight: 700 }
    .full-theme-density select { border: 1px solid #52659d; border-radius: 9px; padding: 8px 11px; background: #0b1228; color: #f1f5ff }
    .full-theme-grid-shell { flex: 1; min-height: 0; filter: drop-shadow(0 18px 34px rgba(0, 0, 0, .5)) }
    .full-theme-grid-shell ::ng-deep .pte-root { border-width: 2px; border-radius: 14px }
    .full-theme-grid-shell ::ng-deep .pte-pinned-row .pte-cell { background: #15234a; color: #fef3c7; font-weight: 750 }
    @media (max-width: 760px) {
      .full-theme-demo { padding: 12px }
      .full-theme-hero { align-items: stretch; flex-direction: column; gap: 10px }
      .full-theme-density { justify-content: space-between }
    }
  `],
})
export class FullyThemedDemoComponent {
  readonly rows = ROWS;
  readonly pinnedRows = [PINNED_ROW];
  readonly rowHeight = signal(58);
  readonly activeRowHeights = computed(() => [this.rowHeight()]);
  readonly theme = computed(() => makeTheme(this.rowHeight()));

  readonly columns: NgColDef[] = [
    { colId: "id", key: "id", label: "CODE", width: 105, pinned: "left" },
    { colId: "project", key: "project", label: "INITIATIVE", width: 190, filter: true, pinned: "left" },
    { colId: "team", key: "team", label: "CREW", width: 115, filter: true },
    {
      colId: "stage", key: "stage", label: "STATUS", width: 125, filter: true,
      cellStyle: ({ value }) => ({
        color: value === "Shipping" ? "#67e8f9" : value === "Building" ? "#c4b5fd" : value === "Review" ? "#fde68a" : "#93a4c7",
        fontWeight: "700",
        letterSpacing: ".03em",
      }),
    },
    {
      colId: "priority", key: "priority", label: "PRIORITY", width: 115, filter: true,
      cellStyle: ({ value }) => ({
        color: value === "Critical" ? "#fb7185" : value === "High" ? "#fbbf24" : "#a7f3d0",
        fontWeight: "700",
      }),
    },
    {
      colId: "progress", key: "progress", label: "PROGRESS", width: 125, type: ColumnType.NUMBER,
      valueFormatter: ({ value }) => `${value}%`,
      cellStyle: ({ value }) => ({ color: value >= 75 ? "#67e8f9" : "#c4b5fd", fontWeight: "700" }),
    },
    { colId: "budget", key: "budget", label: "BUDGET", width: 145, type: ColumnType.CURRENCY },
    { colId: "launch", key: "launch", label: "LAUNCH WINDOW", width: 150 },
  ];

  setRowHeight(event: Event): void {
    this.rowHeight.set(Number((event.target as HTMLSelectElement).value));
  }
}
