import { useEffect, useState } from "react";
import "./roboto-font.css";
import "./style.css";

import { Grid } from "@grid"; // React Data Grid Component
import { Column } from "@grid/types";
import { round } from "./helpers";

function App() {
  const [rowData, setRowData] = useState<any[]>([]);
  const [colDefs, setColDefs] = useState<Column[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("compact");
  const [count, setCount] = useState(50);
  const [toggle, setToggle] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`http://localhost:8080/dept_loc_exp?count=${count}&wide=${category === "wide" ? "0" : "1"}`);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (cancelled) return;

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

        const formatApplier = (cols: Column[]) => {
          for (const col of cols) {
            currencyFormatter(col);
            if (col.children && col.children.length > 0) {
              formatApplier(col.children);
            }
          }
        };

        formatApplier(payload.columns ?? []);

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
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button type="button" onClick={() => setCategory(category === "wide" ? "compact" : "wide")}>Load {category} Data</button>
        <input type="number" value={count} min={1} max={100000} onChange={(e) => setCount(e.target.value)} />
        <button type="button" onClick={() => setToggle(!toggle)}>Fetch</button>
        {loading && <div>Loading data…</div>}
        {error && <div style={{ color: "red" }}>Error: {error}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Grid
          data={rowData}
          columns={colDefs}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export default App;
