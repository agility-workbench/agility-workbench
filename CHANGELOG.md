# Changelog

All three packages (`@agility-workbench/grid`, `@agility-workbench/react-grid`,
`@agility-workbench/angular-grid`) are versioned and released together.

## 1.0.0 — 2026-08-24

First stable release.

- **`@agility-workbench/grid`** — framework-agnostic TypeScript data grid: virtualized
  rendering with pinned column sections, client-side and lazy server-side row models,
  sorting, filtering (column, set, and quick filter), grouping with aggregation, tree
  data, cell/row/column/range selection, editing with undo/redo and async transactions,
  pinned and sticky rows, saved views, toolbars and column management, menus, tooltips,
  ActionFrames, themes (light/dark presets + builder), CSV/Excel export, and a
  keyboard-navigation and accessibility model. Zero runtime dependencies.
- **`@agility-workbench/react-grid`** — React binding (`<Grid />`): declarative props,
  callback events, refs to the imperative API, StrictMode-safe lifecycle, and React
  components in renderer/editor/tooltip/ActionFrame/menu slots. React 18 and 19.
- **`@agility-workbench/angular-grid`** — standalone Angular binding (`<awb-grid>`):
  signal inputs, outputs for common events, `exportAs` API access, zone-isolated core
  (zone-based and zoneless apps), and Angular components in the same extension slots.
  Angular 20.3 through 22, partial-Ivy APF artifact.

Every release artifact is validated by CI: declaration/runtime export parity (ESM +
CJS), exact packed-content allowlists, and standalone consumer builds that install the
packed tarballs on React 18/19 and Angular 20/21/22.
