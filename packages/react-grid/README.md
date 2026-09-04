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
import { StrictMode, useState } from "react";
import {
  ColumnType,
  Grid,
  themeDark,
  type GridEventEditingChangedParams,
  type IGridAPI,
  type ReactColDef,
} from "@agility-workbench/react-grid";

const columnDefs: ReactColDef[] = [
  { key: "name", label: "Name", type: ColumnType.STRING },
  { key: "price", label: "Price", type: ColumnType.NUMBER },
];

const rowData = [
  { id: "1", name: "Widget", price: 9.99 },
  { id: "2", name: "Gadget", price: 14.5 },
];

export function Example() {
  const [api, setApi] = useState<IGridAPI | null>(null);

  return (
    <StrictMode>
      <div style={{ height: 400 }}>
        <Grid
          rowData={rowData}
          columnDefs={columnDefs}
          rowIdKey="id"
          toolbar={{ grouping: true, sorting: true, quickFilter: true, export: true }}
          columnPanel={{ trigger: "toolbar" }}
          theme={themeDark.withParams({ accentColor: "#e11d48", rowHeight: 40 })}
          onGridReady={(readyApi) => {
            setApi(readyApi);
            readyApi.on("editingChanged", (event: GridEventEditingChangedParams) => {
              console.log(event.state);
            });
          }}
        />
      </div>
    </StrictMode>
  );
}
```

The React binding creates and attaches the renderer after the host element mounts, so
`React.StrictMode` effect replay is supported. In development, `onGridReady` may run once
for each live setup React creates; each callback receives a live API, and refs are cleared
when a setup is cleaned up.

`columnPanel.trigger` accepts `"rail"`, `"header"`, `"menu"`, `"footer"`, or `"toolbar"`. All
five entry points open the same right-hand column-management drawer.
`columnPanel.availability` chooses when the panel exists at all: `"always"` (default), or
`"pivot"` to mount it only while pivot mode is on.

`toolbar` independently enables the `views`, `grouping`, `sorting`, `quickFilter`, `export`, and
`pivot` sections.
Every section is off by default; enabling any one shows the toolbar. The quick-filter section reuses
the existing filter and its behavioral `quickFilter` configuration, but supersedes its floating
placement and close controls. Changing the object live adds/removes sections without remounting the
grid. The toolbar-hosted Columns trigger also counts as content, so
`columnPanel={{ trigger: "toolbar" }}` can display a Columns-only toolbar.

Both bars measure the grid container rather than the window, so embedding the grid in a resizable
panel needs no application-level resize handling. At a width their controls do not fit, nothing is
clipped, overlapped, or compressed: each control is laid out at its natural size in one of its
presentation stages, or it moves into that bar's overflow menu (`⋮`), and a bar out of stages
scrolls. `toolbar={{ responsive }}` and `paginationControls={{ responsive }}` choose the strategy
— `"collapse"` (default) walks the ladder, `"scroll"` keeps every control at full size and scrolls,
`false` lets the bar clip. See the core README for the ladder's order.

`toolbar.views` adds the saved-view picker. Supply `savedViews={{ views, activeViewId, onChange,
onActiveViewChange }}` to keep persistence controlled by React state, local storage, or a remote
service. The grid reports complete updated arrays and does not write to storage itself.

Pivot mode and sheets pass through the same way: `pivotMode` / `pivotColumns` are live props
(synced through the imperative API, so values assigned in `onGridReady` are not overwritten),
`pivotColumnMoveMode` is live, `pivotResultColumnDef` / `maxPivotColumns` /
`pivotNoValuesMessage` / `pivotEmptyMessage` are creation-time, and `sheets={{ sheets,
activeSheetId, onChange, onActiveSheetChange }}` renders the footer tab strip with the same
app-owned persistence contract as `savedViews`. See the core README for what pivot mode and
sheets do.

## Styling

Nothing to do — the grid delivers its own stylesheet when it attaches, once per
document, and once per shadow root for grids inside one.

Under a strict Content Security Policy without `style-src 'unsafe-inline'`, pass
a nonce via the `styleNonce` prop (page-global, so use the same value for every
grid). To load the stylesheet yourself instead, import it and opt out with
`suppressStyleInjection` on each grid, so the two copies do not fight in the
cascade:

```ts
import "@agility-workbench/grid/styles.css";
```

## Theming, icons, and the full API

The React entry re-exports everything from `@agility-workbench/grid` (themes, `ColDef`,
`injectGridStyles`, all types), so a single import covers your app:

```tsx
import {
  AggregateType,
  ColumnType,
  FilterType,
  Grid,
  themeLight,
  type ColDef,
  type GridEventEditingChangedParams,
} from "@agility-workbench/react-grid";
```

See the [`@agility-workbench/grid` README](https://www.npmjs.com/package/@agility-workbench/grid)
for the theming API, semantic params, and icon overrides.

## License

[MIT](./LICENSE)
