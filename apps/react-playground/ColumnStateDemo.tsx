import { useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";
import type { ColumnState } from "@grid/interfaces/iGridCore";

/**
 * Demonstrates saving and restoring the column layout via `api.getColumnState()` /
 * `api.applyColumnState()`:
 *  - "Save layout" captures the current widths / pinning / visibility / order.
 *  - "Restore (merge)" re-applies it as a MERGE — columns not in the saved state keep their place.
 *  - "Restore (exact)" passes `{ defaultState: { hidden: true } }`, hiding anything not in the
 *    saved view (including columns added since it was captured).
 *  - The reorder buttons show that ordering keys off each entry's explicit `order` field: a partial
 *    state with an `order` repositions only that column; one without an `order` leaves positions
 *    alone. Add the transient "Notes" column, save, then Restore (exact) to see it hidden on restore.
 */

type ProductRow = {
  id: number;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  rating: number;
  supplier: string;
};

const CATEGORIES = ["Widgets", "Gadgets", "Gizmos", "Doohickeys", "Thingamajigs"];
const SUPPLIERS = ["Acme", "Globex", "Initech", "Umbrella", "Soylent", "Hooli"];

// Deterministic PRNG so the demo data is stable across reloads.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRows(count: number): ProductRow[] {
  const rand = mulberry32(7);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => ({
    id: 2000 + i,
    sku: `SKU-${(2000 + i).toString(36).toUpperCase()}`,
    name: `${pick(CATEGORIES)} ${1 + Math.floor(rand() * 900)}`,
    category: pick(CATEGORIES),
    price: +(5 + rand() * 495).toFixed(2),
    stock: Math.floor(rand() * 500),
    rating: +(1 + rand() * 4).toFixed(1),
    supplier: pick(SUPPLIERS),
  }));
}

export function ColumnStateDemo() {
  const rows = useMemo(() => buildRows(200), []);
  const apiRef = useRef<IGridAPI | null>(null);
  const [saved, setSaved] = useState<ColumnState[] | null>(null);
  const [notesAdded, setNotesAdded] = useState(false);
  const [status, setStatus] = useState("Mutate the columns (resize / pin / hide / reorder), then Save.");

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "id", key: "id", label: "ID", width: 80 },
    { colId: "sku", key: "sku", label: "SKU", width: 130 },
    { colId: "name", key: "name", label: "Name", width: 180 },
    { colId: "category", key: "category", label: "Category", width: 130 },
    { colId: "price", key: "price", label: "Price", width: 110, type: ColumnType.CURRENCY },
    { colId: "stock", key: "stock", label: "Stock", width: 100, type: ColumnType.NUMBER },
    { colId: "rating", key: "rating", label: "Rating", width: 100, type: ColumnType.NUMBER },
    { colId: "supplier", key: "supplier", label: "Supplier", width: 140 },
  ], []);

  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
  };

  const save = () => {
    const api = apiRef.current;
    if (!api) return;
    const state = api.getColumnState();
    setSaved(state);
    setStatus(`Saved layout of ${state.length} columns.`);
  };

  const restoreMerge = () => {
    const api = apiRef.current;
    if (!api || !saved) return;
    api.applyColumnState(saved);
    setStatus("Restored (merge) — columns not in the saved state kept their place.");
  };

  const restoreExact = () => {
    const api = apiRef.current;
    if (!api || !saved) return;
    api.applyColumnState(saved, { defaultState: { hidden: true } });
    setStatus("Restored (exact) — anything not in the saved view is now hidden.");
  };

  // Reposition "supplier" to the front using an explicit order; other columns keep their place.
  const moveSupplierFirst = () => {
    const api = apiRef.current;
    if (!api) return;
    const col = api.getColumnModel().getByColId("supplier");
    if (!col) return;
    api.applyColumnState([{ colId: "supplier", order: 0 }]);
    setStatus("Applied a partial state { colId: 'supplier', order: 0 } — only supplier moved.");
  };

  // Pin "category" left WITHOUT an order — it changes section but is not dragged to the front by
  // the reorder step (order-less entries do not reposition).
  const pinCategoryNoOrder = () => {
    const api = apiRef.current;
    if (!api) return;
    api.applyColumnState([{ colId: "category", pinned: "left" }]);
    setStatus("Applied { colId: 'category', pinned: 'left' } with no order — no positional jump.");
  };

  // Add a transient column at runtime so "Restore (exact)" has something new to hide.
  const addNotesColumn = () => {
    const api = apiRef.current;
    if (!api || notesAdded) return;
    api.getColumnModel().addColumnDef({ colId: "notes", key: "notes", label: "Notes", width: 160 });
    api.dispatch({ type: "columnStateSet", state: api.getColumnState() }); // trigger a rebuild/repaint
    setNotesAdded(true);
    setStatus("Added a transient 'Notes' column. Save now, then Restore (exact) to see it hidden.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" type="button" onClick={save}>Save layout</button>
        <button className="btn" type="button" onClick={restoreMerge} disabled={!saved}>Restore (merge)</button>
        <button className="btn" type="button" onClick={restoreExact} disabled={!saved}>Restore (exact)</button>
        <span style={{ width: 1, alignSelf: "stretch", background: "#ddd" }} />
        <button className="btn" type="button" onClick={moveSupplierFirst}>Supplier → first (order:0)</button>
        <button className="btn" type="button" onClick={pinCategoryNoOrder}>Pin category (no order)</button>
        <button className="btn" type="button" onClick={addNotesColumn} disabled={notesAdded}>Add "Notes" column</button>
      </div>

      <div style={{ fontSize: 13, color: "#374151" }}>{status}</div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <Grid
            data={rows}
            columnDefs={columnDefs}
            rowIdKey="id"
            rowNumbers
            style={{ width: "100%", height: "100%" }}
            onGridReady={handleReady}
          />
        </div>

        <aside style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
          <section style={{ border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 8, padding: 12 }}>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Saved column state</h3>
            {saved ? (
              <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#6b7280" }}>
                    <th style={{ padding: "2px 6px 4px 0" }}>colId</th>
                    <th style={{ padding: "2px 6px 4px 0" }}>order</th>
                    <th style={{ padding: "2px 6px 4px 0" }}>w</th>
                    <th style={{ padding: "2px 6px 4px 0" }}>pin</th>
                    <th style={{ padding: "2px 0 4px 0" }}>hidden</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((s) => (
                    <tr key={s.colId}>
                      <td style={{ padding: "2px 6px 2px 0", fontWeight: 600 }}>{s.colId}</td>
                      <td style={{ padding: "2px 6px 2px 0" }}>{s.order}</td>
                      <td style={{ padding: "2px 6px 2px 0" }}>{s.widthPx != null ? Math.round(s.widthPx) : "—"}</td>
                      <td style={{ padding: "2px 6px 2px 0" }}>{s.pinned ?? "—"}</td>
                      <td style={{ padding: "2px 0" }}>{s.hidden ? "yes" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: 12, color: "#9ca3af" }}>Nothing saved yet.</div>
            )}
          </section>

          <section style={{ border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 8, padding: 12 }}>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>How to try it</h3>
            <ol style={{ fontSize: 12, color: "#6b7280", margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              <li>Resize a column, pin one (via its header menu), hide one, drag to reorder.</li>
              <li><b>Save layout</b> — the captured state appears here.</li>
              <li>Change the columns again, then <b>Restore (merge)</b> vs <b>Restore (exact)</b>.</li>
              <li>Try <b>Add "Notes"</b> → Save → <b>Restore (exact)</b>: Notes is hidden on restore.</li>
              <li>Use the reorder buttons to see order-driven vs order-less behavior.</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default ColumnStateDemo;
