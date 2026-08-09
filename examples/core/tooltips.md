# Tooltips

## Field and computed body tooltips

```ts
const columnDefs: ColDef[] = [
  { key: "owner", label: "Owner", tooltipField: "ownerEmail" },
  {
    key: "revenue",
    label: "Revenue",
    tooltipValueGetter: ({ value, data }) => `${data.account}: $${value}`,
  },
];
```

When no explicit content is configured, clipped cell text gets an automatic
tooltip. Set `suppressAutoTooltip: true` on a column to opt it out.

## Header tooltip

```ts
const column = {
  key: "margin",
  label: "Margin",
  headerTooltip: "Revenue minus direct cost",
} satisfies ColDef;
```

## Custom body tooltip

```ts
const accountTooltip = ({ data }) => {
  const card = document.createElement("div");
  card.innerHTML = `<strong>${data.account}</strong><br>${data.owner}`;
  return card;
};

const column = {
  key: "account",
  label: "Account",
  tooltipComponent: accountTooltip,
} satisfies ColDef;
```

## Position and interaction

```ts
const options = {
  tooltip: {
    showDelay: 150,
    hideDelay: 75,
    mode: "anchored",
    placement: "auto",
    interactive: true,
    escapeRootClip: true,
  },
} satisfies GridOptions;
```

A column may override `mode`, `placement`, `interactive`, and
`escapeRootClip` through `tooltipOptions`. Interactive content is always
anchored; non-interactive content may use `mode: "follow"`.

## Tooltip API and events

```ts
api.showTooltip({ rowId: "order-1", colId: "owner" });
api.hideTooltip();

const unsubscribe = api.on("tooltipShow", (event) => console.log(event));
unsubscribe();
```

Set `tooltip: false` to disable body, header, and automatic tooltips globally.
