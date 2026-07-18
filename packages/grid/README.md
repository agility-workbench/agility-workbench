# @agility-workbench/grid

A high-performance, framework-agnostic TypeScript data grid for building modern data
workspaces.

- **Framework-agnostic core** — the grid engine (`GridCore` + `GridRenderer`) is plain
  TypeScript with no framework dependency.
- **React binding** — using React? Install [`@agility-workbench/react-grid`](https://www.npmjs.com/package/@agility-workbench/react-grid),
  a thin `<Grid />` adapter built on this core.
- **Virtualized** rendering, client-side and server-side row models, row grouping,
  aggregation, quick filter, editing, and CSV / Excel export (zero-dependency `.xlsx` writer).
- **Themeable** via an AG-Grid-style theme object that resolves to CSS variables applied
  per grid instance.

## Installation

```bash
npm install @agility-workbench/grid
```

For React apps, install the binding instead (it depends on this package):

```bash
npm install @agility-workbench/react-grid react react-dom
```

## Quick start (core, no framework)

```ts
import { GridCore, GridRenderer, initDomRenderer, CanvasMeasurer } from "@agility-workbench/grid";
import "@agility-workbench/grid/styles.css";

const core = new GridCore(new CanvasMeasurer(), {
  rowIdKey: "id",
  columnDefs: [{ field: "name" }, { field: "price" }],
});
const { renderer } = initDomRenderer(core);
renderer.attach({ current: document.getElementById("app")! });
core.dispatch({ type: "init" });
core.dispatch({ type: "rowDataSet", rows: [{ id: 1, name: "Widget", price: 9.99 }] });
```

## Styling

The grid needs its stylesheet loaded once. Two options:

**1. Import the stylesheet** (recommended — cacheable, no runtime cost):

```ts
import "@agility-workbench/grid/styles.css";
```

**2. Inject it from JS** (zero-import, e.g. for environments where importing CSS is awkward):

```ts
import { injectGridStyles } from "@agility-workbench/grid";
injectGridStyles(); // no-op during SSR; deduped across calls
```

## Theming

Themes are immutable objects that resolve to CSS custom properties applied inline on each
grid instance — so two grids on the same page can look completely different, and there is no
global CSS to override.

Start from a preset and refine with `withParams`:

```ts
import { themeLight, themeDark } from "@agility-workbench/grid";

const myTheme = themeLight.withParams({
  accentColor: "#2563eb",       // fans out to selection, checkbox, spinner, filter-active…
  backgroundColor: "#ffffff",
  rowHeight: 44,
  spacing: 10,
  fontFamily: "Inter, sans-serif",
});
```

### Semantic params + escape hatch

High-level params (`accentColor`, `borderColor`, `spacing`, `rowHeight`, …) each fan out to
several low-level variables. For anything not covered, set any grid CSS variable directly via
`vars` — these are typed and autocompleted:

```ts
themeDark.withParams({
  accentColor: "#22d3ee",
  vars: {
    "--pte-scrollbar-thumb-color": "#475569",
    "--pte-selected-bg-color": "#0e7490",
  },
});
```

### Icons

Override any icon with a URL, data URI, or inline SVG string, via `options.icons` or the
theme's `icons`:

```ts
new GridCore(new CanvasMeasurer(), {
  columnDefs,
  icons: { filter: "<svg viewBox='0 0 24 24'>…</svg>" },
});
```

## Entry points

| Import | Contents |
| --- | --- |
| `@agility-workbench/grid` | Framework-agnostic core, types, theming API |
| `@agility-workbench/grid/styles.css` | The base stylesheet (icons inlined) |

## License

[MIT](./LICENSE)
