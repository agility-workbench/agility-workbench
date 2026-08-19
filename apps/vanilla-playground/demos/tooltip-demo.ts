import {
  createGrid,
  ColumnType,
  type ColDef,
  type TooltipComponentParams,
  type TooltipMode,
} from "@grid";

import { bold, code, demoRoot, field, gridHost, h, note, select, toolbarRow } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * Tooltips, exercising every content path and both positioning modes:
 *
 *  1. Auto-truncation (default, no config): the long "Notes" column clips, so hovering shows the
 *     full value automatically.
 *  2. `tooltipField`: "Rep" shows the rep's email from another field on the row.
 *  3. `tooltipValueGetter`: "Revenue" shows a computed breakdown string.
 *  4. `tooltipComponent` (a function returning an element): "Region" shows a small rich card.
 *  5. Interactive tooltip: "Country" tooltip has a button you can hover into and click (the grace
 *     bridge keeps it open across the gap).
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

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(7);
  const pick = picker(rand);
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

// Path 4: a rich tooltip component for the Region column. The function form is re-invoked to
// refresh, so returning a fresh element each call is correct.
function regionTooltip(params: TooltipComponentParams): HTMLElement {
  const region = String(params.value ?? "");
  return h("div", { style: { maxWidth: "240px" } },
    h("div", { text: region, style: { fontWeight: "700", marginBottom: "4px" } }),
    h("div", {
      text: REGION_BLURB[region] ?? "—",
      style: { opacity: "0.85", lineHeight: "1.4" },
    }),
  );
}

// Path 5: an interactive tooltip for the Country column (has a clickable button).
function countryTooltip(params: TooltipComponentParams): HTMLElement {
  const country = String(params.value ?? "");
  return h("div", { style: { maxWidth: "240px" } },
    h("div", { text: country, style: { fontWeight: "700", marginBottom: "6px" } }),
    h("button", {
      type: "button",
      class: "btn",
      text: "View details →",
      style: { cursor: "pointer" },
      onClick: () => {
        window.alert(`Drilling into ${country}…`);
        params.hide();
      },
    }),
  );
}

const COLUMNS: ColDef[] = [
  {
    colId: "region", key: "region", label: "Region", width: 130,
    headerTooltip: "Sales region. Hover a cell for a regional summary.",
    tooltipComponent: regionTooltip,
  },
  {
    colId: "country", key: "country", label: "Country", width: 150,
    headerTooltip: "Country within the region. Its tooltip has an action button.",
    tooltipComponent: countryTooltip,
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
  { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
  {
    colId: "revenue", key: "revenue", label: "Revenue", width: 150, type: ColumnType.CURRENCY,
    headerTooltip: "Closed revenue for the account.",
    tooltipValueGetter: p =>
      `Revenue: ${p.valueFormatted}\nUnits: ${p.data?.units}\nAvg / unit: ${
        p.data?.units ? Math.round(Number(p.value) / Number(p.data.units)) : "—"
      }`,
  },
  {
    // Path 1: no tooltip config → auto-truncation shows the full note when the cell clips.
    colId: "notes", key: "notes", label: "Notes", width: 200,
  },
];

export function mountTooltipDemo(container: HTMLElement): () => void {
  const host = gridHost();

  container.appendChild(demoRoot(
    note(
      bold("Tooltips."), " ", bold("Notes"), " clips, so it auto-shows the full text on hover. ",
      bold("Rep"), " uses ", code("tooltipField"), " (email), ",
      bold("Revenue"), " a ", code("tooltipValueGetter"), ", ",
      bold("Region"), " a custom ", code("tooltipComponent"), ", and ",
      bold("Country"), " an interactive one with a clickable button. Column headers carry ",
      code("headerTooltip"), " help text.",
      h("br"),
      "Per-column ", code("tooltipOptions"), " override the grid default: ",
      bold("Rep"), " always follows the mouse, and ", bold("Country"),
      " is always interactive + anchored — both ignore the mode toggle below.",
    ),
    toolbarRow(
      field("mode:", select(
        [
          { value: "anchored", label: "anchored" },
          { value: "follow", label: "follow-mouse" },
        ],
        "anchored",
        value => api.updateGridOptions({ tooltip: { mode: value as TooltipMode, showDelay: 250 } }),
      )),
      h("span", {
        style: { opacity: "0.6", fontSize: "13px" },
        text: "(follow-mouse is display-only; the interactive Country tooltip remains anchored)",
      }),
    ),
    host,
  ));

  const api = createGrid(host, {
    rowData: buildRows(500),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    tooltip: { mode: "anchored", showDelay: 250 },
  });

  return () => api.destroy();
}
