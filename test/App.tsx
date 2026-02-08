import { useCallback, useEffect, useState } from "react";
import "./roboto-font.css";
import "./style.css";

import { GridReact } from "@grid-react"; // React Data Grid Component
import { ColDef, FormatterOptionsParams } from "@grid";

const themePresets = [
  { id: "dark", label: "Dark", className: "pte-theme-dark" },
  { id: "light", label: "Light", className: "pte-theme-light" },
];

function App() {
  const [rowData, setRowData] = useState<any[]>([]);
  const [colDefs, setColDefs] = useState<ColDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("compact");
  const [count, setCount] = useState(50000);
  const [toggle, setToggle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paginate, setPaginate] = useState(true);
  const [rowModel, setRowModel] = useState<RowModelType>("clientSide");
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

  const serverSideDataSource: ServerSideDataSource = useCallback(async (request: ServerSideRequest) => {
    console.log("Server-side request", request);

    const response = await fetch(`http://localhost:8008/dept_loc_exp?wide=${category === "wide" ? "0" : "1"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: request.page,
        page_size: request.pageSize,
        sorts: request.sorts,
        filters: request.filters,
        max: count,
      }),
    });
    if (!response.ok) {
      throw new Error(`Server-side fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    const rows = payload?.data ?? [];
    const totalRows = payload?.totalRows ?? payload?.total ?? rows.length;
    return { rows, totalRows };
  }, [category, count]);

  const serverSideAggregation: ServerSideAggregation = useCallback(async (request: ServerSideAggregationRequest) => {
    console.log("Server-side aggregation request", request);

    const response = await fetch(`http://localhost:8008/dept_loc_exp?wide=${category === "wide" ? "0" : "1"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aggregates: request.aggregates,
        page: request.page,
        page_size: request.pageSize,
        sorts: request.sorts,
        filters: request.filters,
        max: count,
      }),
    });

    return await response.json();
  }, [category]);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`http://localhost:8008/dept_loc_exp?wide=${category === "wide" ? "0" : "1"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page_size: count }),
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
                  params.success(["Sales", "Engineering", "HR", "Marketing"])
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
        setRowData(payload.data ?? []);
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

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [category, toggle]);

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
        <button className="btn" type="button" onClick={() => setCategory(category === "wide" ? "compact" : "wide")}>Load {category} Data</button>
        <div style={{ display: "flex", gap: "12px" }}>
          <input type="number" value={count} min={1} max={100000} onChange={(e) => setCount(Number(e.target.value))} />
          <button className="btn" type="button" onClick={() => setToggle(!toggle)}>Fetch</button>
        </div>
        <button className="btn" type="button" onClick={() => setPaginate(!paginate)}>{paginate ? "Don't" : ""} Paginate</button>
        <button className="btn" type="button" onClick={() => setRowModel(rowModel === "clientSide" ? "serverSide" : "clientSide")}>
          Use {rowModel === "clientSide" ? "Server-side" : "Client-side"} Row Model
        </button>
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
          data={rowData}
          columnDefs={colDefs}
          className={activeTheme.className}
          style={{ width: "100%", height: "100%" }}
          loading={loading}
        />
      </div>
    </div>
  );
}

export default App;
