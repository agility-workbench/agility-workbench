import {
  ColumnType,
  type ColDef,
  type GridToolbarOptions,
  type IGridAPI,
} from "@grid";

import { btn, checkbox, demoRoot, field, gridHost, h, note } from "../dom";
import { mountGrid } from "../demoGrid";

type SalesRow = {
  id: number;
  region: string;
  country: string;
  product: string;
  rep: string;
  quarter: string;
  units: number;
  revenue: number;
};

const REGIONS = ["Americas", "EMEA", "APAC"] as const;
const COUNTRIES: Record<(typeof REGIONS)[number], string[]> = {
  Americas: ["USA", "Canada", "Brazil"],
  EMEA: ["UK", "Germany", "France"],
  APAC: ["Japan", "India", "Australia"],
};
const PRODUCTS = ["Analytics", "Cloud", "Security", "Support"];
const REPS = ["Ava Chen", "Liam Patel", "Mia Kim", "Noah Garcia", "Emma Silva"];

function buildRows(): SalesRow[] {
  return Array.from({ length: 120 }, (_, index) => {
    const region = REGIONS[index % REGIONS.length];
    const units = 12 + ((index * 17) % 180);
    return {
      id: index + 1,
      region,
      country: COUNTRIES[region][Math.floor(index / 3) % COUNTRIES[region].length],
      product: PRODUCTS[(index * 3) % PRODUCTS.length],
      rep: REPS[(index * 2) % REPS.length],
      quarter: `Q${(index % 4) + 1}`,
      units,
      revenue: units * (95 + ((index * 29) % 240)),
    };
  });
}

const SECTIONS: Array<{ key: keyof GridToolbarOptions; label: string }> = [
  { key: "grouping", label: "Grouping" },
  { key: "sorting", label: "Sorting" },
  { key: "quickFilter", label: "Quick filter" },
  { key: "export", label: "Export" },
];

const COLUMNS: ColDef[] = [
  { colId: "region", key: "region", label: "Region", width: 130 },
  { colId: "country", key: "country", label: "Country", width: 130 },
  { colId: "product", key: "product", label: "Product", width: 140 },
  { colId: "rep", key: "rep", label: "Sales rep", width: 160 },
  { colId: "quarter", key: "quarter", label: "Quarter", width: 100 },
  { colId: "units", key: "units", label: "Units", width: 100, type: ColumnType.NUMBER },
  { colId: "revenue", key: "revenue", label: "Revenue", width: 140, type: ColumnType.CURRENCY },
];

export function mountToolbarDemo(container: HTMLElement): () => void {
  let toolbar: GridToolbarOptions = {
    grouping: true,
    sorting: true,
    quickFilter: true,
    export: true,
  };
  let columns = true;

  const host = gridHost();
  const sectionBoxes = new Map<keyof GridToolbarOptions, HTMLInputElement>();
  const columnsBox = checkbox(columns, value => {
    columns = value;
    applyColumnPanel();
    renderReadout();
  });

  const expectedLabel = h("strong", { style: { fontSize: "12px" } });
  const snippet = h("code", {
    style: { display: "block", marginTop: "6px", fontSize: "11px", lineHeight: "1.45", whiteSpace: "pre-wrap" },
  });

  const sectionFields = SECTIONS.map(section => {
    const box = checkbox(toolbar[section.key] === true, value => {
      toolbar = { ...toolbar, [section.key]: value };
      applyToolbar();
    });
    sectionBoxes.set(section.key, box);
    return field(section.label, box, {
      style: { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px" },
    });
  });

  container.appendChild(demoRoot(
    h("div", { style: { display: "flex", alignItems: "stretch", gap: "12px", flexWrap: "wrap" } },
      h("section", {
        style: {
          display: "flex", alignItems: "center", gap: "16px", flex: "1 1 620px", minWidth: "0",
          padding: "10px 12px", border: "1px solid var(--pte-frame-border-color, #d1d5db)",
          borderRadius: "8px",
        },
      },
        h("div", { style: { flex: "0 0 auto" } },
          h("div", { text: "Toolbar sections", style: { fontSize: "13px", fontWeight: "600" } }),
          h("div", {
            text: "Every control updates the existing grid instance.",
            style: { marginTop: "2px", fontSize: "11px", color: "#6b7280" },
          }),
        ),
        h("div", { style: { display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" } },
          ...sectionFields,
          field("Columns trigger", columnsBox, {
            style: { display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px" },
          }),
        ),
        h("div", { style: { display: "flex", gap: "6px", marginLeft: "auto" } },
          btn("All", () => {
            toolbar = { grouping: true, sorting: true, quickFilter: true, export: true };
            columns = true;
            syncBoxes();
            applyToolbar();
            applyColumnPanel();
          }),
          btn("None", () => {
            toolbar = {};
            columns = false;
            syncBoxes();
            applyToolbar();
            applyColumnPanel();
          }),
        ),
      ),
      h("aside", {
        style: {
          flex: "0 1 340px", minWidth: "260px", padding: "10px 12px",
          border: "1px solid var(--pte-frame-border-color, #d1d5db)", borderRadius: "8px",
          background: "#f9fafb",
        },
      },
        h("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px" } },
          h("span", { text: "Expected toolbar", style: { fontSize: "12px", color: "#6b7280" } }),
          expectedLabel,
        ),
        snippet,
      ),
    ),
    note(
      "Disable and re-enable a zone to see that its grouping or sorting state is preserved. Disable"
      + " every section while leaving ", h("strong", { text: "Columns trigger" }),
      " on for a Columns-only toolbar; turn that off and the toolbar takes up no space.",
    ),
    host,
  ));

  const grid = mountGrid(host, {
    rowData: buildRows(),
    columnDefs: COLUMNS,
    rowIdKey: "id",
    toolbar,
    quickFilter: { debounceMs: 0, showOptions: true },
    columnPanel: { trigger: "toolbar" },
    allowExportAsCSV: true,
    allowExportAsExcel: true,
    groupDefaultExpanded: 1,
  });

  seedGroupingAndSort(grid.api);
  renderReadout();

  function applyToolbar(): void {
    grid.renderer.setToolbarOptions(toolbar);
    renderReadout();
  }

  function applyColumnPanel(): void {
    grid.renderer.setColumnPanelOptions(columns ? { trigger: "toolbar" } : false);
  }

  function syncBoxes(): void {
    for (const [key, box] of sectionBoxes) box.checked = toolbar[key] === true;
    columnsBox.checked = columns;
  }

  function renderReadout(): void {
    const visible = Object.values(toolbar).some(Boolean) || columns;
    expectedLabel.textContent = visible ? "Visible" : "Hidden";
    snippet.textContent = `toolbar={${JSON.stringify(toolbar)}}\n`
      + `columnPanel=${columns ? '{ trigger: "toolbar" }' : "false"}`;
  }

  return () => grid.destroy();
}

function seedGroupingAndSort(api: IGridAPI): void {
  const model = api.getColumnModel();
  const region = model.getByColId("region");
  const revenue = model.getByColId("revenue");
  const rep = model.getByColId("rep");
  if (region) api.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });
  api.dispatch({
    type: "sortModelSet",
    sortItems: [
      ...(revenue ? [{ key: revenue.instanceID, dir: "desc" as const }] : []),
      ...(rep ? [{ key: rep.instanceID, dir: "asc" as const }] : []),
    ],
  });
}
