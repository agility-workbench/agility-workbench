import { Component, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  type IGridAPI,
  type NgColDef,
} from "@agility-workbench/angular-grid";
// ColumnState is not re-exported from the public entry; deep-import it like the React demo does.
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
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
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

@Component({
  selector: "column-state-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="cs-toolbar">
      <button class="btn" type="button" (click)="save()">Save layout</button>
      <button class="btn" type="button" (click)="restoreMerge()" [disabled]="!saved()">Restore (merge)</button>
      <button class="btn" type="button" (click)="restoreExact()" [disabled]="!saved()">Restore (exact)</button>
      <span class="cs-divider"></span>
      <button class="btn" type="button" (click)="moveSupplierFirst()">Supplier → first (order:0)</button>
      <button class="btn" type="button" (click)="pinCategoryNoOrder()">Pin category (no order)</button>
      <button class="btn" type="button" (click)="addNotesColumn()" [disabled]="notesAdded()">Add "Notes" column</button>
    </div>

    <div class="cs-status">{{ status() }}</div>

    <div class="cs-main">
      <div class="cs-grid">
        <awb-grid
          [rowData]="rows"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [rowNumbers]="true"
          (gridReady)="onReady($event)"
        />
      </div>

      <aside class="cs-aside">
        <section class="cs-card">
          <h3>Saved column state</h3>
          @if (saved(); as savedState) {
            <table class="cs-table">
              <thead>
                <tr>
                  <th>colId</th>
                  <th>order</th>
                  <th>w</th>
                  <th>pin</th>
                  <th class="cs-last">hidden</th>
                </tr>
              </thead>
              <tbody>
                @for (s of savedState; track s.colId) {
                  <tr>
                    <td class="cs-colid">{{ s.colId }}</td>
                    <td>{{ s.order }}</td>
                    <td>{{ s.widthPx != null ? round(s.widthPx) : "—" }}</td>
                    <td>{{ s.pinned ?? "—" }}</td>
                    <td class="cs-last">{{ s.hidden ? "yes" : "—" }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <div class="cs-empty">Nothing saved yet.</div>
          }
        </section>

        <section class="cs-card">
          <h3>How to try it</h3>
          <ol class="cs-steps">
            <li>Resize a column, pin one (via its header menu), hide one, drag to reorder.</li>
            <li><b>Save layout</b> — the captured state appears here.</li>
            <li>Change the columns again, then <b>Restore (merge)</b> vs <b>Restore (exact)</b>.</li>
            <li>Try <b>Add "Notes"</b> → Save → <b>Restore (exact)</b>: Notes is hidden on restore.</li>
            <li>Use the reorder buttons to see order-driven vs order-less behavior.</li>
          </ol>
        </section>
      </aside>
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
      .cs-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .cs-divider {
        width: 1px;
        align-self: stretch;
        background: #ddd;
      }
      .cs-status {
        font-size: 13px;
        color: #374151;
      }
      .cs-main {
        display: flex;
        gap: 12px;
        flex: 1;
        min-height: 0;
      }
      .cs-grid {
        flex: 1;
        min-width: 0;
        min-height: 0;
      }
      .cs-aside {
        width: 320px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow: auto;
      }
      .cs-card {
        border: 1px solid var(--pte-frame-border-color, #ccc);
        border-radius: 8px;
        padding: 12px;
      }
      .cs-card h3 {
        font-size: 14px;
        margin-bottom: 8px;
      }
      .cs-table {
        font-size: 12px;
        border-collapse: collapse;
        width: 100%;
      }
      .cs-table thead tr {
        text-align: left;
        color: #6b7280;
      }
      .cs-table th {
        padding: 2px 6px 4px 0;
      }
      .cs-table th.cs-last {
        padding: 2px 0 4px 0;
      }
      .cs-table td {
        padding: 2px 6px 2px 0;
      }
      .cs-table td.cs-last {
        padding: 2px 0;
      }
      .cs-table td.cs-colid {
        font-weight: 600;
      }
      .cs-empty {
        font-size: 12px;
        color: #9ca3af;
      }
      .cs-steps {
        font-size: 12px;
        color: #6b7280;
        margin: 0;
        padding-left: 18px;
        line-height: 1.6;
      }
    `,
  ],
})
export class ColumnStateDemoComponent {
  readonly rows = buildRows(200);
  readonly saved = signal<ColumnState[] | null>(null);
  readonly notesAdded = signal(false);
  readonly status = signal("Mutate the columns (resize / pin / hide / reorder), then Save.");

  readonly round = Math.round;

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "ID", width: 80 },
    { colId: "sku", key: "sku", label: "SKU", width: 130 },
    { colId: "name", key: "name", label: "Name", width: 180 },
    { colId: "category", key: "category", label: "Category", width: 130 },
    { colId: "price", key: "price", label: "Price", width: 110, type: ColumnType.CURRENCY },
    { colId: "stock", key: "stock", label: "Stock", width: 100, type: ColumnType.NUMBER },
    { colId: "rating", key: "rating", label: "Rating", width: 100, type: ColumnType.NUMBER },
    { colId: "supplier", key: "supplier", label: "Supplier", width: 140 },
  ];

  private api: IGridAPI | null = null;

  onReady(api: IGridAPI): void {
    this.api = api;
  }

  save(): void {
    const api = this.api;
    if (!api) return;
    const state = api.getColumnState();
    this.saved.set(state);
    this.status.set(`Saved layout of ${state.length} columns.`);
  }

  restoreMerge(): void {
    const api = this.api;
    const saved = this.saved();
    if (!api || !saved) return;
    api.applyColumnState(saved);
    this.status.set("Restored (merge) — columns not in the saved state kept their place.");
  }

  restoreExact(): void {
    const api = this.api;
    const saved = this.saved();
    if (!api || !saved) return;
    api.applyColumnState(saved, { defaultState: { hidden: true } });
    this.status.set("Restored (exact) — anything not in the saved view is now hidden.");
  }

  // Reposition "supplier" to the front using an explicit order; other columns keep their place.
  moveSupplierFirst(): void {
    const api = this.api;
    if (!api) return;
    const col = api.getColumnModel().getByColId("supplier");
    if (!col) return;
    api.applyColumnState([{ colId: "supplier", order: 0 }]);
    this.status.set("Applied a partial state { colId: 'supplier', order: 0 } — only supplier moved.");
  }

  // Pin "category" left WITHOUT an order — it changes section but is not dragged to the front by
  // the reorder step (order-less entries do not reposition).
  pinCategoryNoOrder(): void {
    const api = this.api;
    if (!api) return;
    api.applyColumnState([{ colId: "category", pinned: "left" }]);
    this.status.set("Applied { colId: 'category', pinned: 'left' } with no order — no positional jump.");
  }

  // Add a transient column at runtime so "Restore (exact)" has something new to hide.
  addNotesColumn(): void {
    const api = this.api;
    if (!api || this.notesAdded()) return;
    api.getColumnModel().addColumnDef({ colId: "notes", key: "notes", label: "Notes", width: 160 });
    api.dispatch({ type: "columnStateSet", state: api.getColumnState() }); // trigger a rebuild/repaint
    this.notesAdded.set(true);
    this.status.set("Added a transient 'Notes' column. Save now, then Restore (exact) to see it hidden.");
  }
}
