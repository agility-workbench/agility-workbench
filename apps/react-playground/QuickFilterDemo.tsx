import { useEffect, useMemo, useRef, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import { themeLight } from "@grid";
import type { GridTheme, QuickFilterMatchMode, QuickFilterOptions } from "@grid";

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
 * The highlight color comes from somewhere else — the theme, not the quick-filter config: the
 * `findMatchColor` theme param derives all three find CSS variables (the tint for every match, the
 * stronger tint for the active one, and its outline) from a single color. It is applied as a custom
 * property on the grid root, so changing it re-tints the cells already painted without a remount or
 * a re-render; the swatch below is live even mid-search.
 *
 * Changing any control below reconfigures the live grid in place — the React wrapper forwards the
 * new `quickFilter` config to the renderer, which rebuilds the widget without remounting the grid
 * (an active search is preserved across the change). Open the search with Ctrl/Cmd+F (or it's
 * pinned in "always" mode).
 */

type Company = { id: number; name: string; region: string; sector: string; employees: number };

const NAMES = [
  "Acme Corp", "Acme Labs", "Globex", "Initech", "Umbrella", "Soylent", "Hooli", "Vandelay",
  "Stark Industries", "Wayne Enterprises", "Wonka", "Cyberdyne", "Tyrell", "Massive Dynamic",
  "Aperture Science", "Black Mesa", "Oscorp", "Nakatomi", "Gekko & Co", "Bluth Company",
];
const REGIONS = ["West", "East", "North", "South", "Central"];
const SECTORS = ["Tech", "Finance", "Retail", "Energy", "Health", "Media"];

// The light stylesheet's own find tint, so the swatch opens showing what the grid is already using.
const DEFAULT_FIND_MATCH_COLOR = "#facc15";

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

export function QuickFilterDemo() {
  const rows = useMemo(buildRows, []);
  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "id", key: "id", label: "ID", width: 70 },
    { colId: "name", key: "name", label: "Name", width: 200 },
    { colId: "region", key: "region", label: "Region", width: 120 },
    { colId: "sector", key: "sector", label: "Sector", width: 120 },
    { colId: "employees", key: "employees", label: "Employees", width: 120 },
  ], []);

  // Live-editable quick-filter config.
  const [mode, setMode] = useState<"onDemand" | "always">("onDemand");
  const [behavior, setBehavior] = useState<"filter" | "find">("filter");
  const [showBehaviorToggle, setShowBehaviorToggle] = useState(true);
  const [matchMode, setMatchMode] = useState<QuickFilterMatchMode>("multiTerm");
  const [clearOnClose, setClearOnClose] = useState(false);
  const [anchor, setAnchor] = useState<"left" | "right">("right");
  const [offsetX, setOffsetX] = useState(8);
  const [offsetTop, setOffsetTop] = useState(6);
  const [showOptions, setShowOptions] = useState(true);
  const [showLayoutOptions, setShowLayoutOptions] = useState(true);
  const [findMatchColor, setFindMatchColor] = useState<string | null>(null);
  const [reconfigurePending, setReconfigurePending] = useState(false);
  const [reconfigureResult, setReconfigureResult] = useState("");
  const reconfigureTimer = useRef<number | null>(null);
  const gridHost = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    if (reconfigureTimer.current !== null) window.clearTimeout(reconfigureTimer.current);
  }, []);

  const scheduleFocusedReconfigure = () => {
    if (reconfigureTimer.current !== null) window.clearTimeout(reconfigureTimer.current);
    setReconfigurePending(true);
    setReconfigureResult("");
    gridHost.current?.querySelector<HTMLElement>(".pte-root")?.focus();
    reconfigureTimer.current = window.setTimeout(() => {
      // Any config change rebuilds the widget. Changing this otherwise-inconsequential offset
      // verifies that the replacement widget restores focus when the old input owned it.
      setOffsetX(value => value + 1);
      reconfigureTimer.current = null;
      window.requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null;
        setReconfigureResult(
          active?.classList.contains("pte-quick-filter-input")
            ? "Focus remained in the quick filter."
            : `Focus moved to ${active?.tagName.toLowerCase() ?? "no element"}.`,
        );
        setReconfigurePending(false);
      });
    }, 4000);
  };

  const quickFilter = useMemo<QuickFilterOptions>(() => ({
    mode,
    behavior,
    showBehaviorToggle,
    matchMode,
    clearOnClose,
    position: { anchor, offsetX, offsetTop },
    showOptions,
    showLayoutOptions,
  }), [
    mode, behavior, showBehaviorToggle, matchMode, clearOnClose, anchor, offsetX, offsetTop,
    showOptions, showLayoutOptions,
  ]);

  // Left undefined until the swatch is touched, so the stylesheet's own (light/dark-aware)
  // defaults are what the demo starts from.
  const theme = useMemo<GridTheme | undefined>(
    () => (findMatchColor == null ? undefined : themeLight.withParams({ findMatchColor })),
    [findMatchColor],
  );

  const labelStyle = { fontSize: 13, display: "flex", alignItems: "center", gap: 6 } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={labelStyle}>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as "onDemand" | "always")}>
            <option value="onDemand">onDemand (Ctrl/Cmd+F)</option>
            <option value="always">always (pinned)</option>
          </select>
        </label>

        <label style={labelStyle}>
          Behavior
          <select
            value={behavior}
            onChange={(e) => setBehavior(e.target.value as "filter" | "find")}
          >
            <option value="filter">filter (narrow rows)</option>
            <option value="find">find (highlight cells)</option>
          </select>
        </label>

        <label style={labelStyle}>
          Match
          <select
            value={matchMode}
            onChange={(e) => setMatchMode(e.target.value as QuickFilterMatchMode)}
          >
            <option value="multiTerm">All words</option>
            <option value="substring">Exact phrase</option>
            <option value="wholeCell">Whole cell</option>
          </select>
        </label>

        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={showBehaviorToggle}
            onChange={(e) => setShowBehaviorToggle(e.target.checked)}
          />
          showBehaviorToggle
        </label>

        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={clearOnClose}
            onChange={(e) => setClearOnClose(e.target.checked)}
          />
          clearOnClose
        </label>

        <label style={labelStyle}>
          Anchor
          <select value={anchor} onChange={(e) => setAnchor(e.target.value as "left" | "right")}>
            <option value="right">right</option>
            <option value="left">left</option>
          </select>
        </label>

        <label style={labelStyle}>
          offsetX
          <input
            type="number"
            value={offsetX}
            min={0}
            style={{ width: 64 }}
            onChange={(e) => setOffsetX(Number(e.target.value))}
          />
        </label>

        <label style={labelStyle}>
          offsetTop
          <input
            type="number"
            value={offsetTop}
            min={0}
            style={{ width: 64 }}
            onChange={(e) => setOffsetTop(Number(e.target.value))}
          />
        </label>

        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={showOptions}
            onChange={(e) => setShowOptions(e.target.checked)}
          />
          showOptions
        </label>

        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={showLayoutOptions}
            onChange={(e) => setShowLayoutOptions(e.target.checked)}
          />
          showLayoutOptions
        </label>

        <label style={labelStyle}>
          findMatchColor
          <input
            type="color"
            value={findMatchColor ?? DEFAULT_FIND_MATCH_COLOR}
            style={{ width: 40, height: 24, padding: 0 }}
            onChange={(e) => setFindMatchColor(e.target.value)}
          />
        </label>

        <button
          type="button"
          disabled={findMatchColor == null}
          onClick={() => setFindMatchColor(null)}
        >
          Reset color
        </button>

        <button type="button" disabled={reconfigurePending} onClick={scheduleFocusedReconfigure}>
          {reconfigurePending ? "Reconfiguring in 4s…" : "Test focused reconfigure"}
        </button>
      </div>

      <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
        {mode === "onDemand"
          ? "Press Ctrl/Cmd+F over the grid to open the search."
          : "Search is pinned open under the header."}
        {" "}{behavior === "find"
          ? "Find mode: nothing is filtered — matching cells are highlighted, and Enter / Shift+Enter step through them (the counter shows where you are)."
          : "Filter mode: non-matching rows are hidden."}
        {" "}With <code>showBehaviorToggle</code> on, the ⋯ popover switches between the two without
        touching grid options.
        {" "}With <code>clearOnClose</code> off, dismissing the search leaves the filter active and shows a
        pill you can click to reopen. With <code>showLayoutOptions</code> on, the ⋯ options popover
        exposes the Anchor and “Keep filter when closed” controls.
        {" "}The <code>findMatchColor</code> swatch re-tints the highlights live (theme param, not a
        quick-filter option) — try it with a search active.
        {" "}To verify focus preservation during live reconfiguration, click
        “Test focused reconfigure,” press Ctrl/Cmd+F, and leave the search input focused before the
        four-second timer expires. {reconfigureResult}
      </p>

      <div ref={gridHost} style={{ flex: 1, minHeight: 0 }}>
        <Grid
          data={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowNumbers
          quickFilter={quickFilter}
          theme={theme}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default QuickFilterDemo;
