# Filtering

## Text, number, date, boolean, and set filters

```ts
const columnDefs: ColDef[] = [
  { key: "name", label: "Name", filter: "text" },
  { key: "amount", label: "Amount", type: ColumnType.NUMBER, filter: "number" },
  { key: "due", label: "Due", type: ColumnType.DATE, filter: "date" },
  { key: "active", label: "Active", type: ColumnType.BOOLEAN, filter: "boolean" },
  { key: "region", label: "Region", filter: "set" },
];
```

`filter: true` selects the default UI from the column type. Active filters show
an indicator in the header and are managed from the column's filter panel.

## Static and async set-filter values

```ts
const staticSet = {
  key: "status",
  label: "Status",
  filter: "set",
  filterParams: {
    filterValues: [
      { value: "Open" },
      { value: "Pending" },
      { value: "Closed" },
    ],
  },
} satisfies ColDef;

const asyncSet = {
  key: "owner",
  label: "Owner",
  filter: "set",
  filterParams: {
    filterValues: async ({ success }) => {
      success(await (await fetch("/api/owners")).json());
    },
  },
} satisfies ColDef;
```

Omit `filterValues` to derive unique set values from client-side rows.

## Custom set-filter value labels

The grid always renders and controls the checkbox. Components replace only the
adjacent text span, with dedicated slots for Select All and Blanks:

```ts
const regionSet = {
  key: "region",
  label: "Region",
  filter: "set",
  filterParams: {
    valueComponent: ({ valueFormatted }) => {
      const label = document.createElement("strong");
      label.textContent = valueFormatted;
      return label;
    },
    selectAllComponent: ({ label }) => `All regions — ${label}`,
    blanksComponent: () => "Unassigned region",
  },
} satisfies ColDef;
```

When a component option is absent, the built-in text is used. A configured
component that returns `null` or `undefined` intentionally renders an empty
label slot. Mini-filter matching and checkbox accessible names still use the
underlying formatted label.

## Filter controls and multiple conditions

```ts
const column = {
  key: "name",
  label: "Name",
  filter: "text",
  filterParams: {
    buttons: ["apply", "clear", "cancel"],
    closeOnApply: true,
    debounceMs: 200,
    maxNumConditions: 2,
    initialFilterItemsCount: 1,
    caseSensitive: false,
    trimValues: true,
  },
} satisfies ColDef;
```

When more than one condition is enabled, the filter UI lets the user join them
with AND or OR. Inputs include their own clear button.

`caseSensitive` defaults to `false`. `trimValues` defaults to `false` and trims
only filter operands, not cell values. `closeOnApply` closes the filter popover
after the explicit Apply button commits; it has no effect when no Apply button
is configured.

## Restrict available operators

```ts
const column = {
  key: "amount",
  label: "Amount",
  filter: "number",
  filterParams: {
    filterOptions: [
      { value: FilterType.GTE, label: "At least" },
      { value: FilterType.LTE, label: "At most" },
      { value: FilterType.IN_RANGE, label: "Between" },
    ],
  },
} satisfies ColDef;
```

The built-in operators also include contains, starts/ends with, equality,
inequality, blank checks, inclusion, and negated forms.

## Custom matcher

```ts
const column = {
  key: "tags",
  label: "Tags",
  filter: (value, _node, filterValues) => {
    const query = String(filterValues[0] ?? "").toLowerCase();
    return value.some((tag: string) => tag.toLowerCase().includes(query));
  },
} satisfies ColDef;
```

For reusable normalization and matching, use `filterParams.textFormatter` and
`filterParams.filterFunction`:

```ts
const column = {
  key: "code",
  label: "Code",
  filter: "text",
  filterParams: {
    caseSensitive: false,
    trimValues: true,
    textFormatter: value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    filterFunction: (type, values, cell, caseSensitive, trimValues) => {
      const query = trimValues ? values[0].trim() : values[0];
      const [haystack, needle] = caseSensitive
        ? [cell, query]
        : [cell.toLowerCase(), query.toLowerCase()];
      return type === FilterType.STARTS_WITH && haystack.startsWith(needle);
    },
  },
} satisfies ColDef;
```

The formatter processes both cell and filter values before comparison. A
`filterFunction` takes precedence over a function assigned to `filter`, while
`filter: false` disables filtering completely. These callbacks execute only in
the client-side row model; server-side filtering must implement the equivalent
normalization on the server.

## Quick filter

```ts
const options = {
  quickFilter: {
    mode: "always",
    matchMode: "multiTerm",
    caseSensitive: false,
    debounceMs: 100,
    showOptions: true,
  },
} satisfies GridOptions;

api.setQuickFilter("open europe");
api.setQuickFilter("exact phrase", { matchMode: "substring" });
```

Quick filtering is client-side. Set `toolbar.quickFilter: true` to place its UI
in the toolbar.

## Set a filter model programmatically

```ts
const amount = api.getColumnModel().getByColId("amount")!;

api.dispatch({
  type: "filterModelSet",
  filterModel: [{
    col: amount,
    key: "amount",
    filters: [{ type: FilterType.GTE, values: [100] }],
  }],
});
```
