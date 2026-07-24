import { useMemo, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { ColumnType } from "@grid/interfaces/column";
import { themeLight, themeDark } from "@grid";
import type { GridTheme } from "@grid";

/**
 * Playground for the row/cell visual-state and interaction options:
 *   Visual:      rowHover, columnHover, zebraRows, highlightActiveCell
 *   Interaction: cellSelection (true/false/text), rangeSelection, columnSelection, bodyContextMenu
 *   Header:      showColumnButtonsOnHover (grid-level), plus per-column showColumnMenu /
 *                columnContextMenu demonstrated on the Rating and City columns
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

function Toggle({ label, checked, onChange, hint }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }} title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function VisualStatesDemo() {
  const rows = useMemo(() => buildRows(200), []);

  const [rowHover, setRowHover] = useState(true);
  const [columnHover, setColumnHover] = useState(true);
  const [zebraRows, setZebraRows] = useState(true);
  const [highlightActiveCell, setHighlightActiveCell] = useState(true);

  // Interaction gating (defaults preserve today's behavior).
  const [cellSelection, setCellSelection] = useState<"true" | "false" | "text">("true");
  const [rangeSelection, setRangeSelection] = useState(true);
  const [columnSelection, setColumnSelection] = useState(true);
  const [bodyMenu, setBodyMenu] = useState<"default" | "native" | "custom" | "empty">("default");

  // Header / column-menu options.
  const [buttonsOnHover, setButtonsOnHover] = useState(false);
  // Per-column flags demonstrated on specific columns: hide the menu (⋮) button on "Rating", and
  // disable the right-click column menu on "City" (its header falls back to the native menu).
  const [hideRatingMenu, setHideRatingMenu] = useState(true);
  const [nativeCityMenu, setNativeCityMenu] = useState(true);

  // Map the string control to the option's boolean | "text" value.
  const cellSelectionValue: boolean | "text" =
    cellSelection === "text" ? "text" : cellSelection === "true";

  // Map the body-menu control onto bodyContextMenu's boolean | getter shape.
  const bodyContextMenu = useMemo(() => {
    switch (bodyMenu) {
      case "native": return false;                                    // browser's native menu
      case "empty": return () => [];                                  // grid owns it, shows nothing
      case "custom":                                                  // defaults + a custom item
        return ({ items }: { items: any[] }) => [
          ...items,
          { isSeparator: true },
          { id: "hello", label: "Say hello", onClick: () => window.alert("Hello from a custom item!") },
        ];
      default: return true;                                           // default grid menu
    }
  }, [bodyMenu]);

  const [themeId, setThemeId] = useState(themePresets[0].id);
  const [customColors, setCustomColors] = useState(false);

  const activePreset = themePresets.find((t) => t.id === themeId) ?? themePresets[0];

  const theme = useMemo<GridTheme | undefined>(() => {
    if (!customColors) return undefined;
    const base = themeId === "dark" ? themeDark : themeLight;
    return base.withParams(themeId === "dark" ? CUSTOM_PARAMS_DARK : CUSTOM_PARAMS);
  }, [customColors, themeId]);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "id", key: "id", label: "ID", width: 80 },
    // Editable → the body context menu gains Cut / Paste (right-click a Name cell).
    { colId: "name", key: "name", label: "Name", width: 160, editable: true, filter: true },
    { colId: "department", key: "department", label: "Department", width: 140, filter: true },
    // columnContextMenu: false → right-clicking this header shows the browser's native menu.
    { colId: "city", key: "city", label: "City", width: 130, filter: true, columnContextMenu: !nativeCityMenu },
    { colId: "salary", key: "salary", label: "Salary", width: 120, type: ColumnType.NUMBER },
    // showColumnMenu: false → the ⋮ button is hidden on this header (menu still via right-click).
    { colId: "rating", key: "rating", label: "Rating", width: 100, type: ColumnType.NUMBER, showColumnMenu: !hideRatingMenu },
    { colId: "active", key: "active", label: "Active", width: 90 },
  ], [hideRatingMenu, nativeCityMenu]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 12px", border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 8 }}>
          <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "#6b7280" }}>Visual</strong>
          <Toggle label="rowHover" checked={rowHover} onChange={setRowHover} hint="Highlight the row under the pointer" />
          <Toggle label="columnHover" checked={columnHover} onChange={setColumnHover} hint="Highlight the whole column under the pointer" />
          <Toggle label="zebraRows" checked={zebraRows} onChange={setZebraRows} hint="Alternating background on odd rows" />
          <Toggle label="highlightActiveCell" checked={highlightActiveCell} onChange={setHighlightActiveCell} hint="Outline the focused cell inside a range" />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 12px", border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 8 }}>
          <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "#6b7280" }}>Interaction</strong>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            title="true = grid cell selection · false = inert cells · text = native browser text selection (like a plain HTML table)">
            cellSelection
            <select value={cellSelection} onChange={(e) => setCellSelection(e.target.value as typeof cellSelection)}>
              <option value="true">true (grid)</option>
              <option value="false">false (inert)</option>
              <option value="text">text (native)</option>
            </select>
          </label>
          <Toggle label="rangeSelection" checked={rangeSelection} onChange={setRangeSelection} hint="Allow drag / Shift+Arrow to extend a multi-cell range" />
          <Toggle label="columnSelection" checked={columnSelection} onChange={setColumnSelection} hint="Allow clicking a column header to select the column" />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
            title="default = grid menu · native = browser menu · custom = grid menu + a custom item · empty = no menu (native suppressed)">
            bodyContextMenu
            <select value={bodyMenu} onChange={(e) => setBodyMenu(e.target.value as typeof bodyMenu)}>
              <option value="default">default</option>
              <option value="native">false (native)</option>
              <option value="custom">custom items</option>
              <option value="empty">[] (none)</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 12px", border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 8 }}>
          <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "#6b7280" }}>Header</strong>
          <Toggle label="showColumnButtonsOnHover" checked={buttonsOnHover} onChange={setButtonsOnHover} hint="Reveal the header menu / filter buttons only on header hover or focus (grid-level)" />
          <Toggle label="Rating: showColumnMenu=false" checked={hideRatingMenu} onChange={setHideRatingMenu} hint="Hide the ⋮ menu button on the Rating column (menu still reachable via right-click)" />
          <Toggle label="City: columnContextMenu=false" checked={nativeCityMenu} onChange={setNativeCityMenu} hint="Right-clicking the City header shows the browser's native menu instead of the grid column menu" />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="vs-theme" style={{ fontSize: 13 }}>Theme</label>
          <select id="vs-theme" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            {themePresets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <Toggle label="Custom colors" checked={customColors} onChange={setCustomColors} hint="Apply the new semantic theme params (orange accent)" />
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
        Hover rows and columns to see the highlights. Click a cell, then Shift+Click (or Shift+Arrow) to
        make a range — with <code>highlightActiveCell</code> on, the focused cell keeps a distinct outline
        inside the selection. Use the <strong>Interaction</strong> controls to disable range dragging or
        column-header selection, or set <code>cellSelection</code> to <code>text</code> to revert to a plain
        HTML table where you can drag to select and copy cell text. Right-click the body to try the
        <code>bodyContextMenu</code> modes (default / native / custom items / none) — with a Name cell
        selected the menu also shows Cut / Paste (Name is editable). Under <strong>Header</strong>, turn on
        <code>showColumnButtonsOnHover</code> and hover a header to reveal its ⋮ / filter buttons; the
        Rating column hides its ⋮ button and the City header opens the browser's native menu on
        right-click. Toggle <code>Custom colors</code> to recolor these states via theme params.
      </p>

      <div style={{ flex: 1, minHeight: 0 }} className={activePreset.className}>
        {/* Remount on option changes so the renderer picks up hover-binding / class changes cleanly. */}
        <Grid
          key={`${rowHover}-${columnHover}-${zebraRows}-${highlightActiveCell}-${cellSelection}-${rangeSelection}-${columnSelection}-${bodyMenu}-${buttonsOnHover}-${hideRatingMenu}-${nativeCityMenu}-${themeId}-${customColors}`}
          // cellSelection: "true" | "false" | "text" mapped to boolean | "text"
          data={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowHover={rowHover}
          columnHover={columnHover}
          zebraRows={zebraRows}
          highlightActiveCell={highlightActiveCell}
          cellSelection={cellSelectionValue}
          rangeSelection={rangeSelection}
          columnSelection={columnSelection}
          bodyContextMenu={bodyContextMenu}
          showColumnButtonsOnHover={buttonsOnHover}
          theme={theme}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default VisualStatesDemo;
