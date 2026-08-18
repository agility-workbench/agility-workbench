import {
  ColumnType,
  createGrid,
  type ColDef,
  type ICellEditor,
  type ICellEditorParams,
  type SelectionSnapshot,
  type ValueFormatterParams,
} from "@grid";

import { btn, demoRoot, field, gridHost, h, select, toolbarRow } from "../dom";
import { formatDate, mulberry32, picker } from "../helpers";

/**
 * Demonstrates the core-owned selection + keyboard navigation feature:
 * mouse select / drag, arrow / Ctrl+arrow (Excel-style block jump) / Shift+arrow,
 * Home / End, Ctrl+Home / Ctrl+End, Ctrl+A — with a live readout driven by the
 * `selectionChanged` event and `api.getSelection()`.
 *
 * It also carries a custom cell editor: the class form of `ICellEditor` (a 1–5 star picker) on the
 * Rating column. `getValue()` is read synchronously on commit and `isParsed()` returns true, so the
 * number goes straight to the row without a valueParser.
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

function buildRows(count: number): EmployeeRow[] {
  const rand = mulberry32(42);
  const pick = picker(rand);
  // `id` and `name` are always filled (id is the row key + a stable anchor column). Every other
  // cell has a ~22% chance of being blank, so columns and rows contain irregular gaps — this is
  // what makes Ctrl+Arrow (jump across a data block) visibly different from a plain edge jump.
  const maybe = <T,>(value: T): T | "" => (rand() < 0.22 ? "" : value);
  const startDate = new Date(2000, 0, 0).getTime();
  const endDate = new Date(2026, 55, 0).getTime();
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
    joinedOn: new Date(startDate + Math.floor(rand() * (endDate - startDate))),
  }));

  // Guarantee a couple of obvious, fully-blank horizontal bands and a blank vertical run so the
  // three block-jump regimes (run end / gap skip / fall-through to edge) are easy to try out.
  const blankRow = (r: EmployeeRow): EmployeeRow => ({
    ...r,
    department: "", title: "", city: "", salary: "",
    bonus: "", rating: "", projects: "", active: "",
  });
  if (rows.length > 20) {
    rows[5] = blankRow(rows[5]);
    rows[6] = blankRow(rows[6]);
    // A blank vertical run in the "salary" column across rows 10..14.
    for (let r = 10; r <= 14 && r < rows.length; r++) rows[r].salary = "";
  }
  return rows;
}

/**
 * A class cell editor: a 1–5 star picker. The grid calls `init` once, mounts `getGui()` over the
 * cell, focuses it, and reads `getValue()` when the edit commits. Arrow keys / number keys adjust
 * the rating; the grid keeps ownership of Enter / Esc / Tab.
 */
class StarRatingEditor implements ICellEditor {
  private root = h("div", {
    tabIndex: 0,
    class: "star-rating-editor",
    style: {
      display: "flex", alignItems: "center", height: "100%", padding: "0 8px",
      gap: "2px", cursor: "pointer", outline: "none",
    },
  });
  private stars: HTMLElement[] = [];
  private value = 0;

  init(params: ICellEditorParams): void {
    const initial = typeof params.value === "number" ? Math.round(params.value) : 0;
    this.value = Math.min(5, Math.max(0, initial));

    for (let n = 1; n <= 5; n++) {
      const star = h("span", {
        text: "★",
        style: { fontSize: "16px", lineHeight: "1" },
        onMousedown: (event: MouseEvent) => {
          event.preventDefault();
          this.set(n);
        },
      });
      this.stars.push(star);
      this.root.appendChild(star);
    }

    this.root.addEventListener("keydown", event => {
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        this.set(Math.min(5, this.value + 1));
        event.stopPropagation();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        this.set(Math.max(0, this.value - 1));
        event.stopPropagation();
      } else if (/^[0-5]$/.test(event.key)) {
        this.set(Number(event.key));
        event.stopPropagation();
      }
    });

    this.paint();
  }

  getGui(): HTMLElement {
    return this.root;
  }

  getValue(): unknown {
    return this.value;
  }

  /** Commit the number directly, no valueParser. */
  isParsed(): boolean {
    return true;
  }

  focus(): void {
    this.root.focus();
  }

  private set(value: number): void {
    this.value = value;
    this.paint();
  }

  private paint(): void {
    this.stars.forEach((star, index) => {
      star.style.color = index + 1 <= this.value ? "#f5a623" : "#ccc";
    });
  }
}

const COLUMNS: ColDef[] = [
  { colId: "id", key: "id", label: "ID", width: 80 },
  // Double-click (or press F2 / Enter) to edit. Enter/Tab commit, Esc cancels. Default text editor.
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
  // Class-component editor: the star picker above.
  {
    colId: "rating", key: "rating", label: "Rating", width: 120,
    editable: true, type: ColumnType.NUMBER, cellEditor: StarRatingEditor,
  },
  { colId: "projects", key: "projects", label: "Projects", width: 100 },
  {
    colId: "joinedOn", key: "joinedOn", label: "Joined On", editable: true, type: ColumnType.DATE,
    valueFormatter: (params: ValueFormatterParams) => formatDate(params.value),
  },
  // Yes/No dropdown.
  {
    colId: "active", key: "active", label: "Active", width: 90,
    editable: true, cellEditor: "select", cellEditorParams: { values: ["Yes", "No"] },
  },
];

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

export function mountSelectionDemo(container: HTMLElement): () => void {
  let rowCount = 120;
  let active: { viewIdx?: number; colIdx?: number } | null = null;
  let selection: SelectionSnapshot | null = null;

  const host = gridHost();
  const summary = h("div", { style: { fontSize: "13px", fontWeight: "600" } });
  const detail = h("div", { style: { fontSize: "12px", color: "#6b7280", marginTop: "6px" } });
  const firstCell = h("div", { style: { fontSize: "12px", color: "#6b7280", marginTop: "6px" } });

  container.appendChild(demoRoot(
    toolbarRow(
      field("Rows", select([100, 120, 500, 1000], rowCount, value => {
        rowCount = Number(value);
        api.setRowData(buildRows(rowCount));
      })),
      h("div", { style: { display: "flex", gap: "8px" } },
        btn("Select all (API)", () => api.selectAll()),
        btn("Clear", () => api.clearSelection("all")),
        btn("Go bottom-right (API)", () => api.navigateToCorner("bottomRight")),
        btn("Move 10 rows up", () => api.navigate("up", { jump: "page", pageRows: 10 })),
        btn("Move 10 rows down", () => api.navigate("down", { jump: "page", pageRows: 10 })),
      ),
    ),
    h("div", { style: { display: "flex", gap: "12px", flex: "1", minHeight: "0" } },
      // minWidth:0 lets this flex item shrink below its content's intrinsic width; without it,
      // widening the grid (e.g. a pinned auto-group column) would stretch the whole layout.
      host,
      h("aside", {
        style: {
          width: "300px", flexShrink: "0", display: "flex", flexDirection: "column",
          gap: "12px", overflow: "auto",
        },
      },
        h("section", {
          style: { border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: "8px", padding: "12px" },
        },
          h("h3", { text: "Live selection", style: { fontSize: "14px", marginBottom: "8px" } }),
          summary,
          detail,
          firstCell,
        ),
        h("section", {
          style: { border: "1px solid var(--pte-frame-border-color, #ccc)", borderRadius: "8px", padding: "12px" },
        },
          h("h3", { text: "Keyboard shortcuts", style: { fontSize: "14px", marginBottom: "8px" } }),
          h("table", { style: { fontSize: "12px", borderCollapse: "collapse", width: "100%" } },
            h("tbody", null, ...SHORTCUTS.map(([keys, description]) => h("tr", null,
              h("td", {
                text: keys,
                style: { padding: "3px 8px 3px 0", whiteSpace: "nowrap", fontWeight: "600" },
              }),
              h("td", { text: description, style: { padding: "3px 0", color: "#6b7280" } }),
            ))),
          ),
          h("p", {
            text: "Click a cell first to focus the grid, then use the keyboard.",
            style: { fontSize: "11px", color: "#9ca3af", marginTop: "8px" },
          }),
        ),
      ),
    ),
  ));

  const api = createGrid(host, {
    rowData: buildRows(rowCount),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    rowNumbers: true,
    quickFilter: true,
    rowSelection: true,
    selectAllRowsOnHeaderClick: true,
  });

  const offSelection = api.on("selectionChanged", ev => {
    selection = ev.snapshot;
    renderReadout();
  });
  const offFocus = api.on("focusChanged", ev => {
    active = { viewIdx: ev.viewIdx, colIdx: ev.colIdx };
    renderReadout();
  });

  selection = api.getSelection();
  renderReadout();

  function renderReadout(): void {
    summary.textContent = describeSelection(selection);
    detail.replaceChildren(
      "kind: ",
      h("code", { text: selection?.kind ?? "none" }),
      active?.viewIdx != null ? ` · active: r${active.viewIdx}/c${active.colIdx}` : "",
    );
    const cells = selection?.kind === "range" ? selection.rangeCells : undefined;
    firstCell.replaceChildren(
      ...(cells
        ? ["first cell: ", h("code", { text: `${cells[0]?.rowId}/${cells[0]?.colId}` })]
        : []),
    );
  }

  return () => {
    offSelection();
    offFocus();
    api.destroy();
  };
}
