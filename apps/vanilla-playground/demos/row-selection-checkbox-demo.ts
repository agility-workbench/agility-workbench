import { createGrid, ColumnType, type ColDef, type IRowNode } from "@grid";

import { btn, checkbox, demoRoot, field, gridHost, h, select } from "../dom";

type OrderRow = {
  id: string;
  customer: string;
  region: string;
  status: string;
  owner: string;
  total: number;
};

type SelectionMode = "single" | "multiple";
type CheckboxPin = "left" | "right" | null;

const CUSTOMERS = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne", "Wonka", "Hooli"];
const REGIONS = ["North", "South", "East", "West"];
const STATUSES = ["Ready", "Review", "Blocked"];
const OWNERS = ["Ava", "Liam", "Mia", "Noah", "Emma", "Ethan"];

function buildRows(): OrderRow[] {
  return Array.from({ length: 64 }, (_, index) => ({
    id: `ORD-${String(index + 1).padStart(3, "0")}`,
    customer: `${CUSTOMERS[index % CUSTOMERS.length]} ${Math.floor(index / CUSTOMERS.length) + 1}`,
    region: REGIONS[(index * 3) % REGIONS.length],
    status: STATUSES[(index * 5) % STATUSES.length],
    owner: OWNERS[(index * 7) % OWNERS.length],
    total: 850 + ((index * 1379) % 18_000),
  }));
}

const COLUMNS: ColDef[] = [
  { colId: "id", key: "id", label: "Order", width: 110 },
  { colId: "customer", key: "customer", label: "Customer", width: 180, filter: "text" },
  { colId: "region", key: "region", label: "Region", width: 120, filter: "set" },
  { colId: "status", key: "status", label: "Status", width: 120, filter: "set" },
  { colId: "owner", key: "owner", label: "Owner", width: 120, filter: "set" },
  { colId: "total", key: "total", label: "Total", width: 130, type: ColumnType.CURRENCY },
];

export function mountRowSelectionCheckboxDemo(container: HTMLElement): () => void {
  let selectionMode: SelectionMode = "multiple";
  let checkboxPin: CheckboxPin = "left";
  let checkboxPinnable = true;
  let lockBlocked = false;
  let selectedIds: string[] = [];
  let lastReason = "ready";

  const host = gridHost();
  const count = h("div", { style: { fontSize: "24px", fontWeight: "700" } });
  const reason = h("div", { style: { fontSize: "12px", opacity: "0.65", marginTop: "2px" } });
  const chips = h("div", {
    style: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "12px" },
  });
  const overflow = h("div", { style: { fontSize: "12px", opacity: "0.65", marginTop: "10px" } });

  container.appendChild(demoRoot(
    h("div", {
      style: {
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
        padding: "12px 14px", border: "1px solid var(--pte-frame-border-color, #d1d5db)",
        borderRadius: "8px", background: "var(--pte-header-bg-color, #fff)", flexWrap: "wrap",
      },
    },
      h("div", null,
        h("h2", { text: "Row selection checkboxes", style: { fontSize: "18px", marginBottom: "4px" } }),
        h("p", {
          style: { fontSize: "13px", lineHeight: "1.45", opacity: "0.75" },
          text: "Toggle rows additively, Shift-click to add a range, or use the tri-state header"
            + " checkbox. The checkbox column is independent of row numbers.",
        }),
      ),
      h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
        btn("Select all rows", () => api.selectAllRows()),
        btn("Select sample IDs", () => api.selectRowsById(["ORD-002", "ORD-017", "ORD-036"])),
        btn("Clear", () => api.deselectAllRows()),
      ),
    ),
    h("div", {
      style: {
        display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", padding: "8px 12px",
        border: "1px solid var(--pte-frame-border-color, #d1d5db)", borderRadius: "8px",
      },
    },
      field("Selection mode", select(
        [
          { value: "multiple", label: "Multiple" },
          { value: "single", label: "Single" },
        ],
        selectionMode,
        value => {
          selectionMode = value as SelectionMode;
          applyRowSelection();
        },
      )),
      field("Checkbox pin", select(
        [
          { value: "left", label: "Left" },
          { value: "none", label: "No pin" },
          { value: "right", label: "Right" },
        ],
        "left",
        value => {
          checkboxPin = value === "none" ? null : value as Exclude<CheckboxPin, null>;
          applyRowSelection();
        },
      )),
      field("Can be repinned", checkbox(checkboxPinnable, value => {
        checkboxPinnable = value;
        applyRowSelection();
      })),
      field('Lock "Blocked" rows (isRowSelectable)', checkbox(lockBlocked, value => {
        lockBlocked = value;
        applyRowLock();
      })),
    ),
    h("div", { style: { display: "flex", flex: "1", minHeight: "0", gap: "12px" } },
      host,
      h("aside", {
        style: {
          width: "260px", flexShrink: "0", alignSelf: "stretch", overflow: "auto", padding: "12px",
          border: "1px solid var(--pte-frame-border-color, #d1d5db)", borderRadius: "8px",
          background: "var(--pte-header-bg-color, #fff)", boxSizing: "border-box",
        },
      },
        h("h3", { text: "Selected rows", style: { fontSize: "14px", marginBottom: "8px" } }),
        count,
        reason,
        chips,
        overflow,
      ),
    ),
  ));

  const api = createGrid(host, {
    rowData: buildRows(),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    rowSelection: rowSelectionOptions(),
    quickFilter: true,
    pagination: true,
    pageSize: 15,
    pageSizes: [15, 30, 60],
    onSelectionChanged: ({ snapshot, reason: changeReason }) => {
      selectedIds = snapshot.selectedRowIds.map(String);
      lastReason = changeReason ?? "unknown";
      renderReadout();
    },
  });

  selectedIds = api.getSelection().selectedRowIds.map(String);
  renderReadout();

  function rowSelectionOptions() {
    return {
      mode: selectionMode,
      checkboxes: true,
      checkboxColumnPinned: checkboxPin,
      checkboxColumnPinnable: checkboxPinnable,
    };
  }

  /** Row selection (and its utility column) reconfigure in place — no remount. */
  function applyRowSelection(): void {
    api.updateGridOptions({ rowSelection: rowSelectionOptions() });
  }

  /**
   * isRowSelectable disables the checkbox and every other selection route for the row (rows it
   * disables are pruned from the current selection); the row's own visual identity (here: dimming
   * via getRowStyle) stays the app's job.
   */
  function applyRowLock(): void {
    api.updateGridOptions({
      isRowSelectable: lockBlocked
        ? (node: IRowNode) => (node.data as OrderRow).status !== "Blocked"
        : undefined,
      getRowStyle: lockBlocked
        ? params => ((params.data as OrderRow | undefined)?.status === "Blocked"
          ? { opacity: "0.5" }
          : undefined)
        : undefined,
    });
  }

  function renderReadout(): void {
    count.textContent = String(selectedIds.length);
    reason.textContent = `last change: ${lastReason}`;
    chips.replaceChildren(...selectedIds.slice(0, 18).map(id => h("code", {
      text: id,
      style: {
        padding: "3px 6px", borderRadius: "4px",
        background: "var(--pte-input-bg-color, #eef2f7)", fontSize: "11px",
      },
    })));
    overflow.textContent = selectedIds.length > 18
      ? `+${selectedIds.length - 18} more`
      : selectedIds.length === 0 ? "Use a row or header checkbox to begin." : "";
  }

  return () => api.destroy();
}
