import { AfterViewInit, Component, ElementRef, computed, signal, viewChild } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type ActionFrameComponentParams,
  type IActionFrameNgComp,
  type ITooltipNgComp,
  type NgColDef,
  type RowClassParams,
  type TooltipComponentParams,
} from "@agility-workbench/angular-grid";

/**
 * Kitchen sink — every overlay-sensitive feature on one grid, to shake out interaction bugs.
 * 1:1 port of the React playground's KitchenSinkDemo:
 *
 *  - Column groups in all three sections: "Deal" pinned left, "Location" + "Performance" +
 *    "Workflow" center, "Review" pinned right.
 *  - Pinned rows: a top forecast band and a bottom totals band (plus right-click Pin row on any
 *    data row via `rowPinningMenu`).
 *  - Tooltips on every content path: auto-truncation (Notes), tooltipField (Owner → email),
 *    tooltipValueGetter (Pipeline breakdown), Angular tooltipComponent (Region), interactive
 *    tooltip with a button (Country), and headerTooltip on groups and leaves.
 *  - ActionFrame in two sections: Comment (center, click-to-open, corner indicator) and
 *    Sign-off (right-pinned, popover opens to the left).
 */

type Deal = {
  id: string;
  team: string;
  owner: string;
  email: string;
  region: string;
  country: string;
  pipeline: number;
  closed: number;
  notes: string;
  status: string;
  comment: string;
  signoff: string;
};

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
const TEAMS = ["Enterprise", "Commercial", "Growth"];
const OWNERS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva"];
const STATUSES = ["Qualified", "Negotiating", "Won", "Blocked"];
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

function buildRows(count: number): Deal[] {
  const rand = mulberry32(11);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => {
    const region = pick(Object.keys(REGION_BLURB));
    const owner = pick(OWNERS);
    return {
      id: `deal-${i + 1}`,
      team: pick(TEAMS),
      owner,
      email: `${owner.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      region,
      country: pick(COUNTRIES[region]),
      pipeline: 25_000 + Math.floor(rand() * 180_000),
      closed: 8_000 + Math.floor(rand() * 95_000),
      notes: pick(NOTE_FRAGMENTS),
      status: pick(STATUSES),
      comment: i % 5 === 0 ? "Needs follow-up" : "",
      signoff: i % 7 === 0 ? "Approved" : "",
    };
  });
}

@Component({
  standalone: true,
  template: `
    <div style="max-width: 240px">
      <div style="font-weight: 700; margin-bottom: 4px">{{ region }}</div>
      <div style="opacity: 0.85; line-height: 1.4">{{ blurb }}</div>
    </div>
  `,
})
export class KsRegionTooltipComponent implements ITooltipNgComp {
  region = "";
  blurb = "—";

  awbInit(params: TooltipComponentParams): void {
    this.region = String(params.value ?? "");
    this.blurb = REGION_BLURB[this.region] ?? "—";
  }
}

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
export class KsCountryTooltipComponent implements ITooltipNgComp {
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

/** Params delivered to both ActionFrame forms: the cell context plus the demo's persistence
 * callback, injected via `colDef.actionFrameComponentParams` (the extra-params channel). */
type KsFrameParams = ActionFrameComponentParams & {
  onSave?: (rowId: string, field: keyof Deal, text: string) => void;
};

@Component({
  standalone: true,
  template: `
    <div style="display: flex; flex-direction: column; gap: 8px">
      <div style="font-weight: 700; font-size: 13px">Comment · {{ dealId }}</div>
      <textarea
        #box
        rows="4"
        style="width: 100%; box-sizing: border-box; font: inherit; resize: vertical"
        placeholder="Add a comment…"
        [value]="text()"
        (input)="onInput($event)"
      ></textarea>
      <div style="display: flex; gap: 8px; justify-content: flex-end">
        <button type="button" class="btn" (click)="save('')">Delete</button>
        <button type="button" class="btn" (click)="save(text())">Save</button>
      </div>
    </div>
  `,
})
export class KsCommentFormComponent implements IActionFrameNgComp, AfterViewInit {
  private readonly box = viewChild.required<ElementRef<HTMLTextAreaElement>>("box");
  readonly text = signal("");
  dealId = "";
  private params: KsFrameParams | null = null;

  awbInit(params: KsFrameParams): void {
    this.params = params;
    this.dealId = String(params.data?.id ?? "");
    this.text.set(String(params.value ?? ""));
  }

  awbRefresh(params: KsFrameParams): boolean {
    // Keep the draft the user is typing; just track the latest cell context.
    this.params = params;
    this.dealId = String(params.data?.id ?? "");
    return true;
  }

  ngAfterViewInit(): void {
    this.box().nativeElement.focus();
  }

  onInput(ev: Event): void {
    this.text.set((ev.target as HTMLTextAreaElement).value);
  }

  save(text: string): void {
    this.params?.onSave?.(this.params.rowId, "comment", text);
    this.params?.close();
  }
}

@Component({
  standalone: true,
  template: `
    <div style="display: flex; flex-direction: column; gap: 8px; min-width: 180px">
      <div style="font-weight: 700; font-size: 13px">Sign-off · {{ dealId }}</div>
      <div style="font-size: 12px; opacity: 0.75">{{ current }}</div>
      <div style="display: flex; gap: 8px; justify-content: flex-end">
        <button type="button" class="btn" (click)="set('')">Clear</button>
        <button type="button" class="btn" (click)="set('Approved')">Approve</button>
      </div>
    </div>
  `,
})
export class KsSignoffFormComponent implements IActionFrameNgComp {
  dealId = "";
  current = "Not yet reviewed.";
  private params: KsFrameParams | null = null;

  awbInit(params: KsFrameParams): void {
    this.params = params;
    this.dealId = String(params.data?.id ?? "");
    this.current = params.value ? `Currently: ${params.value}` : "Not yet reviewed.";
  }

  set(text: string): void {
    this.params?.onSave?.(this.params.rowId, "signoff", text);
    this.params?.close();
  }
}

@Component({
  selector: "kitchen-sink-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="demo-intro">
      <strong>Kitchen sink.</strong> Column groups span all three sections
      (<span style="font-weight: 700">Deal</span> pinned left,
      <span style="font-weight: 700">Review</span> pinned right), with pinned top/bottom rows.
      Tooltips: <span style="font-weight: 700">Owner</span> (field),
      <span style="font-weight: 700">Region</span> (Angular component),
      <span style="font-weight: 700">Country</span> (interactive),
      <span style="font-weight: 700">Pipeline</span> (value getter),
      <span style="font-weight: 700">Notes</span> (auto-truncation). ActionFrames: click
      <span style="font-weight: 700">Comment</span> (center) or
      <span style="font-weight: 700">Sign-off</span> (right-pinned). Right-click a data row for
      Pin row.
    </div>
    <div class="demo-topbar" style="font-size: 13px">
      <button class="btn" type="button" (click)="showTop.set(!showTop())">
        {{ showTop() ? "Hide" : "Show" }} top forecast
      </button>
      <button class="btn" type="button" (click)="showBottom.set(!showBottom())">
        {{ showBottom() ? "Hide" : "Show" }} bottom totals
      </button>
      <button
        type="button"
        class="btn"
        (click)="grid.api?.openActionFrame({ rowId: 'deal-1', colId: 'comment' })"
      >
        Open comment on row 1 (API)
      </button>
      <button
        type="button"
        class="btn"
        (click)="grid.api?.openActionFrame({ rowId: 'deal-1', colId: 'signoff' })"
      >
        Open sign-off on row 1 (API)
      </button>
    </div>
    <div class="demo-grid-host">
      <awb-grid
        #grid="awbGrid"
        [rowData]="rows()"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [tooltip]="{ interactive: true, showDelay: 250 }"
        [pinnedTopRowData]="topRows()"
        [pinnedBottomRowData]="bottomRows()"
        [pinnedRowsEditable]="true"
        [rowPinningMenu]="true"
        [quickFilter]="{ mode: 'always', debounceMs: 0 }"
        [toolbar]="{ sorting: true }"
        [getRowClass]="rowClass"
      />
    </div>
  `,
  styles: [":host { display: flex; flex-direction: column; height: 100%; gap: 10px; min-height: 0 }"],
})
export class KitchenSinkDemoComponent {
  readonly rows = signal<Deal[]>(buildRows(200));
  readonly showTop = signal(true);
  readonly showBottom = signal(true);

  private readonly onSave = (rowId: string, field: keyof Deal, text: string): void => {
    this.rows.update((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: text } : r)));
  };

  readonly columnDefs: NgColDef[] = [
    {
      colId: "deal", label: "Deal", pinned: "left",
      children: [
        {
          colId: "team", key: "team", label: "Team", width: 120,
          headerTooltip: "Sales team. This whole group is pinned left.",
        },
        {
          colId: "owner", key: "owner", label: "Owner", width: 130,
          tooltipField: "email",
          headerTooltip: "Account owner — hover a cell for their email (tooltipField).",
        },
      ],
    },
    {
      colId: "location", label: "Location",
      children: [
        {
          colId: "region", key: "region", label: "Region", width: 110,
          tooltipComponent: KsRegionTooltipComponent,
          headerTooltip: "Hover a cell for a regional summary (Angular tooltipComponent).",
        },
        {
          colId: "country", key: "country", label: "Country", width: 150,
          tooltipComponent: KsCountryTooltipComponent,
          tooltipOptions: { interactive: true, placement: "right" },
          headerTooltip: "Interactive tooltip — hover into it and click the button.",
        },
      ],
    },
    {
      colId: "performance", label: "Performance",
      children: [
        {
          colId: "pipeline", key: "pipeline", label: "Pipeline", width: 140, type: ColumnType.CURRENCY,
          tooltipValueGetter: (p) =>
            `Pipeline: ${p.valueFormatted}\nClosed: ${p.data?.closed}\nCoverage: ${
              p.data?.closed ? (Number(p.value) / Number(p.data.closed)).toFixed(1) + "×" : "—"
            }`,
          headerTooltip: "Hover a cell for a computed breakdown (tooltipValueGetter).",
        },
        { colId: "closed", key: "closed", label: "Closed", width: 140, type: ColumnType.CURRENCY },
        {
          // No tooltip config → the auto-truncation tooltip shows the clipped note in full.
          colId: "notes", key: "notes", label: "Notes", width: 180,
        },
      ],
    },
    {
      colId: "workflow", label: "Workflow",
      children: [
        { colId: "status", key: "status", label: "Status", width: 120 },
        {
          colId: "comment", key: "comment", label: "Comment", width: 190,
          editable: true,
          actionFrameTrigger: "click",
          actionFrameComponent: KsCommentFormComponent,
          actionFrameComponentParams: { onSave: this.onSave },
          actionFrameIndicator: "comment",
          tooltipValueGetter: (p) => (p.value ? `Comment: ${p.value}` : "Click to add a comment"),
          headerTooltip: "Center-section ActionFrame — click a cell to open the comment form.",
        },
      ],
    },
    {
      colId: "review", label: "Review", pinned: "right",
      children: [
        {
          colId: "signoff", key: "signoff", label: "Sign-off", width: 110,
          actionFrameTrigger: "click",
          actionFrameComponent: KsSignoffFormComponent,
          actionFrameComponentParams: { onSave: this.onSave },
          actionFrameIndicator: "signoff",
          actionFrameOptions: { placement: "left" },
          headerTooltip: "Right-pinned ActionFrame — the popover opens to the left.",
        },
      ],
    },
  ];

  readonly topRows = computed<Partial<Deal>[]>(() => this.showTop() ? [{
    id: "forecast",
    team: "FY forecast",
    owner: "All teams",
    notes: "Top pinned row — hover cells here too; tooltips and frames should behave.",
    pipeline: 8_500_000,
    closed: 6_400_000,
  }] : []);

  readonly bottomRows = computed<Partial<Deal>[]>(() => {
    if (!this.showBottom()) return [];
    const rows = this.rows();
    return [{
      id: "totals",
      team: "Totals",
      owner: `${rows.length} deals`,
      pipeline: rows.reduce((sum, row) => sum + row.pipeline, 0),
      closed: rows.reduce((sum, row) => sum + row.closed, 0),
    }];
  });

  readonly rowClass = ({ node }: RowClassParams): string | undefined =>
    node.rowPinned ? `demo-pinned-${node.rowPinned}` : undefined;
}
