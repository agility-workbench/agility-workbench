import { useMemo, useState } from "react";

import { Grid } from "@react-grid";
import type { ReactColDef } from "@react-grid";
import type { QuickFilterOptions } from "@grid";

/**
 * Showcases the quick-filter (global search) configuration:
 *  - `clearOnClose`: keep the filter applied after the widget is dismissed (a collapsed pill stands
 *    in so the active search stays visible / re-openable).
 *  - `position`: anchor left/right, plus X (from the edge) and Y (below the header) offsets.
 *  - `showOptions` / `showLayoutOptions`: which controls the widget exposes in its options popover.
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
  const [clearOnClose, setClearOnClose] = useState(false);
  const [anchor, setAnchor] = useState<"left" | "right">("right");
  const [offsetX, setOffsetX] = useState(8);
  const [offsetTop, setOffsetTop] = useState(6);
  const [showOptions, setShowOptions] = useState(true);
  const [showLayoutOptions, setShowLayoutOptions] = useState(true);

  const quickFilter = useMemo<QuickFilterOptions>(() => ({
    mode,
    clearOnClose,
    position: { anchor, offsetX, offsetTop },
    showOptions,
    showLayoutOptions,
  }), [mode, clearOnClose, anchor, offsetX, offsetTop, showOptions, showLayoutOptions]);

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
      </div>

      <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
        {mode === "onDemand"
          ? "Press Ctrl/Cmd+F over the grid to open the search."
          : "Search is pinned open under the header."}
        {" "}With <code>clearOnClose</code> off, dismissing the search leaves the filter active and shows a
        pill you can click to reopen. With <code>showLayoutOptions</code> on, the ⋯ options popover
        exposes the Anchor and “Keep filter when closed” controls.
      </p>

      <div style={{ flex: 1, minHeight: 0 }}>
        <Grid
          data={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          rowNumbers
          quickFilter={quickFilter}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default QuickFilterDemo;
