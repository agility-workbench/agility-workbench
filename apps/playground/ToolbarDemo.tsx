import { useMemo, useRef, useState } from "react";

import {
  ColumnType,
  Grid,
  type GridToolbarOptions,
  type IGridAPI,
  type ReactColDef,
} from "@react-grid";

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

const SECTION_LABELS: Array<{
  key: keyof GridToolbarOptions;
  label: string;
}> = [
  { key: "grouping", label: "Grouping" },
  { key: "sorting", label: "Sorting" },
  { key: "export", label: "Export" },
];

export function ToolbarDemo() {
  const rows = useMemo(() => buildRows(), []);
  const apiRef = useRef<IGridAPI | null>(null);
  const [toolbar, setToolbar] = useState<GridToolbarOptions>({
    grouping: true,
    sorting: true,
    export: true,
  });
  const [columns, setColumns] = useState(true);

  const columnDefs = useMemo<ReactColDef[]>(() => [
    { colId: "region", key: "region", label: "Region", width: 130 },
    { colId: "country", key: "country", label: "Country", width: 130 },
    { colId: "product", key: "product", label: "Product", width: 140 },
    { colId: "rep", key: "rep", label: "Sales rep", width: 160 },
    { colId: "quarter", key: "quarter", label: "Quarter", width: 100 },
    { colId: "units", key: "units", label: "Units", width: 100, type: ColumnType.NUMBER },
    {
      colId: "revenue",
      key: "revenue",
      label: "Revenue",
      width: 140,
      type: ColumnType.CURRENCY,
    },
  ], []);

  const setSection = (key: keyof GridToolbarOptions, enabled: boolean) => {
    setToolbar((current) => ({ ...current, [key]: enabled }));
  };

  const handleReady = (api: IGridAPI) => {
    apiRef.current = api;
    const model = api.getColumnModel();
    const region = model.getByColId("region");
    const revenue = model.getByColId("revenue");
    const rep = model.getByColId("rep");
    if (region) {
      api.dispatch({ type: "rowGroupSet", colIds: [region.instanceID] });
    }
    api.dispatch({
      type: "sortModelSet",
      sortItems: [
        ...(revenue ? [{ key: revenue.instanceID, dir: "desc" as const }] : []),
        ...(rep ? [{ key: rep.instanceID, dir: "asc" as const }] : []),
      ],
    });
  };

  const toolbarVisible = Object.values(toolbar).some(Boolean) || columns;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <section
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flex: "1 1 620px",
            minWidth: 0,
            padding: "10px 12px",
            border: "1px solid var(--pte-frame-border-color, #d1d5db)",
            borderRadius: 8,
          }}
        >
          <div style={{ flex: "0 0 auto" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Toolbar sections</div>
            <div style={{ marginTop: 2, fontSize: 11, color: "#6b7280" }}>
              Every control updates the existing grid instance.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {SECTION_LABELS.map((section) => (
              <label
                key={section.key}
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}
              >
                <input
                  type="checkbox"
                  checked={toolbar[section.key] === true}
                  onChange={(event) => setSection(section.key, event.target.checked)}
                />
                {section.label}
              </label>
            ))}

            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={columns}
                onChange={(event) => setColumns(event.target.checked)}
              />
              Columns trigger
            </label>
          </div>

          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setToolbar({ grouping: true, sorting: true, export: true });
                setColumns(true);
              }}
            >
              All
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setToolbar({});
                setColumns(false);
              }}
            >
              None
            </button>
          </div>
        </section>

        <aside
          style={{
            flex: "0 1 340px",
            minWidth: 260,
            padding: "10px 12px",
            border: "1px solid var(--pte-frame-border-color, #d1d5db)",
            borderRadius: 8,
            background: "#f9fafb",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Expected toolbar</span>
            <strong style={{ fontSize: 12 }}>{toolbarVisible ? "Visible" : "Hidden"}</strong>
          </div>
          <code
            style={{
              display: "block",
              marginTop: 6,
              fontSize: 11,
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
            }}
          >
            {`toolbar={${JSON.stringify(toolbar)}}\ncolumnPanel=${columns ? '{{ trigger: "toolbar" }}' : "{false}"}`}
          </code>
        </aside>
      </div>

      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "#6b7280" }}>
        Disable and re-enable a zone to see that its grouping or sorting state is preserved. Disable
        every section while leaving <strong>Columns trigger</strong> on for a Columns-only toolbar;
        turn that off too and the toolbar takes up no space.
      </p>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <Grid
          apiRef={apiRef}
          rowData={rows}
          columnDefs={columnDefs}
          rowIdKey="id"
          toolbar={toolbar}
          columnPanel={columns ? { trigger: "toolbar" } : false}
          allowExportAsCSV
          allowExportAsExcel
          groupDefaultExpanded={1}
          style={{ width: "100%", height: "100%" }}
          onGridReady={handleReady}
        />
      </div>
    </div>
  );
}

export default ToolbarDemo;
