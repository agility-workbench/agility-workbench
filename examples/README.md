# Focused examples

This directory is a catalog of small, feature-specific examples for the Agility
Workbench libraries. Unlike the playgrounds, these snippets contain only the
options or API calls needed to demonstrate one behavior.

Most core examples show `GridOptions`, `ColDef`, or `IGridAPI` fragments. Those
options can be passed directly to `GridCore`, spread onto React's `<Grid />`, or
bound to Angular's `<awb-grid>`. The framework directories cover the small
amount of binding-specific setup.

## Feature index

| Feature area | Focused examples |
| --- | --- |
| Core mounting, lifecycle, options, and events | [Core setup](core/README.md) |
| Columns, groups, pinning, sizing, state, spanning | [Columns](core/columns.md) |
| Client-side data, transactions, server-side data, schema inference | [Row models](core/row-models.md) |
| Column filters, set filters, quick filter, custom matching | [Filtering](core/filtering.md) |
| Initial sort, multi-sort behavior, custom comparators | [Sorting](core/sorting.md) |
| Cell/range/row/column selection and navigation | [Selection and navigation](core/selection-and-navigation.md) |
| Built-in/custom editors, edit behavior, undo/redo, clipboard | [Editing and clipboard](core/editing-and-clipboard.md) |
| Grouping, tree data, aggregate rows, server aggregation | [Grouping, tree data, and aggregation](core/grouping-tree-and-aggregation.md) |
| CSV/Excel scopes, grouped export, pagination | [Export and pagination](core/export-and-pagination.md) |
| Virtualization, renderers, full-width rows, overlays, visual states | [Rendering](core/rendering.md) |
| Themes, CSS delivery, CSP, icons | [Theming and styles](core/theming-and-styles.md) |
| Body/header tooltips and tooltip API | [Tooltips](core/tooltips.md) |
| Persistent cell frames and programmatic control | [Action frames](core/action-frames.md) |
| Column/body menus and row-pinning menu | [Menus](core/menus.md) |
| Column panel triggers, toolbar sections, saved views | [Panel, toolbar, and views](core/panel-toolbar-and-views.md) |
| Application-pinned rows, runtime pinning, sticky groups | [Pinned and sticky rows](core/pinned-and-sticky-rows.md) |
| React mounting, renderers, editors, callbacks, refs | [React binding](react/README.md) |
| Angular mounting, renderers, editors, outputs, template API | [Angular binding](angular/README.md) |

## How to use the fragments

A core fragment such as:

```ts
import type { GridOptions } from "@agility-workbench/grid";

const options = {
  rowNumbers: true,
  pagination: true,
  pageSize: 25,
} satisfies GridOptions;
```

can be used in any of these forms:

```ts
// Framework-neutral
const core = new GridCore(new CanvasMeasurer(), options);
```

```tsx
// React
<Grid {...options} rowData={rows} columnDefs={columns} />
```

```html
<!-- Angular: bind the individual options shown in the fragment -->
<awb-grid [rowNumbers]="true" [pagination]="true" [pageSize]="25" />
```

Interactions implemented by the grid itself—drag resizing, keyboard shortcuts,
menu commands, virtual scrolling, and responsive layout—are called out beside
the smallest configuration that exposes them.

For exhaustive implementation status, see the
[feature inventory](../docs/architecture/current-state.md#5-feature-inventory).
For complete API explanations, see the
[core package guide](../packages/grid/README.md).
