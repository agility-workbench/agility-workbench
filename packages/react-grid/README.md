# @agility-workbench/react-grid

React bindings for [`@agility-workbench/grid`](https://www.npmjs.com/package/@agility-workbench/grid) —
a high-performance data grid. Provides a `<Grid />` component and re-exports the full
core API, so you can import everything you need from one place.

## Installation

```bash
npm install @agility-workbench/react-grid react react-dom
```

`@agility-workbench/grid` is installed automatically as a dependency. `react` and `react-dom`
are peer dependencies you provide.

## Quick start

```tsx
import { Grid, themeDark, type ReactColDef } from "@agility-workbench/react-grid";
import "@agility-workbench/grid/styles.css";

const columnDefs: ReactColDef[] = [
  { field: "name", headerName: "Name" },
  { field: "price", headerName: "Price" },
];

const data = [
  { name: "Widget", price: 9.99 },
  { name: "Gadget", price: 14.5 },
];

export function Example() {
  return (
    <div style={{ height: 400 }}>
      <Grid
        columnDefs={columnDefs}
        data={data}
        theme={themeDark.withParams({ accentColor: "#e11d48", rowHeight: 40 })}
      />
    </div>
  );
}
```

## Styling

Load the stylesheet once (it lives in the core package):

```ts
import "@agility-workbench/grid/styles.css";
```

Or inject it from JS (zero-import, SSR-safe):

```ts
import { injectGridStyles } from "@agility-workbench/react-grid";
injectGridStyles();
```

## Theming, icons, and the full API

The React entry re-exports everything from `@agility-workbench/grid` (themes, `ColDef`,
`injectGridStyles`, all types), so a single import covers your app:

```tsx
import { Grid, themeLight, type ColDef } from "@agility-workbench/react-grid";
```

See the [`@agility-workbench/grid` README](https://www.npmjs.com/package/@agility-workbench/grid)
for the theming API, semantic params, and icon overrides.

## License

[MIT](./LICENSE)
