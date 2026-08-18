import { ColumnType, createGrid, themeDark, type ColDef, type GridTheme, type IGridAPI } from "@grid";

import { h, select } from "../dom";

type ProjectRow = {
  id: string;
  project: string;
  team: string;
  stage: "Shipping" | "Building" | "Review" | "Queued";
  priority: "Critical" | "High" | "Normal";
  progress: number;
  budget: number;
  launch: string;
};

const TEAMS = ["Orbit", "Nova", "Pulse", "Atlas"];
const STAGES: ProjectRow["stage"][] = ["Shipping", "Building", "Review", "Queued"];
const PRIORITIES: ProjectRow["priority"][] = ["Critical", "High", "Normal"];

const ROWS: ProjectRow[] = Array.from({ length: 48 }, (_, index) => ({
  id: `PX-${String(index + 1).padStart(3, "0")}`,
  project: ["Aurora Console", "Signal Engine", "Vector Mobile", "Prism Billing", "Relay API", "Zenith Search"][index % 6],
  team: TEAMS[index % TEAMS.length],
  stage: STAGES[index % STAGES.length],
  priority: PRIORITIES[index % PRIORITIES.length],
  progress: 18 + ((index * 17) % 81),
  budget: 42_000 + ((index * 13_700) % 310_000),
  launch: `2026-${String(9 + (index % 4)).padStart(2, "0")}-${String(4 + (index * 3) % 24).padStart(2, "0")}`,
}));

const PINNED_ROW: ProjectRow = {
  id: "PORTFOLIO",
  project: "Portfolio target",
  team: "All crews",
  stage: "Shipping",
  priority: "Critical",
  progress: 82,
  budget: 2_400_000,
  launch: "2026-12-18",
};

function makeTheme(rowHeight: number): GridTheme {
  return themeDark.withParams({
    accentColor: "#22d3ee",
    backgroundColor: "#070b18",
    headerBackgroundColor: "#151d3d",
    textColor: "#f1f5ff",
    mutedTextColor: "#93a4c7",
    borderColor: "#334776",
    rowHoverColor: "#182852",
    columnHoverColor: "rgba(124, 92, 255, 0.10)",
    rowAltBackgroundColor: "#0c142a",
    activeCellBorderColor: "#fbbf24",
    selectedBackgroundColor: "#283b72",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: 13,
    headerFontWeight: 750,
    rowHeight,
    cellHorizontalPadding: 16,
    iconColor: "#a5b4fc",
    scrollbarThumbColor: "#52659d",
    aggregateBackgroundColor: "#111d3c",
    sparklineStrokeColor: "#22d3ee",
    sparklineBarColor: "#8b5cf6",
    vars: {
      "--pte-row-border-size": "2px",
      "--pte-frame-border-color": "#8b5cf6",
      "--pte-resize-handle-color": "#52659d",
      "--pte-selected-resize-handle-color": "#fbbf24",
      "--pte-group-row-bg-color": "#111d3c",
      "--pte-input-bg-color": "#0b1228",
      "--pte-control-border-color": "#465b91",
      "--pte-overlay-border-color": "#52659d",
      "--pte-surface-bg-color": "#0b1228",
      "--pte-button-primary-bg": "#7c3aed",
      "--pte-button-primary-text": "#ffffff",
      "--pte-menu-btn-hover-bg": "#26386a",
      "--pte-shadow-color": "rgba(0, 0, 0, 0.72)",
      "--pte-overlay-shadow": "0 24px 70px rgba(0, 0, 0, 0.72)",
      "--pte-drag-shadow": "0 14px 36px rgba(34, 211, 238, 0.22)",
      "--pte-scrollbar-track-color": "#070b18",
      "--pte-scrollbar-thumb-hover-color": "#7c8fc8",
      "--pte-scrollbar-size": "12px",
      "--pte-scrollbar-radius": "999px",
      "--pte-tooltip-bg": "#151d3d",
      "--pte-tooltip-text-color": "#f1f5ff",
      "--pte-tooltip-border-color": "#8b5cf6",
      "--pte-tooltip-radius": "10px",
      "--pte-tooltip-shadow": "0 16px 44px rgba(0, 0, 0, 0.65)",
      "--pte-pagination-footer-height": "52px",
      "--pte-cell-flash-up-bg-color": "rgba(34, 211, 238, 0.38)",
      "--pte-cell-flash-down-bg-color": "rgba(244, 63, 94, 0.42)",
    },
  });
}

const COLUMNS: ColDef[] = [
  { colId: "id", key: "id", label: "CODE", width: 105, pinned: "left" },
  { colId: "project", key: "project", label: "INITIATIVE", width: 190, filter: true, pinned: "left" },
  { colId: "team", key: "team", label: "CREW", width: 115, filter: true },
  {
    colId: "stage", key: "stage", label: "STATUS", width: 125, filter: true,
    cellStyle: ({ value }) => ({
      color: value === "Shipping" ? "#67e8f9"
        : value === "Building" ? "#c4b5fd"
          : value === "Review" ? "#fde68a" : "#93a4c7",
      fontWeight: "700",
      letterSpacing: "0.03em",
    }),
  },
  {
    colId: "priority", key: "priority", label: "PRIORITY", width: 115, filter: true,
    cellStyle: ({ value }) => ({
      color: value === "Critical" ? "#fb7185" : value === "High" ? "#fbbf24" : "#a7f3d0",
      fontWeight: "700",
    }),
  },
  {
    colId: "progress", key: "progress", label: "PROGRESS", width: 125, type: ColumnType.NUMBER,
    valueFormatter: ({ value }) => `${value}%`,
    cellStyle: ({ value }) => ({ color: Number(value) >= 75 ? "#67e8f9" : "#c4b5fd", fontWeight: "700" }),
  },
  { colId: "budget", key: "budget", label: "BUDGET", width: 145, type: ColumnType.CURRENCY },
  { colId: "launch", key: "launch", label: "LAUNCH WINDOW", width: 150 },
];

export function mountFullyThemedDemo(container: HTMLElement): () => void {
  let rowHeight = 58;
  let api: IGridAPI;

  const host = h("div", { style: { width: "100%", height: "100%" } });

  container.appendChild(h("section", { class: "full-theme-demo" },
    h("header", { class: "full-theme-hero" },
      h("div", null,
        h("span", { class: "full-theme-kicker", text: "CUSTOM THEME / VANILLA" }),
        h("h2", { text: "Mission Control" }),
        h("p", {
          text: "Every grid surface is themed per instance: chrome, menus, selection, typography,"
            + " scrollbars, spacing, and two-pixel row dividers.",
        }),
      ),
      h("label", { class: "full-theme-density" },
        "Row height",
        select(
          [
            { value: 44, label: "Compact · 44px" },
            { value: 58, label: "Comfortable · 58px" },
            { value: 72, label: "Oversized · 72px" },
          ],
          rowHeight,
          value => setRowHeight(Number(value)),
        ),
      ),
    ),
    h("div", { class: "full-theme-grid-shell" }, host),
  ));

  build();

  /**
   * `rowHeight` is fixed at construction (it feeds the virtualization geometry), so changing the
   * density rebuilds the instance — the React demo does the same thing with `key={rowHeight}`.
   */
  function build(): void {
    api = createGrid(host, {
      rowData: ROWS,
      columnDefs: COLUMNS,
      rowIdKey: "id",
      rowHeight,
      headerHeight: 56,
      theme: makeTheme(rowHeight),
      rowNumbers: true,
      rowHover: true,
      columnHover: true,
      zebraRows: true,
      highlightActiveCell: true,
      pagination: true,
      pageSize: 12,
      pageSizes: [12, 24, 48],
      pinnedTopRowData: [PINNED_ROW],
      quickFilter: { mode: "always", debounceMs: 0 },
      toolbar: { quickFilter: true, sorting: true, export: true },
      columnPanel: { trigger: "rail" },
      tooltip: { showDelay: 150, hideDelay: 80 },
    });
  }

  function setRowHeight(next: number): void {
    if (next === rowHeight) return;
    rowHeight = next;
    api.destroy();
    host.replaceChildren();
    build();
  }

  return () => api.destroy();
}
