# Columns

Each section below is an independent `columnDefs` or API fragment.

## Column types and formatting

```ts
import { ColumnType, type ColDef } from "@agility-workbench/grid";

const columnDefs: ColDef[] = [
  { key: "name", label: "Name", type: ColumnType.STRING },
  { key: "quantity", label: "Quantity", type: ColumnType.NUMBER },
  { key: "active", label: "Active", type: ColumnType.BOOLEAN },
  { key: "createdAt", label: "Created", type: ColumnType.DATE },
  { key: "revenue", label: "Revenue", type: ColumnType.CURRENCY },
];
```

## Value getter, formatter, and parser

```ts
const column = {
  colId: "total",
  label: "Total",
  valueGetter: (row) => row.quantity * row.unitPrice,
  valueFormatter: ({ value }) => `$${Number(value).toFixed(2)}`,
  editable: true,
  valueParser: ({ value }) => Number(value),
} satisfies ColDef;
```

## Shared defaults

```ts
const options = {
  defaultColDef: {
    sortable: true,
    resizable: true,
    movable: true,
    minWidth: 90,
  },
  columnDefs: [
    { key: "name", label: "Name" },
    { key: "status", label: "Status", sortable: false }, // overrides the default
  ],
} satisfies GridOptions;
```

## Nested column groups

```ts
const columnDefs: ColDef[] = [
  {
    label: "Customer",
    openByDefault: true,
    children: [
      { key: "firstName", label: "First name", columnGroupShow: "open" },
      { key: "lastName", label: "Last name" },
    ],
  },
  {
    label: "Order",
    children: [
      { key: "total", label: "Total", type: ColumnType.CURRENCY },
      { key: "status", label: "Status" },
    ],
  },
];
```

The group chevron expands/collapses children. Nested groups may be used at more
than one level.

## Pinning, visibility, and capabilities

```ts
const columnDefs: ColDef[] = [
  { key: "id", label: "ID", pinned: "left", movable: false },
  { key: "internal", label: "Internal", hidden: true },
  { key: "name", label: "Name", hideable: false },
  { key: "actions", label: "Actions", pinned: "right", resizable: false },
];
```

Users can resize and reorder enabled columns by dragging their headers. They can
pin and hide columns through the column menu or column panel.

## Explicit width and automatic sizing

```ts
const options = {
  minResizeWidth: 60,
  maxColumnWidth: 360,
  columnDefs: [
    { colId: "name", key: "name", label: "Name", minWidth: 120, maxWidth: 280 },
    { key: "notes", label: "Notes", width: 240 },
  ],
} satisfies GridOptions;

// Fit one column to its rendered content.
api.dispatch({ type: "columnAutosize", colId: "name" });
```

Set `autosizeColumnsOnDataChange: true` to recompute content widths after each
data refresh.

## Row numbers

```ts
const options = { rowNumbers: true } satisfies GridOptions;
```

## Cell spanning

```ts
const columnDefs: ColDef[] = [
  {
    key: "title",
    label: "Title",
    colSpan: ({ data }) => data.kind === "section" ? 3 : 1,
  },
  { key: "owner", label: "Owner" },
  { key: "status", label: "Status" },
];
```

A span stops at a pinned-section boundary.

## Conditional cell styling

```ts
const column = {
  key: "change",
  label: "Change",
  cellClass: ({ value }) => Number(value) < 0 ? "is-negative" : "is-positive",
  cellStyle: ({ value }) => ({ fontWeight: Number(value) > 10 ? "700" : "400" }),
} satisfies ColDef;
```

## Header content and whole-cell components

```ts
const labelOnly = ({ colDef }) => {
  const strong = document.createElement("strong");
  strong.textContent = colDef.label;
  return strong;
};

const columnDefs: ColDef[] = [
  { key: "name", label: "Name", headerComponent: labelOnly },
  { key: "status", label: "Status", headerCellComponent: labelOnly },
];
```

`headerComponent` replaces header content while preserving grid controls.
`headerCellComponent` replaces the whole header cell except its resize handle.

## Column state

```ts
const savedState = api.getColumnState();

// Later: restore widths, order, pinning, and visibility.
api.applyColumnState(savedState);

// Exact restore: hide columns absent from the saved state.
api.applyColumnState(savedState, { defaultState: { hidden: true } });
```

## Add or replace definitions at runtime

```ts
api.setColumnDefs([...baseColumns, { key: "margin", label: "Margin" }]);

api.dispatch({
  type: "addSparklineColumn",
  targetColId: "revenue",
  colIds: ["jan", "feb", "mar"],
  sparklineType: "line",
});
```
