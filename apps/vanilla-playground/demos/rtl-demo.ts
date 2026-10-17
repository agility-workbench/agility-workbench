import { createGrid, AggregateType, ColumnType, type ColDef, type IGridAPI } from "@grid";

import { bold, checkbox, code, demoRoot, field, gridHost, note, toolbarRow } from "../dom";

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

const COLUMN_DEFS: ColDef[] = [
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
 * Right-to-left: `enableRtl: true` with Arabic and Hebrew data, columns pinned to both sides, a
 * column group, row numbers, checkboxes, editing, tooltips, the fill handle, aggregates,
 * pagination and row grouping. `enableRtl` is creation-only, so the direction toggle rebuilds.
 */
export function mountRtlDemo(container: HTMLElement): () => void {
  let rtl = true;
  let grouped = false;
  let api: IGridAPI | null = null;
  const host = gridHost();

  function build(): void {
    api?.destroy();
    host.replaceChildren();
    api = createGrid(host, {
      rowData: buildRows(),
      columnDefs: COLUMN_DEFS,
      rowIdKey: "id",
      enableRtl: rtl,
      rowNumbers: true,
      rowSelection: { mode: "multiple", checkboxes: true, headerCheckbox: true },
      fillHandle: true,
      pagination: true,
      pageSize: 20,
      groupDefaultExpanded: -1,
    });
    applyGrouping();
  }

  function applyGrouping(): void {
    api?.setRowGroupColumns(grouped ? ["department"] : []);
  }

  container.appendChild(demoRoot(
    toolbarRow(
      field("Right-to-left (rebuilds)", checkbox(rtl, value => {
        rtl = value;
        build();
      })),
      field("Group by القسم", checkbox(grouped, value => {
        grouped = value;
        applyGrouping();
      })),
    ),
    note(
      bold("Right-to-left."), " ", code("enableRtl: true"), " writes ", code('dir="rtl"'),
      " on the grid root. ", code('pinned: "left"'), " is the inline start, so # , row numbers and"
      + " checkboxes sit at the right edge and المبلغ (", code('pinned: "right"'), ") at the left."
      + " ArrowLeft moves to the next column; Home/End/Tab stay logical. Hover الاسم or المبلغ for"
      + " a tooltip, drag the fill handle on الكمية, open a column menu to see submenus open"
      + " leftwards. The option is creation-only: the toggle recreates the grid.",
    ),
    host,
  ));

  build();

  return () => api?.destroy();
}
