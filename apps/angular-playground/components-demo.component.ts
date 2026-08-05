import { Component, ElementRef, input, viewChild } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type CellRendererParams,
  type ICellEditorNgComp,
  type ICellEditorParams,
  type ITooltipNgComp,
  type NgColDef,
  type TooltipComponentParams,
} from "@agility-workbench/angular-grid";
import { makeTrades, type Trade } from "./data";

/** Cell renderer receiving params via a signal input named `params`. */
@Component({
  standalone: true,
  template: `
    <span [style.color]="(params()?.value ?? 0) >= 250 ? '#16a34a' : '#dc2626'" style="font-variant-numeric: tabular-nums">
      {{ params()?.value }}
    </span>
  `,
})
export class PriceCellComponent {
  readonly params = input<CellRendererParams>();
}

/** Tooltip component using the awbInit(params) contract instead of an input. */
@Component({
  standalone: true,
  template: `
    <div style="padding: 6px 10px; max-width: 260px">
      <strong>{{ title }}</strong>
      <div style="opacity: 0.75; font-size: 12px">{{ notes }}</div>
    </div>
  `,
})
export class TradeTooltipComponent implements ITooltipNgComp {
  title = "";
  notes = "";

  awbInit(params: TooltipComponentParams): void {
    const data = params.data as Trade | undefined;
    this.title = String(params.value ?? "");
    this.notes = data?.notes ?? "";
  }
}

/** Cell editor: the component instance itself provides getValue()/focus(). */
@Component({
  standalone: true,
  template: `
    <input
      #box
      type="number"
      step="0.01"
      [value]="initial"
      style="width: 100%; height: 100%; box-sizing: border-box; border: none; outline: none; padding: 0 8px; background: inherit; color: inherit"
    />
  `,
})
export class PriceEditorComponent implements ICellEditorNgComp {
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>("box");
  initial = "";

  awbInit(params: ICellEditorParams): void {
    this.initial = String(params.value ?? "");
  }

  getValue(): unknown {
    return this.box().nativeElement.value;
  }

  focus(): void {
    const el = this.box().nativeElement;
    el.focus();
    el.select();
  }
}

@Component({
  selector: "components-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="demo-intro">
      Angular components in core-owned DOM: the <em>Price</em> column renders through
      <code>PriceCellComponent</code> (a <code>params</code> signal input) and edits through
      <code>PriceEditorComponent</code> (double-click; <code>ICellEditorNgComp</code>). Hover a
      <em>Name</em> cell for <code>TradeTooltipComponent</code> (<code>awbInit</code> contract).
    </div>
    <div class="demo-grid-host">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [zebraRows]="true"
        [tooltip]="{ showDelay: 300 }"
      />
    </div>
  `,
})
export class ComponentsDemoComponent {
  readonly rows = makeTrades(200);

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "ID", type: ColumnType.NUMBER, width: 80 },
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING, tooltipComponent: TradeTooltipComponent },
    { colId: "city", key: "city", label: "City", type: ColumnType.STRING },
    {
      colId: "price",
      key: "price",
      label: "Price",
      type: ColumnType.NUMBER,
      editable: true,
      cellRenderer: PriceCellComponent,
      cellEditor: PriceEditorComponent,
    },
    { colId: "qty", key: "qty", label: "Qty", type: ColumnType.NUMBER },
  ];
}
