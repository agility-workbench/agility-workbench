import { useCallback, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { IGridAPI, ReactColDef } from "@react-grid";
import { AggregateType } from "@grid/interfaces/aggregate";
import { ColumnType } from "@grid/interfaces/column";

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

const COLUMN_DEFS: ReactColDef[] = [
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
 * rtl-demo.ts. `enableRtl` is creation-only, so the direction toggle remounts the grid via `key`.
 */
export function RtlDemo() {
  const rows = useMemo(() => buildRows(), []);
  const [rtl, setRtl] = useState(true);
  const [grouped, setGrouped] = useState(false);
  const apiRef = useRef<IGridAPI | null>(null);
  const groupedRef = useRef(grouped);
  groupedRef.current = grouped;

  const onGridReady = useCallback((api: IGridAPI) => {
    api.setRowGroupColumns(groupedRef.current ? ["department"] : []);
  }, []);

  const toggleGrouping = (value: boolean) => {
    setGrouped(value);
    apiRef.current?.setRowGroupColumns(value ? ["department"] : []);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={rtl} onChange={e => setRtl(e.target.checked)} />
          Right-to-left (rebuilds)
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={grouped} onChange={e => toggleGrouping(e.target.checked)} />
          Group by القسم
        </label>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        <strong>Right-to-left.</strong> <code>enableRtl: true</code> writes <code>dir="rtl"</code> on the
        grid root. <code>pinned: "left"</code> is the inline start, so #, row numbers and checkboxes sit
        at the right edge and المبلغ (<code>pinned: "right"</code>) at the left. ArrowLeft moves to the
        next column; Home/End/Tab stay logical. Hover الاسم or المبلغ for a tooltip, drag the fill handle
        on الكمية, open a column menu to see submenus open leftwards. The option is creation-only: the
        toggle recreates the grid.
      </p>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <Grid
          key={rtl ? "rtl" : "ltr"}
          apiRef={apiRef}
          rowData={rows}
          columnDefs={COLUMN_DEFS}
          rowIdKey="id"
          enableRtl={rtl}
          rowNumbers
          rowSelection={{ mode: "multiple", checkboxes: true, headerCheckbox: true }}
          fillHandle
          pagination
          pageSize={20}
          groupDefaultExpanded={-1}
          onGridReady={onGridReady}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default RtlDemo;
