import {
  createGrid,
  AggregateType,
  ColumnType,
  type ColDef,
  type GridSheet,
} from "@grid";

import { bold, btn, code, demoRoot, field, gridHost, h, note, select, toolbarRow } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * The blank pivot canvas: pivot mode with no row group, no pivot column and no value displays
 * NOTHING — no columns (not even the auto-group column), no rows — and says so through
 * `pivotEmptyMessage`. Turn pivot mode on with the grid empty of roles and watch the whole
 * layout go blank; the column panel opens itself, because a blank canvas has no header to reach
 * a column menu from.
 *
 * The panel here is `availability: "pivot"` by default — it exists only while pivoted, which is
 * the setup for an app that manages columns its own way but wants the grid's pivot customizer.
 * Flip it to `always` to compare.
 *
 * Press + in the footer for a second blank sheet: a fresh pivot sheet lands on the same canvas.
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

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(11);
  const pick = picker(rand);
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

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 130 },
  { colId: "country", key: "country", label: "Country", width: 130 },
  { colId: "quarter", key: "quarter", label: "Quarter", width: 110 },
  { colId: "product", key: "product", label: "Product", width: 130 },
  { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
];

// Set at construction, like every other message option (none are runtime-updatable). Omit it and
// the grid says "Add row groups, column labels or values to build the pivot".
const EMPTY_MESSAGE = "Nothing configured yet — drop a field into Row groups, Column labels or Values";

export function mountBlankPivotDemo(container: HTMLElement): () => void {
  const rows = buildRows(2000);
  let sheets: GridSheet[] = [{ id: "data", name: "Data" }];
  let activeSheetId: string | null = "data";

  const host = gridHost();
  const stateReadout = h("dl", {
    style: {
      display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px",
      margin: "8px 0 0", fontSize: "12px", lineHeight: "1.5",
    },
  });

  container.appendChild(demoRoot(
    note(
      "Press ", bold("Pivot"), " in the toolbar with no roles set and the grid goes ",
      bold("completely blank"), " — no columns, no rows, just ", code("pivotEmptyMessage"),
      " (overridden on this page, to show it is yours to word). Previously this state showed a ",
      "lone group column over a \"Total\" row that nothing could act on. The column panel opens ",
      "itself on the way in, since a blank canvas has no header to open a column menu from. Fill ",
      "any one of the three wells and the grid fills in; empty them all and it goes blank again. ",
      bold("+"), " in the footer adds another blank pivot sheet.",
    ),
    toolbarRow(
      field("Column panel", select(
        [
          { value: "pivot", label: "availability: \"pivot\"" },
          { value: "always", label: "availability: \"always\"" },
        ],
        "pivot",
        value => api.updateGridOptions({
          columnPanel: { availability: value as "always" | "pivot", trigger: "toolbar" },
        }),
      )),
    ),
    toolbarRow(
      btn("Enter pivot mode (blank)", () => {
        api.setRowGroupColumns([]);
        api.setPivotColumns([]);
        api.setAggregates([]);
        api.setPivotMode(true);
      }),
      btn("Configure a pivot", () => {
        api.setRowGroupColumns(["region"]);
        api.setPivotColumns(["quarter"]);
        api.setAggregates([{ colId: "revenue", type: AggregateType.SUM }]);
        api.setPivotMode(true);
      }),
      btn("Clear every role", () => {
        api.setRowGroupColumns([]);
        api.setPivotColumns([]);
        api.setAggregates([]);
      }),
      btn("Leave pivot mode", () => api.setPivotMode(false)),
    ),
    h("div", { style: { display: "flex", gap: "12px", flex: "1", minHeight: "0" } },
      // minWidth:0 keeps the grid from widening the page as generated pivot columns appear.
      host,
      h("aside", {
        style: {
          width: "260px", flex: "0 0 260px", overflow: "auto", padding: "12px",
          boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: "8px",
          background: "#f9fafb",
        },
      },
        h("strong", { text: "What the grid reports", style: { fontSize: "13px" } }),
        h("div", {
          text: "isPivotUnconfigured() is public, so an app driving pivot through its own UI can render the same empty state the grid does.",
          style: { marginTop: "4px", fontSize: "11px", color: "#6b7280" },
        }),
        stateReadout,
      ),
    ),
  ));

  const api = createGrid(host, {
    rowData: rows,
    columnDefs: COLUMNS,
    rowIdKey: "id",
    groupDefaultExpanded: 1,
    toolbar: { pivot: true },
    pivotEmptyMessage: EMPTY_MESSAGE,
    // Only while pivoted: outside pivot mode this app owns column management itself.
    columnPanel: { availability: "pivot", trigger: "toolbar" },
    sheets: sheetsOptions(),
  });

  // Subscriptions die with the grid instance, which this page destroys on unmount.
  api.on("pivotChanged", renderState);
  api.on("aggregateChanged", renderState);
  api.on("columnsChanged", renderState);
  renderState();

  /** Sheets are application-owned: the grid is handed the list, and reports every next one back. */
  function sheetsOptions() {
    return {
      sheets,
      activeSheetId,
      onChange: (next: GridSheet[]) => { sheets = next; },
      onActiveSheetChange: (sheetId: string | null) => { activeSheetId = sheetId; },
    };
  }

  function renderState(): void {
    const unconfigured = api.isPivotUnconfigured();
    const entries: Array<[string, string]> = [
      ["Pivot mode", api.getPivotMode() ? "on" : "off"],
      ["isPivotUnconfigured()", String(unconfigured)],
      ["Row groups", api.getRowGroupColumns().join(", ") || "—"],
      ["Column labels", api.getPivotColumns().join(", ") || "—"],
      ["Values", api.getAggregates().map(a => `${a.colId}:${a.type}`).join(", ") || "—"],
    ];
    stateReadout.replaceChildren(...entries.flatMap(([term, value]) => [
      h("dt", { text: term, style: { color: "#6b7280" } }),
      h("dd", {
        text: value,
        style: {
          margin: "0",
          fontWeight: term === "isPivotUnconfigured()" && unconfigured ? "700" : "400",
        },
      }),
    ]));
  }

  return () => api.destroy();
}
