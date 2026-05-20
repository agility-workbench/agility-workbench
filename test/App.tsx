import { useEffect, useMemo, useState } from "react";
import "./roboto-font.css";
import "./style.css";

import { GridReact } from "@grid-react"; // React Data Grid Component
import type {
  ColDef,
  FormatterOptionsParams,
  IServerSideDataSource,
  IServerSideFilter,
  IServerSideRequest,
  RowModelType,
} from "@grid";

const GRID_SERVER_URL = "http://localhost:8008";

type GridServerFilter = {
  key: string;
  type: string;
  value: any;
};

type GridServerPayload = {
  aggregates?: Array<{ key: string; type: string }>;
  columns?: ColDef[];
  schemaVersion?: string;
  filters?: GridServerFilter[];
  sorts?: Array<{ key: string; dir: "asc" | "desc" }>;
  page?: number;
  page_size?: number;
  start_row?: number;
  end_row?: number;
};

const themePresets = [
  { id: "dark", label: "Dark", className: "pte-theme-dark" },
  { id: "light", label: "Light", className: "pte-theme-light" },
];

function App() {
  const [rowData, setRowData] = useState<any[]>([]);
  const [colDefs, setColDefs] = useState<ColDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(50000);
  const [toggle, setToggle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paginate, setPaginate] = useState(true);
  const [rowModel, setRowModel] = useState<RowModelType>("serverSide");
  const [serverSideBlockSize, setServerSideBlockSize] = useState(100);
  const [themeId, setThemeId] = useState(themePresets[0].id);

  const applyFormatters = (cols: ColDef[] = []) => {
    const currencyFormatter = (col: ColDef) => {
      if (col.type !== "currency") return;
      // col.valueFormatter = (params: ValueFormatterParams) => {
      //   if (typeof params.value === "number") {
      //     return round(params.value).toLocaleString("en-US", {
      //       style: "currency",
      //       currency: params.row?.currency || "USD",
      //     });
      //   }
      //   return params.value;
      // };
      col.formatterOptions = (params: FormatterOptionsParams) => ({
        currency: params.row?.currency || "USD",
        locale: "en-US",
      });
    };

    const formatApplier = (inputCols: ColDef[]) => {
      for (const col of inputCols) {
        currencyFormatter(col);
        if (col.children && col.children.length > 0) {
          formatApplier(col.children);
        }

        if (col.key == "fy2026") {
          col.filterParams = {
            maxFilterItems: 7,
            buttons: ["apply", "cancel", "clear", "reset"],
          }
        }
      }
    };

    formatApplier(cols);
    return cols;
  };

  const flattenServerFilters = (filters: IServerSideFilter[]): GridServerFilter[] => {
    return filters.flatMap((item) => {
      const mapped = item.filters.flatMap((filter) => {
        const values = Array.isArray(filter.values) ? filter.values : [filter.values];
        if (values.length === 0) return [];
        return values.map((value) => ({
          key: item.key,
          type: filter.type,
          value,
        }));
      });
      return item.join === "or" && mapped.length > 1 ? mapped.slice(0, 1) : mapped;
    });
  };

  const buildServerPayload = (
    request: Pick<IServerSideRequest, "filters" | "sorts" | "startRow" | "endRow">,
    extras: Pick<GridServerPayload, "aggregates"> = {},
  ): GridServerPayload => {
    const startRow = Math.max(0, request.startRow ?? 0);
    const endRow = Math.max(startRow + 1, request.endRow ?? startRow + 100);

    return {
      ...extras,
      start_row: startRow,
      end_row: endRow,
      filters: flattenServerFilters(request.filters),
      sorts: request.sorts,
    };
  };

  const serverSideDataSource = useMemo<IServerSideDataSource>(() => {
    const serverUrl = `${GRID_SERVER_URL}/agg/flat`;

    const fetchServer = async (payload: GridServerPayload) => {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Server-side fetch failed with status ${response.status}`);
      }
      return response.json();
    };

    return {
      getRows: async ({ request }) => {
        console.log("Server-side request", request);

        const payload = await fetchServer(buildServerPayload(request));
        const rows = payload?.data ?? [];
        const totalRows = payload?.totalRows ?? payload?.total ?? rows.length;

        return {
          rows,
          totalRows,
          columns: payload?.columns?.length ? applyFormatters(payload.columns) : undefined,
          schemaVersion: payload?.schemaVersion,
        };
      },
      getAggregates: async ({ request }) => {
        console.log("Server-side aggregation request", request);

        const payload = await fetchServer(buildServerPayload(request, { aggregates: request.aggregates }));
        return { values: payload?.values ?? payload ?? {} };
      },
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      console.log("Are we here??");

      try {
        const response = await fetch(`${GRID_SERVER_URL}/agg/flat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page: 0,
            page_size: rowModel === "clientSide" ? count : 1,
          }),
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) return;

        applyFormatters(payload.columns ?? []);

        payload.columns.forEach((col: ColDef) => {
          if (col.key == "department") {
            col.sortable = false;
            col.filter = "set";
            col.filterParams = {
              filterValues: (params) => {
                setTimeout(() => {
                  console.log("Loading filter values for department column", params);
                  params.success((payload.data ?? []).map((r: any) => r.department));
                }, 1000);
              }
            }
          }
          if (col.key == "country") col.filter = false;
          if (col.key == "location") {
            col.resizable = false;
            col.filter = "set";
          }
          if (col.key == "gl_account") col.movable = false;
          if (col.key == "business_unit") col.hideable = false;
        });

        setColDefs(payload.columns ?? []);
        setRowData(rowModel === "clientSide" ? payload.data ?? [] : []);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (rowModel == "clientSide") fetchData();

    return () => {
      cancelled = true;
    };
  }, [toggle, count, rowModel]);

  useEffect(() => {
    const themeClasses = themePresets.map((theme) => theme.className);
    const activeTheme = themePresets.find((theme) => theme.id === themeId) ?? themePresets[0];

    document.body.classList.remove(...themeClasses);
    document.body.classList.add(activeTheme.className);

    return () => {
      document.body.classList.remove(activeTheme.className);
    };
  }, [themeId]);

  const activeTheme = themePresets.find((theme) => theme.id === themeId) ?? themePresets[0];

  return (
    <div style={{ padding: "8px", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <input type="number" value={count} min={1} max={100000} onChange={(e) => setCount(Number(e.target.value))} />
          <button className="btn" type="button" onClick={() => setToggle(!toggle)}>Fetch</button>
        </div>
        <button className="btn" type="button" onClick={() => setPaginate(!paginate)}>{paginate ? "Don't" : ""} Paginate</button>
        <button className="btn" type="button" onClick={() => setRowModel(rowModel === "clientSide" ? "serverSide" : "clientSide")}>
          Use {rowModel === "clientSide" ? "Server-side" : "Client-side"} Row Model
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label htmlFor="ssrm-block-size" style={{ fontSize: "13px" }}>SSRM block</label>
          <select id="ssrm-block-size" value={serverSideBlockSize} onChange={(e) => setServerSideBlockSize(Number(e.target.value))}>
            {[25, 50, 100, 250, 500].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label htmlFor="theme-select" style={{ fontSize: "13px" }}>Theme</label>
          <select id="theme-select" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            {themePresets.map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.label}</option>
            ))}
          </select>
        </div>
        {/* {loading && <div>Loading data…</div>} */}
        {error && <div style={{ color: "red" }}>Error: {error}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GridReact
          key={`${rowModel}-${serverSideBlockSize}`}
          data={rowData}
          columnDefs={colDefs}
          className={activeTheme.className}
          style={{ width: "100%", height: "100%" }}
          loading={loading}
          pagination={paginate}
          rowModelType={rowModel}
          serverSideDataSource={serverSideDataSource}
          serverSideAggregationSource={serverSideDataSource.getAggregates}
          serverSideBlockSize={serverSideBlockSize}
          pageSize={100}
          pageSizes={[25, 50, 100, 250, 500, 1000]}
        />
      </div>
    </div>
  );
}

export default App;
