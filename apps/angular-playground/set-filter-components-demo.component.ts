import { Component, input } from "@angular/core";
import {
  AwbGrid,
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
  region: string | null;
  owner: string;
};

const REGION_COLORS: Record<string, string> = {
  Americas: "#2563eb",
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
  color(): string { return REGION_COLORS[String(this.params().value)] ?? "#64748b"; }
  code(): string { return String(this.params().value).slice(0, 2).toUpperCase(); }
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
        Enter <code> cafe </code> in the Account filter to see trimming, case folding, accent
        normalization, and a custom filter function work together. Region uses custom Angular value
        components; Owner loads its counted set values asynchronously.
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
    { id: "A-101", account: "Northwind", region: "Americas", owner: "Ava" },
    { id: "A-102", account: "Café Contoso", region: "EMEA", owner: "Liam" },
    { id: "A-103", account: "Globex", region: "APAC", owner: "Mia" },
    { id: "A-104", account: "Initech", region: null, owner: "Noah" },
    { id: "A-105", account: "Umbrella", region: "EMEA", owner: "Emma" },
    { id: "A-106", account: "Stark Industries", region: "Americas", owner: "Ethan" },
    { id: "A-107", account: "Wayne Enterprises", region: "APAC", owner: "Sofia" },
    { id: "A-108", account: "Wonka", region: null, owner: "Lucas" },
  ];

  readonly columnDefs: NgColDef[] = [
    {
      colId: "account",
      key: "account",
      label: "Account",
      width: 220,
      filter: "text",
      filterParams: {
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
      filterParams: {
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
  ];
}
