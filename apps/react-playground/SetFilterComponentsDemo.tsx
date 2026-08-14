import { useMemo } from "react";

import {
  FilterType,
  Grid,
  type FilterParams,
  type FilterValueAsyncSource,
  type FilterValueAsyncSourceParams,
  type ReactColDef,
  type SetFilterSpecialValueComponentParams,
  type SetFilterValueComponentParams,
} from "@react-grid";

type AccountRow = {
  id: string;
  account: string;
  region: Region | null;
  owner: string;
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
  { id: "A-101", account: "Northwind", region: { code: "AMER", name: "Americas" }, owner: "Ava" },
  { id: "A-102", account: "Café Contoso", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Liam" },
  { id: "A-103", account: "Globex", region: { code: "APAC", name: "Asia Pacific" }, owner: "Mia" },
  { id: "A-104", account: "Initech", region: null, owner: "Noah" },
  { id: "A-105", account: "Umbrella", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Emma" },
  { id: "A-106", account: "Stark Industries", region: { code: "AMER", name: "Americas" }, owner: "Ethan" },
  { id: "A-107", account: "Wayne Enterprises", region: { code: "APAC", name: "Asia Pacific" }, owner: "Sofia" },
  { id: "A-108", account: "Wonka", region: null, owner: "Lucas" },
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
          components; Owner loads its counted set values asynchronously.
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
