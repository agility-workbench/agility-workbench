import { useMemo } from "react";

import {
  ColumnType,
  FilterType,
  Grid,
  type FilterParams,
  type FilterValueAsyncSource,
  type FilterValueAsyncSourceParams,
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

const rows: AccountRow[] = [
  { id: "A-101", account: "Northwind", region: { code: "AMER", name: "Americas" }, owner: "Ava", opened: "2024-01-15", product: "Hardware/Laptops/Pro 14" },
  { id: "A-102", account: "Café Contoso", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Liam", opened: "2024-01-28", product: "Software/Suites/Office" },
  { id: "A-103", account: "Globex", region: { code: "APAC", name: "Asia Pacific" }, owner: "Mia", opened: "2024-03-09", product: "Hardware/Laptops/Air 13" },
  { id: "A-104", account: "Initech", region: null, owner: "Noah", opened: "2023-11-02", product: "Hardware/Phones/Model X" },
  { id: "A-105", account: "Umbrella", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Emma", opened: "2023-12-20", product: "Software/Suites/Design" },
  { id: "A-106", account: "Stark Industries", region: { code: "AMER", name: "Americas" }, owner: "Ethan", opened: "2024-03-21", product: "Services/Support/Premium" },
  { id: "A-107", account: "Wayne Enterprises", region: { code: "APAC", name: "Asia Pacific" }, owner: "Sofia", opened: "2024-06-05", product: "Software/Tools/CLI" },
  { id: "A-108", account: "Wonka", region: null, owner: "Lucas", opened: "2023-11-19", product: "Services/Training/Onsite" },
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
        caseSensitive: false,
        trimValues: true,
        textFormatter: formatAccountFilterText,
        filterFunction: matchAccount,
      },
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
        </p>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Grid
          rowData={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default SetFilterComponentsDemo;
