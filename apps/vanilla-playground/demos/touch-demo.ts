import { createGrid, ColumnType, type ColDef } from "@grid";

import { btn, code, demoRoot, gridHost, h, note, toolbarRow } from "../dom";

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

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 120 },
  { colId: "customer", key: "customer", label: "Customer", width: 160, editable: true },
  { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER, editable: true },
  { colId: "price", key: "price", label: "Price", width: 120, type: ColumnType.CURRENCY, editable: true },
  // Built-in checkbox renderer (the BOOLEAN default): a tap on the box toggles it.
  { colId: "shipped", key: "shipped", label: "Shipped", width: 110, type: ColumnType.BOOLEAN, editable: true },
];

const MAX_LOG = 14;

/**
 * Touch & pointer: every gesture the grid recognises from a finger or a pen, logged as the grid
 * reports it. Open Chrome DevTools device emulation (or a phone) and try: tap a cell, tap a
 * checkbox, tap the Shipped box, tap a group chevron, double tap a cell to edit, long press a cell
 * or a header, drag a resize handle, drag a header sideways, drag the fill handle.
 */
export function mountTouchDemo(container: HTMLElement): () => void {
  const host = gridHost();
  const logList = h("ol", {
    style: {
      margin: "0", padding: "6px 6px 6px 28px", fontSize: "12px", fontFamily: "monospace",
      minHeight: "120px", maxHeight: "180px", overflow: "auto",
      border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: "6px",
    },
  });
  const entries: string[] = [];

  function log(text: string): void {
    entries.unshift(`${new Date().toLocaleTimeString()}  ${text}`);
    entries.length = Math.min(entries.length, MAX_LOG);
    logList.replaceChildren(...entries.map(entry => h("li", { text: entry })));
  }

  // The kind of pointer behind a click: a click is a PointerEvent in current browsers.
  const kindOf = (event: MouseEvent) => (event as PointerEvent).pointerType || "mouse";

  container.appendChild(demoRoot(
    toolbarRow(btn("Clear log", () => {
      entries.length = 0;
      logList.replaceChildren();
    })),
    note(
      "Use device emulation (or a touch screen). Tap selects; double tap edits; a long press opens the"
      + " cell menu or the column menu; drag the header edge to resize, a header sideways to move it, the"
      + " fill handle to fill. Swiping the body scrolls and selects nothing. Range drag and hover"
      + " tooltips are mouse-only. The grid root carries ",
      code("touch-action: manipulation"),
      ", header cells ",
      code("pan-y"),
      ", the resize and fill handles ",
      code("none"),
      ".",
    ),
    host,
    logList,
  ));

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") log(`pointerdown (${event.pointerType})`);
  };
  const onPointerCancel = (event: PointerEvent) => {
    log(`pointercancel (${event.pointerType}) — the browser took the gesture`);
  };
  host.addEventListener("pointerdown", onPointerDown, true);
  host.addEventListener("pointercancel", onPointerCancel, true);

  const api = createGrid(host, {
    rowData: buildRows(),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    rowSelection: { checkboxes: true },
    groupDefaultExpanded: -1,
    fillHandle: true,
    bodyContextMenu: ({ ctx, items }) => {
      log(`cell menu on row ${ctx.rowId} (long press or right-click)`);
      return items;
    },
    defaultColDef: {
      columnMenu: ({ column, items }) => {
        log(`column menu on ${column.colId} (long press, right-click or button)`);
        return items;
      },
    },
  });

  api.setRowGroupColumns(["region"]);

  const offs = [
    api.on("rowClicked", ev => log(`tap/click (${kindOf(ev.event)}) on row ${ev.rowId}${ev.isGroup ? " (group)" : ""}`)),
    api.on("cellDoubleClicked", ev => log(`double tap/click on ${ev.colId} of row ${ev.rowId}`)),
    api.on("selectionChanged", ({ snapshot }) => {
      const range = snapshot.range;
      const where = range ? `rows ${range.rowStart}–${range.rowEnd}, cols ${range.colStart}–${range.colEnd}` : "no range";
      log(`selection (${snapshot.kind}): ${where}, ${snapshot.selectedRowIds.length} checked`);
    }),
    api.on("editingChanged", ev => log(`editing ${ev.state}`)),
    api.on("cellValueChanged", ev => log(`value ${ev.cell.colId} of row ${ev.cell.rowId} → ${String(ev.value)} (${ev.source})`)),
    api.on("columnWidthsChanged", ev => {
      if (ev.final) log(`resize settled: ${ev.changedColIds.join(", ") || "all"}`);
    }),
    api.on("columnsChanged", ev => {
      if (ev.reason === "order" && ev.source === "user") log(`column moved: ${(ev.changedColIds ?? []).join(", ")}`);
    }),
  ];

  return () => {
    offs.forEach(off => off());
    host.removeEventListener("pointerdown", onPointerDown, true);
    host.removeEventListener("pointercancel", onPointerCancel, true);
    api.destroy();
  };
}
