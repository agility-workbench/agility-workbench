import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";

import { GridReact } from "@grid-react";
import type { ReactCellEditorHandle, ReactColDef } from "@grid-react";
import { ColumnType } from "@grid/interfaces/column";
import type { IGridAPI } from "@grid/interfaces/iGridAPI";
import type { SelectionSnapshot } from "@grid/interfaces/selection";
import type { ICellEditorParams } from "@grid";
import { ValueFormatterParams, ValueParserParams } from "@grid";
import { formatDate } from "./helpers";

/**
 * A React component cell editor: a 1–5 star picker. It receives ICellEditorParams as props and
 * exposes { getValue, isParsed, focus } via useImperativeHandle so the grid can read the committed
 * value synchronously. Arrow keys / number keys adjust the rating; the grid handles Enter/Esc.
 */
const StarRatingEditor = forwardRef<ReactCellEditorHandle, ICellEditorParams>(
  function StarRatingEditor(params, ref) {
    const initial = typeof params.value === "number" ? Math.round(params.value) : 0;
    const [stars, setStars] = useState(Math.min(5, Math.max(0, initial)));
    const rootRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      getValue: () => stars,
      isParsed: () => true, // commit the number directly, no valueParser
      focus: () => rootRef.current?.focus(),
    }), [stars]);

    return (
      <div
        ref={rootRef}
        tabIndex={0}
        className="star-rating-editor"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") { setStars((s) => Math.min(5, s + 1)); e.stopPropagation(); }
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setStars((s) => Math.max(0, s - 1)); e.stopPropagation(); }
          else if (/^[0-5]$/.test(e.key)) { setStars(Number(e.key)); e.stopPropagation(); }
        }}
        style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 8px", gap: 2, cursor: "pointer", outline: "none" }}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            onMouseDown={(e) => { e.preventDefault(); setStars(n); }}
            style={{ color: n <= stars ? "#f5a623" : "#ccc", fontSize: 16, lineHeight: 1 }}
          >
            ★
          </span>
        ))}
      </div>
    );
  },
);

/**
 * Demonstrates the core-owned selection + keyboard navigation feature:
 * mouse select / drag, arrow / Ctrl+arrow (Excel-style block jump) / Shift+arrow,
 * Home / End, Ctrl+Home / Ctrl+End, Ctrl+A — with a live readout driven by the
 * `selectionChanged` event and `api.getSelection()`.
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
  const blankRow = (r: EmployeeRow) => ({
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

const SHORTCUTS: Array<[string, string]> = [
  ["Click / drag", "Select a cell / range"],
  ["Arrow", "Move one cell"],
  ["Shift + Arrow", "Extend range by one cell"],
  ["Ctrl + Arrow", "Jump across data block (Excel-style)"],
  ["Ctrl + Shift + Arrow", "Extend range across block"],
  ["PageUp / PageDown", "Move up / down one viewport"],
  ["Home / End", "Jump to first / last column"],
  ["Ctrl + Home / End", "Jump to top-left / bottom-right"],
  ["Ctrl + A", "Select all"],
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

export function SelectionDemo() {
  const [rowCount, setRowCount] = useState(120);
  const rows = useMemo(() => buildRows(rowCount), [rowCount]);
  const apiRef = useRef<IGridAPI | null>(null);
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [active, setActive] = useState<{ viewIdx?: number; colIdx?: number } | null>(null);

  const columnDefs = useMemo<ReactColDef[]>(() => [
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
    // React component editor: a star picker exposing getValue via useImperativeHandle.
    { colId: "rating", key: "rating", label: "Rating", width: 120, editable: true, type: ColumnType.NUMBER, cellEditor: StarRatingEditor },
    { colId: "projects", key: "projects", label: "Projects", width: 100 },
    { colId: "joinedOn", key: "joinedOn", label: "Joined On", editable: true, type: ColumnType.DATE,
      valueFormatter: (params: ValueFormatterParams) => formatDate(params.value),
     },
    // Yes/No dropdown.
    {
      colId: "active", key: "active", label: "Active", width: 90,
      editable: true, cellEditor: "select", cellEditorParams: { values: ["Yes", "No"] },
    },
  ], []);

  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
    setSelection(api.getSelection());
    api.on("selectionChanged", (ev) => setSelection(ev.snapshot));
    api.on("focusChanged", (ev) => setActive({ viewIdx: ev.viewIdx, colIdx: ev.colIdx }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="row-count" style={{ fontSize: 13 }}>Rows</label>
          <select id="row-count" value={rowCount} onChange={(e) => setRowCount(Number(e.target.value))}>
            {[100, 120, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" type="button" onClick={() => apiRef.current?.selectAll()}>Select all (API)</button>
          <button className="btn" type="button" onClick={() => apiRef.current?.clearSelection("all")}>Clear</button>
          <button className="btn" type="button" onClick={() => apiRef.current?.navigateToCorner("bottomRight")}>Go bottom-right (API)</button>
          <button className="btn" type="button" onClick={() => apiRef.current?.navigate("up", { jump: "page", pageRows: 10 })}>Move 10 rows up</button>
          <button className="btn" type="button" onClick={() => apiRef.current?.navigate("down", { jump: "page", pageRows: 10 })}>Move 10 rows down</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
        {/* minWidth:0 lets this flex item shrink below its content's intrinsic width; without it,
            widening the grid (e.g. a pinned auto-group column) would stretch the whole layout. */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <GridReact
            data={rows}
            columnDefs={columnDefs}
            rowIdKey="id"
            rowNumbers
            quickFilter
            style={{ width: "100%", height: "100%" }}
            onGridReady={handleReady}
          />
        </div>

        <aside style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
          <section style={{ border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 8, padding: 12 }}>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Live selection</h3>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{describeSelection(selection)}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              kind: <code>{selection?.kind ?? "none"}</code>
              {active?.viewIdx != null && (
                <> · active: r{active.viewIdx}/c{active.colIdx}</>
              )}
            </div>
            {selection?.kind === "range" && selection.rangeCells && (
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                first cell: <code>{selection.rangeCells[0]?.rowId}/{selection.rangeCells[0]?.colId}</code>
              </div>
            )}
          </section>

          <section style={{ border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: 8, padding: 12 }}>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Keyboard shortcuts</h3>
            <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {SHORTCUTS.map(([keys, desc]) => (
                  <tr key={keys}>
                    <td style={{ padding: "3px 8px 3px 0", whiteSpace: "nowrap", fontWeight: 600 }}>{keys}</td>
                    <td style={{ padding: "3px 0", color: "#6b7280" }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
              Click a cell first to focus the grid, then use the keyboard.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default SelectionDemo;
