import { useMemo, useRef } from "react";

import {
  ColumnType,
  FilterType,
  Grid,
  type FilterParams,
  type FilterValueAsyncSource,
  type FilterValueAsyncSourceParams,
  type IGridAPI,
  type ReactColDef,
  type SetFilterGroupComponentParams,
  type SetFilterSpecialValueComponentParams,
  type SetFilterValueComponentParams,
} from "@react-grid";

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

type Region = { code: string; name: string };

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

const rows: AccountRow[] = [
  { id: "A-101", account: "Northwind", region: { code: "AMER", name: "Americas" }, owner: "Ava", opened: "2024-01-15", product: "Hardware/Laptops/Pro 14", stage: "Live", arr: 48000 },
  { id: "A-102", account: "Café Contoso", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Liam", opened: "2024-01-28", product: "Software/Suites/Office", stage: "Trial", arr: 12500 },
  { id: "A-103", account: "Globex", region: { code: "APAC", name: "Asia Pacific" }, owner: "Mia", opened: "2024-03-09", product: "Hardware/Laptops/Air 13", stage: "Live", arr: 96000 },
  { id: "A-104", account: "Initech", region: null, owner: "Noah", opened: "2023-11-02", product: "Hardware/Phones/Model X", stage: "Lead", arr: 7800 },
  { id: "A-105", account: "Umbrella", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Emma", opened: "2023-12-20", product: "Software/Suites/Design", stage: "Live", arr: 64000 },
  { id: "A-106", account: "Stark Industries", region: { code: "AMER", name: "Americas" }, owner: "Ethan", opened: "2024-03-21", product: "Services/Support/Premium", stage: "Trial", arr: 150000 },
  { id: "A-107", account: "Wayne Enterprises", region: { code: "APAC", name: "Asia Pacific" }, owner: "Sofia", opened: "2024-06-05", product: "Software/Tools/CLI", stage: "Lead", arr: 23000 },
  { id: "A-108", account: "Wonka", region: null, owner: "Lucas", opened: "2023-11-19", product: "Services/Training/Onsite", stage: "Live", arr: 31000 },
];

function RegionFilterValue({ value, valueFormatted, showCode, count }: SetFilterValueComponentParams) {
  const region = value as Region;
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden="true"
          style={{ width: 9, height: 9, borderRadius: "50%", background: REGION_COLORS[region.code] ?? "#64748b" }}
        />
        <span>{valueFormatted}</span>
        {showCode && <small style={{ opacity: 0.55 }}>({region.code})</small>}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {count !== undefined && <small style={{ opacity: 0.7 }}>{count}</small>}
      </span>
    </span>
  );
}

function SelectAllFilterValue({ label }: SetFilterSpecialValueComponentParams) {
  return <strong>{label} regions</strong>;
}

function BlanksFilterValue({ count }: SetFilterSpecialValueComponentParams) {
  return (
    <span style={{ display: "flex", justifyContent: "space-between", width: "100%", opacity: 0.7 }}>
      <em>Unassigned region</em>
      {count !== undefined && <small>{count}</small>}
    </span>
  );
}

// Tree-layout group rows: the grid keeps the chevron and checkbox; this owns the label text.
function ProductGroupLabel({ label, count, level, expanded }: SetFilterGroupComponentParams) {
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <span style={{ fontWeight: level === 0 ? 700 : 600 }}>{label}</span>
      <small style={{ opacity: 0.7 }}>
        {count === undefined ? (expanded ? "open" : "closed") : `${count} ${count === 1 ? "item" : "items"}`}
      </small>
    </span>
  );
}

export function SetFilterComponentsDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const applyPreset = (preset: FilterPreset) => apiRef.current?.setFilterModel(FILTER_PRESETS[preset]);

  const columnDefs = useMemo<ReactColDef[]>(() => [
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
        keyCreator: value => value.code,
        valueFormatter: ({ value }) => value.name,
        showValueCounts: true,
        valueComponent: RegionFilterValue,
        valueComponentParams: { showCode: true },
        selectAllComponent: SelectAllFilterValue,
        blanksComponent: BlanksFilterValue,
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
        groupComponent: ProductGroupLabel,
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
  ], []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 12 }}>
      <div
        style={{
          padding: "12px 14px",
          border: "1px solid var(--pte-frame-border-color, #d1d5db)",
          borderRadius: 8,
          background: "var(--pte-header-bg-color, #fff)",
        }}
      >
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Set-filter value components</h2>
        <p style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.75 }}>
          Enter <code> cafe </code> in the Account filter and click Apply: the filter commits and its
          popover closes. This also demonstrates trimming, case folding, accent normalization, and a
          custom filter function. Region uses object keys, formatted labels, and custom React value
          components; Owner loads its counted set values asynchronously. Opened and Product use the
          tree layout: a date column groups by year and month on its own, and Product groups along
          the path its <code>treePathGetter</code> returns, with a custom group label.
          Stage lists its filter values as a static array, in the order to show them.
          The Account and ARR filters take up to three conditions joined with AND or OR: open either
          popover to add a condition and flip the join, or apply the same models through{" "}
          <code>api.setFilterModel</code> with the buttons below.
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => applyPreset("accountOr")}>Account starts with W OR contains "Indust"</button>
        <button type="button" onClick={() => applyPreset("arrOr")}>ARR below 20k OR above 80k</button>
        <button type="button" onClick={() => applyPreset("arrAnd")}>ARR 10k–90k AND not 40k–60k</button>
        <button type="button" onClick={() => applyPreset("none")}>Clear filters</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Grid
          rowData={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          onGridReady={api => { apiRef.current = api; }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default SetFilterComponentsDemo;
