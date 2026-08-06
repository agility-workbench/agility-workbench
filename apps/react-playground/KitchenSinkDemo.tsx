import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";
import type { TooltipComponentParams } from "@grid/renderer/tooltip/tooltipComponent";
import type { ActionFrameComponentParams } from "@grid/renderer/actionFrame/actionFrameComponent";

/**
 * Kitchen sink — every overlay-sensitive feature on one grid, to shake out interaction bugs:
 *
 *  - Column groups in all three sections: "Deal" pinned left, "Location" + "Performance" +
 *    "Workflow" center, "Review" pinned right.
 *  - Pinned rows: a top forecast band and a bottom totals band (plus right-click Pin row on any
 *    data row via `rowPinningMenu`).
 *  - Tooltips on every content path: auto-truncation (Notes), tooltipField (Owner → email),
 *    tooltipValueGetter (Pipeline breakdown), React tooltipComponent (Region), interactive
 *    tooltip with a button (Country), and headerTooltip on groups and leaves.
 *  - ActionFrame in two sections: Comment (center, click-to-open, corner indicator) and
 *    Sign-off (right-pinned, popover opens to the left).
 *
 * Things worth poking at: hover center cells with the pinned sections present, open an
 * ActionFrame and scroll (it should track its cell), hover cells in the pinned top/bottom rows,
 * and drag the horizontal scroll while a tooltip/frame is up.
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
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
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

function RegionTooltip(params: TooltipComponentParams) {
  const region = String(params.value ?? "");
  return (
    <div style={{ maxWidth: 240 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{region}</div>
      <div style={{ opacity: 0.85, lineHeight: 1.4 }}>{REGION_BLURB[region] ?? "—"}</div>
    </div>
  );
}

function CountryTooltip(params: TooltipComponentParams) {
  const country = String(params.value ?? "");
  return (
    <div style={{ maxWidth: 240 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{country}</div>
      <button
        type="button"
        className="btn"
        onClick={() => {
          // eslint-disable-next-line no-alert
          alert(`Drilling into ${country}…`);
          params.hide();
        }}
        style={{ cursor: "pointer" }}
      >
        View details →
      </button>
    </div>
  );
}

function CommentForm(params: ActionFrameComponentParams & { onSave?: (rowId: string, field: keyof Deal, text: string) => void }) {
  const [text, setText] = useState<string>(String(params.value ?? ""));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Comment · {params.data?.id}</div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{ width: "100%", boxSizing: "border-box", font: "inherit", resize: "vertical" }}
        placeholder="Add a comment…"
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={() => { params.onSave?.(params.rowId, "comment", ""); params.close(); }}>
          Delete
        </button>
        <button type="button" className="btn" onClick={() => { params.onSave?.(params.rowId, "comment", text); params.close(); }}>
          Save
        </button>
      </div>
    </div>
  );
}

function SignoffForm(params: ActionFrameComponentParams & { onSave?: (rowId: string, field: keyof Deal, text: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 180 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Sign-off · {params.data?.id}</div>
      <div style={{ fontSize: 12, opacity: 0.75 }}>
        {params.value ? `Currently: ${params.value}` : "Not yet reviewed."}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={() => { params.onSave?.(params.rowId, "signoff", ""); params.close(); }}>
          Clear
        </button>
        <button type="button" className="btn" onClick={() => { params.onSave?.(params.rowId, "signoff", "Approved"); params.close(); }}>
          Approve
        </button>
      </div>
    </div>
  );
}

export function KitchenSinkDemo() {
  const [rows, setRows] = useState(() => buildRows(200));
  const [showTop, setShowTop] = useState(true);
  const [showBottom, setShowBottom] = useState(true);
  const apiRef = useRef<IGridAPI | null>(null);

  const onSave = (rowId: string, field: keyof Deal, text: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, [field]: text } : r)));
  };

  const columnDefs = useMemo<ReactColDef[]>(() => [
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
          tooltipComponent: RegionTooltip,
          headerTooltip: "Hover a cell for a regional summary (React tooltipComponent).",
        },
        {
          colId: "country", key: "country", label: "Country", width: 150,
          tooltipComponent: CountryTooltip,
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
          actionFrameComponent: (p: ActionFrameComponentParams) => <CommentForm {...p} onSave={onSave} />,
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
          actionFrameComponent: (p: ActionFrameComponentParams) => <SignoffForm {...p} onSave={onSave} />,
          actionFrameIndicator: "signoff",
          actionFrameOptions: { placement: "left" },
          headerTooltip: "Right-pinned ActionFrame — the popover opens to the left.",
        },
      ],
    },
  ], []);

  const totalPipeline = rows.reduce((sum, row) => sum + row.pipeline, 0);
  const totalClosed = rows.reduce((sum, row) => sum + row.closed, 0);
  const topRows: Partial<Deal>[] = showTop ? [{
    id: "forecast",
    team: "FY forecast",
    owner: "All teams",
    notes: "Top pinned row — hover cells here too; tooltips and frames should behave.",
    pipeline: 8_500_000,
    closed: 6_400_000,
  }] : [];
  const bottomRows: Partial<Deal>[] = showBottom ? [{
    id: "totals",
    team: "Totals",
    owner: `${rows.length} deals`,
    pipeline: totalPipeline,
    closed: totalClosed,
  }] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        <strong>Kitchen sink.</strong> Column groups span all three sections
        (<span style={{ fontWeight: 700 }}>Deal</span> pinned left,{" "}
        <span style={{ fontWeight: 700 }}>Review</span> pinned right), with pinned top/bottom rows.
        Tooltips: <span style={{ fontWeight: 700 }}>Owner</span> (field),{" "}
        <span style={{ fontWeight: 700 }}>Region</span> (React component),{" "}
        <span style={{ fontWeight: 700 }}>Country</span> (interactive),{" "}
        <span style={{ fontWeight: 700 }}>Pipeline</span> (value getter),{" "}
        <span style={{ fontWeight: 700 }}>Notes</span> (auto-truncation). ActionFrames: click{" "}
        <span style={{ fontWeight: 700 }}>Comment</span> (center) or{" "}
        <span style={{ fontWeight: 700 }}>Sign-off</span> (right-pinned). Right-click a data row
        for Pin row.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={() => setShowTop((v) => !v)}>
          {showTop ? "Hide" : "Show"} top forecast
        </button>
        <button className="btn" type="button" onClick={() => setShowBottom((v) => !v)}>
          {showBottom ? "Hide" : "Show"} bottom totals
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => apiRef.current?.openActionFrame({ rowId: "deal-1", colId: "comment" })}
        >
          Open comment on row 1 (API)
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => apiRef.current?.openActionFrame({ rowId: "deal-1", colId: "signoff" })}
        >
          Open sign-off on row 1 (API)
        </button>
      </div>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Grid
          apiRef={apiRef}
          rowData={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          tooltip={{ interactive: true, showDelay: 250 }}
          pinnedTopRowData={topRows}
          pinnedBottomRowData={bottomRows}
          pinnedRowsEditable
          rowPinningMenu
          quickFilter={{ mode: "always", debounceMs: 0 }}
          toolbar={{ sorting: true }}
          getRowClass={({ node }) => (node.rowPinned ? `demo-pinned-${node.rowPinned}` : undefined)}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default KitchenSinkDemo;
