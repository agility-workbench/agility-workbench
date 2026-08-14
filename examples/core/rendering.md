# Rendering

## Virtual scrolling and overscan

```ts
const options = {
  rowHeight: 40,
  overscanRowCount: 8,
} satisfies GridOptions;
```

For a semantic state shared by every cell, supply one row presentation instead
of repeating cell callbacks across columns:

```ts
const pendingIds = new Set(["order-42"]);

const options = {
  getRowPresentation: ({ rowId }) => pendingIds.has(rowId) ? {
    rowClass: "row-pending",
    cellClass: "cell-pending",
    cellStyle: { opacity: "0.7" },
    editable: false,
    tooltip: {
      content: "Saving changes",
      options: { mode: "follow" },
    },
    accessibility: {
      description: "Changes to this row are being saved",
      busy: true,
    },
    metadata: { status: "pending" },
  } : undefined,
} satisfies GridOptions;

// Required only when the captured Set changes without a row transaction.
api.refreshRowPresentation();
```

Explicit column tooltip content/options override the row defaults. Cell classes
compose; cell inline styles merge with the column winning conflicting fields.
`editable: false` prevents user editing in columns that inherit the row gate;
it does not enable columns when true. A deliberate exception can set
`inheritRowPresentation: { editable: false }`.

Virtualization is automatic: the renderer maintains a small reusable row pool
and slides it over the current viewport. Left, center, and right column sections
stay synchronized without additional configuration.

## Function cell renderer

```ts
const column = {
  key: "status",
  label: "Status",
  cellRenderer: ({ value }) => {
    const badge = document.createElement("span");
    badge.className = `status status-${String(value).toLowerCase()}`;
    badge.textContent = String(value);
    return badge;
  },
} satisfies ColDef;
```

Class renderers implement `init`, `getGui`, and optional `refresh`/`destroy`.

## Change flash

```ts
const column = {
  key: "price",
  label: "Price",
  type: ColumnType.CURRENCY,
  cellRenderer: ChangeFlashCellRenderer,
  cellRendererParams: { cellFlashDuration: 400, cellFadeDuration: 900 },
} satisfies ColDef;
```

Grid-wide defaults are available as `cellFlashDuration` and
`cellFadeDuration`.

## Sparkline

```ts
const column = {
  colId: "trend",
  label: "Trend",
  valueGetter: (row) => row.monthlyRevenue,
  cellRenderer: SparklineRenderer,
  cellRendererParams: {
    type: "area",
    showPoints: true,
    tooltipValueFormatter: ({ xValue, yValue }) => `${xValue}: $${yValue}`,
  },
} satisfies ColDef;
```

Sparkline data may be `number[]` or `[xValue, number][]`; supported visuals are
line, area, and bar.

## Full-width rows

```ts
const options = {
  isFullWidthRow: (node) => node.data?.kind === "notice",
  fullWidthCellRenderer: ({ data }) => {
    const element = document.createElement("strong");
    element.textContent = data.message;
    return element;
  },
} satisfies GridOptions;
```

Full-width rows are client-side and retain the standard row height.

## Conditional rows and visual states

```ts
const options = {
  rowHover: true,
  columnHover: true,
  zebraRows: true,
  getRowClass: ({ data }) => data.overdue ? "row-overdue" : undefined,
  getRowStyle: ({ data }) => ({ opacity: data.archived ? "0.6" : "1" }),
} satisfies GridOptions;
```

## Loading and empty overlays

```tsx
<Grid
  loading={isLoading}
  loadingMessage="Loading orders…"
  noRowsMessage="No orders match this view"
/>
```

For the framework-neutral API:

```ts
api.dispatch({ type: "overlayShow", overlayType: "loading" });
api.dispatch({ type: "overlayShow", overlayType: "none" });
```

The no-rows overlay appears automatically for an empty model and distinguishes
an empty data set from a filtered-out result.
