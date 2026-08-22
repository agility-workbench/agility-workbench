import {
  ColumnType,
  createGrid,
  type ColDef,
  type HeaderComponentParams,
  type IHeaderComponent,
} from "@grid";

import { bold, code, demoRoot, gridHost, h, note } from "../dom";
import { mulberry32, picker } from "../helpers";

/**
 * Custom header components at two levels, exercising all four wiring paths:
 *
 *  1. `headerComponent` (Level 1, function) — replaces the content (label + sort icon) only; the
 *     grid still renders the filter/menu row. Reuses the `.pte-hcell-sort` class so the grid's
 *     default click-to-sort routing fires with no callback wiring.
 *  2. `headerCellComponent` (Level 2, class) — owns the whole cell (content + its own filter &
 *     sort buttons), driving interactions through the params callbacks (progressSort / showFilterMenu).
 *  3. `defaultColDef.headerComponent` applied to every column, with one column overriding it via
 *     its own `headerCellComponent` (Level 2 wins over the Level 1 default).
 *  4. A group (parent) column carrying a `headerComponent` — children still render below it.
 */

type SaleRow = {
  id: number;
  region: string;
  country: string;
  units: number;
  revenue: number;
  rep: string;
};

const REGIONS = ["EMEA", "APAC", "Americas"];
const COUNTRIES: Record<string, string[]> = {
  EMEA: ["UK", "France", "Germany"],
  APAC: ["Japan", "India", "Australia"],
  Americas: ["USA", "Canada", "Brazil"],
};
const REPS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva"];

function buildRows(count: number): SaleRow[] {
  const rand = mulberry32(11);
  const pick = picker(rand);
  return Array.from({ length: count }, (_, i) => {
    const region = pick(REGIONS);
    return {
      id: 1 + i,
      region,
      country: pick(COUNTRIES[region]),
      units: 1 + Math.floor(rand() * 500),
      revenue: 500 + Math.floor(rand() * 500_000),
      rep: pick(REPS),
    };
  });
}

// ── Path 1: Level 1 (content-only) function component ───────────────────────────────────────────
// Renders an emoji + coloured label plus a grid-styled sort span. Because the span carries the
// `.pte-hcell-sort` class, the grid's own interaction handler routes clicks on it to a sort toggle —
// no callback needed. refresh() re-runs the function, so the arrow/priority follow the sort model.
function emojiHeader(icon: string, color: string) {
  return (params: HeaderComponentParams): HTMLElement => {
    const root = document.createElement("div");
    root.style.display = "flex";
    root.style.alignItems = "center";
    root.style.gap = "6px";
    root.style.width = "100%";

    const label = document.createElement("span");
    label.textContent = `${icon} ${params.displayName}`;
    label.style.color = color;
    label.style.fontWeight = "600";
    root.appendChild(label);

    // Reuse the grid sort classes so default click routing + arrow styling apply.
    const sort = document.createElement("div");
    sort.className = "pte-hcell-sort pte-sort-persist";
    const { direction, index, count } = params.sort;
    sort.classList.add(direction ? `pte-sort-${direction}` : "pte-sort-none");
    const arrow = document.createElement("span");
    arrow.className = "pte-hcell-sort-arrow";
    const badge = document.createElement("span");
    badge.className = "pte-hcell-sort-priority";
    if (direction && count >= 2) {
      badge.textContent = String(index + 1);
      sort.classList.add("pte-has-priority");
    }
    sort.append(arrow, badge);
    root.appendChild(sort);

    return root;
  };
}

// ── Path 2 & 3 override: Level 2 (whole-cell) class component ────────────────────────────────────
// Owns the entire cell: a label, a sort button (params.progressSort), and a filter button
// (params.showFilterMenu). refresh() updates the sort caret and the filter-active dot in place.
class FancyHeaderCell implements IHeaderComponent {
  private root = document.createElement("div");
  private caret = document.createElement("button");
  private filterBtn = document.createElement("button");
  private params!: HeaderComponentParams;

  init(params: HeaderComponentParams): void {
    this.params = params;
    this.root.style.display = "flex";
    this.root.style.alignItems = "center";
    this.root.style.justifyContent = "space-between";
    this.root.style.gap = "8px";
    this.root.style.width = "100%";
    this.root.style.padding = "0 8px";
    this.root.style.boxSizing = "border-box";

    const label = document.createElement("span");
    label.textContent = params.displayName;
    label.style.fontWeight = "700";
    label.style.letterSpacing = "0.02em";

    const group = document.createElement("span");
    group.style.display = "inline-flex";
    group.style.gap = "4px";

    styleMiniButton(this.caret);
    this.caret.title = "Sort";
    this.caret.addEventListener("click", e => {
      e.stopPropagation();
      // Additive (multi-column) sort when the modifier key is held.
      this.params.progressSort(e.ctrlKey || e.metaKey || e.shiftKey);
    });

    styleMiniButton(this.filterBtn);
    this.filterBtn.textContent = "⛃";
    this.filterBtn.title = "Filter";
    this.filterBtn.addEventListener("click", e => {
      e.stopPropagation();
      this.params.showFilterMenu(this.filterBtn);
    });

    group.append(this.caret, this.filterBtn);
    this.root.append(label, group);
    this.paint(params);
  }

  getGui(): HTMLElement {
    return this.root;
  }

  refresh(params: HeaderComponentParams): boolean {
    this.params = params;
    this.paint(params);
    return true;
  }

  destroy(): void {
    // Listeners are attached to elements owned by this.root; dropping the reference is enough for GC
    // once the grid removes the node. Nothing external to release.
  }

  private paint(params: HeaderComponentParams): void {
    const dir = params.sort.direction;
    this.caret.textContent = dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕";
    this.caret.style.opacity = dir ? "1" : "0.5";
    this.filterBtn.style.color = params.filterActive ? "#22c55e" : "inherit";
    this.filterBtn.style.opacity = params.filterActive ? "1" : "0.6";
  }
}

function styleMiniButton(button: HTMLButtonElement): void {
  button.type = "button";
  button.style.cursor = "pointer";
  button.style.border = "1px solid var(--pte-border, #d1d5db)";
  button.style.borderRadius = "4px";
  button.style.background = "transparent";
  button.style.color = "inherit";
  button.style.font = "inherit";
  button.style.lineHeight = "1";
  button.style.padding = "2px 5px";
}

// ── Path 3: a plain grid-level default (Level 1) shared by every non-overriding column ───────────
function defaultTintedHeader(params: HeaderComponentParams): HTMLElement {
  const root = document.createElement("div");
  root.textContent = params.displayName;
  root.style.width = "100%";
  root.style.fontStyle = "italic";
  root.style.color = "#6366f1";
  root.title = "Rendered by defaultColDef.headerComponent";
  return root;
}

const COLUMNS: ColDef[] = [
  // Path 4: group column with a Level 1 headerComponent; its leaves render below.
  {
    colId: "location", key: "location", label: "Location",
    headerComponent: emojiHeader("🌍", "#0ea5e9"),
    children: [
      // Path 1: Level 1 function component (reuses grid sort routing).
      {
        colId: "region", key: "region", label: "Region", width: 150,
        filter: "set",
        headerComponent: emojiHeader("🗺️", "#0ea5e9"),
      },
      // No component on this leaf → inherits defaultColDef.headerComponent (Path 3).
      { colId: "country", key: "country", label: "Country", width: 150, filter: "text" },
    ],
  },
  // Path 2 + Path 3 override: this column sets its own Level 2 headerCellComponent, which wins over
  // the grid-level default Level 1 component.
  {
    colId: "rep", key: "rep", label: "Sales Rep", width: 190,
    filter: "set",
    headerCellComponent: FancyHeaderCell,
  },
  // Inherit the grid-level default (Path 3).
  { colId: "units", key: "units", label: "Units", width: 120, type: ColumnType.NUMBER },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 150, type: ColumnType.CURRENCY },
];

export function mountHeaderComponentDemo(container: HTMLElement): () => void {
  const host = gridHost();

  container.appendChild(demoRoot(
    note(
      bold("Custom header components."), " ",
      h("span", { text: "🗺️ Region", style: { color: "#0ea5e9" } }),
      " uses a Level 1 ", code("headerComponent"),
      " (content only — grid keeps the filter icon, and clicking the arrow still sorts). ",
      bold("Sales Rep"), " uses a Level 2 ", code("headerCellComponent"),
      " (owns the whole cell; its ↕ button sorts, ⛃ opens the filter — turns green when active). ",
      h("span", { text: "Country / Units / Revenue", style: { fontStyle: "italic", color: "#6366f1" } }),
      " fall back to ", code("defaultColDef.headerComponent"), ". The ",
      h("span", { text: "🌍 Location", style: { color: "#0ea5e9" } }),
      " group header is a Level 1 component over child columns."
      + " Ctrl/⌘/Shift+click a sort control for multi-sort.",
    ),
    host,
  ));

  const api = createGrid(host, {
    rowData: buildRows(500),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    defaultColDef: { headerComponent: defaultTintedHeader, sortIconVisibility: "always" },
  });

  return () => api.destroy();
}
