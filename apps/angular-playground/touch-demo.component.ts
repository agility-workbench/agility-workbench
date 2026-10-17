import { Component, DestroyRef, ElementRef, inject, signal, viewChild, type AfterViewInit } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type BodyMenuContext,
  type IGridAPI,
  type NgColDef,
  type NgDefaultColDef,
  type NgMenuItem,
} from "@agility-workbench/angular-grid";

type OrderRow = {
  id: number;
  region: string;
  customer: string;
  units: number;
  price: number;
  shipped: boolean;
};

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne"];
const REGIONS = ["North", "South", "East"];
const MAX_LOG = 14;

function buildRows(): OrderRow[] {
  return Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    region: REGIONS[index % REGIONS.length],
    customer: CUSTOMERS[index % CUSTOMERS.length],
    units: 2 + ((index * 7) % 19),
    price: 20 + ((index * 37) % 180),
    shipped: index % 3 !== 0,
  }));
}

// The kind of pointer behind a click: a click is a PointerEvent in current browsers.
const kindOf = (event: MouseEvent) => (event as PointerEvent).pointerType || "mouse";

/**
 * Touch & pointer: every gesture the grid recognises from a finger or a pen, logged as the grid
 * reports it. Same page as the vanilla playground's touch-demo.ts — use device emulation.
 */
@Component({
  selector: "touch-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="td-controls">
      <button type="button" class="btn" (click)="entries.set([])">Clear log</button>
    </div>
    <p class="td-blurb">
      Use device emulation (or a touch screen). Tap selects; double tap edits; a long press opens the
      cell menu or the column menu; drag the header edge to resize, a header sideways to move it, the
      fill handle to fill. Swiping the body scrolls and selects nothing. Range drag and hover tooltips
      are mouse-only. The grid root carries <code>touch-action: manipulation</code>, header
      cells <code>pan-y</code>, the resize and fill handles <code>none</code>.
    </p>
    <div class="demo-grid-host" #host>
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs"
        rowIdKey="id"
        [rowSelection]="{ checkboxes: true }"
        [groupDefaultExpanded]="-1"
        [fillHandle]="true"
        [bodyContextMenu]="bodyContextMenu"
        [defaultColDef]="defaultColDef"
        (gridReady)="onReady($event)"
      />
    </div>
    <ol class="td-log">
      @for (entry of entries(); track $index) {
        <li>{{ entry }}</li>
      }
    </ol>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 12px;
        min-height: 0;
      }
      .td-controls {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .td-blurb {
        margin: 0;
        font-size: 13px;
        color: #6b7280;
        line-height: 1.5;
      }
      .td-log {
        margin: 0;
        padding: 6px 6px 6px 28px;
        font-size: 12px;
        font-family: monospace;
        min-height: 120px;
        max-height: 180px;
        overflow: auto;
        border: 1px solid var(--pte-frame-border-color, #ccc);
        border-radius: 6px;
      }
    `,
  ],
})
export class TouchDemoComponent implements AfterViewInit {
  readonly rows = buildRows();
  readonly entries = signal<string[]>([]);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>("host");
  private readonly destroyRef = inject(DestroyRef);
  private offs: Array<() => void> = [];

  readonly columnDefs: NgColDef[] = [
    { colId: "region", key: "region", label: "Region", width: 120 },
    { colId: "customer", key: "customer", label: "Customer", width: 160, editable: true },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER, editable: true },
    { colId: "price", key: "price", label: "Price", width: 120, type: ColumnType.CURRENCY, editable: true },
    // Built-in checkbox renderer (the BOOLEAN default): a tap on the box toggles it.
    { colId: "shipped", key: "shipped", label: "Shipped", width: 110, type: ColumnType.BOOLEAN, editable: true },
  ];

  readonly bodyContextMenu = ({ ctx, items }: { ctx: BodyMenuContext; items: NgMenuItem[] }) => {
    this.log(`cell menu on row ${ctx.rowId} (long press or right-click)`);
    return items;
  };

  readonly defaultColDef: NgDefaultColDef = {
    columnMenu: ({ column, items }) => {
      this.log(`column menu on ${column.colId} (long press, right-click or button)`);
      return items;
    },
  };

  ngAfterViewInit(): void {
    const host = this.host().nativeElement;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") this.log(`pointerdown (${event.pointerType})`);
    };
    const onPointerCancel = (event: PointerEvent) => {
      this.log(`pointercancel (${event.pointerType}) — the browser took the gesture`);
    };
    host.addEventListener("pointerdown", onPointerDown, true);
    host.addEventListener("pointercancel", onPointerCancel, true);
    this.destroyRef.onDestroy(() => {
      host.removeEventListener("pointerdown", onPointerDown, true);
      host.removeEventListener("pointercancel", onPointerCancel, true);
      this.offs.forEach(off => off());
      this.offs = [];
    });
  }

  onReady(api: IGridAPI): void {
    api.setRowGroupColumns(["region"]);
    this.offs.forEach(off => off());
    this.offs = [
      api.on("rowClicked", ev => this.log(`tap/click (${kindOf(ev.event)}) on row ${ev.rowId}${ev.isGroup ? " (group)" : ""}`)),
      api.on("cellDoubleClicked", ev => this.log(`double tap/click on ${ev.colId} of row ${ev.rowId}`)),
      api.on("selectionChanged", ({ snapshot }) => {
        const range = snapshot.range;
        const where = range ? `rows ${range.rowStart}–${range.rowEnd}, cols ${range.colStart}–${range.colEnd}` : "no range";
        this.log(`selection (${snapshot.kind}): ${where}, ${snapshot.selectedRowIds.length} checked`);
      }),
      api.on("editingChanged", ev => this.log(`editing ${ev.state}`)),
      api.on("cellValueChanged", ev => this.log(`value ${ev.cell.colId} of row ${ev.cell.rowId} → ${String(ev.value)} (${ev.source})`)),
      api.on("columnWidthsChanged", ev => {
        if (ev.final) this.log(`resize settled: ${ev.changedColIds.join(", ") || "all"}`);
      }),
      api.on("columnsChanged", ev => {
        if (ev.reason === "order" && ev.source === "user") this.log(`column moved: ${(ev.changedColIds ?? []).join(", ")}`);
      }),
    ];
  }

  private log(text: string): void {
    this.entries.update(prev => [`${new Date().toLocaleTimeString()}  ${text}`, ...prev].slice(0, MAX_LOG));
  }
}
