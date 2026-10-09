import { Component, input } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  FilterType,
  type FilterParams,
  type FilterValueAsyncSource,
  type FilterValueAsyncSourceParams,
  type NgColDef,
  type SetFilterSpecialValueComponentParams,
  type SetFilterValueComponentParams,
} from "@agility-workbench/angular-grid";

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

@Component({
  selector: "region-filter-value",
  standalone: true,
  template: `
    <span class="value">
      <span class="value-name">
        <span class="dot" [style.background]="color()"></span>
        <span>{{ params().valueFormatted }}</span>
        @if (params().showCode) { <small>({{ code() }})</small> }
      </span>
      <span class="value-meta">
        @if (params().count !== undefined) { <small>{{ params().count }}</small> }
      </span>
    </span>
  `,
  styles: [`
    :host { display: block; width: 100% }
    .value { display: flex; align-items: center; justify-content: space-between; width: 100% }
    .value-name { display: inline-flex; align-items: center; gap: 8px }
    .value-meta { display: inline-flex; align-items: center; gap: 8px }
    .dot { width: 9px; height: 9px; border-radius: 50% }
    small { opacity: 0.55 }
  `],
})
class RegionFilterValueComponent {
  readonly params = input.required<SetFilterValueComponentParams>();
  color(): string { return REGION_COLORS[(this.params().value as Region).code] ?? "#64748b"; }
  code(): string { return (this.params().value as Region).code; }
}

@Component({
  selector: "select-all-filter-value",
  standalone: true,
  template: `<strong>{{ params().label }} regions</strong>`,
})
class SelectAllFilterValueComponent {
  readonly params = input.required<SetFilterSpecialValueComponentParams>();
}

@Component({
  selector: "blanks-filter-value",
  standalone: true,
  template: `
    <span class="blank-value">
      <em>Unassigned region</em>
      @if (params().count !== undefined) { <small>{{ params().count }}</small> }
    </span>
  `,
  styles: [`
    :host { display: block; width: 100% }
    .blank-value { display: flex; justify-content: space-between; width: 100%; opacity: 0.7 }
  `],
})
class BlanksFilterValueComponent {
  readonly params = input.required<SetFilterSpecialValueComponentParams>();
}

@Component({
  selector: "set-filter-components-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="intro">
      <h2>Set-filter value components</h2>
      <p>
        Enter <code> cafe </code> in the Account filter and click Apply: the filter commits and its
        popover closes. This also demonstrates trimming, case folding, accent normalization, and a
        custom filter function. Region uses object keys, formatted labels, and custom Angular value
        components; Owner loads its counted set values asynchronously. Opened and Product use the
        tree layout: a date column groups by year and month on its own, and Product groups along
        the path its <code>treePathGetter</code> returns.
      </p>
    </div>
    <div class="grid-host">
      <awb-grid [rowData]="rows" [columnDefs]="columnDefs" rowIdKey="id" />
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 12px }
    .intro {
      padding: 12px 14px; border: 1px solid var(--pte-frame-border-color, #d1d5db);
      border-radius: 8px; background: var(--pte-header-bg-color, #fff)
    }
    h2 { font-size: 18px; margin-bottom: 4px }
    p { font-size: 13px; line-height: 1.45; opacity: 0.75 }
    .grid-host { flex: 1; min-height: 0 }
    awb-grid { display: block; width: 100%; height: 100% }
  `],
})
export class SetFilterComponentsDemoComponent {
  readonly rows: AccountRow[] = [
    { id: "A-101", account: "Northwind", region: { code: "AMER", name: "Americas" }, owner: "Ava", opened: "2024-01-15", product: "Hardware/Laptops/Pro 14" },
    { id: "A-102", account: "Café Contoso", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Liam", opened: "2024-01-28", product: "Software/Suites/Office" },
    { id: "A-103", account: "Globex", region: { code: "APAC", name: "Asia Pacific" }, owner: "Mia", opened: "2024-03-09", product: "Hardware/Laptops/Air 13" },
    { id: "A-104", account: "Initech", region: null, owner: "Noah", opened: "2023-11-02", product: "Hardware/Phones/Model X" },
    { id: "A-105", account: "Umbrella", region: { code: "EMEA", name: "Europe, Middle East & Africa" }, owner: "Emma", opened: "2023-12-20", product: "Software/Suites/Design" },
    { id: "A-106", account: "Stark Industries", region: { code: "AMER", name: "Americas" }, owner: "Ethan", opened: "2024-03-21", product: "Services/Support/Premium" },
    { id: "A-107", account: "Wayne Enterprises", region: { code: "APAC", name: "Asia Pacific" }, owner: "Sofia", opened: "2024-06-05", product: "Software/Tools/CLI" },
    { id: "A-108", account: "Wonka", region: null, owner: "Lucas", opened: "2023-11-19", product: "Services/Training/Onsite" },
  ];

  readonly columnDefs: NgColDef[] = [
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
        valueComponent: RegionFilterValueComponent,
        valueComponentParams: { showCode: true },
        selectAllComponent: SelectAllFilterValueComponent,
        blanksComponent: BlanksFilterValueComponent,
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
      filterParams: { treePathGetter: (value: string) => value.split("/") },
    },
  ];
}
