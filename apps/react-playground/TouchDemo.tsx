import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef, ReactDefaultColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";

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
export function TouchDemo() {
  const apiRef = useRef<IGridAPI | null>(null);
  const rows = useMemo(() => buildRows(), []);
  const [entries, setEntries] = useState<string[]>([]);
  const offs = useRef<Array<() => void>>([]);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const log = useCallback((text: string) => {
    setEntries(prev => [`${new Date().toLocaleTimeString()}  ${text}`, ...prev].slice(0, MAX_LOG));
  }, []);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 120 },
    { colId: "customer", key: "customer", label: "Customer", width: 160, editable: true },
    { colId: "units", key: "units", label: "Units", width: 110, type: ColumnType.NUMBER, editable: true },
    { colId: "price", key: "price", label: "Price", width: 120, type: ColumnType.CURRENCY, editable: true },
    // Built-in checkbox renderer (the BOOLEAN default): a tap on the box toggles it.
    { colId: "shipped", key: "shipped", label: "Shipped", width: 110, type: ColumnType.BOOLEAN, editable: true },
  ], []);

  const defaultColDef = useMemo<ReactDefaultColDef>(() => ({
    columnMenu: ({ column, items }) => {
      log(`column menu on ${column.colId} (long press, right-click or button)`);
      return items;
    },
  }), [log]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") log(`pointerdown (${event.pointerType})`);
    };
    const onPointerCancel = (event: PointerEvent) => {
      log(`pointercancel (${event.pointerType}) — the browser took the gesture`);
    };
    host.addEventListener("pointerdown", onPointerDown, true);
    host.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      host.removeEventListener("pointerdown", onPointerDown, true);
      host.removeEventListener("pointercancel", onPointerCancel, true);
      offs.current.forEach(off => off());
      offs.current = [];
    };
  }, [log]);

  const onGridReady = useCallback((api: IGridAPI) => {
    api.setRowGroupColumns(["region"]);
    offs.current.forEach(off => off());
    offs.current = [
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
  }, [log]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={() => setEntries([])}>Clear log</button>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        Use device emulation (or a touch screen). Tap selects; double tap edits; a long press opens the
        cell menu or the column menu; drag the header edge to resize, a header sideways to move it, the
        fill handle to fill. Swiping the body scrolls and selects nothing. Range drag and hover tooltips
        are mouse-only. The grid root carries <code>touch-action: manipulation</code>, header
        cells <code>pan-y</code>, the resize and fill handles <code>none</code>.
      </p>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <Grid
          apiRef={apiRef}
          rowData={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowSelection={{ checkboxes: true }}
          groupDefaultExpanded={-1}
          fillHandle
          bodyContextMenu={({ ctx, items }) => {
            log(`cell menu on row ${ctx.rowId} (long press or right-click)`);
            return items;
          }}
          defaultColDef={defaultColDef}
          onGridReady={onGridReady}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <ol
        style={{
          margin: 0, padding: "6px 6px 6px 28px", fontSize: 12, fontFamily: "monospace",
          minHeight: 120, maxHeight: 180, overflow: "auto",
          border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 6,
        }}
      >
        {entries.map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}
      </ol>
    </div>
  );
}

export default TouchDemo;
