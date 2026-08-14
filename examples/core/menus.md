# Menus

## Column-menu visibility

```ts
const columnDefs: ColDef[] = [
  { key: "name", label: "Name", showColumnMenu: false },
  { key: "city", label: "City", columnContextMenu: false },
  { key: "status", label: "Status", filter: true },
];

const options = {
  showColumnButtonsOnHover: true,
} satisfies GridOptions;
```

`showColumnMenu: false` hides the button but leaves right-click access.
`columnContextMenu: false` restores the native header context menu but leaves
the button. Filterable columns add their filter panel to the menu.

## Customize column-menu items in React

```tsx
<Grid
  getColumnMenuItems={({ ctx, items }) => [
    ...items,
    { isSeparator: true },
    {
      id: "inspect-column",
      label: `Inspect ${ctx.targetColId}`,
      onClick: () => inspectColumn(ctx.targetColId),
    },
  ]}
/>
```

## Body context menu

```ts
const options = {
  bodyContextMenu: ({ ctx, items }) => [
    ...items,
    { isSeparator: true },
    {
      id: "open-record",
      label: "Open record",
      onClick: () => openRecord(ctx.rowId),
    },
  ],
} satisfies GridOptions;
```

Use `bodyContextMenu: false` for the browser's native menu, or return `[]` to
suppress both the grid items and native menu.

## Row pinning menu

```ts
const options = {
  rowPinningMenu: true,
  bodyContextMenu: true,
} satisfies GridOptions;
```

The body menu adds Pin to top, Pin to bottom, and Unpin for the row or selection.
Copy, cut, paste, and export commands appear automatically when applicable.

## Row insertion menu

```ts
let nextId = 100;

const options = {
  rowNumbers: true,
  rowInsertionMenu: {
    createRow: ({ data, position }) => ({
      ...data,
      id: String(nextId++),
      name: `Inserted ${position}`,
    }),
    // Optional: hide either direction for a particular row.
    canInsert: ({ data, position }) => data.locked !== true || position === "below",
  },
} satisfies GridOptions;
```

This opt-in adds **Insert → 1 row above / 1 row below** only to row-number
context menus on client-side rows. The factory owns required fields and stable
IDs. Insertion uses underlying source order, so an active sort or filter may
display the new row somewhere else.
