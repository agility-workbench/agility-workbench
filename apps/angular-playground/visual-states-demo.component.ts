import { Component, computed, input, output, signal } from "@angular/core";
import {
  AwbGrid,
  ColumnType,
  themeLight,
  themeDark,
  type BodyMenuContext,
  type CellValueChangedParams,
  type GridEventCellClickedParams,
  type GridEventSelectionChangedParams,
  type GridTheme,
  type NgColDef,
  type NgMenuItem,
  type PaginationControl,
  type PaginationControlsOptions,
  type RowClassParams,
} from "@agility-workbench/angular-grid";

/**
 * Playground for the row/cell visual-state and interaction options:
 *   Visual:      rowHover, columnHover, zebraRows, highlightActiveCell
 *   Interaction: cellSelection (true/false/text), rangeSelection, columnSelection, bodyContextMenu
 *   Header:      showColumnButtonsOnHover (grid-level), plus per-column showColumnMenu /
 *                columnContextMenu demonstrated on the Rating and City columns
 *   Pagination:  select/buttons page selection, visible controls and their order
 *
 * Toggle each independently, in light or dark, and optionally apply custom colors through the
 * semantic theme params (activeCellBorderColor / rowAltBackgroundColor / columnHoverColor) to
 * confirm they feed the same CSS variables. The Name column is editable, so the body context menu
 * gains Cut / Paste when a Name cell is in the selection.
 */

type PersonRow = {
  id: number;
  name: string;
  department: string;
  city: string;
  salary: number;
  rating: number;
  active: string;
};

const FIRST = ["Ava", "Liam", "Mia", "Noah", "Emma", "Ethan", "Olivia", "Lucas", "Sophia", "Mason", "Isla", "Leo"];
const LAST = ["Chen", "Patel", "Kim", "Garcia", "Nguyen", "Silva", "Khan", "Rossi", "Haas", "Ito", "Novak", "Park"];
const DEPTS = ["Engineering", "Sales", "Marketing", "Finance", "Operations", "Support"];
const CITIES = ["New York", "Chicago", "Seattle", "Austin", "Denver", "Miami", "Boston", "Portland"];

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

function buildRows(count: number): PersonRow[] {
  const rand = mulberry32(7);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  return Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    department: pick(DEPTS),
    city: pick(CITIES),
    salary: 60_000 + Math.floor(rand() * 140_000),
    rating: +(1 + rand() * 4).toFixed(1),
    active: rand() > 0.25 ? "Yes" : "No",
  }));
}

const themePresets = [
  { id: "light", label: "Light", className: "pte-theme-light" },
  { id: "dark", label: "Dark", className: "pte-theme-dark" },
];

type PaginationLayout = "default" | "compact" | "reversed";
const PAGINATION_LAYOUTS: Record<PaginationLayout, PaginationControl[]> = {
  default: ["pageSize", "firstPage", "previousPage", "pageSelector", "nextPage", "lastPage"],
  compact: ["previousPage", "pageSelector", "nextPage"],
  reversed: ["lastPage", "nextPage", "pageSelector", "previousPage", "firstPage", "pageSize"],
};

// Custom accent colors layered on top of a preset via the semantic theme params added for these
// features. Each fans out to its --pte-* variable.
const CUSTOM_PARAMS = {
  activeCellBorderColor: "#f97316", // orange active-cell outline
  rowAltBackgroundColor: "#fff7ed", // warm zebra stripe (light)
  columnHoverColor: "#ffedd5", // warm column hover (light)
};
const CUSTOM_PARAMS_DARK = {
  activeCellBorderColor: "#fb923c",
  rowAltBackgroundColor: "#20160c",
  columnHoverColor: "#2a1c0e",
};

/** Checkbox toggle helper, used only by this demo. */
@Component({
  selector: "vs-toggle",
  standalone: true,
  template: `
    <label
      style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer"
      [title]="hint() ?? ''"
    >
      <input type="checkbox" [checked]="checked()" (change)="toggled.emit($any($event.target).checked)" />
      {{ label() }}
    </label>
  `,
})
export class VsToggleComponent {
  readonly label = input.required<string>();
  readonly checked = input.required<boolean>();
  readonly hint = input<string>();
  readonly toggled = output<boolean>();
}

@Component({
  selector: "visual-states-demo",
  standalone: true,
  imports: [AwbGrid, VsToggleComponent],
  template: `
    <div class="vs-controls">
      <div class="vs-group">
        <strong class="vs-group-title">Visual</strong>
        <vs-toggle label="rowHover" [checked]="rowHover()" (toggled)="rowHover.set($event)" hint="Highlight the row under the pointer" />
        <vs-toggle label="columnHover" [checked]="columnHover()" (toggled)="columnHover.set($event)" hint="Highlight the whole column under the pointer" />
        <vs-toggle label="zebraRows" [checked]="zebraRows()" (toggled)="zebraRows.set($event)" hint="Alternating background on odd rows" />
        <vs-toggle label="highlightActiveCell" [checked]="highlightActiveCell()" (toggled)="highlightActiveCell.set($event)" hint="Outline the focused cell inside a range" />
        <vs-toggle label="conditionalStyling" [checked]="conditionalStyling()" (toggled)="conditionalStyling.set($event)" hint="getRowStyle dims inactive rows; the Salary column's cellStyle colors high/low values" />
        <vs-toggle label="sortConfig" [checked]="sortConfig()" (toggled)="sortConfig.set($event)" hint="Initial sort (Salary desc) + custom Department comparator (fixed priority order). Applied on load." />
      </div>

      <div class="vs-group">
        <strong class="vs-group-title">Interaction</strong>
        <label class="vs-select"
          title="true = grid cell selection · false = inert cells · text = native browser text selection (like a plain HTML table)">
          cellSelection
          <select [value]="cellSelection()" (change)="setCellSelection($event)">
            <option value="true">true (grid)</option>
            <option value="false">false (inert)</option>
            <option value="text">text (native)</option>
          </select>
        </label>
        <vs-toggle label="rangeSelection" [checked]="rangeSelection()" (toggled)="rangeSelection.set($event)" hint="Allow drag / Shift+Arrow to extend a multi-cell range" />
        <vs-toggle label="columnSelection" [checked]="columnSelection()" (toggled)="columnSelection.set($event)" hint="Allow clicking a column header to select the column" />
        <label class="vs-select"
          title="How a mouse gesture starts editing the (editable) Name column. Keyboard triggers are governed by suppressKeyboardEdit.">
          editTrigger
          <select [value]="editTrigger()" (change)="setEditTrigger($event)">
            <option value="doubleClick">doubleClick</option>
            <option value="singleClick">singleClick</option>
            <option value="none">none</option>
          </select>
        </label>
        <vs-toggle label="suppressKeyboardEdit" [checked]="suppressKeyboardEdit()" (toggled)="suppressKeyboardEdit.set($event)" hint="Disable F2 / Enter / type-to-edit (mouse trigger unaffected)" />
        <vs-toggle label="suppressTypeToEdit" [checked]="suppressTypeToEdit()" (toggled)="suppressTypeToEdit.set($event)" hint="Disable only type-to-edit; F2 / Enter still start editing" />
        <vs-toggle label="moveAfterEdit" [checked]="moveAfterEdit()" (toggled)="moveAfterEdit.set($event)" hint="After committing, Enter moves down / Tab moves right (edit the Name column to try)" />
        <vs-toggle label="commitOnBlur" [checked]="commitOnBlur()" (toggled)="commitOnBlur.set($event)" hint="Commit the editor when it loses focus; off keeps it open" />
        <label class="vs-select"
          title="default = grid menu · native = browser menu · custom = grid menu + a custom item · empty = no menu (native suppressed)">
          bodyContextMenu
          <select [value]="bodyMenu()" (change)="setBodyMenu($event)">
            <option value="default">default</option>
            <option value="native">false (native)</option>
            <option value="custom">custom items</option>
            <option value="empty">[] (none)</option>
          </select>
        </label>
      </div>

      <div class="vs-group">
        <strong class="vs-group-title">Header</strong>
        <vs-toggle label="showColumnButtonsOnHover" [checked]="buttonsOnHover()" (toggled)="buttonsOnHover.set($event)" hint="Reveal the header menu / filter buttons only on header hover or focus (grid-level)" />
        <vs-toggle label="Rating: showColumnMenu=false" [checked]="hideRatingMenu()" (toggled)="hideRatingMenu.set($event)" hint="Hide the ⋮ menu button on the Rating column (menu still reachable via right-click)" />
        <vs-toggle label="City: columnContextMenu=false" [checked]="nativeCityMenu()" (toggled)="nativeCityMenu.set($event)" hint="Right-clicking the City header shows the browser's native menu instead of the grid column menu" />
      </div>

      <div class="vs-group">
        <strong class="vs-group-title">Pagination</strong>
        <label class="vs-select">
          pageSelection
          <select [value]="pageSelection()" (change)="setPageSelection($event)">
            <option value="select">select</option>
            <option value="buttons">buttons</option>
          </select>
        </label>
        <vs-toggle label="showPageLabel" [checked]="showPageLabel()" (toggled)="showPageLabel.set($event)" hint="Show or remove the visible Page label; accessible names remain" />
        <label class="vs-select" title="Presets demonstrate hiding and reordering individual pagination controls">
          controls
          <select [value]="paginationLayout()" (change)="setPaginationLayout($event)">
            <option value="default">default order</option>
            <option value="compact">compact</option>
            <option value="reversed">reversed</option>
          </select>
        </label>
        <label class="vs-select">
          maxPageButtons
          <select [value]="maxPageButtons()" (change)="setMaxPageButtons($event)" [disabled]="pageSelection() !== 'buttons'">
            <option [value]="5">5</option>
            <option [value]="7">7</option>
            <option [value]="9">9</option>
          </select>
        </label>
      </div>

      <div class="vs-theme-picker">
        <label for="vs-theme" style="font-size: 13px">Theme</label>
        <select id="vs-theme" [value]="themeId()" (change)="setThemeId($event)">
          @for (t of themePresets; track t.id) {
            <option [value]="t.id">{{ t.label }}</option>
          }
        </select>
        <vs-toggle label="Custom colors" [checked]="customColors()" (toggled)="customColors.set($event)" hint="Apply the new semantic theme params (orange accent)" />
      </div>
    </div>

    <p class="vs-blurb">
      Hover rows and columns to see the highlights. Click a cell, then Shift+Click (or Shift+Arrow) to
      make a range — with <code>highlightActiveCell</code> on, the focused cell keeps a distinct outline
      inside the selection. Use the <strong>Interaction</strong> controls to disable range dragging or
      column-header selection, or set <code>cellSelection</code> to <code>text</code> to revert to a plain
      HTML table where you can drag to select and copy cell text. Right-click the body to try the
      <code>bodyContextMenu</code> modes (default / native / custom items / none) — with a Name cell
      selected the menu also shows Cut / Paste (Name is editable). Under <strong>Header</strong>, turn on
      <code>showColumnButtonsOnHover</code> and hover a header to reveal its ⋮ / filter buttons; the
      Rating column hides its ⋮ button and the City header opens the browser's native menu on
      right-click. The <strong>Pagination</strong> controls switch the page picker and demonstrate
      reordered or omitted footer controls. Toggle <code>Custom colors</code> to recolor these states
      via theme params.
    </p>

    <!-- Runtime options update the existing grid instance so selection and scroll state survive. -->
    <div
      class="demo-grid-host"
      [class.pte-theme-light]="activePreset().id === 'light'"
      [class.pte-theme-dark]="activePreset().id === 'dark'"
    >
      <awb-grid
        [rowData]="rows"
        [columnDefs]="columnDefs()"
        rowIdKey="id"
        [pagination]="true"
        [pageSize]="10"
        [pageSizes]="[10, 25, 50]"
        [paginationControls]="paginationControls()"
        [rowHover]="rowHover()"
        [columnHover]="columnHover()"
        [zebraRows]="zebraRows()"
        [highlightActiveCell]="highlightActiveCell()"
        [getRowStyle]="getRowStyle()"
        (cellClicked)="onCellClicked($event)"
        (sortChanged)="lastEvent.set('onSortChanged')"
        (selectionChanged)="onSelectionChanged($event)"
        (cellValueChanged)="onCellValueChanged($event)"
        [cellSelection]="cellSelectionValue()"
        [rangeSelection]="rangeSelection()"
        [columnSelection]="columnSelection()"
        [editTrigger]="editTrigger()"
        [suppressKeyboardEdit]="suppressKeyboardEdit()"
        [suppressTypeToEdit]="suppressTypeToEdit()"
        [moveAfterEdit]="moveAfterEdit()"
        [commitOnBlur]="commitOnBlur()"
        [bodyContextMenu]="bodyContextMenu()"
        [showColumnButtonsOnHover]="buttonsOnHover()"
        [theme]="theme()"
        [columnPanel]="true"
      />
    </div>

    <div class="vs-event-log">
      Last event: <span style="color: var(--pte-text-color, #111)">{{ lastEvent() }}</span>
    </div>
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; height: 100%; gap: 12px; min-height: 0 }
      .vs-controls { display: flex; align-items: center; gap: 20px; flex-wrap: wrap }
      .vs-group { display: flex; align-items: center; gap: 14px; padding: 6px 12px; border: 1px solid var(--pte-frame-border-color, #ccc); border-radius: 8px }
      .vs-group-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: #6b7280 }
      .vs-select { display: flex; align-items: center; gap: 6px; font-size: 13px }
      .vs-theme-picker { display: flex; align-items: center; gap: 8px }
      .vs-blurb { font-size: 12px; color: #6b7280; margin: 0 }
      .vs-event-log { font-size: 12px; color: #6b7280; font-family: monospace }
    `,
  ],
})
export class VisualStatesDemoComponent {
  readonly rows = buildRows(200);
  readonly themePresets = themePresets;

  readonly rowHover = signal(true);
  readonly columnHover = signal(true);
  readonly zebraRows = signal(true);
  readonly highlightActiveCell = signal(true);
  readonly pageSelection = signal<"select" | "buttons">("select");
  readonly showPageLabel = signal(true);
  readonly paginationLayout = signal<PaginationLayout>("default");
  readonly maxPageButtons = signal(7);
  readonly paginationControls = computed<PaginationControlsOptions>(() => ({
    pageSelection: this.pageSelection(),
    showPageLabel: this.showPageLabel(),
    controls: PAGINATION_LAYOUTS[this.paginationLayout()],
    maxPageButtons: this.maxPageButtons(),
  }));

  // Interaction gating (defaults preserve today's behavior).
  readonly cellSelection = signal<"true" | "false" | "text">("true");
  readonly rangeSelection = signal(true);
  readonly columnSelection = signal(true);
  readonly bodyMenu = signal<"default" | "native" | "custom" | "empty">("default");
  readonly editTrigger = signal<"doubleClick" | "singleClick" | "none">("doubleClick");
  readonly suppressKeyboardEdit = signal(false);
  readonly suppressTypeToEdit = signal(false);
  readonly moveAfterEdit = signal(true);
  readonly commitOnBlur = signal(true);

  // Conditional styling (getRowStyle + per-column cellStyle/cellClass).
  readonly conditionalStyling = signal(true);

  // Sort config: an initial sort (Salary desc) + a custom Department comparator (by a fixed order).
  // NOTE: initial sort seeds ONCE at first column setup, so toggling it needs a grid remount (key).
  readonly sortConfig = signal(true);

  // Event-callback readout: shows the most recent grid event (cellClicked / sortChanged / …).
  readonly lastEvent = signal<string>("—");

  // Header / column-menu options.
  readonly buttonsOnHover = signal(false);
  // Per-column flags demonstrated on specific columns: hide the menu (⋮) button on "Rating", and
  // disable the right-click column menu on "City" (its header falls back to the native menu).
  readonly hideRatingMenu = signal(true);
  readonly nativeCityMenu = signal(true);

  readonly themeId = signal(themePresets[0].id);
  readonly customColors = signal(false);

  readonly activePreset = computed(
    () => themePresets.find((t) => t.id === this.themeId()) ?? themePresets[0],
  );

  // Map the string control to the option's boolean | "text" value.
  readonly cellSelectionValue = computed<boolean | "text">(() =>
    this.cellSelection() === "text" ? "text" : this.cellSelection() === "true",
  );

  // Map the body-menu control onto bodyContextMenu's boolean | getter shape.
  readonly bodyContextMenu = computed<
    boolean | ((p: { ctx: BodyMenuContext; items: NgMenuItem[] }) => NgMenuItem[])
  >(() => {
    switch (this.bodyMenu()) {
      case "native": return false;                                    // browser's native menu
      case "empty": return () => [];                                  // grid owns it, shows nothing
      case "custom":                                                  // defaults + a custom item
        return ({ items }: { items: NgMenuItem[] }) => [
          ...items,
          { isSeparator: true },
          { id: "hello", label: "Say hello", onClick: () => window.alert("Hello from a custom item!") },
        ];
      default: return true;                                           // default grid menu
    }
  });

  readonly theme = computed<GridTheme | undefined>(() => {
    if (!this.customColors()) return undefined;
    const base = this.themeId() === "dark" ? themeDark : themeLight;
    return base.withParams(this.themeId() === "dark" ? CUSTOM_PARAMS_DARK : CUSTOM_PARAMS);
  });

  // getRowStyle: subtly dim inactive employees (active === "No").
  readonly getRowStyle = computed(() =>
    this.conditionalStyling()
      ? (p: RowClassParams) => ((p.data as PersonRow).active === "No" ? { opacity: "0.55" } : undefined)
      : undefined,
  );

  readonly columnDefs = computed<NgColDef[]>(() => [
    { colId: "id", key: "id", label: "ID", width: 80 },
    // Editable → the body context menu gains Cut / Paste (right-click a Name cell).
    { colId: "name", key: "name", label: "Name", width: 160, editable: true, filter: true },
    {
      colId: "department", key: "department", label: "Department", width: 140, filter: true,
      // Custom comparator: sort by a fixed department priority rather than alphabetically.
      comparator: this.sortConfig()
        ? (a: string, b: string) => DEPTS.indexOf(a) - DEPTS.indexOf(b)
        : undefined,
    },
    // columnContextMenu: false → right-clicking this header shows the browser's native menu.
    { colId: "city", key: "city", label: "City", width: 130, filter: true, columnContextMenu: !this.nativeCityMenu() },
    {
      colId: "salary", key: "salary", label: "Salary", width: 120, type: ColumnType.NUMBER,
      // Initial sort: Salary descending on first load.
      sort: this.sortConfig() ? "desc" : undefined,
      // cellStyle: color high salaries green, low ones muted (function of the cell value).
      cellStyle: this.conditionalStyling()
        ? (p: { value: number }) => ({ color: p.value >= 150_000 ? "#16a34a" : "#9ca3af", fontWeight: p.value >= 150_000 ? "600" : "400" })
        : undefined,
    },
    // showColumnMenu: false → the ⋮ button is hidden on this header (menu still via right-click).
    { colId: "rating", key: "rating", label: "Rating", width: 100, type: ColumnType.NUMBER, showColumnMenu: !this.hideRatingMenu() },
    { colId: "active", key: "active", label: "Active", width: 90 },
  ]);

  onCellClicked(p: GridEventCellClickedParams): void {
    this.lastEvent.set(`onCellClicked → row ${String(p.rowId)}, col "${String(p.colId)}" = ${JSON.stringify(p.value)}`);
  }

  onSelectionChanged(p: GridEventSelectionChangedParams): void {
    this.lastEvent.set(`onSelectionChanged → ${p.snapshot.kind}`);
  }

  onCellValueChanged(p: CellValueChangedParams): void {
    this.lastEvent.set(`onCellValueChanged → row ${String(p.rowId)}, col "${String(p.colId)}" = ${JSON.stringify(p.value)}`);
  }

  setCellSelection(ev: Event): void {
    this.cellSelection.set((ev.target as HTMLSelectElement).value as "true" | "false" | "text");
  }

  setEditTrigger(ev: Event): void {
    this.editTrigger.set((ev.target as HTMLSelectElement).value as "doubleClick" | "singleClick" | "none");
  }

  setBodyMenu(ev: Event): void {
    this.bodyMenu.set((ev.target as HTMLSelectElement).value as "default" | "native" | "custom" | "empty");
  }

  setPageSelection(ev: Event): void {
    this.pageSelection.set((ev.target as HTMLSelectElement).value as "select" | "buttons");
  }

  setPaginationLayout(ev: Event): void {
    this.paginationLayout.set((ev.target as HTMLSelectElement).value as PaginationLayout);
  }

  setMaxPageButtons(ev: Event): void {
    this.maxPageButtons.set(Number((ev.target as HTMLSelectElement).value));
  }

  setThemeId(ev: Event): void {
    this.themeId.set((ev.target as HTMLSelectElement).value);
  }
}
