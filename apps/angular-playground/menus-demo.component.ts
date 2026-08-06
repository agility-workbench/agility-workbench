import { Component, TemplateRef, signal, viewChild } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type BodyMenuContext,
  type ColumnMenuContext,
  type NgColDef,
  type NgMenuItem,
} from "@agility-workbench/angular-grid";
import { makeTrades } from "./data";

@Component({
  selector: "menus-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="demo-intro">
      Menu customization with <code>TemplateRef</code> slots: open a column's header menu (⋮) for a
      template-decorated "Star this column" item; right-click a cell for a custom body menu entry.
    </div>
    <div class="demo-topbar">
      <span class="demo-log">{{ log() }}</span>
    </div>
    <div class="demo-grid-host">
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [zebraRows]="true"
        [getColumnMenuItems]="columnMenuItems"
        [bodyContextMenu]="bodyMenuItems"
      />
    </div>

    <ng-template #star>
      <span class="menu-badge">★</span>
    </ng-template>
  `,
})
export class MenusDemoComponent {
  readonly rows = makeTrades(200);
  readonly log = signal("");

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "ID", type: ColumnType.NUMBER, width: 80 },
    { colId: "name", key: "name", label: "Name", type: ColumnType.STRING },
    { colId: "city", key: "city", label: "City", type: ColumnType.STRING },
    { colId: "price", key: "price", label: "Price", type: ColumnType.NUMBER },
  ];

  private readonly starTpl = viewChild.required<TemplateRef<unknown>>("star");

  // Bound as input values, so arrow functions keep `this`.
  readonly columnMenuItems = (p: { ctx: ColumnMenuContext; items: NgMenuItem[] }): NgMenuItem[] => [
    ...p.items,
    { isSeparator: true },
    {
      label: "Star this column",
      left: this.starTpl(),
      onClick: () => this.log.set(`Starred column: ${p.ctx.targetColId}`),
    },
  ];

  readonly bodyMenuItems = (p: { ctx: BodyMenuContext; items: NgMenuItem[] }): NgMenuItem[] => [
    {
      label: "Log this row",
      left: this.starTpl(),
      onClick: () => this.log.set(`Row via body menu: ${String(p.ctx.rowId)}`),
    },
    { isSeparator: true },
    ...p.items,
  ];
}
