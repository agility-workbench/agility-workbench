import { ColumnType, type ColDef, type SavedGridView } from "@grid";

import { btn, demoRoot, gridHost, h } from "../dom";
import { mountGrid } from "../demoGrid";

type Row = {
  id: number;
  region: string;
  country: string;
  product: string;
  owner: string;
  revenue: number;
};

const STORAGE_KEY = "pte-saved-views-demo";

function loadViews(): SavedGridView[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function buildRows(): Row[] {
  return Array.from({ length: 120 }, (_, index) => ({
    id: index + 1,
    region: ["Americas", "EMEA", "APAC"][index % 3],
    country: ["USA", "Germany", "India", "Japan", "Brazil", "France"][(index * 5) % 6],
    product: ["Analytics", "Cloud", "Security", "Support"][(index * 3) % 4],
    owner: ["Ava", "Liam", "Mia", "Noah", "Emma"][(index * 2) % 5],
    revenue: 15_000 + ((index * 8_719) % 110_000),
  }));
}

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 130 },
  { colId: "country", key: "country", label: "Country", width: 130 },
  { colId: "product", key: "product", label: "Product", width: 140 },
  { colId: "owner", key: "owner", label: "Owner", width: 120 },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
];

export function mountSavedViewsDemo(container: HTMLElement): () => void {
  let views = loadViews();
  let activeViewId: string | null = null;

  const host = gridHost();
  const list = h("div");
  const clearButton = btn("Clear demo storage", () => {
    persistViews([]);
    activeViewId = null;
    applySavedViews();
  }, { disabled: views.length === 0 });

  container.appendChild(demoRoot(
    h("div", { style: { display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" } },
      h("div", {
        style: { flex: "1 1 560px", fontSize: "12px", lineHeight: "1.55", color: "#4b5563" },
      },
        "Configure columns, grouping, sorting, column filters, quick filter, and group expansion."
        + " Then use ", h("strong", { text: "Views → Save current view…" }),
        ". Switching views restores the complete presentation state through the public grid APIs."),
      clearButton,
    ),
    h("div", { style: { display: "flex", gap: "12px", flex: "1", minHeight: "0" } },
      host,
      h("aside", {
        style: {
          width: "280px", flex: "0 0 280px", overflow: "auto", padding: "12px",
          boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: "8px",
          background: "#f9fafb",
        },
      },
        h("strong", { text: "Application-owned views", style: { fontSize: "13px" } }),
        h("div", {
          text: "Persisted by this page in local storage.",
          style: { marginTop: "4px", fontSize: "11px", color: "#6b7280" },
        }),
        list,
      ),
    ),
  ));

  const grid = mountGrid(host, {
    rowData: buildRows(),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    toolbar: { views: true, grouping: true, sorting: true, quickFilter: true, export: true },
    savedViews: savedViewsOptions(),
    quickFilter: { debounceMs: 0, showOptions: true },
    columnPanel: { trigger: "toolbar" },
    allowExportAsCSV: true,
    allowExportAsExcel: true,
    groupDefaultExpanded: 1,
  });

  renderList();

  function savedViewsOptions() {
    return {
      views,
      activeViewId,
      onChange: (next: SavedGridView[]) => {
        persistViews(next);
        applySavedViews();
      },
      onActiveViewChange: (viewId: string | null) => {
        activeViewId = viewId;
        renderList();
      },
    };
  }

  function persistViews(next: SavedGridView[]): void {
    views = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    clearButton.disabled = views.length === 0;
    renderList();
  }

  /** Saved views are application-owned: hand the renderer the new list so the Views menu refreshes. */
  function applySavedViews(): void {
    grid.renderer.setSavedViewsOptions(savedViewsOptions());
  }

  function renderList(): void {
    if (views.length === 0) {
      list.replaceChildren(h("p", {
        text: "No saved views yet.",
        style: { fontSize: "12px", color: "#9ca3af" },
      }));
      return;
    }
    list.replaceChildren(h("ol", {
      style: { margin: "10px 0 0", paddingLeft: "20px", fontSize: "12px", lineHeight: "1.7" },
    }, ...views.map(view => h("li", null,
      h("strong", { text: view.name }),
      view.id === activeViewId ? " — active" : "",
    ))));
  }

  return () => grid.destroy();
}
