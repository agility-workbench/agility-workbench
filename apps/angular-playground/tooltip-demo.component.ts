import { Component, computed, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type ITooltipNgComp,
  type NgColDef,
  type TooltipComponentParams,
  type TooltipOptions,
} from "@agility-workbench/angular-grid";

/**
 * Tooltips, exercising every content path and both positioning modes:
 *
 *  1. Auto-truncation (default, no config): the long "Notes" column clips, so hovering shows the
 *     full value automatically.
 *  2. `tooltipField`: "Rep" shows the rep's email from another field on the row.
 *  3. `tooltipValueGetter`: "Revenue" shows a computed breakdown string.
 *  4. `tooltipComponent` (Angular): "Region" shows a small rich card.
 *  5. Interactive tooltip (Angular): "Country" tooltip has a button you can hover into and click
 *     (grace bridge keeps it open across the gap).
 *  6. `headerTooltip`: several column headers carry help text.
 *
 * A toggle switches display-only tooltips between anchored (default) and follow-mouse mode. The
 * interactive Country tooltip remains anchored so its button is always reachable.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  units: number;
  revenue: number;
  rep: string;
  email: string;
  notes: string;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const REGION_BLURB: Record<string, string> = {
  EMEA: "Europe, Middle East & Africa — 42 markets, HQ in London.",
  APAC: "Asia-Pacific — fastest-growing region this year (+18% YoY).",
  Americas: "North & South America — largest revenue base.",
};
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["United Kingdom", "France", "Germany"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["United States of America", "Canada", "Brazil"],
};
const REPS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva"];
const NOTE_FRAGMENTS = [
  "Renewal pending finance sign-off; expansion into two new business units under discussion.",
  "Escalated support ticket resolved; customer sentiment improved after the Q2 QBR.",
  "Multi-year contract; discount tier applies. Champion changed roles — reconfirm sponsor.",
  "Pilot converted to paid; onboarding scheduled. Watch for seat over-provisioning.",
];

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
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    const rep = pick(REPS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 500_000),
      rep,
      email: `${rep.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      notes: pick(NOTE_FRAGMENTS),
    };
  });
}

/** Path 4: a rich Angular tooltip component for the Region column. */
@Component({
  standalone: true,
  template: `
    <div style="max-width: 240px">
      <div style="font-weight: 700; margin-bottom: 4px">{{ region }}</div>
      <div style="opacity: 0.85; line-height: 1.4">{{ blurb }}</div>
    </div>
  `,
})
export class RegionTooltipComponent implements ITooltipNgComp {
  region = "";
  blurb = "—";

  awbInit(params: TooltipComponentParams): void {
    this.region = String(params.value ?? "");
    this.blurb = REGION_BLURB[this.region] ?? "—";
  }
}

/** Path 5: an interactive Angular tooltip for the Country column (has a clickable button). */
@Component({
  standalone: true,
  template: `
    <div style="max-width: 240px">
      <div style="font-weight: 700; margin-bottom: 6px">{{ country }}</div>
      <button type="button" class="btn" style="cursor: pointer" (click)="drillIn()">
        View details →
      </button>
    </div>
  `,
})
export class CountryTooltipComponent implements ITooltipNgComp {
  country = "";
  private params: TooltipComponentParams | null = null;

  awbInit(params: TooltipComponentParams): void {
    this.params = params;
    this.country = String(params.value ?? "");
  }

  drillIn(): void {
    // eslint-disable-next-line no-alert
    alert(`Drilling into ${this.country}…`);
    this.params?.hide();
  }
}

@Component({
  selector: "tooltip-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="demo-intro">
      <strong>Tooltips.</strong>
      <span style="font-weight: 700">Notes</span> clips, so it auto-shows the full text on hover.
      <span style="font-weight: 700">Rep</span> uses <code>tooltipField</code> (email),
      <span style="font-weight: 700">Revenue</span> a <code>tooltipValueGetter</code>,
      <span style="font-weight: 700">Region</span> a custom Angular <code>tooltipComponent</code>, and
      <span style="font-weight: 700">Country</span> an interactive one with a clickable button.
      Column headers carry <code>headerTooltip</code> help text.
      <br />
      Per-column <code>tooltipOptions</code> override the grid default:
      <span style="font-weight: 700">Rep</span> always follows the mouse, and
      <span style="font-weight: 700">Country</span> is always interactive + anchored — both ignore the mode toggle below.
    </div>
    <div class="demo-topbar" style="font-size: 13px">
      <label style="display: inline-flex; gap: 6px; align-items: center">
        mode:
        <select [value]="mode()" (change)="onModeChange($event)">
          <option value="anchored">anchored</option>
          <option value="follow">follow-mouse</option>
        </select>
      </label>
      <span style="opacity: 0.6">
        (follow-mouse is display-only; the interactive Country tooltip remains anchored)
      </span>
    </div>
    <div class="demo-grid-host">
      <awb-grid [rowData]="rows" [columnDefs]="columnDefs" rowIdKey="id" [tooltip]="tooltipOptions()" />
    </div>
  `,
  styles: [":host { display: flex; flex-direction: column; height: 100%; gap: 12px; min-height: 0; }"],
})
export class TooltipDemoComponent {
  readonly rows = buildRows(500);
  readonly mode = signal<"anchored" | "follow">("anchored");

  readonly tooltipOptions = computed<TooltipOptions>(() => ({
    mode: this.mode(),
    showDelay: 250,
  }));

  readonly columnDefs: NgColDef[] = [
    {
      colId: "region", key: "region", label: "Region", width: 130,
      headerTooltip: "Sales region. Hover a cell for a regional summary.",
      tooltipComponent: RegionTooltipComponent,
    },
    {
      colId: "country", key: "country", label: "Country", width: 150,
      headerTooltip: "Country within the region. Its tooltip has an action button.",
      tooltipComponent: CountryTooltipComponent,
      // Per-column override: this tooltip is always interactive + anchored, regardless of the
      // grid-level toggle below, because its button must be clickable.
      tooltipOptions: { interactive: true, placement: "right" },
    },
    {
      colId: "rep", key: "rep", label: "Sales Rep", width: 150,
      headerTooltip: "Account owner. Hover for their email.",
      tooltipField: "email",
      // Per-column override: the rep hint always follows the pointer, even when the grid default
      // is anchored.
      tooltipOptions: { mode: "follow" },
    },
    {
      colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER,
    },
    {
      colId: "revenue", key: "revenue", label: "Revenue", width: 150, type: ColumnType.CURRENCY,
      headerTooltip: "Closed revenue for the account.",
      tooltipValueGetter: (p) =>
        `Revenue: ${p.valueFormatted}\nUnits: ${p.data?.units}\nAvg / unit: ${
          p.data?.units ? Math.round(Number(p.value) / Number(p.data.units)) : "—"
        }`,
    },
    {
      // Path 1: no tooltip config → auto-truncation shows the full note when the cell clips.
      colId: "notes", key: "notes", label: "Notes", width: 200,
    },
  ];

  onModeChange(ev: Event): void {
    this.mode.set((ev.target as HTMLSelectElement).value as "anchored" | "follow");
  }
}
