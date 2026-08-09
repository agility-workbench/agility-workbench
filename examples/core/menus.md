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
