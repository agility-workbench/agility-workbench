import {
  createGrid,
  AggregateType,
  ColumnType,
  type ColDef,
  type ColumnPanelTrigger,
  type GroupDisplayType,
  type GroupSortMode,
  type IGridAPI,
} from "@grid";

import { btn, checkbox, demoRoot, field, gridHost, h, select, toolbarRow } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * Row-grouping playground: group by one or more columns, switch the GroupDisplayType, and toggle a
 * SUM aggregate. The grid lives in a constrained flex item (minWidth:0) so adding the pinned
 * auto-group column never widens the page.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  category: string;
  rep: string;
  units: number;
  revenue: number;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany", "Spain"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
// Deliberately omit one category from each region. This makes a Region → Category grouping useful
// for checking that a Category sort reorders the second-level groups in local group-sort mode.
const CATEGORIES_BY_REGION: Record<string, string[]> = {
  EMEA: ["Hardware", "Software"],
  APAC: ["Software", "Services"],
  Americas: ["Hardware", "Services"],
};
const REPS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva", "Ethan Khan"];

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(7);
  const pick = picker(rand);
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      category: pick(CATEGORIES_BY_REGION[region]),
      rep: pick(REPS),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 500_000),
    };
  });
}

const GROUPABLE: Array<{ colId: string; label: string }> = [
  { colId: "region", label: "Region" },
  { colId: "country", label: "Country" },
  { colId: "category", label: "Category" },
  { colId: "rep", label: "Sales Rep" },
];

const DISPLAY_TYPES: GroupDisplayType[] = ["singleColumn", "multipleColumns", "groupRows"];

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 130 },
  { colId: "country", key: "country", label: "Country", width: 130 },
  // colSpan demo: the Category cell spans across Sales Rep whenever it is "Services", producing a
  // merged two-column cell on those rows only. Span is clamped within the (center) section.
  {
    colId: "category", key: "category", label: "Category", width: 130,
    colSpan: p => (p.value === "Services" ? 2 : 1),
  },
  { colId: "rep", key: "rep", label: "Sales Rep", width: 160 },
  { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
];

/** Resolve a column's instanceID (the key the aggregate model expects) from its colId. */
function colInstance(api: IGridAPI, colId: string): string {
  return api.getColumnModel().getByColId(colId)?.instanceID ?? "";
}

export function mountGroupingDemo(container: HTMLElement): () => void {
  let groupBy = ["region", "category"];
  let aggregate = true;

  const host = gridHost();

  const groupChecks = GROUPABLE.map(({ colId, label }) => field(
    label,
    checkbox(groupBy.includes(colId), () => {
      groupBy = groupBy.includes(colId) ? groupBy.filter(c => c !== colId) : [...groupBy, colId];
      applyGrouping();
    }),
    { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px" } },
  ));

  container.appendChild(demoRoot(
    toolbarRow(
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
        field("Display type", select(DISPLAY_TYPES, "singleColumn", value =>
          // groupDisplayType changes the synthesized grouping columns and whether group nodes render
          // as full-width rows; core reconciles it in place, no remount needed.
          api.updateGridOptions({ groupDisplayType: value as GroupDisplayType }))),
        h("span", { text: "(updates live)", style: { fontSize: "11px", color: "#9ca3af" } }),
      ),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
        h("span", { text: "Group by", style: { fontSize: "13px" } }),
        ...groupChecks,
      ),
      field("Sum Units & Revenue", checkbox(aggregate, value => {
        aggregate = value;
        applyAggregates();
      })),
      field("Group rows selectable", checkbox(true, value => api.updateGridOptions({ groupRowsSelectable: value }))),
      field("Group sort mode", select(
        [
          { value: "local", label: "Local" },
          { value: "hierarchy", label: "Hierarchy" },
          { value: "global", label: "Global" },
        ],
        "local",
        value => api.updateGridOptions({ groupSortMode: value as GroupSortMode }),
      )),
      btn("Clear grouping", () => {
        groupBy = [];
        groupChecks.forEach(label => {
          const input = label.querySelector("input");
          if (input) input.checked = false;
        });
        applyGrouping();
      }),
    ),
    toolbarRow(field("Columns trigger", select(
      [
        { value: "rail", label: "Rail" },
        { value: "header", label: "Header" },
        { value: "menu", label: "Column menu" },
        { value: "footer", label: "Footer" },
        { value: "toolbar", label: "Toolbar" },
      ],
      "rail",
      value => api.updateGridOptions({ columnPanel: { trigger: value as ColumnPanelTrigger } }),
    ))),
    // minWidth:0 keeps the grid from widening the page when the pinned auto-group column appears.
    host,
  ));

  const api = createGrid(host, {
    rowData: buildRows(2000),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    groupDisplayType: "singleColumn",
    groupDefaultExpanded: 1,
    groupSortMode: "local",
    groupRowsSelectable: true,
    columnPanel: { trigger: "rail" },
  });

  applyAggregates();
  applyGrouping();

  function applyGrouping(): void {
    api.dispatch({ type: "rowGroupSet", colIds: groupBy });
  }

  function applyAggregates(): void {
    const aggregateModels = aggregate
      ? [
        { key: colInstance(api, "units"), type: AggregateType.SUM },
        { key: colInstance(api, "revenue"), type: AggregateType.SUM },
      ].filter(model => model.key)
      : [];
    api.dispatch({ type: "aggregateModelSet", aggregateModels });
  }

  return () => api.destroy();
}
