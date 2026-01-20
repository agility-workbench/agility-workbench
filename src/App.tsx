import { useCallback, useEffect, useState } from "react";
import "./roboto-font.css";
import "./style.css";

import { Grid } from "@grid"; // React Data Grid Component
import { Column, RowModelType, ServerSideAggregation, ServerSideDataSource, ValueFormatterParams } from "@grid/types";
import { round } from "./helpers";
import { FormatterOptionsParams } from "@grid/formatters";

const themePresets = [
  { id: "dark", label: "Dark", className: "pte-theme-dark" },
  { id: "light", label: "Light", className: "pte-theme-light" },
];

function App() {
  const [rowData, setRowData] = useState<any[]>([]);
  const [colDefs, setColDefs] = useState<Column[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("compact");
  const [count, setCount] = useState(50000);
  const [toggle, setToggle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paginate, setPaginate] = useState(true);
  const [rowModel, setRowModel] = useState<RowModelType>("clientSide");
  const [themeId, setThemeId] = useState(themePresets[0].id);

  const applyFormatters = (cols: Column[] = []) => {
    const currencyFormatter = (col: Column) => {
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

    const formatApplier = (inputCols: Column[]) => {
      for (const col of inputCols) {
        currencyFormatter(col);
        if (col.children && col.children.length > 0) {
          formatApplier(col.children);
        }
      }
    };

    formatApplier(cols);
    return cols;
  };

  const serverSideDataSource: ServerSideDataSource = useCallback(async (request) => {
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

  const serverSideAggregation: ServerSideAggregation = useCallback(async(request) => {
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

        payload.columns.forEach((col: Column) => {
          if (col.key == "department") col.sortable = false;
          if (col.key == "country") col.filterable = false;
          if (col.key == "location") col.resizable = false;
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
        <button type="button" onClick={() => setCategory(category === "wide" ? "compact" : "wide")}>Load {category} Data</button>
        <div style={{ display: "flex", gap: "12px" }}>
          <input type="number" value={count} min={1} max={100000} onChange={(e) => setCount(Number(e.target.value))} />
          <button type="button" onClick={() => setToggle(!toggle)}>Fetch</button>
        </div>
        <button type="button" onClick={() => setPaginate(!paginate)}>{paginate ? "Don't" : ""} Paginate</button>
        <button type="button" onClick={() => setRowModel(rowModel === "clientSide" ? "serverSide" : "clientSide")}>
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
        {loading && <div>Loading data…</div>}
        {error && <div style={{ color: "red" }}>Error: {error}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Grid
          data={rowData}
          columns={colDefs}
          className={activeTheme.className}
          style={{ width: "100%", height: "100%" }}
          pagination={paginate}
          rowModel={rowModel}
          serverSideDataSource={rowModel === "serverSide" ? serverSideDataSource : undefined}
          serverSideAggregation={rowModel === "serverSide" ? serverSideAggregation : undefined}
        />
      </div>
    </div>
  );
}

export default App;
