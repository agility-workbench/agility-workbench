import {
  ColumnType,
  themeDark,
  themeLight,
  type ColDef,
  type GetRowPresentation,
  type GridTheme,
  type MenuItem,
  type PaginationControl,
  type PaginationControlsOptions,
  type TooltipComponentParams,
  type TooltipMode,
} from "@grid";

import { checkbox, code, controlGroup, demoRoot, field, gridHost, h, note, select } from "../dom";
import { mountGrid, setRuntimeOptions } from "../demoGrid";
import { mulberry32, picker } from "../helpers";

/**
 * Playground for the row/cell visual-state and interaction options:
 *   Visual:      rowHover, columnHover, zebraRows, highlightActiveCell
 *   Row defaults: getRowPresentation styling, tooltip, ARIA, metadata, editability, and overrides
 *   Tooltip:      anchored-to-cell or follow-pointer positioning
 *   Interaction: cellSelection (true/false/text), rangeSelection, columnSelection, bodyContextMenu
 *   Header:      showColumnButtonsOnHover (grid-level), plus per-column showColumnMenu /
 *                columnContextMenu demonstrated on the Rating and City columns
 *   Pagination:  select/buttons page selection, visible controls and their order
 *
 * Every control updates the existing instance: runtime options through `setRuntimeOptions`, the
 * tooltip/pagination/theme slices through their renderer setters, and per-column flags by
 * re-supplying the column defs. Selection and scroll state survive each change.
 */

type PersonRow = {
  id: number;
  name: string;
  department: string;
  city: string;
  salary: number;
  rating: number;
  active: string;
  compensationReview: boolean;
};

const FIRST = ["Ava", "Liam", "Mia", "Noah", "Emma", "Ethan", "Olivia", "Lucas", "Sophia", "Mason", "Isla", "Leo"];
const LAST = ["Chen", "Patel", "Kim", "Garcia", "Nguyen", "Silva", "Khan", "Rossi", "Haas", "Ito", "Novak", "Park"];
const DEPTS = ["Engineering", "Sales", "Marketing", "Finance", "Operations", "Support"];
const CITIES = ["New York", "Chicago", "Seattle", "Austin", "Denver", "Miami", "Boston", "Portland"];

function buildRows(count: number): PersonRow[] {
  const rand = mulberry32(7);
  const pick = picker(rand);
  return Array.from({ length: count }, (_, i) => {
    const salary = 60_000 + Math.floor(rand() * 140_000);
    return {
      id: 1000 + i,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      department: pick(DEPTS),
      city: pick(CITIES),
      salary,
      rating: +(1 + rand() * 4).toFixed(1),
      active: rand() > 0.25 ? "Yes" : "No",
      // Salary is initially sorted descending, so the first page always contains examples.
      compensationReview: salary >= 175_000,
    };
  });
}

const THEME_PRESETS = [
  { id: "light", label: "Light", className: "pte-theme-light" },
  { id: "dark", label: "Dark", className: "pte-theme-dark" },
];

type PaginationLayout = "default" | "compact" | "reversed";
const PAGINATION_LAYOUTS: Record<PaginationLayout, PaginationControl[]> = {
  default: ["pageSize", "firstPage", "previousPage", "pageSelector", "nextPage", "lastPage"],
  compact: ["previousPage", "pageSelector", "nextPage"],
  reversed: ["lastPage", "nextPage", "pageSelector", "previousPage", "firstPage", "pageSize"],
};

// Custom accent colors layered on top of a preset via the semantic theme params. Each fans out to
// its --pte-* variable.
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

function compensationReviewTooltip(params: TooltipComponentParams): HTMLElement {
  const label = String(params.rowPresentation?.metadata?.reviewLabel ?? "Compensation review");
  return h("div", { style: { display: "grid", gap: "4px", maxWidth: "260px" } },
    h("strong", { text: label, style: { color: "#d97706" } }),
    h("span", { text: String(params.content ?? "") }),
  );
}

export function mountVisualStatesDemo(container: HTMLElement): () => void {
  const state = {
    rowHover: true,
    columnHover: true,
    zebraRows: true,
    highlightActiveCell: true,
    tooltipMode: "anchored" as TooltipMode,
    pageSelection: "select" as "select" | "buttons",
    showPageLabel: true,
    paginationLayout: "default" as PaginationLayout,
    maxPageButtons: 7,
    cellSelection: "true" as "true" | "false" | "text",
    rangeSelection: true,
    columnSelection: true,
    bodyMenu: "default" as "default" | "native" | "custom" | "empty",
    editTrigger: "doubleClick" as "doubleClick" | "singleClick" | "none",
    suppressKeyboardEdit: false,
    suppressTypeToEdit: false,
    moveAfterEdit: true,
    commitOnBlur: true,
    conditionalStyling: true,
    rowPresentationEnabled: true,
    reviewRowsEditable: false,
    sortConfig: true,
    buttonsOnHover: false,
    hideRatingMenu: true,
    nativeCityMenu: true,
    themeId: "light",
    customColors: false,
  };

  let lastEvent = "—";

  const host = gridHost();
  const themeWrapper = h("div", {
    class: THEME_PRESETS[0].className,
    style: { flex: "1", minHeight: "0", display: "flex" },
  }, host);
  const statusBanner = h("div", { role: "status" });
  const eventLine = h("div", { style: { fontSize: "12px", color: "#6b7280", fontFamily: "monospace" } });
  const maxButtonsSelect = select([5, 7, 9], state.maxPageButtons, value => {
    state.maxPageButtons = Number(value);
    applyPaginationControls();
  }, { disabled: state.pageSelection !== "buttons" });

  const toggle = (
    label: string,
    key: keyof typeof state,
    onChange: () => void,
    hint?: string,
  ) => field(label, checkbox(state[key] as boolean, value => {
    (state as Record<string, unknown>)[key] = value;
    onChange();
  }), { title: hint ?? "", style: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" } });

  container.appendChild(demoRoot(
    h("div", { style: { display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" } },
      controlGroup("Visual",
        toggle("rowHover", "rowHover", applyRuntime, "Highlight the row under the pointer"),
        toggle("columnHover", "columnHover", applyRuntime, "Highlight the whole column under the pointer"),
        toggle("zebraRows", "zebraRows", applyRuntime, "Alternating background on odd rows"),
        toggle("highlightActiveCell", "highlightActiveCell", applyRuntime, "Outline the focused cell inside a range"),
        field("tooltip", select(
          [
            { value: "anchored", label: "anchored" },
            { value: "follow", label: "follow pointer" },
          ],
          state.tooltipMode,
          value => {
            state.tooltipMode = value as TooltipMode;
            grid.renderer.setTooltipOptions({ mode: state.tooltipMode, showDelay: 150 });
          },
        ), { title: "Anchor tooltips to their cell or keep them beside the pointer" }),
        toggle("conditionalStyling", "conditionalStyling", () => {
          applyRuntime();
          applyColumnDefs();
        }, "getRowStyle dims inactive rows; the Salary column's cellStyle colors high/low values"),
        toggle("getRowPresentation", "rowPresentationEnabled", applyRuntime,
          "Style compensation-review rows, describe them to assistive tech, and lock editing except for the Active override"),
        toggle("review rows editable", "reviewRowsEditable", applyRuntime,
          "The exact boolean returned as getRowPresentation(...).editable for amber rows"),
        toggle("sortConfig", "sortConfig", applyColumnDefs,
          "Initial sort (Salary desc) + custom Department comparator (fixed priority order). Applied on load."),
      ),
      controlGroup("Interaction",
        field("cellSelection", select(
          [
            { value: "true", label: "true (grid)" },
            { value: "false", label: "false (inert)" },
            { value: "text", label: "text (native)" },
          ],
          state.cellSelection,
          value => {
            state.cellSelection = value as typeof state.cellSelection;
            applyRuntime();
          },
        ), {
          title: "true = grid cell selection · false = inert cells · text = native browser text"
            + " selection (like a plain HTML table)",
        }),
        toggle("rangeSelection", "rangeSelection", applyRuntime, "Allow drag / Shift+Arrow to extend a multi-cell range"),
        toggle("columnSelection", "columnSelection", applyRuntime, "Allow clicking a column header to select the column"),
        field("editTrigger", select(
          ["doubleClick", "singleClick", "none"],
          state.editTrigger,
          value => {
            state.editTrigger = value as typeof state.editTrigger;
            applyRuntime();
          },
        ), { title: "How a mouse gesture starts editing the (editable) Name column." }),
        toggle("suppressKeyboardEdit", "suppressKeyboardEdit", applyRuntime, "Disable F2 / Enter / type-to-edit (mouse trigger unaffected)"),
        toggle("suppressTypeToEdit", "suppressTypeToEdit", applyRuntime, "Disable only type-to-edit; F2 / Enter still start editing"),
        toggle("moveAfterEdit", "moveAfterEdit", applyRuntime, "After committing, Enter moves down / Tab moves right"),
        toggle("commitOnBlur", "commitOnBlur", applyRuntime, "Commit the editor when it loses focus; off keeps it open"),
        field("bodyContextMenu", select(
          [
            { value: "default", label: "default" },
            { value: "native", label: "false (native)" },
            { value: "custom", label: "custom items" },
            { value: "empty", label: "[] (none)" },
          ],
          state.bodyMenu,
          value => {
            state.bodyMenu = value as typeof state.bodyMenu;
            applyRuntime();
          },
        ), {
          title: "default = grid menu · native = browser menu · custom = grid menu + a custom item"
            + " · empty = no menu (native suppressed)",
        }),
      ),
      controlGroup("Header",
        toggle("showColumnButtonsOnHover", "buttonsOnHover", applyRuntime,
          "Reveal the header menu / filter buttons only on header hover or focus (grid-level)"),
        toggle("Rating: showColumnMenu=false", "hideRatingMenu", applyColumnDefs,
          "Hide the ⋮ menu button on the Rating column (menu still reachable via right-click)"),
        toggle("City: columnContextMenu=false", "nativeCityMenu", applyColumnDefs,
          "Right-clicking the City header shows the browser's native menu instead of the grid column menu"),
      ),
      controlGroup("Pagination",
        field("pageSelection", select(["select", "buttons"], state.pageSelection, value => {
          state.pageSelection = value as typeof state.pageSelection;
          maxButtonsSelect.disabled = state.pageSelection !== "buttons";
          applyPaginationControls();
        })),
        toggle("showPageLabel", "showPageLabel", applyPaginationControls,
          "Show or remove the visible Page label; accessible names remain"),
        field("controls", select(
          [
            { value: "default", label: "default order" },
            { value: "compact", label: "compact" },
            { value: "reversed", label: "reversed" },
          ],
          state.paginationLayout,
          value => {
            state.paginationLayout = value as PaginationLayout;
            applyPaginationControls();
          },
        ), { title: "Presets demonstrate hiding and reordering individual pagination controls" }),
        field("maxPageButtons", maxButtonsSelect),
      ),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
        field("Theme", select(
          THEME_PRESETS.map(preset => ({ value: preset.id, label: preset.label })),
          state.themeId,
          value => {
            state.themeId = value;
            applyTheme();
          },
        )),
        toggle("Custom colors", "customColors", applyTheme, "Apply the semantic theme params (orange accent)"),
      ),
    ),
    statusBanner,
    note(
      "Hover rows and columns to see the highlights. Change ", code("tooltip.mode"),
      ", then hover the Name cells or header to compare cell-anchored and pointer-following tooltips."
      + " Amber rows use ", code("getRowPresentation"),
      ": hover most cells for a row-default component that follows the pointer; Name overrides its"
      + " content, Salary overrides it to an anchored-right tooltip, and Active opts out. Toggle ",
      code("review rows editable"), " to change the exact boolean returned by ",
      code("getRowPresentation"), ". When false, the gated Name cells show a red underline, refuse"
      + " editing, and omit Cut / Paste; when true they edit normally. Active remains editable"
      + " because it sets ", code("inheritRowPresentation.editable: false"),
      ". Click a cell, then Shift+Click (or Shift+Arrow) to make a range — with ",
      code("highlightActiveCell"), " on, the focused cell keeps a distinct outline inside the"
      + " selection. Use the Interaction controls to disable range dragging or column-header"
      + " selection, or set ", code("cellSelection"), " to ", code("text"),
      " to revert to a plain HTML table. Right-click the body to try the ", code("bodyContextMenu"),
      " modes. Under Header, turn on ", code("showColumnButtonsOnHover"),
      " and hover a header to reveal its ⋮ / filter buttons; the Rating column hides its ⋮ button and"
      + " the City header opens the browser's native menu on right-click. The Pagination controls"
      + " switch the page picker and demonstrate reordered or omitted footer controls.",
    ),
    themeWrapper,
    eventLine,
  ));

  const grid = mountGrid(host, {
    rowData: buildRows(200),
    columnDefs: buildColumnDefs(),
    rowIdKey: "id",
    pagination: true,
    pageSize: 10,
    pageSizes: [10, 25, 50],
    paginationControls: paginationControls(),
    rowHover: state.rowHover,
    columnHover: state.columnHover,
    zebraRows: state.zebraRows,
    highlightActiveCell: state.highlightActiveCell,
    tooltip: { mode: state.tooltipMode, showDelay: 150 },
    getRowStyle: rowStyle(),
    getRowPresentation: rowPresentation(),
    cellSelection: true,
    rangeSelection: true,
    columnSelection: true,
    columnPanel: true,
    onCellClicked: p =>
      setLastEvent(`onCellClicked → row ${p.rowId}, col "${p.colId}" = ${JSON.stringify(p.value)}`),
    onSortChanged: () => setLastEvent("onSortChanged"),
    onSelectionChanged: p => setLastEvent(`onSelectionChanged → ${p.snapshot.kind}`),
    onCellValueChanged: p =>
      setLastEvent(`onCellValueChanged → row ${p.rowId}, col "${p.colId}" = ${JSON.stringify(p.value)}`),
  });

  renderBanner();
  renderEvent();

  function buildColumnDefs(): ColDef[] {
    return [
      { colId: "id", key: "id", label: "ID", width: 80 },
      // Editable → the body context menu gains Cut / Paste (right-click a Name cell).
      {
        colId: "name", key: "name", label: "Name — row gated", width: 190, editable: true, filter: true,
        headerTooltip: "Employee name — this header uses the selected tooltip positioning mode.",
        // On review rows this replaces only row tooltip content; the row component/options remain.
        tooltipValueGetter: p => `${p.value} — hover within the cell to compare tooltip positioning.`,
        // Make the behavioral field visible: locked review cells get a red underline + blocked cursor.
        cellStyle: p => p.rowPresentation?.editable === false
          ? { cursor: "not-allowed", boxShadow: "inset 0 -3px 0 #dc2626" }
          : { cursor: "text" },
      },
      {
        colId: "department", key: "department", label: "Department", width: 140, filter: true,
        // Custom comparator: sort by a fixed department priority rather than alphabetically.
        comparator: state.sortConfig
          ? (a: unknown, b: unknown) => DEPTS.indexOf(String(a)) - DEPTS.indexOf(String(b))
          : undefined,
      },
      // columnContextMenu: false → right-clicking this header shows the browser's native menu.
      {
        colId: "city", key: "city", label: "City", width: 130, filter: true,
        columnContextMenu: !state.nativeCityMenu,
      },
      {
        colId: "salary", key: "salary", label: "Salary", width: 120, type: ColumnType.NUMBER,
        // Initial sort: Salary descending on first load. NOTE: the initial sort seeds once at first
        // column setup, so toggling sortConfig afterwards only affects the comparator.
        sort: state.sortConfig ? "desc" : undefined,
        // cellStyle: color high salaries green, low ones muted (function of the cell value).
        cellStyle: state.conditionalStyling
          ? p => ({
            color: Number(p.value) >= 150_000 ? "#16a34a" : "#9ca3af",
            fontWeight: Number(p.value) >= 150_000 ? "600" : "400",
          })
          : undefined,
        // This column overrides row follow-mode while retaining row content and component.
        tooltipOptions: { mode: "anchored", placement: "right" },
      },
      // showColumnMenu: false → the ⋮ button is hidden on this header (menu still via right-click).
      {
        colId: "rating", key: "rating", label: "Rating", width: 100, type: ColumnType.NUMBER,
        showColumnMenu: !state.hideRatingMenu,
      },
      {
        colId: "active", key: "active", label: "Active — override", width: 145, editable: true,
        cellEditor: "select", cellEditorParams: { values: ["Yes", "No"] },
        headerTooltip: "Explicit exception: this column remains editable on locked review rows.",
        // Deliberate exception: no row tooltip, and row editable:false does not veto this column.
        inheritRowPresentation: { tooltip: false, editable: false },
      },
    ];
  }

  /** getRowStyle: subtly dim inactive employees (active === "No"). */
  function rowStyle() {
    return state.conditionalStyling
      ? (p: { data: any }) => (p.data.active === "No" ? { opacity: "0.55" } : undefined)
      : undefined;
  }

  function rowPresentation(): GetRowPresentation | undefined {
    if (!state.rowPresentationEnabled) return undefined;
    const editable = state.reviewRowsEditable;
    return ({ data }) => {
      const row = data as PersonRow;
      if (!row.compensationReview) return undefined;
      const editabilityLabel = editable
        ? "editable in columns that opt into editing"
        : "read-only except for column overrides";
      return {
        rowClass: "vs-compensation-review-row",
        rowStyle: { boxShadow: "inset 3px 0 0 #f59e0b" },
        cellClass: "vs-compensation-review-cell",
        cellStyle: { backgroundColor: "rgba(245, 158, 11, 0.14)" },
        editable,
        tooltip: {
          content: `${row.name} is awaiting compensation review. This row is ${editabilityLabel}.`,
          component: compensationReviewTooltip,
          options: { mode: "follow", placement: "top", interactive: false, escapeRootClip: true },
        },
        accessibility: {
          description: `${row.name} is awaiting compensation review and is ${editabilityLabel}.`,
          busy: false,
        },
        metadata: {
          status: "review",
          reviewLabel: "Compensation review",
          editable,
        },
      };
    };
  }

  /** Map the body-menu control onto bodyContextMenu's boolean | getter shape. */
  function bodyContextMenu(): boolean | ((p: { items: MenuItem[] }) => MenuItem[]) {
    switch (state.bodyMenu) {
      case "native": return false; // browser's native menu
      case "empty": return () => []; // grid owns it, shows nothing
      case "custom": // defaults + a custom item
        return ({ items }) => [
          ...items,
          { isSeparator: true },
          { id: "hello", label: "Say hello", onClick: () => window.alert("Hello from a custom item!") },
        ];
      default: return true; // default grid menu
    }
  }

  function applyRuntime(): void {
    setRuntimeOptions(grid, {
      rowHover: state.rowHover,
      columnHover: state.columnHover,
      zebraRows: state.zebraRows,
      highlightActiveCell: state.highlightActiveCell,
      cellSelection: state.cellSelection === "text" ? "text" : state.cellSelection === "true",
      rangeSelection: state.rangeSelection,
      columnSelection: state.columnSelection,
      showColumnButtonsOnHover: state.buttonsOnHover,
      bodyContextMenu: bodyContextMenu(),
      editTrigger: state.editTrigger,
      suppressKeyboardEdit: state.suppressKeyboardEdit,
      suppressTypeToEdit: state.suppressTypeToEdit,
      moveAfterEdit: state.moveAfterEdit,
      commitOnBlur: state.commitOnBlur,
      getRowStyle: rowStyle(),
      getRowPresentation: rowPresentation(),
    });
    grid.api.refreshRowPresentation();
    renderBanner();
  }

  function applyColumnDefs(): void {
    grid.core.setColumnDefsFromProps(buildColumnDefs());
  }

  function paginationControls(): PaginationControlsOptions {
    return {
      pageSelection: state.pageSelection,
      showPageLabel: state.showPageLabel,
      controls: PAGINATION_LAYOUTS[state.paginationLayout],
      maxPageButtons: state.maxPageButtons,
    };
  }

  function applyPaginationControls(): void {
    grid.renderer.setPaginationControls(paginationControls());
  }

  function applyTheme(): void {
    const preset = THEME_PRESETS.find(p => p.id === state.themeId) ?? THEME_PRESETS[0];
    themeWrapper.className = preset.className;
    let theme: GridTheme | undefined;
    if (state.customColors) {
      const base = state.themeId === "dark" ? themeDark : themeLight;
      theme = base.withParams(state.themeId === "dark" ? CUSTOM_PARAMS_DARK : CUSTOM_PARAMS);
    }
    grid.renderer.setTheme(theme);
  }

  function setLastEvent(text: string): void {
    lastEvent = text;
    renderEvent();
  }

  function renderEvent(): void {
    eventLine.replaceChildren(
      "Last event: ",
      h("span", { text: lastEvent, style: { color: "var(--pte-text-color, #111)" } }),
    );
  }

  function renderBanner(): void {
    const locked = state.rowPresentationEnabled && !state.reviewRowsEditable;
    Object.assign(statusBanner.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "8px 12px",
      border: `1px solid ${locked ? "#dc2626" : "#16a34a"}`,
      borderRadius: "8px",
      background: locked ? "rgba(220, 38, 38, 0.08)" : "rgba(22, 163, 74, 0.08)",
      fontSize: "13px",
    });
    statusBanner.replaceChildren(
      h("strong", { text: "Amber review rows:" }),
      h("strong", {
        text: !state.rowPresentationEnabled
          ? "ROW PRESENTATION OFF — EDITABLE"
          : state.reviewRowsEditable ? "EDITABLE" : "READ-ONLY",
        style: { color: locked ? "#dc2626" : "#16a34a" },
      }),
      h("span", null, "Try ", h("strong", { text: "Name — row gated" }), ". ",
        h("strong", { text: "Active — override" }),
        " remains editable in either state because that column opts out of the row gate."),
    );
  }

  return () => grid.destroy();
}
