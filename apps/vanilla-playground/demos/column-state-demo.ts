import { ColumnType, createGrid, type ColDef } from "@grid";
// `ColumnState` is the shape `api.getColumnState()` returns but is not re-exported from the package
// entry today, so this names it through its declaring module (as the React playground does).
import type { ColumnState } from "@grid/interfaces/iGridCore";

import { btn, demoRoot, gridHost, h } from "../dom";
import { mulberry32, picker } from "../helpers";

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

function buildRows(count: number): ProductRow[] {
  const rand = mulberry32(7);
  const pick = picker(rand);
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

const COLUMNS: ColDef[] = [
  { colId: "id", key: "id", label: "ID", width: 80 },
  { colId: "sku", key: "sku", label: "SKU", width: 130 },
  { colId: "name", key: "name", label: "Name", width: 180 },
  { colId: "category", key: "category", label: "Category", width: 130 },
  { colId: "price", key: "price", label: "Price", width: 110, type: ColumnType.CURRENCY },
  { colId: "stock", key: "stock", label: "Stock", width: 100, type: ColumnType.NUMBER },
  { colId: "rating", key: "rating", label: "Rating", width: 100, type: ColumnType.NUMBER },
  { colId: "supplier", key: "supplier", label: "Supplier", width: 140 },
];

export function mountColumnStateDemo(container: HTMLElement): () => void {
  let saved: ColumnState[] | null = null;
  let notesAdded = false;

  const host = gridHost();
  const statusLine = h("div", {
    style: { fontSize: "13px", color: "#374151" },
    text: "Mutate the columns (resize / pin / hide / reorder), then Save.",
  });
  const savedPanel = h("div");

  const restoreMergeButton = btn("Restore (merge)", () => {
    if (!saved) return;
    api.applyColumnState(saved);
    setStatus("Restored (merge) — columns not in the saved state kept their place.");
  }, { disabled: true });

  const restoreExactButton = btn("Restore (exact)", () => {
    if (!saved) return;
    api.applyColumnState(saved, { defaultState: { hidden: true } });
    setStatus("Restored (exact) — anything not in the saved view is now hidden.");
  }, { disabled: true });

  const addNotesButton = btn("Add \"Notes\" column", () => {
    if (notesAdded) return;
    // Add a transient column at runtime so "Restore (exact)" has something new to hide.
    api.getColumnModel().addColumnDef({ colId: "notes", key: "notes", label: "Notes", width: 160 });
    api.dispatch({ type: "columnStateSet", state: api.getColumnState() }); // trigger a rebuild/repaint
    notesAdded = true;
    addNotesButton.disabled = true;
    setStatus("Added a transient 'Notes' column. Save now, then Restore (exact) to see it hidden.");
  });

  container.appendChild(demoRoot(
    h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
      btn("Save layout", () => {
        saved = api.getColumnState();
        restoreMergeButton.disabled = false;
        restoreExactButton.disabled = false;
        renderSavedPanel();
        setStatus(`Saved layout of ${saved.length} columns.`);
      }),
      restoreMergeButton,
      restoreExactButton,
      h("span", { style: { width: "1px", alignSelf: "stretch", background: "#ddd" } }),
      // Reposition "supplier" to the front using an explicit order; other columns keep their place.
      btn("Supplier → first (order:0)", () => {
        api.applyColumnState([{ colId: "supplier", order: 0 }]);
        setStatus("Applied a partial state { colId: 'supplier', order: 0 } — only supplier moved.");
      }),
      // Pin "category" left WITHOUT an order — it changes section but is not dragged to the front by
      // the reorder step (order-less entries do not reposition).
      btn("Pin category (no order)", () => {
        api.applyColumnState([{ colId: "category", pinned: "left" }]);
        setStatus("Applied { colId: 'category', pinned: 'left' } with no order — no positional jump.");
      }),
      addNotesButton,
    ),
    statusLine,
    h("div", { style: { display: "flex", gap: "12px", flex: "1", minHeight: "0" } },
      host,
      h("aside", {
        style: {
          width: "320px", flexShrink: "0", display: "flex", flexDirection: "column",
          gap: "12px", overflow: "auto",
        },
      },
        h("section", {
          style: { border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: "8px", padding: "12px" },
        },
          h("h3", { text: "Saved column state", style: { fontSize: "14px", marginBottom: "8px" } }),
          savedPanel,
        ),
        h("section", {
          style: { border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: "8px", padding: "12px" },
        },
          h("h3", { text: "How to try it", style: { fontSize: "14px", marginBottom: "8px" } }),
          h("ol", {
            style: { fontSize: "12px", color: "#6b7280", margin: "0", paddingLeft: "18px", lineHeight: "1.6" },
          },
            h("li", { text: "Resize a column, pin one (via its header menu), hide one, drag to reorder." }),
            h("li", null, h("b", { text: "Save layout" }), " — the captured state appears here."),
            h("li", null, "Change the columns again, then ", h("b", { text: "Restore (merge)" }), " vs ",
              h("b", { text: "Restore (exact)" }), "."),
            h("li", null, "Try ", h("b", { text: "Add \"Notes\"" }), " → Save → ",
              h("b", { text: "Restore (exact)" }), ": Notes is hidden on restore."),
            h("li", { text: "Use the reorder buttons to see order-driven vs order-less behavior." }),
          ),
        ),
      ),
    ),
  ));

  const api = createGrid(host, {
    rowData: buildRows(200),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    rowNumbers: true,
  });

  renderSavedPanel();

  function setStatus(text: string): void {
    statusLine.textContent = text;
  }

  function renderSavedPanel(): void {
    if (!saved) {
      savedPanel.replaceChildren(h("div", {
        text: "Nothing saved yet.",
        style: { fontSize: "12px", color: "#9ca3af" },
      }));
      return;
    }
    const headerCell = (text: string) => h("th", { text, style: { padding: "2px 6px 4px 0" } });
    savedPanel.replaceChildren(
      h("table", { style: { fontSize: "12px", borderCollapse: "collapse", width: "100%" } },
        h("thead", null, h("tr", { style: { textAlign: "left", color: "#6b7280" } },
          headerCell("colId"), headerCell("order"), headerCell("w"), headerCell("pin"), headerCell("hidden"),
        )),
        h("tbody", null, ...saved.map(state => h("tr", null,
          h("td", { text: state.colId, style: { padding: "2px 6px 2px 0", fontWeight: "600" } }),
          h("td", { text: String(state.order ?? ""), style: { padding: "2px 6px 2px 0" } }),
          h("td", {
            text: state.widthPx != null ? String(Math.round(state.widthPx)) : "—",
            style: { padding: "2px 6px 2px 0" },
          }),
          h("td", { text: state.pinned ?? "—", style: { padding: "2px 6px 2px 0" } }),
          h("td", { text: state.hidden ? "yes" : "—", style: { padding: "2px 0" } }),
        ))),
      ),
    );
  }

  return () => api.destroy();
}
