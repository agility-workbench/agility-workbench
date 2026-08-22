import { createGrid, type ColDef, type QuickFilterOptions } from "@grid";

import { checkbox, code, demoRoot, field, gridHost, h, note, numberInput, select, toolbarRow } from "../dom";

/**
 * Showcases the quick-filter (global search) configuration:
 *  - `clearOnClose`: keep the filter applied after the widget is dismissed (a collapsed pill stands
 *    in so the active search stays visible / re-openable).
 *  - `position`: anchor left/right, plus X (from the edge) and Y (below the header) offsets.
 *  - `showOptions` / `showLayoutOptions`: which controls the widget exposes in its options popover.
 *
 * Changing any control below reconfigures the live grid in place: `api.updateGridOptions({ quickFilter })`
 * rebuilds the widget without remounting the grid (an active search is preserved across the
 * change). Open the search with Ctrl/Cmd+F (or it's pinned in "always" mode).
 */

type Company = { id: number; name: string; region: string; sector: string; employees: number };

const NAMES = [
  "Acme Corp", "Acme Labs", "Globex", "Initech", "Umbrella", "Soylent", "Hooli", "Vandelay",
  "Stark Industries", "Wayne Enterprises", "Wonka", "Cyberdyne", "Tyrell", "Massive Dynamic",
  "Aperture Science", "Black Mesa", "Oscorp", "Nakatomi", "Gekko & Co", "Bluth Company",
];
const REGIONS = ["West", "East", "North", "South", "Central"];
const SECTORS = ["Tech", "Finance", "Retail", "Energy", "Health", "Media"];

function buildRows(): Company[] {
  // Deterministic (no Math.random) so the demo data is stable across reloads.
  return NAMES.map((name, i) => ({
    id: i + 1,
    name,
    region: REGIONS[i % REGIONS.length],
    sector: SECTORS[i % SECTORS.length],
    employees: 50 + ((i * 137) % 950),
  }));
}

const COLUMNS: ColDef[] = [
  { colId: "id", key: "id", label: "ID", width: 70 },
  { colId: "name", key: "name", label: "Name", width: 200 },
  { colId: "region", key: "region", label: "Region", width: 120 },
  { colId: "sector", key: "sector", label: "Sector", width: 120 },
  { colId: "employees", key: "employees", label: "Employees", width: 120 },
];

export function mountQuickFilterDemo(container: HTMLElement): () => void {
  const config = {
    mode: "onDemand" as "onDemand" | "always",
    clearOnClose: false,
    anchor: "right" as "left" | "right",
    offsetX: 8,
    offsetTop: 6,
    showOptions: true,
    showLayoutOptions: true,
  };

  let reconfigureTimer: number | null = null;
  let reconfigureResult = "";

  const host = gridHost();
  const offsetXInput = numberInput(config.offsetX, value => {
    config.offsetX = Number(value);
    applyQuickFilter();
  }, { min: 0, style: { width: "64px" } });

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
  });

  function quickFilterOptions(): QuickFilterOptions {
    return {
      mode: config.mode,
      clearOnClose: config.clearOnClose,
      position: { anchor: config.anchor, offsetX: config.offsetX, offsetTop: config.offsetTop },
      showOptions: config.showOptions,
      showLayoutOptions: config.showLayoutOptions,
    };
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
      " With ", code("clearOnClose"),
      " off, dismissing the search leaves the filter active and shows a pill you can click to reopen."
      + " With ", code("showLayoutOptions"),
      " on, the ⋯ options popover exposes the Anchor and “Keep filter when closed” controls."
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
