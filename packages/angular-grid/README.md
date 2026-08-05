# @agility-workbench/angular-grid

Angular bindings for [`@agility-workbench/grid`](https://www.npmjs.com/package/@agility-workbench/grid) —
a high-performance data grid. Provides the standalone `<awb-grid>` component and re-exports the
full core API, so you can import everything you need from one place. Supports Angular 20.3+
(zone-based and zoneless applications).

## Installation

```bash
npm install @agility-workbench/angular-grid
```

`@agility-workbench/grid` is installed automatically as a dependency; `@angular/core >= 20.3` is a
peer dependency your app provides.

## Quick start

```ts
import { Component } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";
import "@agility-workbench/grid/styles.css";

@Component({
  selector: "app-example",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="height: 400px">
      <awb-grid
        [rowData]="rowData"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [rowNumbers]="true"
        (gridReady)="onGridReady($event)"
      />
    </div>
  `,
})
export class ExampleComponent {
  columnDefs: NgColDef[] = [
    { key: "name", label: "Name", type: ColumnType.STRING },
    { key: "price", label: "Price", type: ColumnType.NUMBER },
  ];

  rowData = [
    { id: "1", name: "Widget", price: 9.99 },
    { id: "2", name: "Gadget", price: 14.5 },
  ];

  onGridReady(api: IGridAPI): void {
    // Imperative API: sorting, selection, editing, exports, view state, …
  }
}
```

The grid fills its host element — give `<awb-grid>` (or a wrapper) a height. The component is
also available via template reference: `<awb-grid #grid="awbGrid" />` → `grid.api`.

## Angular components in the grid

Column definitions accept Angular component classes wherever the core accepts a class component —
`cellRenderer`, `cellEditor`, `tooltipComponent`, `headerTooltip`, and `actionFrameComponent`.
A component receives its params either through an input named `params` or by implementing
`awbInit(params)` (plus optional `awbRefresh(params)`):

```ts
import { Component, input } from "@angular/core";
import type { CellRendererParams } from "@agility-workbench/angular-grid";

@Component({
  standalone: true,
  template: `<strong>{{ params()?.value }}</strong>`,
})
export class BoldCell {
  readonly params = input<CellRendererParams>();
}

const columnDefs: NgColDef[] = [{ key: "name", label: "Name", cellRenderer: BoldCell }];
```

Cell editors implement `ICellEditorNgComp` (`getValue()` plus optional `focus`, `isParsed`,
`isCancelBeforeStart`). Menu items returned from `getColumnMenuItems` / `bodyContextMenu` may use
`TemplateRef`s for their `left`/`right` slots (`NgMenuItem`).

## License

MIT
