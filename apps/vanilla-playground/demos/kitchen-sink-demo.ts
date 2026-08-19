import {
  createGrid,
  ColumnType,
  type ActionFrameComponentParams,
  type ColDef,
  type TooltipComponentParams,
} from "@grid";

import { bold, btn, demoRoot, gridHost, h, note, toolbarRow } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * Kitchen sink — every overlay-sensitive feature on one grid, to shake out interaction bugs:
 *
 *  - Column groups in all three sections: "Deal" pinned left, "Location" + "Performance" +
 *    "Workflow" center, "Review" pinned right.
 *  - Pinned rows: a top forecast band and a bottom totals band (plus right-click Pin row on any
 *    data row via `rowPinningMenu`).
 *  - Tooltips on every content path: auto-truncation (Notes), tooltipField (Owner → email),
 *    tooltipValueGetter (Pipeline breakdown), tooltipComponent (Region), interactive tooltip with a
 *    button (Country), and headerTooltip on groups and leaves.
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
  email?: string;
  region?: string;
  country?: string;
  pipeline: number;
  closed: number;
  notes?: string;
  status?: string;
  comment?: string;
  signoff?: string;
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

function buildRows(count: number): Deal[] {
  const rand = mulberry32(11);
  const pick = picker(rand);
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

function regionTooltip(params: TooltipComponentParams): HTMLElement {
  const region = String(params.value ?? "");
  return h("div", { style: { maxWidth: "240px" } },
    h("div", { text: region, style: { fontWeight: "700", marginBottom: "4px" } }),
    h("div", { text: REGION_BLURB[region] ?? "—", style: { opacity: "0.85", lineHeight: "1.4" } }),
  );
}

function countryTooltip(params: TooltipComponentParams): HTMLElement {
  const country = String(params.value ?? "");
  return h("div", { style: { maxWidth: "240px" } },
    h("div", { text: country, style: { fontWeight: "700", marginBottom: "6px" } }),
    h("button", {
      type: "button", class: "btn", text: "View details →", style: { cursor: "pointer" },
      onClick: () => {
        window.alert(`Drilling into ${country}…`);
        params.hide();
      },
    }),
  );
}

type SaveField = "comment" | "signoff";
type SaveFn = (rowId: string, field: SaveField, text: string) => void;

function commentForm(params: ActionFrameComponentParams, onSave: SaveFn): HTMLElement {
  let text = String(params.value ?? "");
  const textarea = h("textarea", {
    rows: 4,
    value: text,
    placeholder: "Add a comment…",
    style: { width: "100%", boxSizing: "border-box", font: "inherit", resize: "vertical" },
    onInput: (event: Event) => { text = (event.target as HTMLTextAreaElement).value; },
  });
  requestAnimationFrame(() => textarea.focus());

  return h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } },
    h("div", { text: `Comment · ${params.data?.id}`, style: { fontWeight: "700", fontSize: "13px" } }),
    textarea,
    h("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
      btn("Delete", () => { onSave(params.rowId, "comment", ""); params.close(); }),
      btn("Save", () => { onSave(params.rowId, "comment", text); params.close(); }),
    ),
  );
}

function signoffForm(params: ActionFrameComponentParams, onSave: SaveFn): HTMLElement {
  return h("div", {
    style: { display: "flex", flexDirection: "column", gap: "8px", minWidth: "180px" },
  },
    h("div", { text: `Sign-off · ${params.data?.id}`, style: { fontWeight: "700", fontSize: "13px" } }),
    h("div", {
      text: params.value ? `Currently: ${params.value}` : "Not yet reviewed.",
      style: { fontSize: "12px", opacity: "0.75" },
    }),
    h("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
      btn("Clear", () => { onSave(params.rowId, "signoff", ""); params.close(); }),
      btn("Approve", () => { onSave(params.rowId, "signoff", "Approved"); params.close(); }),
    ),
  );
}

export function mountKitchenSinkDemo(container: HTMLElement): () => void {
  const rows = buildRows(200);
  const rowsById = new Map(rows.map(row => [row.id, row]));
  let showTop = true;
  let showBottom = true;

  const onSave: SaveFn = (rowId, field, text) => {
    const row = rowsById.get(rowId);
    if (!row) return;
    const next = { ...row, [field]: text };
    rowsById.set(rowId, next);
    api.applyTransaction({ update: [{ rowId, row: next }] });
    applyPinnedRows();
  };

  const columnDefs: ColDef[] = [
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
          tooltipComponent: regionTooltip,
          headerTooltip: "Hover a cell for a regional summary (custom tooltipComponent).",
        },
        {
          colId: "country", key: "country", label: "Country", width: 150,
          tooltipComponent: countryTooltip,
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
          tooltipValueGetter: p =>
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
          actionFrameComponent: params => commentForm(params, onSave),
          actionFrameIndicator: "comment",
          tooltipValueGetter: p => (p.value ? `Comment: ${p.value}` : "Click to add a comment"),
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
          actionFrameComponent: params => signoffForm(params, onSave),
          actionFrameIndicator: "signoff",
          actionFrameOptions: { placement: "left" },
          headerTooltip: "Right-pinned ActionFrame — the popover opens to the left.",
        },
      ],
    },
  ];

  const host = gridHost();
  const topButton = btn("Hide top forecast", () => {
    showTop = !showTop;
    topButton.textContent = `${showTop ? "Hide" : "Show"} top forecast`;
    applyPinnedRows();
  });
  const bottomButton = btn("Hide bottom totals", () => {
    showBottom = !showBottom;
    bottomButton.textContent = `${showBottom ? "Hide" : "Show"} bottom totals`;
    applyPinnedRows();
  });

  container.appendChild(demoRoot(
    note(
      bold("Kitchen sink."), " Column groups span all three sections (", bold("Deal"),
      " pinned left, ", bold("Review"), " pinned right), with pinned top/bottom rows. Tooltips: ",
      bold("Owner"), " (field), ", bold("Region"), " (component), ", bold("Country"),
      " (interactive), ", bold("Pipeline"), " (value getter), ", bold("Notes"),
      " (auto-truncation). ActionFrames: click ", bold("Comment"), " (center) or ",
      bold("Sign-off"), " (right-pinned). Right-click a data row for Pin row.",
    ),
    toolbarRow(
      topButton,
      bottomButton,
      btn("Open comment on row 1 (API)", () =>
        api.openActionFrame({ rowId: "deal-1", colId: "comment" })),
      btn("Open sign-off on row 1 (API)", () =>
        api.openActionFrame({ rowId: "deal-1", colId: "signoff" })),
    ),
    host,
  ));

  const api = createGrid(host, {
    rowData: rows,
    columnDefs,
    rowIdKey: "id",
    tooltip: { showDelay: 250 },
    pinnedTopRowData: topRows(),
    pinnedBottomRowData: bottomRows(),
    pinnedRowsEditable: true,
    rowPinningMenu: true,
    quickFilter: { mode: "always", debounceMs: 0 },
    toolbar: { sorting: true },
    getRowClass: ({ node }) => (node.rowPinned ? `demo-pinned-${node.rowPinned}` : undefined),
  });

  function applyPinnedRows(): void {
    api.updateGridOptions({
      pinnedTopRowData: topRows(),
      pinnedBottomRowData: bottomRows(),
    });
  }

  function topRows(): Partial<Deal>[] {
    return showTop ? [{
      id: "forecast",
      team: "FY forecast",
      owner: "All teams",
      notes: "Top pinned row — hover cells here too; tooltips and frames should behave.",
      pipeline: 8_500_000,
      closed: 6_400_000,
    }] : [];
  }

  function bottomRows(): Partial<Deal>[] {
    const values = [...rowsById.values()];
    return showBottom ? [{
      id: "totals",
      team: "Totals",
      owner: `${values.length} deals`,
      pipeline: values.reduce((sum, row) => sum + row.pipeline, 0),
      closed: values.reduce((sum, row) => sum + row.closed, 0),
    }] : [];
  }

  return () => api.destroy();
}
