import { Component, ElementRef, computed, signal, viewChild } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  formatChord,
  type GridEventSelectionChangedParams,
  type ICellEditorNgComp,
  type ICellEditorParams,
  type IGridAPI,
  type NgColDef,
  type ValueFormatterParams,
} from "@agility-workbench/angular-grid";

// SelectionSnapshot is not re-exported from the public entry; derive it from the exported
// selectionChanged event params instead of deep-importing @grid/interfaces/selection.
type SelectionSnapshot = GridEventSelectionChangedParams["snapshot"];

// Copied from apps/react-playground/helpers.ts (per porting guide: no shared helper files).
function formatDate(date: Date): string {
  if (!(date instanceof Date)) {
    console.log(date);
    date = new Date(date);
    console.log(date);
  }
  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  const dayNum = String(date.getDate()).padStart(2, "0");
  const monthName = date.toLocaleDateString("en-US", { month: "short" });
  const year = date.getFullYear();

  return `${dayName}, ${dayNum} ${monthName}, ${year}`;
}

/**
 * An Angular component cell editor: a 1–5 star picker. It receives ICellEditorParams via awbInit
 * and exposes getValue / isParsed / focus through the ICellEditorNgComp contract so the grid can
 * read the committed value synchronously. Arrow keys / number keys adjust the rating; the grid
 * handles Enter/Esc.
 */
@Component({
  standalone: true,
  template: `
    <div
      #root
      tabindex="0"
      class="star-rating-editor"
      (keydown)="onKeyDown($event)"
      style="display: flex; align-items: center; height: 100%; padding: 0 8px; gap: 2px; cursor: pointer; outline: none"
    >
      @for (n of allStars; track n) {
        <span
          (mousedown)="$event.preventDefault(); stars.set(n)"
          [style.color]="n <= stars() ? '#f5a623' : '#ccc'"
          style="font-size: 16px; line-height: 1"
        >
          ★
        </span>
      }
    </div>
  `,
})
export class StarRatingEditorComponent implements ICellEditorNgComp {
  private readonly root = viewChild.required<ElementRef<HTMLDivElement>>("root");
  readonly allStars = [1, 2, 3, 4, 5];
  readonly stars = signal(0);

  awbInit(params: ICellEditorParams): void {
    const initial = typeof params.value === "number" ? Math.round(params.value) : 0;
    this.stars.set(Math.min(5, Math.max(0, initial)));
  }

  getValue(): unknown {
    return this.stars();
  }

  isParsed(): boolean {
    return true; // commit the number directly, no valueParser
  }

  focus(): void {
    this.root().nativeElement.focus();
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      this.stars.update((s) => Math.min(5, s + 1));
      e.stopPropagation();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      this.stars.update((s) => Math.max(0, s - 1));
      e.stopPropagation();
    } else if (/^[0-5]$/.test(e.key)) {
      this.stars.set(Number(e.key));
      e.stopPropagation();
    }
  }
}

/**
 * Demonstrates the core-owned selection + keyboard navigation feature:
 * mouse select / drag, arrow / Ctrl+arrow (Excel-style block jump) / Shift+arrow,
 * Home / End, Ctrl+Home / Ctrl+End, Ctrl+A — with a live readout driven by the
 * `selectionChanged` event and `api.getSelection()`.
 *
 * Also demonstrates the grid's keyboard *surface* switches: `cellSelection` (false/"text" removes
 * the body keyboard cursor, and clipboard/editing/navigation keys with it) and
 * `headerKeyboardNavigation` (false makes the header mouse-only). The shortcut table is rendered
 * with `formatChord`, so macOS shows ⌘⇧-style chords and other platforms Ctrl+Shift+.
 *
 * The "App shortcuts" panel exercises `api.registerShortcut`: a fresh chord (Ctrl+Shift+Y) that no
 * built-in claims, and an `override: true` takeover of Ctrl+F, which beats the built-in quick
 * filter while registered and hands the chord back on dispose. The panel lists the live app
 * bindings straight from `api.getKeyboardShortcuts()`.
 */

type EmployeeRow = {
  id: number;
  name: string;
  // The rest may be empty ("") to exercise Excel-style Ctrl+Arrow block jumps.
  department: string;
  title: string;
  city: string;
  salary: number | "";
  bonus: number | "";
  rating: number | "";
  projects: number | "";
  active: string;
  joinedOn: Date;
};

const FIRST_NAMES = [
  "Ava", "Liam", "Mia", "Noah", "Emma", "Ethan", "Olivia", "Lucas", "Sophia", "Mason",
  "Isla", "James", "Amelia", "Leo", "Harper", "Ryan", "Zoe", "Kai", "Nora", "Owen",
];
const LAST_NAMES = [
  "Chen", "Patel", "Kim", "Garcia", "Nguyen", "Silva", "Khan", "Rossi", "Haas", "Ito",
  "Mbeki", "Novak", "Costa", "Reyes", "Park", "Singh", "Weber", "Lopez", "Tanaka", "Ford",
];
const DEPARTMENTS = ["Engineering", "Sales", "Marketing", "Finance", "Operations", "Support", "Legal"];
const TITLES = ["Analyst", "Associate", "Manager", "Senior", "Lead", "Director", "VP"];
const CITIES = ["New York", "Chicago", "Seattle", "Austin", "Denver", "Miami", "Boston", "Portland"];

// Deterministic PRNG so the demo data is stable across reloads (no Math.random in the grid path).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getRandomDate(start?: Date, end?: Date): Date {
  const startDate = start ? start.getTime() : Date.now() - 10 * 365 * 24 * 60 * 60 * 1000;
  const endDate = end ? end.getTime() : Date.now();

  if (startDate > endDate) {
    throw new Error("Start date must be before or equal to the end date.");
  }

  const randomTimestamp = Math.floor(Math.random() * (endDate - startDate + 1)) + startDate;
  return new Date(randomTimestamp);
}

function buildRows(count: number): EmployeeRow[] {
  const rand = mulberry32(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  // `id` and `name` are always filled (id is the row key + a stable anchor column). Every other
  // cell has a ~22% chance of being blank, so columns and rows contain irregular gaps — this is
  // what makes Ctrl+Arrow (jump across a data block) visibly different from a plain edge jump.
  const maybe = <T,>(value: T): T | "" => (rand() < 0.22 ? "" : value);
  const rows = Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    department: maybe(pick(DEPARTMENTS)) as string,
    title: maybe(pick(TITLES)) as string,
    city: maybe(pick(CITIES)) as string,
    salary: maybe(60_000 + Math.floor(rand() * 140_000)),
    bonus: maybe(Math.floor(rand() * 30_000)),
    rating: maybe(+(1 + rand() * 4).toFixed(1)),
    projects: maybe(Math.floor(rand() * 25)),
    active: maybe(rand() > 0.2 ? "Yes" : "No") as string,
    joinedOn: getRandomDate(new Date(2000, 0, 0), new Date(2026, 55, 0)),
  }));

  // Guarantee a couple of obvious, fully-blank horizontal bands and a blank vertical run so the
  // three block-jump regimes (run end / gap skip / fall-through to edge) are easy to try out.
  const blankRow = (r: EmployeeRow): EmployeeRow => ({
    ...r,
    department: "", title: "", city: "", salary: "" as const,
    bonus: "" as const, rating: "" as const, projects: "" as const, active: "",
  });
  if (rows.length > 20) {
    rows[5] = blankRow(rows[5]);
    rows[6] = blankRow(rows[6]);
    // A blank vertical run in the "salary" column across rows 10..14.
    for (let r = 10; r <= 14 && r < rows.length; r++) rows[r].salary = "";
  }
  return rows;
}

// Chords printed with formatChord, so the platform decides the spelling ("Ctrl+→" vs "⌘→").
const fmt = (chord: string) => formatChord(chord);
const SHORTCUTS: Array<[string, string]> = [
  ["Click / drag", "Select a cell / range"],
  [`${fmt("arrowleft")} ${fmt("arrowup")} ${fmt("arrowdown")} ${fmt("arrowright")}`, "Move one cell"],
  [fmt("shift+arrowright"), "Extend range by one cell"],
  [fmt("mod+arrowright"), "Jump across data block (Excel-style)"],
  [fmt("mod+shift+arrowright"), "Extend range across block"],
  [`${fmt("pageup")} / ${fmt("pagedown")}`, "Move up / down one viewport"],
  [`${fmt("home")} / ${fmt("end")}`, "Jump to first / last column"],
  [`${fmt("mod+home")} / ${fmt("mod+end")}`, "Jump to top-left / bottom-right"],
  [fmt("mod+a"), "Select all"],
  [`${fmt("arrowup")} from the top row`, "Move into the column header"],
  [`${fmt("space")} / ${fmt("enter")} in the header`, "Select column / sort"],
];

function describeSelection(sel: SelectionSnapshot | null): string {
  if (!sel || sel.kind === "none") return "Nothing selected";
  switch (sel.kind) {
    case "cell": {
      const c = sel.rangeCells?.[0];
      return c ? `Cell — row ${c.rowId}, ${c.colId}` : "Single cell";
    }
    case "range": {
      const r = sel.range!;
      const rows = r.rowEnd - r.rowStart + 1;
      const cols = r.colEnd - r.colStart + 1;
      return `Range — ${rows} × ${cols} (${sel.rangeCells?.length ?? 0} cells)`;
    }
    case "row":
      return `${sel.selectedRowIds.length} row(s) selected`;
    case "column":
      return `${sel.selectedColumnIds.length} column(s) selected`;
    default:
      return "";
  }
}

@Component({
  selector: "selection-demo",
  standalone: true,
  imports: [AwbGrid],
  template: `
    <div class="sel-toolbar">
      <div class="sel-row-count">
        <label for="row-count" style="font-size: 13px">Rows</label>
        <select id="row-count" [value]="String(rowCount())" (change)="setRowCount($event)">
          @for (n of rowCountOptions; track n) {
            <option [value]="String(n)" [selected]="n === rowCount()">{{ n }}</option>
          }
        </select>
      </div>
      <div class="sel-row-count">
        <label for="cell-selection" style="font-size: 13px">Cell selection</label>
        <select id="cell-selection" (change)="setCellSelection($event)">
          <option value="true" selected>true — full keyboard</option>
          <option value="text">"text" — native text selection</option>
          <option value="false">false — inert cells</option>
        </select>
      </div>
      <label style="font-size: 13px; display: flex; align-items: center; gap: 6px">
        <input
          type="checkbox"
          [checked]="headerKeyboardNav()"
          (change)="headerKeyboardNav.set($any($event.target).checked)"
        />
        Header keyboard nav
      </label>
      <div style="display: flex; gap: 8px">
        <button class="btn" type="button" (click)="api?.selectAll()">Select all (API)</button>
        <button class="btn" type="button" (click)="api?.clearSelection('all')">Clear</button>
        <button class="btn" type="button" (click)="api?.navigateToCorner('bottomRight')">Go bottom-right (API)</button>
        <button class="btn" type="button" (click)="api?.navigate('up', { jump: 'page', pageRows: 10 })">Move 10 rows up</button>
        <button class="btn" type="button" (click)="api?.navigate('down', { jump: 'page', pageRows: 10 })">Move 10 rows down</button>
      </div>
    </div>

    <div class="sel-main">
      <!-- min-width:0 lets this flex item shrink below its content's intrinsic width; without it,
           widening the grid (e.g. a pinned auto-group column) would stretch the whole layout. -->
      <div class="demo-grid-host" style="min-width: 0">
        <awb-grid
          [rowData]="rows()"
          [columnDefs]="columnDefs"
          rowIdKey="id"
          [rowNumbers]="true"
          [quickFilter]="true"
          [rowSelection]="true"
          [selectAllRowsOnHeaderClick]="true"
          [cellSelection]="cellSelection()"
          [headerKeyboardNavigation]="headerKeyboardNav()"
          (gridReady)="onReady($event)"
        />
      </div>

      <aside class="sel-aside">
        <section class="sel-panel">
          <h3 class="sel-panel-title">Live selection</h3>
          <div style="font-size: 13px; font-weight: 600">{{ describeSelection(selection()) }}</div>
          <div class="sel-muted">
            kind: <code>{{ selection()?.kind ?? "none" }}</code>
            · cursor: <code>{{ cursorLabel() }}</code>
          </div>
          @if (selection()?.kind === "range" && selection()?.rangeCells) {
            <div class="sel-muted">
              first cell: <code>{{ selection()?.rangeCells?.[0]?.rowId }}/{{ selection()?.rangeCells?.[0]?.colId }}</code>
            </div>
          }
        </section>

        <section class="sel-panel">
          <h3 class="sel-panel-title">Keyboard shortcuts</h3>
          <table class="sel-shortcuts">
            <tbody>
              @for (shortcut of shortcuts; track shortcut[0]) {
                <tr>
                  <td class="sel-keys">{{ shortcut[0] }}</td>
                  <td class="sel-desc">{{ shortcut[1] }}</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="sel-hint">Click a cell first to focus the grid, then use the keyboard.</p>
          <p class="sel-hint">
            Cell selection <code>false</code> / <code>"text"</code> removes the body keyboard
            cursor — navigation, clipboard, and editing keys go with it, and Tab lands the cursor
            in the header instead. Turning header keyboard nav off too leaves the grid claiming no
            navigation keys at all.
          </p>
        </section>

        <section class="sel-panel">
          <h3 class="sel-panel-title">App shortcuts</h3>
          <label style="font-size: 13px; display: flex; align-items: center; gap: 6px">
            <input type="checkbox" [checked]="approveOn()" (change)="toggleApprove($any($event.target).checked)" />
            Approve selection — {{ approveChord }} (fresh chord)
          </label>
          <label style="font-size: 13px; display: flex; align-items: center; gap: 6px; margin-top: 6px">
            <input type="checkbox" [checked]="searchOn()" (change)="toggleSearch($any($event.target).checked)" />
            App search — {{ searchChord }} (overrides quick filter)
          </label>
          <div class="sel-muted" style="margin-top: 8px">
            last fired: <code>{{ lastFired() }}</code>
          </div>
          <div class="sel-muted" data-app-shortcut-list>
            @if (appRows().length === 0) {
              no app shortcuts registered
            } @else {
              @for (row of appRows(); track row.id) {
                <div><code>{{ row.display }}</code> — {{ row.label }} <em>({{ row.scope }})</em></div>
              }
            }
          </div>
          <p class="sel-hint">
            The list reads back from <code>api.getKeyboardShortcuts()</code>. While "App search" is
            on, the chord is the app's (<em>appOverride</em> scope beats built-ins); uncheck it and
            the quick filter takes it back. Reserved chords (Tab, Escape, arrows while navigation is
            on) are refused by <code>registerShortcut</code> with an error naming the owning
            feature.
          </p>
        </section>
      </aside>
    </div>
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; height: 100%; gap: 12px; min-height: 0 }
      .sel-toolbar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap }
      .sel-row-count { display: flex; align-items: center; gap: 8px }
      .sel-main { display: flex; gap: 12px; flex: 1; min-height: 0 }
      .sel-aside { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; overflow: auto }
      .sel-panel { border: 1px solid var(--pte-frame-border-color, #ccc); border-radius: 8px; padding: 12px }
      .sel-panel-title { font-size: 14px; margin-bottom: 8px }
      .sel-muted { font-size: 12px; color: #6b7280; margin-top: 6px }
      .sel-shortcuts { font-size: 12px; border-collapse: collapse; width: 100% }
      .sel-keys { padding: 3px 8px 3px 0; white-space: nowrap; font-weight: 600 }
      .sel-desc { padding: 3px 0; color: #6b7280 }
      .sel-hint { font-size: 11px; color: #9ca3af; margin-top: 8px }
    `,
  ],
})
export class SelectionDemoComponent {
  readonly rowCount = signal(120);
  readonly rowCountOptions = [100, 120, 500, 1000];
  readonly rows = computed(() => buildRows(this.rowCount()));
  readonly selection = signal<SelectionSnapshot | null>(null);
  readonly active = signal<{ viewIdx?: number; colIdx?: number } | null>(null);
  // The keyboard-surface switches. cellSelection !== true removes the body keyboard cursor;
  // headerKeyboardNavigation false makes the header mouse-only. Both are runtime options, so the
  // wrapper reconciles them live — no grid rebuild.
  readonly cellSelection = signal<boolean | "text">(true);
  readonly headerKeyboardNav = signal(true);
  readonly headerAt = signal<number | null>(null);
  // App shortcuts (api.registerShortcut): held disposers, the rows read back from
  // api.getKeyboardShortcuts() so the panel shows the router's truth, and what fired last.
  readonly approveOn = signal(false);
  readonly searchOn = signal(false);
  readonly lastFired = signal("—");
  readonly appRows = signal<Array<{ id: string; scope: string; display: string; label?: string }>>([]);
  readonly approveChord = fmt("mod+shift+y");
  readonly searchChord = fmt("mod+f");
  private approveOff: (() => void) | null = null;
  private searchOff: (() => void) | null = null;
  readonly shortcuts = SHORTCUTS;
  readonly describeSelection = describeSelection;
  readonly String = String;

  api: IGridAPI | null = null;

  readonly columnDefs: NgColDef[] = [
    { colId: "id", key: "id", label: "ID", width: 80 },
    // Double-click (or press F2 / Enter) to edit. Enter/Tab commit, Esc cancels.
    // Default text editor.
    { colId: "name", key: "name", label: "Name", width: 150, editable: true },
    // Dropdown populated from the distinct values already in this column.
    {
      colId: "department", key: "department", label: "Department", width: 130,
      editable: true, cellEditor: "select", cellEditorParams: { values: "fromRows" },
    },
    // Dropdown from a static list.
    {
      colId: "title", key: "title", label: "Title", width: 140,
      editable: true, cellEditor: "select",
      cellEditorParams: { values: ["Engineer", "Senior Engineer", "Manager", "Director", "VP"] },
    },
    { colId: "city", key: "city", label: "City", width: 120, editable: true },
    // Numeric editor (<input type=number>) — commits a real number, no valueParser needed.
    { colId: "salary", key: "salary", label: "Salary", width: 110, editable: true, type: ColumnType.NUMBER },
    { colId: "bonus", key: "bonus", label: "Bonus", width: 100 },
    // Angular component editor: a star picker exposing getValue via ICellEditorNgComp.
    { colId: "rating", key: "rating", label: "Rating", width: 120, editable: true, type: ColumnType.NUMBER, cellEditor: StarRatingEditorComponent },
    { colId: "projects", key: "projects", label: "Projects", width: 100 },
    {
      colId: "joinedOn", key: "joinedOn", label: "Joined On", editable: true, type: ColumnType.DATE,
      valueFormatter: (params: ValueFormatterParams) => formatDate(params.value),
    },
    // Yes/No dropdown.
    {
      colId: "active", key: "active", label: "Active", width: 90,
      editable: true, cellEditor: "select", cellEditorParams: { values: ["Yes", "No"] },
    },
  ];

  onReady(api: IGridAPI): void {
    this.api = api;
    this.selection.set(api.getSelection());
    api.on("selectionChanged", (ev) => this.selection.set(ev.snapshot));
    api.on("focusChanged", (ev) => this.active.set({ viewIdx: ev.viewIdx, colIdx: ev.colIdx }));
    // The header cursor is a separate position from the body's (they are mutually exclusive).
    api.on("headerFocusChanged", (ev) => this.headerAt.set(ev.colIdx ?? null));
  }

  setRowCount(ev: Event): void {
    this.rowCount.set(Number((ev.target as HTMLSelectElement).value));
  }

  setCellSelection(ev: Event): void {
    const value = (ev.target as HTMLSelectElement).value;
    this.cellSelection.set(value === "text" ? "text" : value === "true");
  }

  private refreshAppShortcuts(): void {
    const rows = (this.api?.getKeyboardShortcuts() ?? [])
      .filter((row) => row.scope === "app" || row.scope === "appOverride")
      .map((row) => ({
        id: row.id,
        scope: row.scope as string,
        display: row.chord ? formatChord(row.chord) : "",
        label: row.label,
      }));
    this.appRows.set(rows);
  }

  toggleApprove(on: boolean): void {
    this.approveOn.set(on);
    if (on) {
      // A fresh chord: nothing built-in claims Ctrl+Shift+Y, so plain `app` scope receives it.
      this.approveOff = this.api!.registerShortcut({
        id: "approve",
        chord: "mod+shift+y",
        label: "Approve selection (app)",
        run: () => {
          const cells = this.api!.getSelection()?.rangeCells?.length ?? 0;
          this.lastFired.set(`Approve — ${cells} cell(s)`);
        },
      });
    } else {
      this.approveOff?.();
      this.approveOff = null;
    }
    this.refreshAppShortcuts();
  }

  toggleSearch(on: boolean): void {
    this.searchOn.set(on);
    if (on) {
      // Overrides the built-in quick filter: `override: true` registers ahead of the non-blocking
      // built-in scopes, so Ctrl+F is the app's while this is on and the quick filter's again the
      // moment it is disposed.
      this.searchOff = this.api!.registerShortcut({
        id: "appSearch",
        chord: "mod+f",
        override: true,
        label: "App search (overrides quick filter)",
        run: () => this.lastFired.set("App search — quick filter suppressed"),
      });
    } else {
      this.searchOff?.();
      this.searchOff = null;
    }
    this.refreshAppShortcuts();
  }

  cursorLabel(): string {
    const headerAt = this.headerAt();
    if (headerAt != null) return `header c${headerAt}`;
    const active = this.active();
    return active?.viewIdx != null ? `r${active.viewIdx}/c${active.colIdx}` : "—";
  }
}
