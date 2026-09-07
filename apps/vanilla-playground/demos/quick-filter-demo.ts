import { createGrid, themeLight, type ColDef, type GridTheme, type QuickFilterOptions } from "@grid";

import { checkbox, code, demoRoot, field, gridHost, h, note, numberInput, select, toolbarRow } from "../dom";

/**
 * Showcases the quick-filter (global search) configuration:
 *  - `behavior` / `showBehaviorToggle`: filter the rows, or leave every row in place and highlight
 *    the matching cells (Excel-style find, with a match counter and Enter/Shift+Enter stepping).
 *  - `matchMode`: all words / one contiguous run / the cell's whole text (the same three shapes in
 *    both behaviors; only "all words" widens to the whole row while filtering).
 *  - `clearOnClose`: keep the filter applied after the widget is dismissed (a collapsed pill stands
 *    in so the active search stays visible / re-openable).
 *  - `position`: anchor left/right, plus X (from the edge) and Y (below the header) offsets.
 *  - `showOptions` / `showLayoutOptions`: which controls the widget exposes in its options popover.
 *
 * In find mode the widget is not chrome you dismiss once the search is typed — you keep operating it
 * (next/previous, the counter) while reading the cells — so a match that lands underneath it would
 * be unreachable. Stepping onto one therefore moves it out from under the widget: the reveal scrolls
 * the match clear where it can, and where no scroll can (the first row, the last column, and the
 * pinned Status column, none of which have anywhere to go) the widget flips to the opposite edge.
 * The configured anchor is untouched by that — a dodge lasts as long as the search does.
 *
 * The highlight color comes from somewhere else — the theme, not the quick-filter config: the
 * `findMatchColor` theme param derives all three find CSS variables (the tint for every match, the
 * stronger tint for the active one, and its outline) from a single color. It is applied as a custom
 * property on the grid root, so changing it re-tints the cells already painted without a remount or
 * a re-render; the swatch below is live even mid-search.
 *
 * Changing any control below reconfigures the live grid in place: `api.updateGridOptions({ quickFilter })`
 * rebuilds the widget without remounting the grid (an active search is preserved across the
 * change). Open the search with Ctrl/Cmd+F (or it's pinned in "always" mode).
 */

type Company = {
  id: number;
  name: string;
  region: string;
  sector: string;
  employees: number;
  ceo: string;
  hq: string;
  country: string;
  currency: string;
  founded: number;
  revenue: number;
  tier: string;
  status: string;
  domain: string;
  notes: string;
};

const NAMES = [
  "Acme Corp", "Acme Labs", "Globex", "Initech", "Umbrella", "Soylent", "Hooli", "Vandelay",
  "Stark Industries", "Wayne Enterprises", "Wonka", "Cyberdyne", "Tyrell", "Massive Dynamic",
  "Aperture Science", "Black Mesa", "Oscorp", "Nakatomi", "Gekko & Co", "Bluth Company",
];
const REGIONS = ["West", "East", "North", "South", "Central"];
const SECTORS = ["Tech", "Finance", "Retail", "Energy", "Health", "Media"];
const CEOS = [
  "Dana Whitfield", "Marcus Lee", "Priya Nair", "Tom Okafor", "Elena Rossi",
  "Hiro Tanaka", "Sara Kaufman", "Luis Ferreira", "Anna Novak", "Owen Bradley",
];
const CITIES = [
  "Seattle", "Austin", "Boston", "Denver", "Atlanta",
  "Chicago", "Portland", "Miami", "Phoenix", "Newark",
];
// Paired so a row's country and currency never contradict each other.
const LOCALES = [
  { country: "USA", currency: "USD" },
  { country: "Canada", currency: "CAD" },
  { country: "UK", currency: "GBP" },
  { country: "Germany", currency: "EUR" },
  { country: "Japan", currency: "JPY" },
  { country: "Australia", currency: "AUD" },
];
const TIERS = ["Enterprise", "Mid-Market", "SMB"];
const STATUSES = ["Active", "Prospect", "Churned", "On Hold"];
const NOTE_TOPICS = [
  "renewal pending", "expansion review", "pilot in flight", "quarterly audit", "migration planned",
];

// The light stylesheet's own find tint, so the swatch opens showing what the grid is already using.
const DEFAULT_FIND_MATCH_COLOR = "#facc15";

function buildRows(): Company[] {
  // Deterministic (no Math.random) so the demo data is stable across reloads.
  return NAMES.map((name, i) => {
    const sector = SECTORS[i % SECTORS.length];
    const locale = LOCALES[i % LOCALES.length];
    return {
      id: i + 1,
      name,
      region: REGIONS[i % REGIONS.length],
      sector,
      employees: 50 + ((i * 137) % 950),
      ceo: CEOS[i % CEOS.length],
      hq: CITIES[i % CITIES.length],
      country: locale.country,
      currency: locale.currency,
      founded: 1958 + ((i * 7) % 60),
      revenue: 4 + ((i * 31) % 480),
      tier: TIERS[i % TIERS.length],
      status: STATUSES[i % STATUSES.length],
      // Echoes the name in a different shape, so "whole cell" and "exact phrase" visibly disagree.
      domain: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`,
      notes: `${sector} ${NOTE_TOPICS[i % NOTE_TOPICS.length]}`,
    };
  });
}

const COLUMNS: ColDef[] = [
  // Deliberately wider than the viewport: find-mode stepping has to scroll matches
  // into view horizontally, not just vertically.
  { colId: "id", key: "id", label: "ID", width: 70 },
  { colId: "name", key: "name", label: "Name", width: 200 },
  { colId: "region", key: "region", label: "Region", width: 120 },
  { colId: "sector", key: "sector", label: "Sector", width: 120 },
  { colId: "employees", key: "employees", label: "Employees", width: 120 },
  { colId: "ceo", key: "ceo", label: "CEO", width: 160 },
  { colId: "hq", key: "hq", label: "HQ", width: 120 },
  { colId: "country", key: "country", label: "Country", width: 110 },
  { colId: "currency", key: "currency", label: "Currency", width: 100 },
  { colId: "founded", key: "founded", label: "Founded", width: 100 },
  { colId: "revenue", key: "revenue", label: "Revenue ($M)", width: 130 },
  { colId: "tier", key: "tier", label: "Tier", width: 130 },
  // Pinned right, which is the case scrolling can never rescue: a match here sits under a
  // right-anchored search widget and no scroll can move it, so the widget has to step aside.
  { colId: "status", key: "status", label: "Status", width: 110, pinned: "right" },
  { colId: "domain", key: "domain", label: "Domain", width: 200 },
  { colId: "notes", key: "notes", label: "Notes", width: 240 },
];

export function mountQuickFilterDemo(container: HTMLElement): () => void {
  const config = {
    mode: "onDemand" as "onDemand" | "always",
    behavior: "filter" as "filter" | "find",
    showBehaviorToggle: true,
    matchMode: "multiTerm" as "multiTerm" | "substring" | "wholeCell",
    clearOnClose: false,
    anchor: "right" as "left" | "right",
    offsetX: 8,
    offsetTop: 6,
    showOptions: true,
    showLayoutOptions: true,
    // Left null until the swatch is touched, so the stylesheet's own (light/dark-aware) defaults
    // are what the demo starts from.
    findMatchColor: null as string | null,
  };

  let reconfigureTimer: number | null = null;
  let reconfigureResult = "";

  const host = gridHost();
  const offsetXInput = numberInput(config.offsetX, value => {
    config.offsetX = Number(value);
    applyQuickFilter();
  }, { min: 0, style: { width: "64px" } });

  const colorInput = h("input", {
    type: "color",
    value: DEFAULT_FIND_MATCH_COLOR,
    style: { width: "40px", height: "24px", padding: "0" },
    onInput: (event: Event) => {
      config.findMatchColor = (event.target as HTMLInputElement).value;
      applyTheme();
    },
  });

  const resetColorButton = h("button", {
    type: "button",
    text: "Reset color",
    disabled: true,
    onClick: () => {
      config.findMatchColor = null;
      colorInput.value = DEFAULT_FIND_MATCH_COLOR;
      applyTheme();
    },
  });

  const reconfigureButton = h("button", {
    type: "button",
    text: "Test focused reconfigure",
    onClick: () => scheduleFocusedReconfigure(),
  });

  const modeNote = note();

  container.appendChild(demoRoot(
    toolbarRow(
      field("Mode", select(
        [
          { value: "onDemand", label: "onDemand (Ctrl/Cmd+F)" },
          { value: "always", label: "always (pinned)" },
        ],
        config.mode,
        value => {
          config.mode = value as typeof config.mode;
          applyQuickFilter();
        },
      )),
      field("Behavior", select(
        [
          { value: "filter", label: "filter (narrow rows)" },
          { value: "find", label: "find (highlight cells)" },
        ],
        config.behavior,
        value => {
          config.behavior = value as typeof config.behavior;
          applyQuickFilter();
        },
      )),
      field("Match", select(
        [
          { value: "multiTerm", label: "All words" },
          { value: "substring", label: "Exact phrase" },
          { value: "wholeCell", label: "Whole cell" },
        ],
        config.matchMode,
        value => {
          config.matchMode = value as typeof config.matchMode;
          applyQuickFilter();
        },
      )),
      field("showBehaviorToggle", checkbox(config.showBehaviorToggle, value => {
        config.showBehaviorToggle = value;
        applyQuickFilter();
      })),
      field("clearOnClose", checkbox(config.clearOnClose, value => {
        config.clearOnClose = value;
        applyQuickFilter();
      })),
      field("Anchor", select(["right", "left"], config.anchor, value => {
        config.anchor = value as typeof config.anchor;
        applyQuickFilter();
      })),
      field("offsetX", offsetXInput),
      field("offsetTop", numberInput(config.offsetTop, value => {
        config.offsetTop = Number(value);
        applyQuickFilter();
      }, { min: 0, style: { width: "64px" } })),
      field("showOptions", checkbox(config.showOptions, value => {
        config.showOptions = value;
        applyQuickFilter();
      })),
      field("showLayoutOptions", checkbox(config.showLayoutOptions, value => {
        config.showLayoutOptions = value;
        applyQuickFilter();
      })),
      field("findMatchColor", colorInput),
      resetColorButton,
      reconfigureButton,
    ),
    modeNote,
    host,
  ));

  const api = createGrid(host, {
    rowData: buildRows(),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    rowNumbers: true,
    quickFilter: quickFilterOptions(),
    theme: findTheme(),
  });

  function quickFilterOptions(): QuickFilterOptions {
    return {
      mode: config.mode,
      behavior: config.behavior,
      showBehaviorToggle: config.showBehaviorToggle,
      matchMode: config.matchMode,
      clearOnClose: config.clearOnClose,
      position: { anchor: config.anchor, offsetX: config.offsetX, offsetTop: config.offsetTop },
      showOptions: config.showOptions,
      showLayoutOptions: config.showLayoutOptions,
    };
  }

  function findTheme(): GridTheme | undefined {
    const color = config.findMatchColor;
    return color == null ? undefined : themeLight.withParams({ findMatchColor: color });
  }

  function applyTheme(): void {
    resetColorButton.disabled = config.findMatchColor == null;
    api.updateGridOptions({ theme: findTheme() });
  }

  function applyQuickFilter(): void {
    api.updateGridOptions({ quickFilter: quickFilterOptions() });
    renderNote();
  }

  function scheduleFocusedReconfigure(): void {
    if (reconfigureTimer !== null) window.clearTimeout(reconfigureTimer);
    reconfigureResult = "";
    reconfigureButton.disabled = true;
    reconfigureButton.textContent = "Reconfiguring in 4s…";
    renderNote();
    host.querySelector<HTMLElement>(".pte-root")?.focus();
    reconfigureTimer = window.setTimeout(() => {
      // Any config change rebuilds the widget. Changing this otherwise-inconsequential offset
      // verifies that the replacement widget restores focus when the old input owned it.
      config.offsetX += 1;
      offsetXInput.value = String(config.offsetX);
      applyQuickFilter();
      reconfigureTimer = null;
      window.requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null;
        reconfigureResult = active?.classList.contains("pte-quick-filter-input")
          ? "Focus remained in the quick filter."
          : `Focus moved to ${active?.tagName.toLowerCase() ?? "no element"}.`;
        reconfigureButton.disabled = false;
        reconfigureButton.textContent = "Test focused reconfigure";
        renderNote();
      });
    }, 4000);
  }

  function renderNote(): void {
    modeNote.replaceChildren(
      config.mode === "onDemand"
        ? "Press Ctrl/Cmd+F over the grid to open the search."
        : "Search is pinned open under the header.",
      config.behavior === "find"
        ? " Find mode: nothing is filtered — matching cells are highlighted, and Enter / Shift+Enter"
          + " step through them (the counter shows where you are)."
        : " Filter mode: non-matching rows are hidden.",
      " With ", code("showBehaviorToggle"),
      " on, the ⋯ popover lets you switch between the two without touching grid options.",
      " With ", code("clearOnClose"),
      " off, dismissing the search leaves the filter active and shows a pill you can click to reopen."
      + " With ", code("showLayoutOptions"),
      " on, the ⋯ options popover exposes the Anchor and “Keep filter when closed” controls.",
      " The ", code("findMatchColor"),
      " swatch re-tints the highlights live (a theme param, not a quick-filter option) — try it with"
      + " a search active."
      + " In find mode the search box steps out of its own way: search “Active” and step to the first"
      + " row's pinned Status cell — nothing can scroll it out from under the box, so the box flips to"
      + " the other edge instead (your Anchor setting stays as you left it)."
      + " To verify focus preservation during live reconfiguration, click “Test focused reconfigure,”"
      + " press Ctrl/Cmd+F, and leave the search input focused before the four-second timer expires. ",
      reconfigureResult,
    );
  }

  renderNote();

  return () => {
    if (reconfigureTimer !== null) window.clearTimeout(reconfigureTimer);
    api.destroy();
  };
}
