import {
  ColumnType,
  FilterType,
  createGrid,
  type ColDef,
  type FilterParams,
  type FilterValueAsyncSource,
  type FilterValueAsyncSourceParams,
  type IGridAPI,
  type SetFilterGroupComponentParams,
  type SetFilterSpecialValueComponentParams,
  type SetFilterValueComponentParams,
} from "@grid";

import { btn, code, demoRoot, gridHost, h, toolbarRow } from "../dom";

type Region = { code: string; name: string };

type AccountRow = {
  id: string;
  account: string;
  region: Region | null;
  owner: string;
  opened: string;
  product: string;
  stage: string;
  arr: number;
};

const REGION_COLORS: Record<string, string> = {
  AMER: "#2563eb",
  APAC: "#7c3aed",
  EMEA: "#059669",
};

const OWNERS = ["Ava", "Liam", "Mia", "Noah", "Emma", "Ethan", "Sofia", "Lucas"];

const formatAccountFilterText = (value: any): string => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

const matchAccount: NonNullable<FilterParams["filterFunction"]> = (
  type,
  filterValues,
  cellValue,
  caseSensitive = false,
  trimValues = false,
) => {
  let query = String(filterValues[0] ?? "");
  let account = String(cellValue ?? "");
  if (trimValues) query = query.trim();
  if (!caseSensitive) {
    query = query.toLowerCase();
    account = account.toLowerCase();
  }

  switch (type) {
    case FilterType.CONTAINS: return account.includes(query);
    case FilterType.NOT_CONTAINS: return !account.includes(query);
    case FilterType.EQ: return account === query;
    case FilterType.NEQ: return account !== query;
    case FilterType.STARTS_WITH: return account.startsWith(query);
    case FilterType.ENDS_WITH: return account.endsWith(query);
    default: return false;
  }
};

const loadOwnerValues: FilterValueAsyncSource = async (
  { signal, success }: FilterValueAsyncSourceParams,
) => {
  await new Promise(resolve => setTimeout(resolve, 250));
  if (!signal.aborted) success(OWNERS);
};

// Filter models the buttons apply through `api.setFilterModel`: several conditions on one column,
// joined with AND or OR. The same models can be built by hand in the Account or ARR filter popover.
const FILTER_PRESETS = {
  accountOr: [{
    colId: "account",
    join: "or",
    filters: [
      { type: FilterType.STARTS_WITH, values: ["W"] },
      { type: FilterType.CONTAINS, values: ["Indust"] },
    ],
  }],
  arrOr: [{
    colId: "arr",
    join: "or",
    filters: [
      { type: FilterType.LT, values: [20000] },
      { type: FilterType.GT, values: [80000] },
    ],
  }],
  arrAnd: [{
    colId: "arr",
    join: "and",
    filters: [
      { type: FilterType.IN_RANGE, values: [10000, 90000] },
      { type: FilterType.NOT_IN_RANGE, values: [40000, 60000] },
    ],
  }],
  none: [],
} satisfies Record<string, Parameters<IGridAPI["setFilterModel"]>[0]>;

type FilterPreset = keyof typeof FILTER_PRESETS;

const ROWS: AccountRow[] = [
  { id: "A-101", account: "Northwind", region: { code: "AMER", name: "Americas" }, owner: "Ava", opened: "2024-01-15", product: "Hardware/Laptops/Pro 14", stage: "Live", arr: 48000 },
  { id: "A-102", account: "Café Contoso", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Liam", opened: "2024-01-28", product: "Software/Suites/Office", stage: "Trial", arr: 12500 },
  { id: "A-103", account: "Globex", region: { code: "APAC", name: "Asia Pacific" }, owner: "Mia", opened: "2024-03-09", product: "Hardware/Laptops/Air 13", stage: "Live", arr: 96000 },
  { id: "A-104", account: "Initech", region: null, owner: "Noah", opened: "2023-11-02", product: "Hardware/Phones/Model X", stage: "Lead", arr: 7800 },
  { id: "A-105", account: "Umbrella", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Emma", opened: "2023-12-20", product: "Software/Suites/Design", stage: "Live", arr: 64000 },
  { id: "A-106", account: "Stark Industries", region: { code: "AMER", name: "Americas" }, owner: "Ethan", opened: "2024-03-21", product: "Services/Support/Premium", stage: "Trial", arr: 150000 },
  { id: "A-107", account: "Wayne Enterprises", region: { code: "APAC", name: "Asia Pacific" }, owner: "Sofia", opened: "2024-06-05", product: "Software/Tools/CLI", stage: "Lead", arr: 23000 },
  { id: "A-108", account: "Wonka", region: null, owner: "Lucas", opened: "2023-11-19", product: "Services/Training/Onsite", stage: "Live", arr: 31000 },
];

function regionFilterValue({
  value, valueFormatted, showCode, count,
}: SetFilterValueComponentParams): HTMLElement {
  // Blank-safe: rows with no region fold into the (Blanks) option, and the grid passes the blank
  // value through the same value hooks before it separates them out.
  const region = (value ?? { code: "", name: "" }) as Region;
  return h("span", {
    style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
  },
    h("span", { style: { display: "inline-flex", alignItems: "center", gap: "8px" } },
      h("span", {
        "aria-hidden": "true",
        style: {
          width: "9px", height: "9px", borderRadius: "50%",
          background: REGION_COLORS[region.code] ?? "#64748b",
        },
      }),
      h("span", { text: valueFormatted }),
      showCode ? h("small", { text: `(${region.code})`, style: { opacity: "0.55" } }) : null,
    ),
    h("span", { style: { display: "inline-flex", alignItems: "center", gap: "8px" } },
      count !== undefined ? h("small", { text: String(count), style: { opacity: "0.7" } }) : null,
    ),
  );
}

function selectAllFilterValue({ label }: SetFilterSpecialValueComponentParams): HTMLElement {
  return h("strong", { text: `${label} regions` });
}

function blanksFilterValue({ count }: SetFilterSpecialValueComponentParams): HTMLElement {
  return h("span", {
    style: { display: "flex", justifyContent: "space-between", width: "100%", opacity: "0.7" },
  },
    h("em", { text: "Unassigned region" }),
    count !== undefined ? h("small", { text: String(count) }) : null,
  );
}

// Tree-layout group rows: the grid keeps the chevron and checkbox; this owns the label text.
function productGroupLabel({ label, count, level, expanded }: SetFilterGroupComponentParams): HTMLElement {
  return h("span", {
    style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" },
  },
    h("span", { text: label, style: { fontWeight: level === 0 ? "700" : "600" } }),
    h("small", {
      text: count === undefined ? (expanded ? "open" : "closed") : `${count} ${count === 1 ? "item" : "items"}`,
      style: { opacity: "0.7" },
    }),
  );
}

const COLUMNS: ColDef[] = [
  {
    colId: "account",
    key: "account",
    label: "Account",
    width: 220,
    filter: "text",
    filterParams: {
      buttons: ["apply", "clear"],
      closeOnApply: true,
      // Up to three conditions, joined with the popover's AND / OR toggle.
      maxNumConditions: 3,
      caseSensitive: false,
      trimValues: true,
      textFormatter: formatAccountFilterText,
      filterFunction: matchAccount,
    },
  },
  {
    colId: "arr",
    key: "arr",
    label: "ARR",
    width: 120,
    type: ColumnType.CURRENCY,
    // A condition filter: up to three conditions (Between, Not between, …) joined with AND or OR.
    filter: "number",
    filterParams: { maxNumConditions: 3 },
  },
  {
    colId: "region",
    key: "region",
    label: "Region",
    width: 160,
    filter: "set",
    valueFormatter: ({ value }) => value?.code ?? "",
    filterParams: {
      // Unguarded on purpose, and safe: the grid folds blank regions into its own (Blanks) row and
      // never asks these callbacks about a value they were not written for. The *column* formatter
      // above still needs its guard — cells legitimately render blanks.
      keyCreator: value => value.code,
      valueFormatter: ({ value }) => value.name,
      showValueCounts: true,
      valueComponent: regionFilterValue,
      valueComponentParams: { showCode: true },
      selectAllComponent: selectAllFilterValue,
      blanksComponent: blanksFilterValue,
    },
  },
  {
    colId: "owner",
    key: "owner",
    label: "Owner",
    width: 150,
    filter: "set",
    filterParams: { showValueCounts: true, filterValues: loadOwnerValues },
  },
  {
    colId: "opened",
    key: "opened",
    label: "Opened",
    width: 130,
    type: ColumnType.DATE,
    // Tree layout: a date column groups its values by year › month on its own, days as leaves.
    filter: "tree",
    filterParams: { showValueCounts: true, treeDefaultExpanded: 1 },
  },
  {
    colId: "product",
    key: "product",
    label: "Product",
    width: 200,
    // Tree layout along an application path: Hardware › Laptops › Pro 14.
    filter: "tree",
    filterParams: {
      treePathGetter: (value: string) => value.split("/"),
      showValueCounts: true,
      groupComponent: productGroupLabel,
    },
  },
  {
    colId: "stage",
    key: "stage",
    label: "Stage",
    width: 110,
    // A static list of the values themselves, in the order to show them (Lead › Trial › Live).
    filter: "set",
    filterParams: { filterValues: ["Lead", "Trial", "Live"] },
  },
];

export function mountSetFilterComponentsDemo(container: HTMLElement): () => void {
  const host = gridHost();

  container.appendChild(demoRoot(
    h("div", {
      style: {
        padding: "12px 14px",
        border: "1px solid var(--pte-frame-border-color, #d1d5db)",
        borderRadius: "8px",
        background: "var(--pte-header-bg-color, #fff)",
      },
    },
      h("h2", { text: "Set-filter value components", style: { fontSize: "18px", marginBottom: "4px" } }),
      h("p", { style: { fontSize: "13px", lineHeight: "1.45", opacity: "0.75" } },
        "Enter ", code(" cafe "), " in the Account filter and click Apply: the filter commits and its"
        + " popover closes. This also demonstrates trimming, case folding, accent normalization, and a"
        + " custom filter function. Region uses object keys, formatted labels, and custom value"
        + " components; Owner loads its counted set values asynchronously. Opened and Product use the"
        + " tree layout: a date column groups by year and month on its own, and Product groups along"
        + " the path its treePathGetter returns, with a custom group label. "
        + "Stage lists its filter values as a static array, in the order to show them. "
        + "The Account and ARR filters take up to three conditions joined with AND or OR: open either"
        + " popover to add a condition and flip the join, or apply the same models through ",
        code("api.setFilterModel"), " with the buttons below."),
    ),
    toolbarRow(
      btn('Account starts with W OR contains "Indust"', () => applyPreset("accountOr")),
      btn("ARR below 20k OR above 80k", () => applyPreset("arrOr")),
      btn("ARR 10k–90k AND not 40k–60k", () => applyPreset("arrAnd")),
      btn("Clear filters", () => applyPreset("none")),
    ),
    host,
  ));

  const api: IGridAPI = createGrid(host, {
    rowData: ROWS,
    columnDefs: COLUMNS,
    rowIdKey: "id",
  });

  function applyPreset(preset: FilterPreset): void {
    api.setFilterModel(FILTER_PRESETS[preset]);
  }

  return () => api.destroy();
}
