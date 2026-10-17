import { Component, signal } from "@angular/core";
import { AggregateType, AwbGrid, ColumnType, type IGridAPI, type NgColDef } from "@agility-workbench/angular-grid";

type StaffRow = {
  id: number;
  nameAr: string;
  nameHe: string;
  nameEn: string;
  department: string;
  city: string;
  date: Date;
  quantity: number;
  amount: number;
};

const NAMES_AR = ["أحمد", "فاطمة", "يوسف", "مريم", "خالد", "ليلى", "عمر", "نور"];
const NAMES_HE = ["דוד", "שרה", "יוסף", "רחל", "משה", "מרים", "אברהם", "נועה"];
const NAMES_EN = ["Ahmad / David", "Fatima / Sarah", "Yusuf / Yosef", "Maryam / Rachel", "Khalid / Moshe", "Layla / Miriam", "Omar / Avraham", "Nour / Noa"];
const DEPARTMENTS = ["المبيعات", "الهندسة", "المالية", "الدعم"];
const CITIES = ["ירושלים", "תל אביב", "חיפה", "באר שבע", "אילת"];

function buildRows(): StaffRow[] {
  return Array.from({ length: 60 }, (_, index) => ({
    id: index + 1,
    nameAr: NAMES_AR[index % NAMES_AR.length],
    nameHe: NAMES_HE[(index * 3) % NAMES_HE.length],
    nameEn: NAMES_EN[index % NAMES_EN.length],
    department: DEPARTMENTS[(index * 5) % DEPARTMENTS.length],
    city: CITIES[(index * 7) % CITIES.length],
    date: new Date(2026, index % 12, 1 + ((index * 5) % 28)),
    quantity: 1 + ((index * 7) % 23),
    amount: 120 + ((index * 137) % 4800),
  }));
}

const COLUMN_DEFS: NgColDef[] = [
  // pinned: "left" is the inline START: in RTL this column sits at the right edge.
  { colId: "id", key: "id", label: "#", width: 80, type: ColumnType.NUMBER, pinned: "left" },
  {
    colId: "employee", label: "الموظف · עובד",
    children: [
      { colId: "nameAr", key: "nameAr", label: "الاسم", width: 130, editable: true, tooltipField: "nameEn" },
      { colId: "nameHe", key: "nameHe", label: "שם", width: 120, editable: true },
    ],
  },
  { colId: "department", key: "department", label: "القسم", width: 130, editable: true },
  { colId: "city", key: "city", label: "עיר", width: 130, editable: true },
  { colId: "date", key: "date", label: "التاريخ", width: 150, type: ColumnType.DATE },
  {
    colId: "quantity", key: "quantity", label: "الكمية", width: 110, type: ColumnType.NUMBER,
    editable: true, aggFunc: AggregateType.SUM,
  },
  // pinned: "right" is the inline END: in RTL this column sits at the left edge.
  {
    colId: "amount", key: "amount", label: "المبلغ", width: 140, type: ColumnType.CURRENCY,
    editable: true, aggFunc: AggregateType.SUM, pinned: "right",
    tooltipValueGetter: p => `${p.valueFormatted ?? ""} · ${p.data?.quantity ?? 0} × ${p.data?.nameEn ?? ""}`,
  },
];

/**
 * Right-to-left: `enableRtl` with Arabic and Hebrew data. Same page as the vanilla playground's
 * rtl-demo.ts. `enableRtl` is creation-only, so the direction toggle recreates the grid: the
 * single-item `@for` tracks the direction, so a new value destroys and recreates `awb-grid`
 * (React uses `key=` for the same thing).
 */
@Component({
  selector: "rtl-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="rtl-controls">
      <label>
        <input type="checkbox" [checked]="rtl()" (change)="rtl.set($any($event.target).checked)" />
        Right-to-left (rebuilds)
      </label>
      <label>
        <input type="checkbox" [checked]="grouped()" (change)="toggleGrouping($any($event.target).checked)" />
        Group by القسم
      </label>
    </div>
    <p class="rtl-blurb">
      <strong>Right-to-left.</strong> <code>enableRtl: true</code> writes <code>dir="rtl"</code> on the
      grid root. <code>pinned: "left"</code> is the inline start, so #, row numbers and checkboxes sit
      at the right edge and المبلغ (<code>pinned: "right"</code>) at the left. ArrowLeft moves to the
      next column; Home/End/Tab stay logical. Hover الاسم or المبلغ for a tooltip, drag the fill handle
      on الكمية, open a column menu to see submenus open leftwards. The option is creation-only: the
      toggle recreates the grid.
    </p>
    <div class="demo-grid-host">
      @for (direction of [rtl()]; track direction) {
        <awb-grid
          [rowData]="rows"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [enableRtl]="direction"
          [rowNumbers]="true"
          [rowSelection]="{ mode: 'multiple', checkboxes: true, headerCheckbox: true }"
          [fillHandle]="true"
          [pagination]="true"
          [pageSize]="20"
          [groupDefaultExpanded]="-1"
          (gridReady)="onReady($event)"
        />
      }
    </div>
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
      .rtl-controls {
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
        font-size: 13px;
      }
      .rtl-controls label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .rtl-blurb {
        margin: 0;
        font-size: 13px;
        color: #6b7280;
        line-height: 1.5;
      }
    `,
  ],
})
export class RtlDemoComponent {
  readonly rows = buildRows();
  readonly columnDefs = COLUMN_DEFS;
  readonly rtl = signal(true);
  readonly grouped = signal(false);
  private api: IGridAPI | null = null;

  onReady(api: IGridAPI): void {
    this.api = api;
    api.setRowGroupColumns(this.grouped() ? ["department"] : []);
  }

  toggleGrouping(value: boolean): void {
    this.grouped.set(value);
    this.api?.setRowGroupColumns(value ? ["department"] : []);
  }
}
