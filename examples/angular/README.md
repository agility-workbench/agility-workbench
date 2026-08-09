# Angular binding examples

Install `@agility-workbench/angular-grid` in an Angular 20.3+ application. Every
core option in [`../core`](../core/) has a matching signal input on `<awb-grid>`;
this page focuses on Angular-specific components, outputs, and API access.

## Minimal standalone component

```ts
import { Component } from "@angular/core";
import { AwbGrid, type NgColDef } from "@agility-workbench/angular-grid";

@Component({
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div style="height: 360px">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columns"
        rowIdKey="id"
      />
    </div>
  `,
})
export class ExampleComponent {
  readonly rows = [{ id: "1", name: "Alpha" }];
  readonly columns: NgColDef[] = [{ key: "name", label: "Name" }];
}
```

The component is standalone, works in zone-based and zoneless applications,
and defers browser creation with `afterNextRender` for SSR safety.

## Angular cell renderer with a params input

```ts
@Component({
  standalone: true,
  template: `<strong>{{ params()?.value }}</strong>`,
})
export class BoldCell {
  readonly params = input<CellRendererParams>();
}

const column: NgColDef = {
  key: "name",
  label: "Name",
  cellRenderer: BoldCell,
};
```

## Angular tooltip with `awbInit`

```ts
@Component({
  standalone: true,
  template: `<span>{{ text }}</span>`,
})
export class OwnerTooltip implements ITooltipNgComp {
  text = "";

  awbInit(params: TooltipComponentParams): void {
    this.text = `${params.data.owner} · ${params.data.ownerEmail}`;
  }
}

const column: NgColDef = {
  key: "owner",
  label: "Owner",
  tooltipComponent: OwnerTooltip,
};
```

ActionFrame components follow the same pattern with `IActionFrameNgComp`.

## Angular cell editor

```ts
@Component({
  standalone: true,
  template: `<input #box [value]="initial" />`,
})
export class TextEditor implements ICellEditorNgComp {
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>("box");
  initial = "";

  awbInit(params: ICellEditorParams): void {
    this.initial = String(params.value ?? "");
  }

  getValue(): unknown {
    return this.box().nativeElement.value;
  }

  focus(): void {
    this.box().nativeElement.focus();
  }
}

const column: NgColDef = {
  key: "name",
  label: "Name",
  editable: true,
  cellEditor: TextEditor,
};
```

Angular component instances may instead receive params through a signal or
decorator input named `params`. Angular header components are not adapted;
headers use the core DOM component contract.

## Outputs and ready API

```html
<awb-grid
  [rowData]="rows"
  [columnDefs]="columns"
  (gridReady)="onGridReady($event)"
  (cellClicked)="onCellClicked($event)"
  (rowClicked)="onRowClicked($event)"
  (cellValueChanged)="saveChange($event)"
  (selectionChanged)="selectionChanged($event)"
  (sortChanged)="sortChanged($event)"
/>
```

```ts
onGridReady(api: IGridAPI): void {
  api.setQuickFilter("open");
}
```

Outputs re-enter Angular's zone even though the grid core and its high-frequency
listeners run outside it.

## Template-reference API

```html
<button (click)="grid.api?.exportDataAsCsv()">Export</button>
<awb-grid #grid="awbGrid" [rowData]="rows" [columnDefs]="columns" />
```

`grid.api` is `null` until the browser-side grid is ready.

## TemplateRef menu slots

```html
<ng-template #shortcut><kbd>Enter</kbd></ng-template>
<awb-grid [getColumnMenuItems]="columnMenuItems" />
```

```ts
readonly shortcut = viewChild.required<TemplateRef<unknown>>("shortcut");

readonly columnMenuItems = ({ items }: { items: NgMenuItem[] }) => [
  ...items,
  {
    id: "open",
    label: "Open",
    right: this.shortcut(),
    onClick: () => this.openSelected(),
  },
];
```

Angular menu items accept `TemplateRef` values in their `left` and `right`
slots for both column and body menus.
