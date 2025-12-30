import { useCallback, useEffect, useState } from "react";
import "./roboto-font.css";
import "./style.css";

import { Grid } from "@grid"; // React Data Grid Component
import { Column, RowModelType, ServerSideDataSource } from "@grid/types";
import { round } from "./helpers";

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

  const applyFormatters = (cols: Column[] = []) => {
    const currencyFormatter = (col: Column) => {
      if (col.type !== "number") return;
      col.valueFormatter = (value: any, row: any) => {
        if (typeof value === "number") {
          return round(value).toLocaleString("en-US", {
            style: "currency",
            currency: row.currency || "USD",
          });
        }
        return value;
      };
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

    const response = await fetch(`http://localhost:8080/dept_loc_exp?wide=${category === "wide" ? "0" : "1"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: request.page,
        page_size: request.pageSize,
        sorts: request.sorts,
        filters: request.filters,
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

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`http://localhost:8080/dept_loc_exp?wide=${category === "wide" ? "0" : "1"}`, {
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
        {loading && <div>Loading data…</div>}
        {error && <div style={{ color: "red" }}>Error: {error}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Grid
          data={rowData}
          columns={colDefs}
          style={{ width: "100%", height: "100%" }}
          pagination={paginate}
          rowModel={rowModel}
          serverSideDataSource={rowModel === "serverSide" ? serverSideDataSource : undefined}
        />
      </div>
    </div>
  );
}

export default App;
