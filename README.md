# Agility Workbench Grid

A fast, extensible TypeScript data grid for building spreadsheet-like data
experiences on the web. Use the framework-agnostic core directly, or choose the
first-party React or Angular binding.

Agility Workbench Grid combines a virtualized DOM renderer with client- and
server-side row models. It includes the features expected of a serious data
workspace—sorting, filtering, grouping, editing, selection, saved views, and
export—without adding runtime dependencies to the core package.

> Stable release: the public API follows [semantic versioning](https://semver.org/).
> Breaking changes only land in major releases.

## Highlights

- Virtualized rows and pinned left, center, and right column sections
- Client-side and lazy server-side row models
- Sorting, quick filtering, column filters, pagination, and aggregation
- Multi-level row grouping, tree data, sticky groups, and pinned rows
- Cell and row selection, clipboard operations, keyboard navigation, and editing
- CSV and Excel export, including grouped data, selection, and cell spans
- Column groups, resizing, reordering, visibility, pinning, and a column panel
- Custom renderers, editors, headers, tooltips, menus, and full-width rows
- Responsive toolbar, saved views, sparklines, and light/dark theming
- React 18+ and Angular 20.3–22 bindings with TypeScript types throughout

## Choose a package

| Package | Use it when… | Documentation |
| --- | --- | --- |
| `@agility-workbench/react-grid` | You are building a React 18+ application | [React guide](packages/react-grid/README.md) |
| `@agility-workbench/angular-grid` | You are building an Angular 20.3–22 application | [Angular guide](packages/angular-grid/README.md) |
| `@agility-workbench/grid` | You need the framework-neutral TypeScript API and DOM renderer | [Core guide](packages/grid/README.md) |

The framework bindings depend on the core package and re-export its public API,
so application code normally imports everything from a single binding package.

## Quick start

### React

Install the React binding and its peer dependencies:

```bash
npm install @agility-workbench/react-grid react react-dom
```

Then give the grid a container with an explicit height:

```tsx
import {
  ColumnType,
  Grid,
  themeLight,
  type ReactColDef,
} from "@agility-workbench/react-grid";

const columnDefs: ReactColDef[] = [
  { key: "name", label: "Product", type: ColumnType.STRING },
  { key: "price", label: "Price", type: ColumnType.CURRENCY, editable: true },
  { key: "stock", label: "In stock", type: ColumnType.NUMBER },
];

const rowData = [
  { id: "p-1", name: "Notebook", price: 12.5, stock: 84 },
  { id: "p-2", name: "Mechanical pencil", price: 4.25, stock: 130 },
];

export function ProductGrid() {
  return (
    <div style={{ height: 420 }}>
      <Grid
        rowData={rowData}
        columnDefs={columnDefs}
        rowIdKey="id"
        rowNumbers
        toolbar={{ quickFilter: true, sorting: true, export: true }}
        columnPanel={{ trigger: "toolbar" }}
        theme={themeLight}
      />
    </div>
  );
}
```

Styles are injected once when the first grid attaches. For a strict Content
Security Policy, or if you prefer global CSS, import
`@agility-workbench/grid/styles.css` and set `suppressStyleInjection` on the
grid. See the [React styling notes](packages/react-grid/README.md#styling) for
details.

### Angular

Install the Angular binding:

```bash
npm install @agility-workbench/angular-grid
```

`AwbGrid` is standalone and can be imported directly into a component:

```ts
import { Component } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type NgColDef,
} from "@agility-workbench/angular-grid";

@Component({
  selector: "app-products",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="height: 420px">
      <awb-grid
        [rowData]="rowData"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [rowNumbers]="true"
      />
    </div>
  `,
})
export class ProductsComponent {
  readonly columnDefs: NgColDef[] = [
    { key: "name", label: "Product", type: ColumnType.STRING },
    { key: "price", label: "Price", type: ColumnType.CURRENCY, editable: true },
  ];

  readonly rowData = [
    { id: "p-1", name: "Notebook", price: 12.5 },
    { id: "p-2", name: "Mechanical pencil", price: 4.25 },
  ];
}
```

See the [Angular guide](packages/angular-grid/README.md) for API access, styling,
and using Angular components as renderers and editors.

### Framework-neutral TypeScript

Install the core when you want to own the integration lifecycle:

```bash
npm install @agility-workbench/grid
```

```ts
import { ColumnType, createGrid } from "@agility-workbench/grid";

const api = createGrid(document.querySelector("#grid")!, {
  rowIdKey: "id",
  columnDefs: [
    { key: "name", label: "Product", type: ColumnType.STRING },
    { key: "price", label: "Price", type: ColumnType.CURRENCY },
  ],
  rowData: [{ id: "p-1", name: "Notebook", price: 12.5 }],
});
```

The [core package guide](packages/grid/README.md) covers theming, toolbars,
saved views, column management, sparklines, pinned rows, tree data, and the
published entry points.

## Focused examples

The documentation site's [feature examples](https://agilityworkbench.dev/docs/examples)
provide small, feature-specific snippets for the core, React, and Angular
libraries — each topic pairs a live interactive grid with per-framework code
tabs, and each example isolates one option, API workflow, or framework adapter
instead of recreating a full playground screen. The pages live in
[`apps/docs/docs/examples`](apps/docs/docs/examples).

The deployable documentation site lives in [`apps/docs`](apps/docs). Its first
curated release pairs 12 interactive React examples with switchable React,
Angular, and framework-neutral code, plus getting-started guides, limitations,
and a manually maintained API reference.

## Developing locally

### Prerequisites

- Node.js 18 or newer (the repository is developed on Node.js 22)
- npm with workspace support

Install dependencies from the repository root:

```bash
npm install
```

Start any playground to explore features and develop against package source:

```bash
npm run dev          # React playground at http://localhost:5176
npm run dev:angular  # Angular playground at http://localhost:5180
npm run dev:vanilla  # Framework-free playground at http://localhost:5182
npm run docs:dev     # Documentation site at http://localhost:3000
```

The vanilla playground mirrors the React playground's pages using only
`@agility-workbench/grid` — `createGrid` plus plain DOM — so every feature can be
exercised without a framework binding in the loop.

Useful root commands:

| Command | Purpose |
| --- | --- |
| `npm run build` | Build core, React, and Angular packages in dependency order |
| `npm run docs:build` | Build the static documentation site for deployment |
| `npm test` | Run the core, React, and Angular test suites once |
| `npm run test:watch` | Run the core and React Vitest suite in watch mode |
| `npm run typecheck` | Build core declarations and type-check all packages and playgrounds |
| `npm run pack:packages` | Build and create local npm tarballs in `artifacts/npm/` |
| `npm run clean` | Remove generated package and demo output |

Before opening a change, the most useful full check is:

```bash
npm run typecheck
npm test
npm run build
```

Tests live beside the code they exercise. The Angular package has a separate
Vitest configuration because its components are compiled by the Analog Angular
plugin; the root `npm test` command runs both configurations for you.

## Repository layout

```text
.
├── apps/
│   ├── docs/                   Deployable documentation and examples site
│   ├── react-playground/       React feature gallery
│   ├── angular-playground/     Angular feature gallery
│   └── vanilla-playground/     Framework-free feature gallery (core only)
├── packages/
│   ├── grid/                   Framework-neutral engine and DOM renderer
│   ├── react-grid/             React component and adapters
│   └── angular-grid/           Standalone Angular component and adapters
├── docs/
│   ├── architecture/           Architecture, feature status, and plans
│   └── maintainers/            Build, package, and publishing notes
└── package.json                npm workspace scripts and shared tooling
```

The dependency direction stays deliberately simple:

```text
React binding  ─┐
                ├──> framework-neutral grid core
Angular binding ┘
```

The core has no runtime dependencies. Framework bindings keep their framework as
a peer dependency and translate framework components and lifecycle events into
the core's public contracts.

For a detailed module map and feature inventory, read the
[architecture reference](docs/architecture/current-state.md). Maintainers can
find package boundaries, build ordering, and release notes in the
[repository guide](docs/maintainers/repository.md).

## Project status and limitations

The feature set is broad, but the project is still evolving. Notable current
gaps include variable/automatic row heights, master-detail rows, and pivoting.
The data surface exposes an ARIA grid model with a roving-focus
(`aria-activedescendant`) model, state semantics, and live announcements, and
all interactions are keyboard-reachable; column-group (parent) header cells are
not yet exposed to assistive technology, and an end-to-end screen-reader
validation pass is still pending — see the documentation site's Accessibility
page for the full picture.

Server-side and client-side row models also differ intentionally in a few areas.
For example, client-side transactions, quick filtering, full-width rows, custom
filter functions, and tree data are currently client-side features. Consult the
[current limitations](docs/architecture/current-state.md#10-current-limitations--gaps)
before committing to an advanced integration.

## License

The packages are available under the MIT License. See the license file in each
package: [core](packages/grid/LICENSE), [React](packages/react-grid/LICENSE), and
[Angular](packages/angular-grid/LICENSE).
